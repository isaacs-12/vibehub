import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }
  try {
    const features = await getStore().listFeatures(projectId);
    return NextResponse.json(features);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, projectId, name, slug, content } = body;
    if (!id || !projectId || !name || !content) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const store = getStore();
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
      author: body.author,
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
