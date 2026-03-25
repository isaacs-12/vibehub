/**
 * POST /api/prs/[id]/retry
 *
 * Retries compilation for an update whose compile job failed or timed out.
 * Creates a new compile job and enqueues it for the agent.
 *
 * Only the project owner can retry compilation.
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore, COMPILE_LIMITS } from '@/lib/data/store';
import { requireAuth, isAuthError } from '@/lib/auth-middleware';
import { resolveCompileModel } from '@/lib/resolve-compile-model';

interface Params { params: { id: string } }

export async function POST(req: Request, { params }: Params) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;

  const store = getStore();
  const pr = await store.getPR(params.id);
  if (!pr) return NextResponse.json({ error: 'PR not found' }, { status: 404 });

  const allProjects = await store.listProjects();
  const project = allProjects.find((p) => p.id === pr.projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (project.owner !== authResult.handle) {
    return NextResponse.json({ error: 'Only the project owner can retry compilation' }, { status: 403 });
  }

  // Check if there's already an active compile job
  const existingJob = await store.getCompileJobForPR(pr.id);
  if (existingJob && (existingJob.status === 'pending' || existingJob.status === 'running')) {
    return NextResponse.json(
      { error: 'A compilation is already in progress for this update' },
      { status: 409 },
    );
  }

  // Check concurrency limits
  const resolved = await resolveCompileModel(authResult.id);
  const activeJobs = await store.countActiveJobsForUser(authResult.id);
  const limit = resolved.keySource === 'user' ? COMPILE_LIMITS.user : COMPILE_LIMITS.platform;
  if (activeJobs >= limit) {
    return NextResponse.json(
      { error: `Compile limit reached (${activeJobs}/${limit} active). Wait for a current compile to finish.` },
      { status: 429 },
    );
  }

  const now = new Date().toISOString();
  const job = {
    id: crypto.randomUUID(),
    prId: pr.id,
    status: 'pending' as const,
    model: resolved.model,
    fastModel: resolved.fastModel,
    provider: resolved.provider,
    keySource: resolved.keySource,
    apiKey: resolved.apiKey,
    userId: authResult.id,
    createdAt: now,
  };
  await store.createCompileJob(job);

  return NextResponse.json({ status: 'queued', jobId: job.id });
}
