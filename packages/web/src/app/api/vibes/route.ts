import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';
import { requireAuth, isAuthError, requireReadAccess } from '@/lib/auth-middleware';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }
  try {
    const store = getStore();

    // Resolve project to check visibility
    const project = await store.getProjectById(projectId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    const denied = await requireReadAccess(request, project);
    if (denied) return denied;

    const features = await store.listFeatures(projectId);
    return NextResponse.json(features);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  // Require authentication
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  try {
    const body = await request.json();
    const { id, projectId, name, slug, content } = body;
    if (!id || !projectId || !name || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const store = getStore();

    // Verify user owns this project
    const project = await store.getProjectById(projectId);
    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    if (project.owner !== user.handle) {
      return NextResponse.json({ error: 'You do not have write access to this project' }, { status: 403 });
    }

    const now = new Date().toISOString();
    const featureSlug = slug ?? name.toLowerCase().replace(/\s+/g, '-');

    await store.upsertFeature({
      id,
      projectId,
      name,
      slug: featureSlug,
      content,
      createdAt: now,
      updatedAt: now,
    });

    // Create a snapshot capturing the new state of all features
    const allFeatures = await store.listFeatures(projectId);
    const latestSnapshot = await store.getLatestSnapshot(projectId);
    await store.createSnapshot({
      id: crypto.randomUUID(),
      projectId,
      version: 0, // auto-assigned
      features: allFeatures.map((f) => ({ slug: f.slug, content: f.content })),
      message: `Updated feature: ${name}`,
      author: user.handle,
      parentSnapshotId: latestSnapshot?.id ?? null,
      forkedFromSnapshotId: null,
      createdAt: now,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
