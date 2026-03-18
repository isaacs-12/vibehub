/**
 * POST /api/projects/[owner]/[repo]/fork
 *
 * Creates a fork of this project under a new owner.
 * Body: { owner: string, repo?: string }
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';

interface Params { params: { owner: string; repo: string } }

export async function POST(req: Request, { params }: Params) {
  const store = getStore();
  const source = await store.getProject(params.owner, params.repo);
  if (!source) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const newOwner = body.owner;
  const newRepo = body.repo || params.repo;

  if (!newOwner) return NextResponse.json({ error: 'owner required' }, { status: 400 });

  // Check for name conflict
  const existing = await store.getProject(newOwner, newRepo);
  if (existing) return NextResponse.json({ error: `${newOwner}/${newRepo} already exists` }, { status: 409 });

  const forked = await store.forkProject(source.id, newOwner, newRepo);

  return NextResponse.json({
    project: forked,
    url: `/${newOwner}/${newRepo}`,
  }, { status: 201 });
}
