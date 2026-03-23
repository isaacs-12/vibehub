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

  // ── Incremental event push (no status change) ──
  if (body?.events && !body?.status) {
    const events = Array.isArray(body.events) ? body.events : [];
    if (events.length > 0) {
      await getStore().appendCompileJobEvents(params.id, events);
    }
    return NextResponse.json({ ok: true });
  }

  if (!body?.status || !body?.prId) {
    return NextResponse.json({ error: 'status and prId are required' }, { status: 400 });
  }

  const store = getStore();
  const now = new Date().toISOString();

  if (body.status === 'completed') {
    const proofs: { path: string; content: string }[] = Array.isArray(body.implementationProofs)
      ? body.implementationProofs
      : [];
    const generatedVibes: { path: string; content: string }[] = Array.isArray(body.generatedVibes)
      ? body.generatedVibes
      : [];
    const model: string = body.model ?? 'unknown';

    await store.updateCompileJob(params.id, { status: 'completed', completedAt: now });

    // Merge proofs (and generated vibes) into the PR's intentDiff
    const pr = await store.getPR(body.prId);
    if (pr) {
      const updatedDiff = { ...pr.intentDiff };
      if (proofs.length > 0) updatedDiff.implementationProofs = proofs;
      if (generatedVibes.length > 0) updatedDiff.headFeatures = generatedVibes;

      if (proofs.length > 0 || generatedVibes.length > 0) {
        await store.upsertPR({
          ...pr,
          updatedAt: now,
          intentDiff: updatedDiff,
        });
      }

      // If the agent generated vibes (ideation), persist them as project features + snapshot
      if (generatedVibes.length > 0) {
        const featureRecords = generatedVibes.map((f) => ({
          id: crypto.randomUUID(),
          projectId: pr.projectId,
          name: f.path.replace(/^\.vibe\/features\//, '').replace(/\.md$/, ''),
          slug: f.path.replace(/^\.vibe\/features\//, '').replace(/\.md$/, ''),
          content: f.content,
          createdAt: now,
          updatedAt: now,
        }));
        for (const feat of featureRecords) {
          await store.upsertFeature(feat);
        }
        await store.createSnapshot({
          id: crypto.randomUUID(),
          projectId: pr.projectId,
          version: 0,
          features: featureRecords.map((f) => ({ slug: f.slug, content: f.content })),
          message: 'Initial features from ideation',
          author: pr.author ?? 'ai',
          parentSnapshotId: null,
          forkedFromSnapshotId: null,
          createdAt: now,
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
