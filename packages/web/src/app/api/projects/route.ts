import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';

export async function GET() {
  try {
    const projects = await getStore().listProjects();
    return NextResponse.json(projects);
  } catch (err) {
    console.error('GET /api/projects failed:', err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message || 'Failed to list projects' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
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
      forkedFromId: body.forkedFromId ?? null,
      compiledWith: body.compiledWith ?? null,
      visibility: (body.visibility ?? 'public') as 'public' | 'unlisted' | 'private',
      starCount: 0,
      forkCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    const store = getStore();
    await store.upsertProject(project);

    // If features are provided (e.g. from import), create initial snapshot
    const features: { slug: string; content: string }[] = Array.isArray(body.features) ? body.features : [];
    if (features.length > 0) {
      for (const f of features) {
        await store.upsertFeature({
          id: crypto.randomUUID(),
          projectId: project.id,
          name: f.slug,
          slug: f.slug,
          content: f.content,
          createdAt: now,
          updatedAt: now,
        });
      }
      await store.createSnapshot({
        id: crypto.randomUUID(),
        projectId: project.id,
        version: 0,
        features,
        message: 'Initial import',
        author: body.owner,
        parentSnapshotId: null,
        forkedFromSnapshotId: null,
        createdAt: now,
      });
    }

    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/projects failed:', err);
    return NextResponse.json(
      { error: message || 'Failed to create project' },
      { status: 500 },
    );
  }
}
