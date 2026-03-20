/**
 * GET /api/projects/[owner]/[repo]/snapshot
 *
 * Returns the full project snapshot consumed by `vibe clone`.
 * Shape matches the Go `Snapshot` struct in packages/cli/internal/project/project.go.
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';

interface Params { params: { owner: string; repo: string } }

export async function GET(_req: Request, { params }: Params) {
  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const [features, latestSnapshot] = await Promise.all([
    store.listFeatures(project.id),
    store.getLatestSnapshot(project.id),
  ]);

  // If a specific snapshot version is requested via ?version=N, serve that instead
  const url = new URL(_req.url);
  const requestedVersion = url.searchParams.get('version');
  let snapshotFeatures = features.map((f) => ({ name: f.slug, content: f.content }));
  let snapshotId = latestSnapshot?.id ?? null;
  let snapshotVersion = latestSnapshot?.version ?? null;

  if (requestedVersion && latestSnapshot) {
    const snapshots = await store.listSnapshots(project.id);
    const target = snapshots.find((s) => s.version === parseInt(requestedVersion, 10));
    if (target) {
      snapshotFeatures = target.features.map((f) => ({ name: f.slug, content: f.content }));
      snapshotId = target.id;
      snapshotVersion = target.version;
    }
  }

  return NextResponse.json({
    name: project.repo,
    owner: project.owner,
    description: project.description,
    forkedFromId: project.forkedFromId ?? null,
    compiledWith: project.compiledWith ?? null,
    starCount: project.starCount,
    forkCount: project.forkCount,
    snapshotId,
    snapshotVersion,
    features: snapshotFeatures,
    requirements: [],
    mapping: {},
  });
}
