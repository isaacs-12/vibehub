/**
 * POST /api/projects/[owner]/[repo]/star   — toggle star (auth required)
 * GET  /api/projects/[owner]/[repo]/star   — check if starred
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';
import { requireAuth, isAuthError, getAuthUser, requireReadAccess } from '@/lib/auth-middleware';

interface Params { params: { owner: string; repo: string } }

export async function POST(req: Request, { params }: Params) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Can't star your own project
  if (project.owner === user.handle) {
    return NextResponse.json({ error: 'You cannot star your own project' }, { status: 400 });
  }

  const starred = await store.isStarred(project.id, user.id);
  if (starred) {
    await store.unstarProject(project.id, user.id);
  } else {
    await store.starProject({
      id: `star-${project.id}-${user.id}`,
      projectId: project.id,
      userId: user.id,
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

  const denied = await requireReadAccess(req, project);
  if (denied) return denied;

  const user = await getAuthUser(req);
  const starred = user ? await store.isStarred(project.id, user.id) : false;

  return NextResponse.json({ starred, starCount: project.starCount });
}
