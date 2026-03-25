/**
 * Semantic intent diffing via LLM.
 *
 * Given two versions of a vibe spec, extracts what actually changed
 * in terms of behavioral intent — ignoring rewording, formatting,
 * and clarifications that don't alter meaning.
 *
 * All files are batched into a single LLM call to avoid rate limits.
 * Model-agnostic: uses Gemini (platform key) by default.
 */

export interface IntentDelta {
  kind: 'added' | 'removed' | 'modified';
  summary: string;
  confidence: number;
}

export interface FileIntentDiff {
  slug: string;
  path: string;
  status: 'added' | 'removed' | 'modified';
  deltas: IntentDelta[];
  /** True if the LLM call failed for this file — UI should show a distinct state. */
  failed?: boolean;
}

export interface IntentDiffResult {
  files: FileIntentDiff[];
  computedAt: string;
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function buildBatchPrompt(
  fileEntries: { slug: string; status: 'added' | 'removed' | 'modified'; baseContent: string; headContent: string }[],
): string {
  const fileBlocks = fileEntries.map((f) => {
    if (f.status === 'added') {
      return `### ${f.slug}.md (NEW FILE)\n${f.headContent}`;
    }
    if (f.status === 'removed') {
      return `### ${f.slug}.md (REMOVED FILE)\n${f.baseContent}`;
    }
    return `### ${f.slug}.md (MODIFIED)\n#### Before\n${f.baseContent}\n#### After\n${f.headContent}`;
  }).join('\n\n---\n\n');

  return `You are analyzing vibe specification files to extract behavioral intent.

A vibe spec describes what a feature should do: behaviors, constraints, data, dependencies.

For NEW files: extract every discrete behavioral intent the spec defines. Be thorough — each behavior, capability, constraint, data requirement, dependency, or rule is a separate intent.

For REMOVED files: extract every intent that is being removed.

For MODIFIED files: identify only what INTENT changed between the before/after versions. IGNORE rewording, formatting, and clarifications that don't alter meaning. Only report genuine changes to behavior, constraints, data, or dependencies.

Respond with a JSON object where each key is a filename (e.g. "plot") and each value is an array of intent objects:
{
  "plot": [
    { "kind": "added", "summary": "...", "confidence": 1.0 },
    ...
  ],
  "auth": [
    { "kind": "modified", "summary": "...", "confidence": 0.9 }
  ]
}

Rules:
- "kind" must be "added", "removed", or "modified"
- "summary" is one clear sentence describing the intent
- "confidence" is 0.0–1.0 (use 1.0 for new/removed files since intents are directly stated)
- For new files, EVERY intent must be extracted — do not summarize or skip any
- For modified files, only report genuine intent changes
- Include ALL files from the input — every file key must appear in the output
- If a modified file has no meaningful intent changes, use an empty array for that file

Output ONLY the JSON object. No code fences, no explanation.

## Files to analyze

${fileBlocks}`;
}

// ─── LLM call ────────────────────────────────────────────────────────────────

interface VibeFile {
  path: string;
  content: string;
}

function getSlug(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/, '');
}

async function callGemini(prompt: string): Promise<Record<string, IntentDelta[]>> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key configured for intent diffing');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    console.error('[intent-diff] Gemini API error:', err);
    throw new Error(`Gemini API error (${response.status}): ${err.slice(0, 200)}`);
  }

  const data = await response.json();
  const candidate = data?.candidates?.[0];

  if (!candidate?.content?.parts?.[0]?.text) {
    const reason = candidate?.finishReason ?? 'unknown';
    console.error('[intent-diff] Empty Gemini response:', reason, JSON.stringify(data).slice(0, 500));
    throw new Error(`Empty response from Gemini (finishReason: ${reason})`);
  }

  const text = candidate.content.parts[0].text.trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error('[intent-diff] JSON parse failed:', text.slice(0, 500));
    throw new Error('Failed to parse LLM response as JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    console.error('[intent-diff] Expected object, got:', typeof parsed, text.slice(0, 200));
    throw new Error('LLM returned non-object JSON');
  }

  // Validate and filter each file's deltas
  // Normalize keys: the LLM may return "overview.md" but we use "overview" as the slug
  const result: Record<string, IntentDelta[]> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      console.warn(`[intent-diff] Non-array value for ${key}, skipping`);
      continue;
    }
    const normalizedKey = key.replace(/\.md$/, '');
    result[normalizedKey] = value.filter(
      (d: any) =>
        d &&
        typeof d.kind === 'string' &&
        typeof d.summary === 'string' &&
        typeof d.confidence === 'number' &&
        ['added', 'removed', 'modified'].includes(d.kind),
    );
  }

  return result;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function computeIntentDiff(
  baseFeatures: VibeFile[],
  headFeatures: VibeFile[],
): Promise<IntentDiffResult> {
  const baseMap = new Map(baseFeatures.map((f) => [getSlug(f.path), f]));
  const headMap = new Map(headFeatures.map((f) => [getSlug(f.path), f]));

  const allSlugs = new Set([...baseMap.keys(), ...headMap.keys()]);
  const entries: { slug: string; path: string; status: FileIntentDiff['status']; baseContent: string; headContent: string }[] = [];

  for (const slug of allSlugs) {
    const base = baseMap.get(slug);
    const head = headMap.get(slug);
    if (base && head && base.content === head.content) continue;

    const status: FileIntentDiff['status'] = !base ? 'added' : !head ? 'removed' : 'modified';
    const path = (head ?? base)!.path;
    entries.push({ slug, path, status, baseContent: base?.content ?? '', headContent: head?.content ?? '' });
  }

  if (entries.length === 0) {
    return { files: [], computedAt: new Date().toISOString() };
  }

  // Single batched LLM call for all files
  const prompt = buildBatchPrompt(entries);
  let llmResult: Record<string, IntentDelta[]>;

  try {
    llmResult = await callGemini(prompt);
  } catch (e) {
    console.error('[intent-diff] Batch call failed:', e);
    // Mark all files as failed so the UI can show a distinct state
    return {
      files: entries.map((f) => ({ slug: f.slug, path: f.path, status: f.status, deltas: [], failed: true })),
      computedAt: new Date().toISOString(),
    };
  }

  const files: FileIntentDiff[] = entries.map((entry) => {
    const deltas = llmResult[entry.slug] ?? [];
    // If the LLM returned nothing for a new/removed file, mark as failed
    const failed = deltas.length === 0 && entry.status !== 'modified' && !llmResult[entry.slug];
    return { slug: entry.slug, path: entry.path, status: entry.status, deltas, failed };
  });

  return {
    files: files.filter((f) => f.status === 'added' || f.status === 'removed' || f.deltas.length > 0 || f.failed),
    computedAt: new Date().toISOString(),
  };
}
