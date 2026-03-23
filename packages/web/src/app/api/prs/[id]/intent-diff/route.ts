/**
 * POST /api/prs/[id]/intent-diff
 *
 * Computes (or returns cached) semantic intent diff for a PR.
 * Uses an LLM to extract what behavioral intent actually changed,
 * ignoring rewording/formatting.
 *
 * Response: IntentDiffResult
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';
import { computeIntentDiff } from '@/lib/intent-diff';

interface Params { params: { id: string } }

export async function POST(req: Request, { params }: Params) {
  const store = getStore();
  const pr = await store.getPR(params.id);
  if (!pr) return NextResponse.json({ error: 'PR not found' }, { status: 404 });

  const base = pr.intentDiff?.baseFeatures ?? [];
  const head = pr.intentDiff?.headFeatures ?? [];

  if (head.length === 0) {
    return NextResponse.json({ error: 'No head features to diff' }, { status: 400 });
  }

  // Check for force-recompute
  const body = await req.json().catch(() => null);
  const force = body?.force === true;

  // Return cached if available
  if (!force && pr.intentDiff?.semanticDiff) {
    return NextResponse.json(pr.intentDiff.semanticDiff);
  }

  // Compute fresh
  try {
    const result = await computeIntentDiff(base, head);

    // Cache on the PR record
    await store.upsertPR({
      ...pr,
      updatedAt: new Date().toISOString(),
      intentDiff: {
        ...pr.intentDiff,
        semanticDiff: result,
      },
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
