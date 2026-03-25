/**
 * Semantic intent diffing via LLM.
 *
 * Given two versions of a vibe spec, produces a narrative synthesis
 * of what actually changed in terms of behavioral intent — written
 * like a mentor explaining changes to a colleague, not a granular list.
 *
 * All files are batched into a single LLM call to avoid rate limits.
 * Model-agnostic: uses Gemini (platform key) by default.
 */

export interface IntentHighlight {
  kind: 'added' | 'modified' | 'removed';
  text: string;
}

export interface FileIntentDiff {
  slug: string;
  path: string;
  status: 'added' | 'removed' | 'modified';
  /** Synthesized bullet points, each tagged as added/modified/removed intent. */
  highlights: IntentHighlight[];
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
      return `### ${f.slug} (NEW FILE)\n${f.headContent}`;
    }
    if (f.status === 'removed') {
      return `### ${f.slug} (REMOVED FILE)\n${f.baseContent}`;
    }
    return `### ${f.slug} (MODIFIED)\n#### Before\n${f.baseContent}\n#### After\n${f.headContent}`;
  }).join('\n\n---\n\n');

  return `You are summarizing changes to vibe specification files for a teammate.

A vibe spec describes what a feature should do: behaviors, constraints, data models, dependencies, and UX.

Your job is to write the minimum number of bullet points needed to completely and concisely explain each file's intent. Each bullet should cover one key theme or area, synthesizing related details together. A small change might need one bullet; a large feature might need eight. Don't enumerate every field or constraint individually — group related things together.

Each bullet has a "kind" describing what type of change it represents:
- "added" — new capability or intent being introduced
- "modified" — existing intent that changed (e.g. "color scheme changed from red to blue")
- "removed" — capability or intent being dropped

Guidelines:
- For NEW files: all bullets will be "added". Cover the core purpose, key data models, how it connects to other features, and any notable UX decisions.
- For REMOVED files: all bullets will be "removed". What capability is being dropped.
- For MODIFIED files: each bullet should be tagged based on whether that specific intent was added, changed, or removed within the file. Ignore rewording or formatting. If nothing meaningful changed, use a single "modified" bullet: "Cosmetic changes only — no intent changes"

Respond with a JSON object where each key is the file name (matching the headers below exactly) and each value is an array of objects with "kind" and "text":

{
  "overview": [
    { "kind": "added", "text": "Central dashboard that tracks total net worth by aggregating assets and liabilities across monthly snapshots" },
    { "kind": "added", "text": "Integrates with DataEntry for editing any month's data, and Plot for visualizing trends over time" }
  ],
  "auth": [
    { "kind": "modified", "text": "Session timeout changed from 30 minutes to 1 hour" },
    { "kind": "removed", "text": "Dropped support for legacy API key authentication" }
  ]
}

Rules:
- Each bullet is one concise line — no sub-bullets, no line breaks
- Write in plain English, as if explaining to a smart colleague
- Synthesize related concepts into single bullets rather than listing individually
- Use as few bullets as needed to fully cover the key points — no filler, no padding
- Every file from the input must appear as a key in the output
- Output ONLY the JSON object — no code fences, no explanation

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

async function callGemini(prompt: string): Promise<Record<string, IntentHighlight[]>> {
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
          temperature: 0.2,
          maxOutputTokens: 4096,
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

  // Normalize keys (LLM may return "overview.md" instead of "overview")
  const validKinds = ['added', 'modified', 'removed'];
  const result: Record<string, IntentHighlight[]> = {};
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!Array.isArray(value)) {
      console.warn(`[intent-diff] Non-array value for ${key}, skipping`);
      continue;
    }
    result[key.replace(/\.md$/, '')] = value.filter(
      (v: any): v is IntentHighlight =>
        v && typeof v.text === 'string' && typeof v.kind === 'string' && validKinds.includes(v.kind),
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

  const prompt = buildBatchPrompt(entries);
  let llmResult: Record<string, IntentHighlight[]>;

  try {
    llmResult = await callGemini(prompt);
  } catch (e) {
    console.error('[intent-diff] Batch call failed:', e);
    return {
      files: entries.map((f) => ({ slug: f.slug, path: f.path, status: f.status, highlights: [], failed: true })),
      computedAt: new Date().toISOString(),
    };
  }

  const files: FileIntentDiff[] = entries.map((entry) => {
    const highlights = llmResult[entry.slug] ?? [];
    const failed = highlights.length === 0 && !(entry.slug in llmResult);
    return { slug: entry.slug, path: entry.path, status: entry.status, highlights, failed };
  });

  return {
    files: files.filter((f) => f.highlights.length > 0 || f.failed),
    computedAt: new Date().toISOString(),
  };
}
