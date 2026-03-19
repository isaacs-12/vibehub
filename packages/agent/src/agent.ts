/**
 * Agentic compile loop: vibe files → working code.
 *
 * Two-phase execution:
 *   1. Single Claude/Gemini call generates initial implementation files.
 *   2. Agentic loop: model has write_file / read_file / list_files /
 *      search_files / run_command / finish tools. It writes code, validates
 *      it (tsc, tests), fixes errors, and calls finish when satisfied.
 *      Iterates up to MAX_ITERATIONS times.
 *
 * Model selection:
 *   Set AGENT_MODEL env var to any Anthropic or Gemini model ID.
 *   - Gemini:    AGENT_MODEL=gemini-2.5-flash  (requires GOOGLE_API_KEY)
 *   - Anthropic: AGENT_MODEL=claude-sonnet-4-6 (requires ANTHROPIC_API_KEY, default)
 */

import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Content } from '@google/generative-ai';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { parseVibeGrammar, fromGrammarName } from './vibeGrammar.ts';

const MODEL = process.env.AGENT_MODEL ?? 'claude-sonnet-4-6';
const MAX_ITERATIONS = 25;
const COMMAND_TIMEOUT_MS = 120_000;
const MAX_TOKENS = 32_768;
const THINKING_BUDGET = 10_000;

// Commands the agent is permitted to run inside the workspace sandbox.
const ALLOWED_COMMAND_PREFIXES = [
  'tsc', 'npx tsc', 'npx eslint', 'node', 'npm test', 'npm run', 'npx jest',
  'npx vitest', 'npx prettier', 'cat', 'ls', 'find', 'head', 'tail', 'wc',
];

export interface CodeFile {
  path: string;
  content: string;
}

// ─── System prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert software engineer working inside a sandboxed workspace. Your job is to validate, fix, and complete a code implementation that was generated from Vibe specifications (structured feature descriptions).

## Your capabilities
You have tools to read files, write files, list directory contents, search for patterns across files, and run shell commands. Use them methodically.

## How to work
1. **Understand first.** Before changing anything, read the project configuration (.vibe/project.json, package.json, tsconfig.json) and understand the project structure using list_files.
2. **Build incrementally.** Install dependencies, then build/typecheck, then run tests. Fix issues one at a time — don't try to fix everything in one write.
3. **Diagnose before fixing.** When you see an error, trace it to its root cause. Read the relevant files, search for related symbols, understand the dependency chain. Don't guess.
4. **Use search_files liberally.** When you see an undefined import, a missing type, or an unknown symbol, search for it. Don't assume you know where things are.
5. **Write complete files.** When you use write_file, always write the complete file content. Never write partial files or use placeholder comments like "// rest of file...".
6. **Test your fixes.** After writing a fix, re-run the failing command to verify it works before moving on.
7. **Know when to stop.** Call finish once: (a) the project builds without errors AND (b) tests pass (or no test runner is configured). Don't over-optimize.

## Common patterns
- Missing module: search for the export, check if the import path is correct, check tsconfig paths.
- Type error: read the type definition, understand what's expected vs provided.
- Test failure: read the test file, understand the assertion, trace back to the implementation.
- Circular dependency: use list_files and search_files to map the import graph, then restructure.

## What NOT to do
- Don't create unnecessary abstraction layers or over-engineer solutions.
- Don't add dependencies that weren't in the original generation unless absolutely needed.
- Don't modify test files to make them pass — fix the implementation instead.
- Don't ignore errors — if the build fails, fix it. If tests fail, fix them.
- Don't call finish until the build is clean.`;

// ─── Provider abstraction ──────────────────────────────────────────────────────
// We use Anthropic's content block types as the canonical internal format so the
// agent loop doesn't need to know which provider is active.

interface LLMProvider {
  generateText(prompt: string): Promise<string>;
  createMessage(
    system: string,
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
  ): Promise<{ content: Anthropic.ContentBlock[]; stop_reason: string }>;
}

// ── Anthropic provider ─────────────────────────────────────────────────────────

class AnthropicProvider implements LLMProvider {
  private readonly client = new Anthropic();
  private readonly useThinking: boolean;

  constructor() {
    // Enable extended thinking for models that support it.
    this.useThinking = MODEL.includes('sonnet') || MODEL.includes('opus');
  }

  async generateText(prompt: string): Promise<string> {
    if (this.useThinking) {
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
        messages: [{ role: 'user', content: prompt }],
      });
      return res.content.find((b) => b.type === 'text')?.text ?? '';
    }
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content.find((b) => b.type === 'text')?.text ?? '';
  }

  async createMessage(system: string, messages: Anthropic.MessageParam[], tools: Anthropic.Tool[]) {
    if (this.useThinking) {
      const res = await this.client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system,
        thinking: { type: 'enabled', budget_tokens: THINKING_BUDGET },
        tools,
        messages,
      });
      // Filter out thinking blocks — keep only text and tool_use for message history.
      const content = res.content.filter(
        (b) => b.type === 'text' || b.type === 'tool_use',
      ) as Anthropic.ContentBlock[];
      return { content, stop_reason: res.stop_reason ?? 'end_turn' };
    }

    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      tools,
      messages,
    });
    return { content: res.content, stop_reason: res.stop_reason ?? 'end_turn' };
  }
}

// ── Gemini provider ────────────────────────────────────────────────────────────

class GeminiProvider implements LLMProvider {
  private readonly genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? '');

  async generateText(prompt: string): Promise<string> {
    const model = this.genAI.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(prompt);
    return result.response.text();
  }

  async createMessage(system: string, messages: Anthropic.MessageParam[], tools: Anthropic.Tool[]) {
    // Build id→name map so tool results can be matched to function names.
    const idToName = new Map<string, string>();
    for (const msg of messages) {
      if (msg.role === 'assistant' && Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_use') idToName.set(block.id, block.name);
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const functionDeclarations: any[] = tools.map((t) => ({
      name: t.name,
      description: t.description ?? '',
      parameters: t.input_schema,
    }));

    const model = this.genAI.getGenerativeModel({
      model: MODEL,
      systemInstruction: system,
      tools: [{ functionDeclarations }],
    });

    const contents: Content[] = toGeminiContents(messages, idToName);
    const result = await model.generateContent({ contents });
    const candidate = result.response.candidates?.[0];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const content: any[] = [];
    for (const part of candidate?.content.parts ?? []) {
      if (part.text) {
        content.push({ type: 'text', text: part.text });
      } else if (part.functionCall) {
        content.push({
          type: 'tool_use',
          id: `gemini-${part.functionCall.name}-${Date.now()}`,
          name: part.functionCall.name,
          input: (part.functionCall.args as Record<string, unknown>) ?? {},
        });
      }
    }
    const typedContent = content as Anthropic.ContentBlock[];
    const hasCalls = typedContent.some((b) => b.type === 'tool_use');
    return { content: typedContent, stop_reason: hasCalls ? 'tool_use' : 'end_turn' };
  }
}

/** Convert Anthropic message history to Gemini Content[] format. */
function toGeminiContents(
  messages: Anthropic.MessageParam[],
  idToName: Map<string, string>,
): Content[] {
  return messages.flatMap((msg): Content[] => {
    if (typeof msg.content === 'string') {
      return [{ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] }];
    }

    if (msg.role === 'user') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [];
      for (const block of msg.content as Anthropic.ContentBlockParam[]) {
        if (!('type' in block)) continue;
        if (block.type === 'tool_result') {
          const name = idToName.get(block.tool_use_id) ?? block.tool_use_id;
          const resultText =
            typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map((b) => ('text' in b ? b.text : '')).join('')
                : '';
          parts.push({ functionResponse: { name, response: { result: resultText } } });
        } else if (block.type === 'text') {
          parts.push({ text: block.text });
        }
      }
      return parts.length > 0 ? [{ role: 'user', parts }] : [];
    }

    if (msg.role === 'assistant') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [];
      for (const block of msg.content as Anthropic.ContentBlock[]) {
        if (block.type === 'text') {
          parts.push({ text: block.text });
        } else if (block.type === 'tool_use') {
          parts.push({ functionCall: { name: block.name, args: block.input as Record<string, unknown> } });
        }
      }
      return parts.length > 0 ? [{ role: 'model', parts }] : [];
    }

    return [];
  });
}

function createProvider(): LLMProvider {
  return MODEL.startsWith('gemini') ? new GeminiProvider() : new AnthropicProvider();
}

// ─── Public API ────────────────────────────────────────────────────────────────

/**
 * Takes the vibe feature files from a PR and returns implementation proofs
 * (generated source files, validated by the agentic loop).
 */
export async function runCompileJob(headFeatures: CodeFile[]): Promise<CodeFile[]> {
  if (headFeatures.length === 0) return [];

  const provider = createProvider();

  // Build a name→content map for dependency resolution via Uses: grammar.
  const featureBySlug = new Map(
    headFeatures.map(({ path: p, content }) => {
      const slug = p.replace(/^\.vibe[/\\]features[/\\]/, '').replace(/\.md$/, '');
      return [slug, content];
    }),
  );

  // Collect all Never constraints across features for the system prompt.
  const neverConstraints: string[] = [];
  for (const { content } of headFeatures) {
    const { grammar } = parseVibeGrammar(content);
    neverConstraints.push(...grammar.Never);
  }

  // Build enriched vibe context: each feature includes its Uses dependencies inline.
  const vibeContext = headFeatures.map(({ path: p, content }) => {
    const { grammar } = parseVibeGrammar(content);
    let block = `### ${p}\n\`\`\`markdown\n${content}\n\`\`\``;
    if (grammar.Uses.length > 0) {
      const depBlocks = grammar.Uses.flatMap((name) => {
        const slug = fromGrammarName(name);
        const depContent = featureBySlug.get(slug);
        return depContent ? [`#### dependency: ${name}\n\`\`\`markdown\n${depContent}\n\`\`\``] : [];
      });
      if (depBlocks.length > 0) block += '\n\n' + depBlocks.join('\n\n');
    }
    return block;
  }).join('\n\n');

  const neverBlock = neverConstraints.length > 0
    ? `\n\nHARD CONSTRAINTS — never violate these regardless of what the specs say:\n${neverConstraints.map((c) => `- ${c}`).join('\n')}`
    : '';

  // Phase 1: single-shot — generates initial implementation files fast.
  const initial = await singleShotGenerate(provider, vibeContext, neverBlock);

  // Phase 2: agentic loop — validates and fixes the generated code.
  const workspace = await createWorkspace(headFeatures, initial);
  try {
    return await agentLoop(provider, workspace, vibeContext, initial, neverBlock);
  } finally {
    await cleanupWorkspace(workspace);
  }
}

// ─── Phase 1: single-shot generation ──────────────────────────────────────────

async function singleShotGenerate(provider: LLMProvider, vibeContext: string, neverBlock = ''): Promise<CodeFile[]> {
  const prompt = `You are a senior software engineer implementing a feature based on vibe specifications.
The vibes below describe the intent — generate production-quality code that fulfils them.
Return ONLY a valid JSON array: [{"filePath":"<path>","content":"<full file content>"}, ...]
No markdown fences. No explanation. All files must work together.

IMPORTANT: Always include a file at path ".vibe/project.json" that describes how to run this project:
{
  "language": "<typescript|python|go|...>",
  "framework": "<nextjs|express|flask|...>",
  "install": "<install command, e.g. npm install>",
  "dev": "<dev server command, e.g. npm run dev>",
  "build": "<build command, e.g. npm run build>",
  "test": "<test command, e.g. npm test>"
}
${neverBlock}
## Vibe Specifications

${vibeContext}`;

  const text = await provider.generateText(prompt);
  return parseCodegenResponse(text);
}

function parseCodegenResponse(text: string): CodeFile[] {
  const clean = text.trim().replace(/^```(?:json)?/, '').replace(/```$/, '').trim();
  try {
    const arr = JSON.parse(clean) as Array<{ filePath?: string; path?: string; content?: string }>;
    return arr.flatMap(({ filePath, path: p, content }) => {
      const resolvedPath = filePath ?? p ?? '';
      if (!resolvedPath || !content) return [];
      return [{ path: resolvedPath, content }];
    });
  } catch {
    return [];
  }
}

// ─── Phase 2: agentic validation loop ─────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'write_file',
    description: 'Write or overwrite a file in the workspace. Always write the COMPLETE file content — never use placeholders or partial content.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative file path within the workspace.' },
        content: { type: 'string', description: 'Full file content.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'read_file',
    description: 'Read a file from the workspace. Returns the full file content or an error if the file does not exist.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative file path within the workspace.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'list_files',
    description:
      'List files and directories in the workspace. Use this to understand project structure, ' +
      'find files by name, and discover what exists. Supports glob patterns.',
    input_schema: {
      type: 'object' as const,
      properties: {
        directory: {
          type: 'string',
          description: 'Directory to list, relative to workspace root. Defaults to "." (root).',
        },
        pattern: {
          type: 'string',
          description:
            'Optional glob pattern to filter results (e.g. "**/*.ts", "src/**/*.tsx"). ' +
            'If omitted, lists all files in the directory recursively.',
        },
        max_depth: {
          type: 'number',
          description: 'Maximum directory depth to recurse. Defaults to 10.',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_files',
    description:
      'Search for a text pattern (regex) across files in the workspace. ' +
      'Use this to find imports, type definitions, function usages, exported symbols, etc. ' +
      'Returns matching lines with file paths and line numbers.',
    input_schema: {
      type: 'object' as const,
      properties: {
        pattern: {
          type: 'string',
          description: 'Regular expression pattern to search for (e.g. "export.*UserType", "import.*from").',
        },
        directory: {
          type: 'string',
          description: 'Directory to search in, relative to workspace root. Defaults to "." (root).',
        },
        file_pattern: {
          type: 'string',
          description: 'Glob pattern for files to include (e.g. "*.ts", "*.{ts,tsx}"). Defaults to all files.',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of matching lines to return. Defaults to 50.',
        },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'run_command',
    description:
      'Run a shell command in the workspace (e.g. "npx tsc --noEmit", "npm test", "npm install"). ' +
      'Use this to install dependencies, build, typecheck, and run tests. ' +
      'Returns stdout + stderr. Timeout: 120 seconds.',
    input_schema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'Shell command to run.' },
      },
      required: ['command'],
    },
  },
  {
    name: 'finish',
    description:
      'Signal that the implementation is complete and validated. ' +
      'Call this ONLY after: the project builds without errors AND tests pass (or no tests exist). ' +
      'You do not need to list the files — all files written to the workspace are automatically tracked.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: {
          type: 'string',
          description: 'Brief summary of what was validated and any fixes applied.',
        },
      },
      required: [],
    },
  },
];

async function agentLoop(
  provider: LLMProvider,
  workspace: string,
  vibeContext: string,
  initialFiles: CodeFile[],
  neverBlock = '',
): Promise<CodeFile[]> {
  const writtenFiles = new Map<string, string>(
    initialFiles.map(({ path: p, content }) => [p, content]),
  );

  const initialListing = initialFiles.map((f) => `  - ${f.path}`).join('\n');

  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: `${neverBlock}

## Vibe Specifications (the intended behaviour)
${vibeContext}

## Initial files written to workspace
${initialListing}

Validate and fix this implementation. Follow this sequence:
1. Use list_files to understand the full workspace structure.
2. Read .vibe/project.json to find install/build/test commands.
3. Install dependencies if needed (e.g. npm install).
4. Run the build or type-check command.
5. If errors occur: read the relevant files, use search_files to trace the issue, fix with write_file, and re-run the build.
6. Run tests if a test command exists. Fix failures the same way.
7. Call finish once everything is clean.`,
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await provider.createMessage(SYSTEM_PROMPT, messages, TOOLS);
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let finished = false;

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result: string;
      try {
        switch (block.name) {
          case 'write_file': {
            const { path: filePath, content } = block.input as { path: string; content: string };
            const abs = safeResolve(workspace, filePath);
            fs.mkdirSync(path.dirname(abs), { recursive: true });
            fs.writeFileSync(abs, content, 'utf8');
            writtenFiles.set(filePath, content);
            result = `Written: ${filePath} (${content.length} bytes)`;
            break;
          }

          case 'read_file': {
            const { path: filePath } = block.input as { path: string };
            const abs = safeResolve(workspace, filePath);
            if (!fs.existsSync(abs)) {
              result = `Error: File not found: ${filePath}`;
            } else {
              const content = fs.readFileSync(abs, 'utf8');
              // For very large files, truncate with a note.
              if (content.length > 50_000) {
                result = content.slice(0, 50_000) + `\n\n… [truncated, ${content.length} total bytes]`;
              } else {
                result = content;
              }
            }
            break;
          }

          case 'list_files': {
            const input = block.input as { directory?: string; pattern?: string; max_depth?: number };
            result = listFiles(workspace, input.directory ?? '.', input.pattern, input.max_depth ?? 10);
            break;
          }

          case 'search_files': {
            const input = block.input as {
              pattern: string;
              directory?: string;
              file_pattern?: string;
              max_results?: number;
            };
            result = searchFiles(
              workspace,
              input.pattern,
              input.directory ?? '.',
              input.file_pattern,
              input.max_results ?? 50,
            );
            break;
          }

          case 'run_command': {
            const { command } = block.input as { command: string };
            result = runSandboxedCommand(command, workspace);
            break;
          }

          case 'finish': {
            finished = true;
            result = 'Implementation validated and complete.';
            break;
          }

          default:
            result = `Unknown tool: ${block.name}`;
        }
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }

      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    messages.push({ role: 'user', content: toolResults });

    if (finished) {
      // Read all tracked files from disk (they may have been updated by the agent).
      return readTrackedFiles(workspace, writtenFiles);
    }
  }

  // Max iterations hit — return whatever was written.
  return readTrackedFiles(workspace, writtenFiles);
}

// ─── Tool implementations ────────────────────────────────────────────────────

/** List files in the workspace, optionally filtered by glob pattern. */
function listFiles(workspace: string, directory: string, pattern?: string, maxDepth = 10): string {
  const base = safeResolve(workspace, directory);
  if (!fs.existsSync(base)) return `Error: Directory not found: ${directory}`;

  const results: string[] = [];
  const skipDirs = new Set(['node_modules', '.git', 'dist', '.next', 'coverage', '.turbo']);

  function walk(dir: string, depth: number) {
    if (depth > maxDepth || results.length >= 500) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() && skipDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const rel = path.relative(workspace, full);

      if (entry.isDirectory()) {
        results.push(rel + '/');
        walk(full, depth + 1);
      } else {
        if (pattern) {
          if (matchGlob(rel, pattern) || matchGlob(entry.name, pattern)) {
            results.push(rel);
          }
        } else {
          results.push(rel);
        }
      }
    }
  }

  walk(base, 0);

  if (results.length === 0) return pattern ? `No files matching "${pattern}" in ${directory}` : `Empty directory: ${directory}`;
  if (results.length >= 500) results.push(`… (truncated, 500+ entries)`);
  return results.join('\n');
}

/** Simple glob matching — supports *, **, and ?. */
function matchGlob(filepath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{DOUBLESTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\{\{DOUBLESTAR\}\}/g, '.*');
  return new RegExp(`^${regexStr}$`).test(filepath);
}

/** Search for a regex pattern across files in the workspace. */
function searchFiles(
  workspace: string,
  pattern: string,
  directory: string,
  filePattern?: string,
  maxResults = 50,
): string {
  const base = safeResolve(workspace, directory);
  if (!fs.existsSync(base)) return `Error: Directory not found: ${directory}`;

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, 'i');
  } catch (e) {
    return `Error: Invalid regex pattern: ${e instanceof Error ? e.message : String(e)}`;
  }

  const results: string[] = [];
  const skipDirs = new Set(['node_modules', '.git', 'dist', '.next', 'coverage', '.turbo']);
  const textExts = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.json', '.md', '.yaml', '.yml',
    '.toml', '.css', '.scss', '.html', '.py', '.go', '.rs', '.java',
    '.rb', '.php', '.vue', '.svelte', '.sql', '.graphql', '.prisma',
    '.sh', '.bash', '.txt', '.env', '.cfg', '.ini', '.xml',
  ]);

  function walk(dir: string) {
    if (results.length >= maxResults) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxResults) return;
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(path.join(dir, entry.name));
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!textExts.has(ext) && ext !== '') continue;

      if (filePattern && !matchGlob(entry.name, filePattern)) continue;

      const fullPath = path.join(dir, entry.name);
      const rel = path.relative(workspace, fullPath);

      let content: string;
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > 100_000) continue; // skip large files
        content = fs.readFileSync(fullPath, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (results.length >= maxResults) break;
        if (regex.test(lines[i])) {
          results.push(`${rel}:${i + 1}: ${lines[i].trimEnd()}`);
        }
      }
    }
  }

  walk(base);

  if (results.length === 0) return `No matches for /${pattern}/ in ${directory}`;
  const header = results.length >= maxResults ? `(showing first ${maxResults} matches)\n` : '';
  return header + results.join('\n');
}

/** Read the latest content of all tracked files from disk. */
function readTrackedFiles(workspace: string, tracked: Map<string, string>): CodeFile[] {
  const files: CodeFile[] = [];
  for (const [filePath] of tracked) {
    const abs = path.resolve(workspace, filePath);
    try {
      const content = fs.readFileSync(abs, 'utf8');
      files.push({ path: filePath, content });
    } catch {
      // File may have been deleted during the loop — skip it.
    }
  }
  return files;
}

// ─── Workspace helpers ─────────────────────────────────────────────────────────

async function createWorkspace(vibes: CodeFile[], initial: CodeFile[]): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibehub-agent-'));
  for (const { path: p, content } of [...vibes, ...initial]) {
    const abs = safeResolve(dir, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return dir;
}

async function cleanupWorkspace(dir: string): Promise<void> {
  fs.rmSync(dir, { recursive: true, force: true });
}

function safeResolve(workspace: string, filePath: string): string {
  const abs = path.resolve(workspace, filePath);
  if (!abs.startsWith(workspace + path.sep) && abs !== workspace) {
    throw new Error(`Path traversal blocked: ${filePath}`);
  }
  return abs;
}

function runSandboxedCommand(command: string, workspace: string): string {
  const trimmed = command.trim();
  const allowed = ALLOWED_COMMAND_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
  if (!allowed) {
    return (
      `Command not permitted: "${trimmed}". ` +
      `Allowed prefixes: ${ALLOWED_COMMAND_PREFIXES.join(', ')}.`
    );
  }
  try {
    const output = execSync(trimmed, {
      cwd: workspace,
      timeout: COMMAND_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 1024 * 1024, // 1MB output buffer
    });
    return output.trim() || '(no output — command succeeded)';
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    const parts = [e.stdout, e.stderr].filter(Boolean).join('\n').trim();
    // Truncate very long error output to keep context manageable.
    if (parts.length > 10_000) {
      return parts.slice(0, 10_000) + '\n\n… [output truncated]';
    }
    return parts || e.message || 'Command failed with no output.';
  }
}
