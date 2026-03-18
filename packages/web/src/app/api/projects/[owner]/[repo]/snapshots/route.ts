/**
 * GET  /api/projects/[owner]/[repo]/snapshots  — list all spec snapshots (version history)
 * POST /api/projects/[owner]/[repo]/snapshots  — manually create a snapshot (e.g. from desktop push)
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';

interface Params { params: { owner: string; repo: string } }

export async function GET(_req: Request, { params }: Params) {
  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const snapshots = await store.listSnapshots(project.id);

  // Enrich each snapshot with its compilations
  const enriched = await Promise.all(
    snapshots.map(async (s) => {
      const compilations = await store.listCompilations(s.id);
      return { ...s, compilations };
    }),
  );

  return NextResponse.json(enriched);
}

export async function POST(req: Request, { params }: Params) {
  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  if (!body.features || !Array.isArray(body.features)) {
    return NextResponse.json({ error: 'features array required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const latestSnapshot = await store.getLatestSnapshot(project.id);

  const snapshot = await store.createSnapshot({
    id: crypto.randomUUID(),
    projectId: project.id,
    version: 0, // auto-assigned
    features: body.features,
    message: body.message ?? 'Manual snapshot',
    author: body.author,
    prId: body.prId,
    parentSnapshotId: latestSnapshot?.id ?? null,
    forkedFromSnapshotId: null,
    createdAt: now,
  });

  return NextResponse.json(snapshot, { status: 201 });
}
