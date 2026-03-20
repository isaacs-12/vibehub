import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';
import type { CompileJob } from '@/lib/data/store';
import { requireAuth, isAuthError, requireOwnership, requireReadAccess } from '@/lib/auth-middleware';
import { resolveCompileModel } from '@/lib/resolve-compile-model';

interface Params { params: { owner: string; repo: string } }

export async function GET(_req: Request, { params }: Params) {
  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const denied = await requireReadAccess(_req, project);
  if (denied) return denied;

  const prs = await store.listPRs(project.id);
  return NextResponse.json(prs);
}

export async function POST(request: Request, { params }: Params) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  const project = await getStore().getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  // Only the project owner can create PRs (push)
  const ownerCheck = requireOwnership(user, project.owner);
  if (ownerCheck) return ownerCheck;

  const body = await request.json().catch(() => null);
  if (!body?.title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const now = new Date().toISOString();
  const headBranch = body.headBranch ?? 'feature/unnamed';
  const isFeatureEntry = (f: unknown) => f && typeof f === 'object' && 'path' in f && 'content' in f;
  const features: { path: string; content: string }[] = Array.isArray(body.features)
    ? body.features.filter(isFeatureEntry)
    : [];
  const baseFeatures: { path: string; content: string }[] = Array.isArray(body.baseFeatures)
    ? body.baseFeatures.filter(isFeatureEntry)
    : [];
  const implementationProofs: { path: string; content: string }[] = Array.isArray(body.implementationProofs)
    ? body.implementationProofs.filter(isFeatureEntry)
    : [];

  const hasIntent = features.length > 0 || implementationProofs.length > 0;
  const pr = {
    id: crypto.randomUUID(),
    projectId: project.id,
    title: body.title,
    author: user.handle,
    status: 'open' as const,
    headBranch,
    decisionsChanged: body.decisionsChanged ?? features.length,
    createdAt: now,
    updatedAt: now,
    intentDiff: hasIntent ? {
      baseFeatures: baseFeatures.length > 0 ? baseFeatures : undefined,
      headFeatures: features.length > 0 ? features : undefined,
      implementationProofs: implementationProofs.length > 0 ? implementationProofs : undefined,
    } : undefined,
  };

  const store = getStore();
  await store.upsertPR(pr);

  // If the PR includes new features and no base was provided, snapshot current state as base
  if (features.length > 0 && baseFeatures.length === 0) {
    const currentFeatures = await store.listFeatures(project.id);
    if (currentFeatures.length > 0) {
      const latestSnapshot = await store.getLatestSnapshot(project.id);
      if (!latestSnapshot) {
        await store.createSnapshot({
          id: crypto.randomUUID(),
          projectId: project.id,
          version: 0,
          features: currentFeatures.map((f) => ({ slug: f.slug, content: f.content })),
          message: 'Base state before PR',
          parentSnapshotId: null,
          forkedFromSnapshotId: null,
          createdAt: now,
        });
      }
    }
  }

  // Resolve which model/key to use based on the user's preferences
  const resolved = await resolveCompileModel(user.id);

  // Enqueue a cloud compile job so the agent can produce robust implementation proofs.
  const job: CompileJob = {
    id: crypto.randomUUID(),
    prId: pr.id,
    status: 'pending',
    model: resolved.model,
    fastModel: resolved.fastModel,
    provider: resolved.provider,
    keySource: resolved.keySource,
    apiKey: resolved.apiKey,
    userId: user.id,
    createdAt: now,
  };
  await store.createCompileJob(job);

  return NextResponse.json(pr, { status: 201 });
}
