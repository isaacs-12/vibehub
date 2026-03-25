/**
 * POST /api/prs/[id]/close
 *
 * Closes an open update without merging. The spec changes are preserved
 * but will not be applied to main.
 *
 * Only the project owner can close an update.
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

  if (pr.status !== 'open') {
    return NextResponse.json(
      { error: `Cannot close an update that is already ${pr.status}` },
      { status: 409 },
    );
  }

  const allProjects = await store.listProjects();
  const project = allProjects.find((p) => p.id === pr.projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  if (project.owner !== authResult.handle) {
    return NextResponse.json({ error: 'Only the project owner can close updates' }, { status: 403 });
  }

  const now = new Date().toISOString();
  await store.upsertPR({ ...pr, status: 'closed', updatedAt: now });

  return NextResponse.json({ status: 'closed', pr: { ...pr, status: 'closed', updatedAt: now } });
}
