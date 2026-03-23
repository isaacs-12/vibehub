/**
 * Semantic intent diffing via LLM.
 *
 * Given two versions of a vibe spec, extracts what actually changed
 * in terms of behavioral intent — ignoring rewording, formatting,
 * and clarifications that don't alter meaning.
 *
 * Uses Gemini Flash (platform key) for speed and cost efficiency.
 */

export interface IntentDelta {
  /** What kind of intent change this is */
  kind: 'added' | 'removed' | 'modified';
  /** One-sentence summary of the intent change */
  summary: string;
  /** 0–1 confidence that this is a genuine intent change, not just rewording */
  confidence: number;
}

export interface FileIntentDiff {
  /** The file slug, e.g. "auth" */
  slug: string;
  /** Path, e.g. ".vibe/features/auth.md" */
  path: string;
  /** Whether the file is new, deleted, or existed on both sides */
  status: 'added' | 'removed' | 'modified';
  /** Semantic intent deltas (empty if no meaningful intent changed) */
  deltas: IntentDelta[];
}

export interface IntentDiffResult {
  files: FileIntentDiff[];
  /** ISO timestamp of when this diff was computed */
  computedAt: string;
}

const INTENT_DIFF_PROMPT = `You are analyzing two versions of a vibe specification file to identify what INTENT changed — not what text changed.

A vibe spec describes what a feature should do: behaviors, constraints, data, dependencies. Your job is to find where the actual intended behavior differs between the two versions.

IGNORE these — they are NOT intent changes:
- Rewording that says the same thing differently
- Formatting, whitespace, markdown structure changes
- Clarifications that make existing intent more explicit without changing it
- Reordering sections or bullet points
- Grammar/spelling fixes

REPORT these — they ARE intent changes:
- New behaviors or capabilities added
- Behaviors or capabilities removed
- Constraints added or relaxed
- Data entities added, removed, or restructured
- Dependencies (Uses) added or removed
- "Never" constraints added or removed
- Changed business logic or rules

For each intent change, output a JSON object with:
- "kind": "added" | "removed" | "modified"
- "summary": one clear sentence describing what intent changed (written from the perspective of what the new version does differently)
- "confidence": 0.0–1.0 how confident you are this is a genuine intent change, not just rewording

Respond with ONLY a JSON array of intent changes. If nothing meaningful changed, respond with an empty array: []

Do not wrap in code fences. Raw JSON only.`;

function buildFilePrompt(slug: string, baseContent: string, headContent: string): string {
  return `${INTENT_DIFF_PROMPT}

## File: ${slug}.md

### Base version (before)
${baseContent || '(file did not exist)'}

### New version (after)
${headContent || '(file was deleted)'}`;
}

/**
 * Compute intent deltas for a single file pair using Gemini Flash.
 */
async function computeFileIntentDeltas(
  slug: string,
  baseContent: string,
  headContent: string,
): Promise<IntentDelta[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('No Gemini API key configured for intent diffing');

  const prompt = buildFilePrompt(slug, baseContent, headContent);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error: ${err}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (d: any) =>
        d &&
        typeof d.kind === 'string' &&
        typeof d.summary === 'string' &&
        typeof d.confidence === 'number' &&
        ['added', 'removed', 'modified'].includes(d.kind),
    );
  } catch {
    return [];
  }
}

interface VibeFile {
  path: string;
  content: string;
}

function getSlug(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/, '');
}

/**
 * Compute the full semantic intent diff between base and head feature sets.
 * Calls the LLM in parallel for all changed files.
 */
export async function computeIntentDiff(
  baseFeatures: VibeFile[],
  headFeatures: VibeFile[],
): Promise<IntentDiffResult> {
  const baseMap = new Map(baseFeatures.map((f) => [getSlug(f.path), f]));
  const headMap = new Map(headFeatures.map((f) => [getSlug(f.path), f]));

  const allSlugs = new Set([...baseMap.keys(), ...headMap.keys()]);
  const tasks: Promise<FileIntentDiff>[] = [];

  for (const slug of allSlugs) {
    const base = baseMap.get(slug);
    const head = headMap.get(slug);

    // Unchanged — skip
    if (base && head && base.content === head.content) continue;

    const status: FileIntentDiff['status'] = !base ? 'added' : !head ? 'removed' : 'modified';
    const path = (head ?? base)!.path;

    tasks.push(
      computeFileIntentDeltas(slug, base?.content ?? '', head?.content ?? '')
        .then((deltas) => ({ slug, path, status, deltas }))
        .catch(() => ({ slug, path, status, deltas: [] })),
    );
  }

  const files = await Promise.all(tasks);

  return {
    files: files.filter((f) => f.status === 'added' || f.status === 'removed' || f.deltas.length > 0),
    computedAt: new Date().toISOString(),
  };
}
