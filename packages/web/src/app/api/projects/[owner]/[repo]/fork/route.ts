/**
 * POST /api/projects/[owner]/[repo]/fork
 *
 * Creates a fork of this project under the authenticated user's handle.
 * Body: { repo?: string }
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';
import { requireAuth, isAuthError } from '@/lib/auth-middleware';

interface Params { params: { owner: string; repo: string } }

export async function POST(req: Request, { params }: Params) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  const store = getStore();
  const source = await store.getProject(params.owner, params.repo);
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const newOwner = user.handle;
  const newRepo = body.repo || params.repo;

  // Check for name conflict
  const existing = await store.getProject(newOwner, newRepo);
  if (existing) return NextResponse.json({ error: `${newOwner}/${newRepo} already exists` }, { status: 409 });

  const forked = await store.forkProject(source.id, newOwner, newRepo);

  return NextResponse.json({
    project: forked,
    url: `/${newOwner}/${newRepo}`,
  }, { status: 201 });
}
