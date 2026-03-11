import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';

export async function GET() {
  const projects = await getStore().listProjects();
  return NextResponse.json(projects);
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body?.owner || !body?.repo) {
    return NextResponse.json({ error: 'owner and repo are required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const project = {
    id: crypto.randomUUID(),
    owner: body.owner.trim(),
    repo: body.repo.trim(),
    description: body.description?.trim() ?? '',
    createdAt: now,
    updatedAt: now,
  };

  await getStore().upsertProject(project);
  return NextResponse.json(project, { status: 201 });
}
