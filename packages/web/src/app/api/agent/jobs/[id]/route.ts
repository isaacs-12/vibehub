/**
 * PATCH /api/agent/jobs/[id]
 *
 * Agent writes back the result of a compile job.
 * Body: { status: 'completed', prId, model?, implementationProofs: [{path, content}] }
 *    or { status: 'failed', prId, error: '...' }
 *
 * On completion the proofs are merged into the PR's intentDiff so they appear
 * in the Implementation Proofs tab immediately, and a Compilation record is created.
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
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
    const model: string = body.model ?? 'unknown';

    await store.updateCompileJob(params.id, { status: 'completed', completedAt: now });

    // Merge proofs into the PR's intentDiff
    const pr = await store.getPR(body.prId);
    if (pr) {
      if (proofs.length > 0) {
        await store.upsertPR({
          ...pr,
          updatedAt: now,
          intentDiff: { ...pr.intentDiff, implementationProofs: proofs },
        });
      }

      // Record a Compilation against the latest snapshot for this project
      const latestSnapshot = await store.getLatestSnapshot(pr.projectId);
      if (latestSnapshot) {
        await store.createCompilation({
          id: crypto.randomUUID(),
          snapshotId: latestSnapshot.id,
          projectId: pr.projectId,
          model,
          status: 'completed',
          code: proofs,
          startedAt: body.startedAt,
          completedAt: now,
          createdAt: now,
        });

        // Update project's compiledWith field
        const allProjects = await store.listProjects();
        const project = allProjects.find((p) => p.id === pr.projectId);
        if (project) {
          project.compiledWith = model;
          project.updatedAt = now;
          await store.upsertProject(project);
        }
      }
    }
  } else if (body.status === 'failed') {
    await store.updateCompileJob(params.id, {
      status: 'failed',
      completedAt: now,
      error: body.error ?? 'Unknown error',
    });

    // Record a failed Compilation too
    const pr = await store.getPR(body.prId);
    if (pr) {
      const latestSnapshot = await store.getLatestSnapshot(pr.projectId);
      if (latestSnapshot) {
        await store.createCompilation({
          id: crypto.randomUUID(),
          snapshotId: latestSnapshot.id,
          projectId: pr.projectId,
          model: body.model ?? 'unknown',
          status: 'failed',
          error: body.error ?? 'Unknown error',
          startedAt: body.startedAt,
          completedAt: now,
          createdAt: now,
        });
      }
    }
  } else {
    return NextResponse.json({ error: 'status must be completed or failed' }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
