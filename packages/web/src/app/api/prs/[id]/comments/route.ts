import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';
import { requireAuth, isAuthError, requireReadAccess } from '@/lib/auth-middleware';

interface Params { params: { id: string } }

/** Resolve the project that owns a PR so we can check visibility. */
async function getProjectForPR(prId: string) {
  const store = getStore();
  const pr = await store.getPR(prId);
  if (!pr) return null;
  return store.getProjectById(pr.projectId);
}

export async function GET(_req: Request, { params }: Params) {
  const project = await getProjectForPR(params.id);
  if (project) {
    const denied = await requireReadAccess(_req, project);
    if (denied) return denied;
  }

  const comments = await getStore().listComments(params.id);
  return NextResponse.json(comments);
}

export async function POST(request: Request, { params }: Params) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  const body = await request.json().catch(() => null);
  if (!body?.content) return NextResponse.json({ error: 'content is required' }, { status: 400 });

  const comment = {
    id: crypto.randomUUID(),
    prId: params.id,
    author: user.handle,
    content: body.content,
    createdAt: new Date().toISOString(),
  };

  await getStore().addComment(comment);
  return NextResponse.json(comment, { status: 201 });
}
