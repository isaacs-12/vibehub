import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';
import type { CompileJob } from '@/lib/data/store';
import { COMPILE_LIMITS } from '@/lib/data/store';
import { requireAuth, isAuthError } from '@/lib/auth-middleware';
import { resolveCompileModel } from '@/lib/resolve-compile-model';

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
    const authResult = await requireAuth(request);
    if (isAuthError(authResult)) return authResult;
    const user = authResult;

    const body = await request.json().catch(() => null);
    const repo = body?.repo;
    if (!repo) {
      return NextResponse.json({ error: 'repo is required' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      owner: user.handle,
      repo: repo.trim(),
      description: body.description?.trim() ?? '',
      framework: body.framework ?? null,
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
        author: user.handle,
        parentSnapshotId: null,
        forkedFromSnapshotId: null,
        createdAt: now,
      });
    }

    // Auto-create an initial PR + compile job when a description is provided
    // so the agent can ideate features and compile code automatically.
    let initialPrId: string | null = null;
    if (project.description && features.length === 0) {
      const pr = {
        id: crypto.randomUUID(),
        projectId: project.id,
        title: project.description,
        author: user.handle,
        status: 'open' as const,
        headBranch: 'feature/initial',
        decisionsChanged: 0,
        createdAt: now,
        updatedAt: now,
        intentDiff: undefined,
      };
      await store.upsertPR(pr);
      initialPrId = pr.id;

      // Enqueue compile job (same logic as PR creation route)
      const resolved = await resolveCompileModel(user.id);
      const activeJobs = await store.countActiveJobsForUser(user.id);
      const limit = resolved.keySource === 'user' ? COMPILE_LIMITS.user : COMPILE_LIMITS.platform;
      if (activeJobs < limit) {
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
      }
    }

    return NextResponse.json({ ...project, initialPrId }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('POST /api/projects failed:', err);
    return NextResponse.json(
      { error: message || 'Failed to create project' },
      { status: 500 },
    );
  }
}
