/**
 * POST /api/prs/[id]/revert
 *
 * Creates a new update that reverses the changes from a merged update.
 *
 * The revert is safe in the presence of subsequent merges: it uses the 3-way
 * merge infrastructure rather than naively restoring a snapshot. Specifically:
 *
 *   base   = the snapshot created by the merged PR (state after the merge)
 *   head   = the parent snapshot (state before the merge)
 *   main   = current main (which may include later merges)
 *
 * When this revert update is itself merged, the 3-way merge will:
 *   - Cleanly revert files only touched by the original PR
 *   - Surface conflicts for files touched by both the original PR and later PRs
 *   - Leave files untouched by the original PR unchanged
 *
 * Only the project owner can create a revert.
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';
import { requireAuth, isAuthError } from '@/lib/auth-middleware';

interface Params { params: { id: string } }

export async function POST(req: Request, { params }: Params) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;

  const store = getStore();
  const pr = await store.getPR(params.id);
  if (!pr) return NextResponse.json({ error: 'PR not found' }, { status: 404 });

  if (pr.status !== 'merged') {
    return NextResponse.json(
      { error: 'Can only revert a merged update' },
      { status: 409 },
    );
  }

  const allProjects = await store.listProjects();
  const project = allProjects.find((p) => p.id === pr.projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (project.owner !== authResult.handle) {
    return NextResponse.json({ error: 'Only the project owner can revert updates' }, { status: 403 });
  }

  // Find the snapshot created by this PR
  const snapshots = await store.listSnapshots(project.id);
  const prSnapshot = snapshots.find((s) => s.prId === pr.id);
  if (!prSnapshot) {
    return NextResponse.json(
      { error: 'No snapshot found for this update — cannot determine what to revert' },
      { status: 404 },
    );
  }

  // Find the parent snapshot (the state before this PR was merged)
  if (!prSnapshot.parentSnapshotId) {
    return NextResponse.json(
      { error: 'This was the first update — there is no previous state to revert to' },
      { status: 409 },
    );
  }
  const parentSnapshot = await store.getSnapshot(prSnapshot.parentSnapshotId);
  if (!parentSnapshot) {
    return NextResponse.json(
      { error: 'Parent snapshot not found — data may be corrupted' },
      { status: 500 },
    );
  }

  // Build the revert update:
  // base = what the PR created (so the 3-way merge sees what changed)
  // head = what existed before the PR (what we want to restore)
  const baseFeatures = prSnapshot.features.map((f) => ({
    path: `.vibe/features/${f.slug}.md`,
    content: f.content,
  }));
  const headFeatures = parentSnapshot.features.map((f) => ({
    path: `.vibe/features/${f.slug}.md`,
    content: f.content,
  }));

  const now = new Date().toISOString();
  const revertPR = {
    id: crypto.randomUUID(),
    projectId: project.id,
    title: `Revert: ${pr.title}`,
    author: authResult.handle,
    status: 'open' as const,
    headBranch: `revert/${pr.id.slice(0, 8)}`,
    decisionsChanged: baseFeatures.length,
    createdAt: now,
    updatedAt: now,
    intentDiff: {
      baseFeatures,
      headFeatures,
    },
  };

  await store.upsertPR(revertPR);

  return NextResponse.json({ status: 'created', pr: revertPR }, { status: 201 });
}
