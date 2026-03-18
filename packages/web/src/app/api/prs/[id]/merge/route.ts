/**
 * POST /api/prs/[id]/merge
 *
 * Phase 1 — called without a body:
 *   Runs 3-way conflict detection between baseFeatures (main at branch time),
 *   headFeatures (the PR), and the project's current main features.
 *   → 200  { status: 'merged' }           — no conflicts, merged
 *   → 409  { conflicts: MergeConflict[] } — conflicts found, needs resolution
 *
 * Phase 2 — called with { resolutions }:
 *   Resolutions provided by the resolver UI after the user chose accept-head /
 *   accept-main / AI-feathered content per conflicting file.
 *   → 200  { status: 'merged' }
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';
import { detectConflicts, computeMergedVibes, changedFiles } from '@/lib/vibe-merge';

interface Params { params: { id: string } }

export async function POST(req: Request, { params }: Params) {
  const store = getStore();
  const pr = await store.getPR(params.id);
  if (!pr) return NextResponse.json({ error: 'PR not found' }, { status: 404 });
  if (pr.status !== 'open') {
    return NextResponse.json({ error: `PR is already ${pr.status}` }, { status: 409 });
  }

  // Find the project so we can look up current main features
  const allProjects = await store.listProjects();
  const project = allProjects.find((p) => p.id === pr.projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const baseFeatures = pr.intentDiff?.baseFeatures ?? [];
  const headFeatures = pr.intentDiff?.headFeatures ?? [];
  const mainFeaturesRaw = await store.listFeatures(project.id);
  const mainFeatures = mainFeaturesRaw.map((f) => ({
    path: `.vibe/features/${f.slug}.md`,
    content: f.content,
  }));

  // Parse resolutions if the caller already resolved conflicts
  const body = await req.json().catch(() => null) as null | {
    resolutions?: Record<string, string>; // slug → resolved content
  };
  const resolutionMap = new Map<string, string>(
    Object.entries(body?.resolutions ?? {}),
  );

  // Detect conflicts (skip if resolutions cover everything)
  const conflicts = baseFeatures.length > 0
    ? detectConflicts(baseFeatures, headFeatures, mainFeatures)
    : [];

  const unresolvedConflicts = conflicts.filter((c) => !resolutionMap.has(c.name));
  if (unresolvedConflicts.length > 0) {
    return NextResponse.json({ conflicts: unresolvedConflicts }, { status: 409 });
  }

  // Compute merged vibes and sync features table
  const merged = computeMergedVibes(baseFeatures, headFeatures, mainFeatures, resolutionMap);
  const now = new Date().toISOString();

  for (const { path, content } of merged) {
    const slug = path.split('/').pop()?.replace('.md', '') ?? path;
    const existing = mainFeaturesRaw.find((f) => f.slug === slug);
    await store.upsertFeature({
      id: existing?.id ?? crypto.randomUUID(),
      projectId: project.id,
      name: slug,
      slug,
      content,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  // Create an immutable spec snapshot of the merged state
  const latestSnapshot = await store.getLatestSnapshot(project.id);
  await store.createSnapshot({
    id: crypto.randomUUID(),
    projectId: project.id,
    version: 0, // auto-assigned by store
    features: merged.map(({ path, content }) => ({
      slug: path.split('/').pop()?.replace('.md', '') ?? path,
      content,
    })),
    message: pr.title,
    author: pr.author,
    prId: pr.id,
    parentSnapshotId: latestSnapshot?.id ?? null,
    forkedFromSnapshotId: null,
    createdAt: now,
  });

  // Mark PR merged, store merged vibes in intentDiff for the compile job
  const mergedPR = {
    ...pr,
    status: 'merged' as const,
    updatedAt: now,
    intentDiff: {
      ...pr.intentDiff,
      headFeatures: merged, // overwrite with the fully-merged set
    },
  };
  await store.upsertPR(mergedPR);

  // Enqueue compile job scoped to the changed files only
  const oldMain = mainFeatures;
  const filesToRecompile = changedFiles(oldMain, merged);
  await store.createCompileJob({
    id: crypto.randomUUID(),
    prId: pr.id,
    status: 'pending',
    createdAt: now,
  });

  void filesToRecompile; // agent reads headFeatures from the PR; scoped recompile is future work

  return NextResponse.json({ status: 'merged', pr: mergedPR });
}
