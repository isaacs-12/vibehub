/**
 * Agent job queue API — consumed by the external agent worker service.
 *
 * GET  /api/agent/jobs/next  → claims and returns the next pending job (or 204 if none)
 *
 * The agent service is a separate, independently-scalable process. It polls this endpoint,
 * runs the agentic compile loop, then PATCHes /api/agent/jobs/[id] with the results.
 *
 * Auth: set AGENT_SECRET env var; agent must send `Authorization: Bearer <secret>`.
 * Omit AGENT_SECRET in dev to skip auth.
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';

function checkAuth(req: Request): boolean {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return true; // no secret configured → open in dev
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

/** Claim the next pending job. Returns 204 if queue is empty. */
export async function GET(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const store = getStore();
  const job = await store.claimNextPendingJob();
  if (!job) return new NextResponse(null, { status: 204 });

  // Attach the PR so the agent has the vibe files without a second request
  const pr = await store.getPR(job.prId);

  // Attach the project so the agent can access description + framework for ideation
  let project: { description?: string; framework?: string | null } | null = null;
  if (pr) {
    const fullProject = await store.getProjectById(pr.projectId);
    if (fullProject) {
      project = { description: fullProject.description, framework: fullProject.framework ?? null };
    }
  }

  return NextResponse.json({ job, pr, project });
}
