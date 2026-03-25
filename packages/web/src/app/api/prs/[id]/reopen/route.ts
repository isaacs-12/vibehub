/**
 * POST /api/prs/[id]/reopen
 *
 * Reopens a previously closed update. Only works on updates with status 'closed'.
 * Merged updates cannot be reopened.
 *
 * Only the project owner can reopen an update.
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';
import { requireAuth, isAuthError } from '@/lib/auth-middleware';

interface Params { params: { id: string } }

export async function POST(req: Request, { params }: Params) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;

  const store = getStore();
  const pr = await store.getPR(params.id);
  if (!pr) return NextResponse.json({ error: 'PR not found' }, { status: 404 });

  if (pr.status !== 'closed') {
    return NextResponse.json(
      { error: pr.status === 'merged' ? 'Cannot reopen a merged update' : 'Update is not closed' },
      { status: 409 },
    );
  }

  const allProjects = await store.listProjects();
  const project = allProjects.find((p) => p.id === pr.projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (project.owner !== authResult.handle) {
    return NextResponse.json({ error: 'Only the project owner can reopen updates' }, { status: 403 });
  }

  const now = new Date().toISOString();
  await store.upsertPR({ ...pr, status: 'open', updatedAt: now });

  return NextResponse.json({ status: 'open', pr: { ...pr, status: 'open', updatedAt: now } });
}
