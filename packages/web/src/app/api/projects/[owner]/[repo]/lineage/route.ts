/**
 * GET /api/projects/[owner]/[repo]/lineage
 *
 * Returns the full family tree: root project + all variants (forks),
 * with rollup star count. Used for the "Other versions" section.
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';

interface Params { params: { owner: string; repo: string } }

export async function GET(_req: Request, { params }: Params) {
  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const family = await store.getProjectFamily(project.id);
  if (!family) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(family);
}
