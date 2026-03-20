/**
 * GET  /api/projects/[owner]/[repo]/compilations           — list all compilations for project
 * POST /api/projects/[owner]/[repo]/compilations           — record a new compilation
 * PATCH /api/projects/[owner]/[repo]/compilations?id=...   — update compilation status/code
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';
import { requireAuth, isAuthError } from '@/lib/auth-middleware';

interface Params { params: { owner: string; repo: string } }

export async function GET(_req: Request, { params }: Params) {
  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const compilations = await store.listProjectCompilations(project.id);
  return NextResponse.json(compilations);
}

export async function POST(req: Request, { params }: Params) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;

  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  if (!body.snapshotId || !body.model) {
    return NextResponse.json({ error: 'snapshotId and model required' }, { status: 400 });
  }

  // Verify snapshot exists and belongs to this project
  const snapshot = await store.getSnapshot(body.snapshotId);
  if (!snapshot || snapshot.projectId !== project.id) {
    return NextResponse.json({ error: 'Snapshot not found for this project' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const compilation = {
    id: crypto.randomUUID(),
    snapshotId: body.snapshotId,
    projectId: project.id,
    model: body.model,
    status: (body.status ?? 'pending') as 'pending' | 'running' | 'completed' | 'failed',
    code: body.code ?? null,
    error: body.error,
    startedAt: body.startedAt,
    completedAt: body.completedAt,
    createdAt: now,
  };

  await store.createCompilation(compilation);

  // Update project's compiledWith field
  if (compilation.status === 'completed') {
    project.compiledWith = compilation.model;
    project.updatedAt = now;
    await store.upsertProject(project);
  }

  return NextResponse.json(compilation, { status: 201 });
}

export async function PATCH(req: Request, { params }: Params) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;

  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const compilationId = url.searchParams.get('id');
  if (!compilationId) return NextResponse.json({ error: 'id query param required' }, { status: 400 });

  const body = await req.json();
  await store.updateCompilation(compilationId, body);

  // Update project's compiledWith when compilation completes
  if (body.status === 'completed' && body.model) {
    project.compiledWith = body.model;
    project.updatedAt = new Date().toISOString();
    await store.upsertProject(project);
  }

  return NextResponse.json({ ok: true });
}
