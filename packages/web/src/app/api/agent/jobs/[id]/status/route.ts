/**
 * GET /api/agent/jobs/[id]/status
 *
 * Returns the current status and progress events for a compile job.
 * Frontend polls this while status is 'pending' or 'running'.
 *
 * Query params:
 *   after — index of last seen event (returns only newer events)
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';

interface Params { params: { id: string } }

export async function GET(req: Request, { params }: Params) {
  const store = getStore();
  const job = await store.getCompileJob(params.id);
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const url = new URL(req.url);
  const after = Number(url.searchParams.get('after') ?? -1);
  const allEvents = job.events ?? [];
  const events = after >= 0 ? allEvents.slice(after + 1) : allEvents;

  return NextResponse.json({
    status: job.status,
    startedAt: job.startedAt ?? null,
    completedAt: job.completedAt ?? null,
    error: job.error ?? null,
    events,
    eventCount: allEvents.length,
  });
}
