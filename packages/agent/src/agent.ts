/**
 * Agentic compile loop: vibe files → working code.
 *
 * Two-phase execution:
 *   1. Single Claude/Gemini call generates initial implementation files.
 *   2. Agentic loop: model has write_file / read_file / run_command / finish tools.
 *      It writes code, validates it (tsc, tests), fixes errors, and calls finish
 *      when satisfied. Iterates up to MAX_ITERATIONS times.
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
const MAX_ITERATIONS = 10;
const COMMAND_TIMEOUT_MS = 30_000;

// Commands the agent is permitted to run inside the workspace sandbox.
const ALLOWED_COMMAND_PREFIXES = [
  'tsc', 'npx tsc', 'npx eslint', 'node', 'npm test', 'npm run', 'npx jest',
];

export interface CodeFile {
  path: string;
  content: string;
}

// ─── Provider abstraction ──────────────────────────────────────────────────────
// We use Anthropic's content block types as the canonical internal format so the
// agent loop doesn't need to know which provider is active.

interface LLMProvider {
  generateText(prompt: string): Promise<string>;
  createMessage(
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[],
  ): Promise<{ content: Anthropic.ContentBlock[]; stop_reason: string }>;
}

// ── Anthropic provider ─────────────────────────────────────────────────────────

class AnthropicProvider implements LLMProvider {
  private readonly client = new Anthropic();

  async generateText(prompt: string): Promise<string> {
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 8096,
      messages: [{ role: 'user', content: prompt }],
    });
    return res.content.find((b) => b.type === 'text')?.text ?? '';
  }

  async createMessage(messages: Anthropic.MessageParam[], tools: Anthropic.Tool[]) {
    const res = await this.client.messages.create({
      model: MODEL,
      max_tokens: 8096,
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

  async createMessage(messages: Anthropic.MessageParam[], tools: Anthropic.Tool[]) {
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
      // Gemini accepts standard JSON Schema (lowercase types) — cast at SDK boundary.
      parameters: t.input_schema,
    }));

    const model = this.genAI.getGenerativeModel({
      model: MODEL,
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
          // Gemini has no call IDs — encode name so tool_result lookup works.
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
    description: 'Write or overwrite a file in the workspace.',
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
    description: 'Read a file from the workspace.',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Relative file path within the workspace.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'run_command',
    description:
      'Run a validation command in the workspace (e.g. "npx tsc --noEmit", "npm test"). ' +
      'Use this to check for type errors and test failures, then fix them.',
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
      'Signal that the implementation is complete and correct. ' +
      'Call this once the code compiles and tests pass (or there are no tests to run).',
    input_schema: {
      type: 'object' as const,
      properties: {
        files: {
          type: 'array',
          description: 'Final list of implementation files.',
          items: {
            type: 'object',
            properties: {
              filePath: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['filePath', 'content'],
          },
        },
      },
      required: ['files'],
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
      content: `You are a senior software engineer validating and fixing an AI-generated implementation.
${neverBlock}
## Vibe Specifications (the intended behaviour)
${vibeContext}

## Initial files written to workspace
${initialListing}

Your job:
1. Read .vibe/project.json to find the install, build, and test commands for this project.
2. If an install command is specified, run it first (e.g. npm install).
3. Run the build or type-check command (e.g. npx tsc --noEmit, npm run build).
4. If a test command exists, run it.
5. Fix any errors using write_file and repeat from step 3.
6. Call finish with the final file list once everything is clean.

If there is no .vibe/project.json or no tsconfig.json, write a minimal one first.`,
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const response = await provider.createMessage(messages, TOOLS);
    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'end_turn') break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    let finished = false;
    let finalFiles: CodeFile[] = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      let result: string;
      try {
        if (block.name === 'write_file') {
          const { path: filePath, content } = block.input as { path: string; content: string };
          const abs = safeResolve(workspace, filePath);
          fs.mkdirSync(path.dirname(abs), { recursive: true });
          fs.writeFileSync(abs, content, 'utf8');
          writtenFiles.set(filePath, content);
          result = `Written: ${filePath}`;
        } else if (block.name === 'read_file') {
          const { path: filePath } = block.input as { path: string };
          const abs = safeResolve(workspace, filePath);
          result = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : 'File not found.';
        } else if (block.name === 'run_command') {
          const { command } = block.input as { command: string };
          result = runSandboxedCommand(command, workspace);
        } else if (block.name === 'finish') {
          const { files } = block.input as { files: Array<{ filePath: string; content: string }> };
          finalFiles = files.map(({ filePath, content }) => ({ path: filePath, content }));
          finished = true;
          result = 'Done.';
        } else {
          result = `Unknown tool: ${block.name}`;
        }
      } catch (err) {
        result = `Error: ${err instanceof Error ? err.message : String(err)}`;
      }

      toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
    }

    messages.push({ role: 'user', content: toolResults });

    if (finished) {
      return finalFiles.length > 0
        ? finalFiles
        : [...writtenFiles.entries()].map(([p, content]) => ({ path: p, content }));
    }
  }

  // Max iterations hit — return whatever was written.
  return [...writtenFiles.entries()].map(([p, content]) => ({ path: p, content }));
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
    });
    return output.trim() || '(no output — command succeeded)';
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return [e.stdout, e.stderr, e.message].filter(Boolean).join('\n').trim() || 'Command failed.';
  }
}
