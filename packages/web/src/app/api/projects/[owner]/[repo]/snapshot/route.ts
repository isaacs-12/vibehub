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

  const features = await store.listFeatures(project.id);

  return NextResponse.json({
    name: project.repo,
    features: features.map((f) => ({ name: f.slug, content: f.content })),
    requirements: [],
    mapping: {},
  });
}
