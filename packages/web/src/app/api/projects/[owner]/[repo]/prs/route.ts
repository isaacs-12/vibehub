import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';

interface Params { params: { owner: string; repo: string } }

export async function GET(_req: Request, { params }: Params) {
  const project = await getStore().getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  const prs = await getStore().listPRs(project.id);
  return NextResponse.json(prs);
}

export async function POST(request: Request, { params }: Params) {
  const project = await getStore().getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const body = await request.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const now = new Date().toISOString();
  const pr = {
    id: crypto.randomUUID(),
    projectId: project.id,
    title: body.title,
    author: body.author ?? 'anonymous',
    status: 'open' as const,
    headBranch: body.headBranch ?? 'feature/unnamed',
    decisionsChanged: body.decisionsChanged ?? 0,
    createdAt: now,
    updatedAt: now,
  };

  await getStore().upsertPR(pr);
  return NextResponse.json(pr, { status: 201 });
}
