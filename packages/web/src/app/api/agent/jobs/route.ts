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
  const job = await getStore().claimNextPendingJob();
  if (!job) return new NextResponse(null, { status: 204 });

  // Attach the PR so the agent has the vibe files without a second request
  const pr = await getStore().getPR(job.prId);
  return NextResponse.json({ job, pr });
}
