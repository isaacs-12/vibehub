/**
 * Zombie job reaper — marks stale running jobs as failed.
 *
 * POST /api/agent/jobs/reap  { startedBefore: ISO string }
 *
 * Called periodically by agent workers. Any job still in "running" state
 * that was started before the cutoff is assumed dead and marked failed.
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';

function checkAuth(req: Request): boolean {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body?.startedBefore) {
    return NextResponse.json({ error: 'startedBefore is required' }, { status: 400 });
  }

  const store = getStore();
  const stale = await store.findStaleRunningJobs(body.startedBefore);

  let reaped = 0;
  for (const job of stale) {
    await store.updateCompileJob(job.id, {
      status: 'failed',
      error: 'Job timed out (exceeded 15 minute limit)',
      completedAt: new Date().toISOString(),
    });
    reaped++;
    console.log(`[reap] marked job ${job.id} as failed (started ${job.startedAt})`);
  }

  return NextResponse.json({ reaped });
}
