import path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { simpleGit } from 'simple-git';
import { glob } from 'glob';
import fs from 'fs-extra';
import type { VibeFeature, VibeMapping, VibeRequirement, VibeSnapshot } from './types.js';

const MODEL = 'gemini-1.5-flash';

// Max characters of file content sent to the model to stay within token limits
const MAX_FILE_CHARS = 300_000;

/**
 * Viber — the extraction engine.
 *
 * Given a Git repository path, it:
 *   1. Scans the file tree (respecting .gitignore)
 *   2. Reads the last 10 commit messages
 *   3. Sends a structured prompt to Gemini 1.5 Flash
 *   4. Parses the model's JSON response into a VibeSnapshot
 */
export class Viber {
  private genai: GoogleGenerativeAI;

  constructor(apiKey: string) {
    this.genai = new GoogleGenerativeAI(apiKey);
  }

  async extract(repoPath: string): Promise<VibeSnapshot> {
    const [fileTree, commitMessages, sampleContent] = await Promise.all([
      this.getFileTree(repoPath),
      this.getCommitMessages(repoPath),
      this.getSampleContent(repoPath),
    ]);

    const repoName = path.basename(repoPath);
    const prompt = this.buildPrompt(repoName, fileTree, commitMessages, sampleContent);

    const model = this.genai.getGenerativeModel({ model: MODEL });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return this.parseResponse(repoName, text);
  }

  // ─── Repo Scanning ─────────────────────────────────────────────────────────

  private async getFileTree(repoPath: string): Promise<string[]> {
    const files = await glob('**/*', {
      cwd: repoPath,
      nodir: true,
      ignore: [
        'node_modules/**',
        '.git/**',
        'dist/**',
        'build/**',
        '*.lock',
        '**/*.min.js',
        '**/*.map',
      ],
      maxDepth: 6,
    });
    return files.sort();
  }

  private async getCommitMessages(repoPath: string): Promise<string[]> {
    try {
      const git = simpleGit(repoPath);
      const log = await git.log({ maxCount: 10 });
      return log.all.map((c) => `${c.hash.slice(0, 7)} ${c.message}`);
    } catch {
      return ['(no git history found)'];
    }
  }

  private async getSampleContent(repoPath: string): Promise<string> {
    // Read a representative set of files: READMEs, configs, entry points
    const priority = [
      'README.md',
      'README.rst',
      'package.json',
      'pyproject.toml',
      'Cargo.toml',
      'go.mod',
      'src/index.*',
      'src/main.*',
      'src/app.*',
      'main.*',
      'app.*',
    ];

    const collected: string[] = [];
    let totalChars = 0;

    for (const pattern of priority) {
      if (totalChars >= MAX_FILE_CHARS) break;
      const matches = await glob(pattern, { cwd: repoPath, nodir: true, maxDepth: 3 });
      for (const f of matches.slice(0, 2)) {
        if (totalChars >= MAX_FILE_CHARS) break;
        try {
          const content = await fs.readFile(path.join(repoPath, f), 'utf8');
          const snippet = content.slice(0, 4_000);
          collected.push(`\n### ${f}\n\`\`\`\n${snippet}\n\`\`\``);
          totalChars += snippet.length;
        } catch {
          // skip unreadable files
        }
      }
    }

    return collected.join('\n') || '(no sample content available)';
  }

  // ─── Prompt ────────────────────────────────────────────────────────────────

  private buildPrompt(
    repoName: string,
    fileTree: string[],
    commits: string[],
    sampleContent: string,
  ): string {
    return `You are a software architect analyzing a Git repository named "${repoName}".
Your job is to infer the project's human-readable **Vibes** — its features and technical requirements.

## File Tree (up to 6 levels deep)
\`\`\`
${fileTree.slice(0, 500).join('\n')}
${fileTree.length > 500 ? `\n… and ${fileTree.length - 500} more files` : ''}
\`\`\`

## Last 10 Commits
\`\`\`
${commits.join('\n')}
\`\`\`

## Sample File Contents
${sampleContent}

---

Respond with **only** a valid JSON object matching this exact schema (no markdown fences, no extra text):

{
  "features": [
    {
      "name": "<kebab-case-filename-stem>",
      "content": "<full Markdown document describing this feature, with ## sections>"
    }
  ],
  "requirements": [
    {
      "name": "<kebab-case-filename-stem>",
      "data": { ... }
    }
  ],
  "mapping": {
    "features/<name>.md": ["<glob-or-path>", ...]
  }
}

Guidelines:
- features: 2–6 top-level product features inferred from the code and history. Each should be 100–300 words of Markdown.
- requirements: 2–4 documents covering tech stack, security, infrastructure, performance, etc.
- mapping: link each feature to the most relevant source directories or globs.
- Be specific and accurate — prefer real file paths and technology names you see in the code.
- Do NOT include any text outside the JSON object.`;
  }

  // ─── Response Parsing ──────────────────────────────────────────────────────

  private parseResponse(repoName: string, text: string): VibeSnapshot {
    // Strip accidental markdown fences
    const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();

    let parsed: {
      features?: Array<{ name: string; content: string }>;
      requirements?: Array<{ name: string; data: Record<string, unknown> }>;
      mapping?: VibeMapping;
    };

    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      throw new Error(`Gemini returned invalid JSON:\n${cleaned}\n\nParse error: ${String(err)}`);
    }

    const features: VibeFeature[] = (parsed.features ?? []).map((f) => ({
      name: this.toKebab(f.name),
      content: f.content,
    }));

    const requirements: VibeRequirement[] = (parsed.requirements ?? []).map((r) => ({
      name: this.toKebab(r.name),
      data: r.data ?? {},
    }));

    const mapping: VibeMapping = parsed.mapping ?? {};

    return { name: repoName, features, requirements, mapping };
  }

  private toKebab(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
