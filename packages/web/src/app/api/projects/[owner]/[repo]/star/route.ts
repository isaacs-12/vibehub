/**
 * POST /api/projects/[owner]/[repo]/star   — toggle star
 * GET  /api/projects/[owner]/[repo]/star   — check if starred
 *
 * Body: { userId: string }
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';

interface Params { params: { owner: string; repo: string } }

export async function POST(req: Request, { params }: Params) {
  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const starred = await store.isStarred(project.id, userId);
  if (starred) {
    await store.unstarProject(project.id, userId);
  } else {
    await store.starProject({
      id: `star-${project.id}-${userId}`,
      projectId: project.id,
      userId,
      createdAt: new Date().toISOString(),
    });
  }

  // Re-read to get updated count
  const updated = await store.getProject(params.owner, params.repo);
  return NextResponse.json({ starred: !starred, starCount: updated?.starCount ?? 0 });
}

export async function GET(req: Request, { params }: Params) {
  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  const starred = userId ? await store.isStarred(project.id, userId) : false;

  return NextResponse.json({ starred, starCount: project.starCount });
}
