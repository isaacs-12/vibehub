/**
 * PATCH /api/agent/jobs/[id]
 *
 * Agent writes back the result of a compile job.
 * Body: { status: 'completed', prId, implementationProofs: [{path, content}] }
 *    or { status: 'failed', prId, error: '...' }
 *
 * On completion the proofs are merged into the PR's intentDiff so they appear
 * in the Implementation Proofs tab immediately.
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';

interface Params { params: { id: string } }

function checkAuth(req: Request): boolean {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return true;
  return (req.headers.get('authorization') ?? '') === `Bearer ${secret}`;
}

export async function PATCH(req: Request, { params }: Params) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.status || !body?.prId) {
    return NextResponse.json({ error: 'status and prId are required' }, { status: 400 });
  }

  const store = getStore();
  const now = new Date().toISOString();

  if (body.status === 'completed') {
    const proofs: { path: string; content: string }[] = Array.isArray(body.implementationProofs)
      ? body.implementationProofs
      : [];

    await store.updateCompileJob(params.id, { status: 'completed', completedAt: now });

    if (proofs.length > 0) {
      const pr = await store.getPR(body.prId);
      if (pr) {
        await store.upsertPR({
          ...pr,
          updatedAt: now,
          intentDiff: { ...pr.intentDiff, implementationProofs: proofs },
        });
      }
    }
  } else if (body.status === 'failed') {
    await store.updateCompileJob(params.id, {
      status: 'failed',
      completedAt: now,
      error: body.error ?? 'Unknown error',
    });
  } else {
    return NextResponse.json({ error: 'status must be completed or failed' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
