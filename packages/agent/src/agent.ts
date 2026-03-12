/**
 * Agentic compile loop: vibe files → working code.
 *
 * Current implementation: single Claude call (fast, good for MVP).
 *
 * Upgrade path → full agentic loop:
 *   1. Create a temp workspace, write vibe files + scaffolding
 *   2. Give Claude tools: write_file, read_file, run_command
 *   3. Loop until Claude calls a "done" tool or we hit max iterations
 *   4. run_command lets Claude type-check, run tests, and fix errors
 *   5. Collect written files as implementation proofs
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const client = new Anthropic();

export interface CodeFile {
  path: string;
  content: string;
}

/**
 * Takes the vibe feature files from a PR and returns implementation proofs
 * (generated source files).
 */
export async function runCompileJob(headFeatures: CodeFile[]): Promise<CodeFile[]> {
  if (headFeatures.length === 0) return [];

  const vibeContext = headFeatures
    .map(({ path: p, content }) => `### ${p}\n\`\`\`markdown\n${content}\n\`\`\``)
    .join('\n\n');

  // --- Phase 1: single-shot generation (current) ---
  // TODO: replace with full agentic loop (see upgrade path above)
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    messages: [
      {
        role: 'user',
        content: `You are a senior software engineer implementing a feature based on vibe specifications.
The vibes below describe the intent — generate production-quality code that fulfils them.
Return ONLY a valid JSON array: [{"filePath":"<path>","content":"<full file content>"}, ...]
No markdown fences. No explanation. All files must work together.

## Vibe Specifications

${vibeContext}`,
      },
    ],
  });

  const text = response.content.find((b) => b.type === 'text')?.text ?? '';
  const proofs = parseCodegenResponse(text);

  // --- Phase 2 (TODO): agentic validation loop ---
  // const workspace = await createWorkspace(headFeatures, proofs);
  // proofs = await agentLoop(client, workspace, headFeatures);
  // await cleanupWorkspace(workspace);

  return proofs;
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

// ─── Agentic loop scaffolding (TODO: wire up) ─────────────────────────────────

/** Creates a temp workspace with vibe files + initial generated code. */
async function createWorkspace(vibes: CodeFile[], initial: CodeFile[]): Promise<string> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibehub-agent-'));
  for (const { path: p, content } of [...vibes, ...initial]) {
    const abs = path.join(dir, p);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
  }
  return dir;
}

/** Removes the temp workspace. */
async function cleanupWorkspace(dir: string): Promise<void> {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Full agentic loop: Claude has tools to read/write files and run commands.
 * Iterates until Claude signals "done" or we hit MAX_ITERATIONS.
 *
 * TODO: implement and swap in for the single-shot call above.
 */
async function agentLoop(
  _anthropic: Anthropic,
  _workspace: string,
  _vibes: CodeFile[],
): Promise<CodeFile[]> {
  // Placeholder — returns empty so callers fall back to single-shot.
  // Real implementation:
  //   1. Define tools: write_file, read_file, run_command, finish(files)
  //   2. Loop: call claude, handle tool_use blocks, break on finish
  //   3. Return files passed to finish tool
  throw new Error('agentLoop not yet implemented — using single-shot fallback');
}
