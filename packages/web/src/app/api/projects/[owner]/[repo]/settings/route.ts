import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';
import { requireAuth, isAuthError } from '@/lib/auth-middleware';

const VALID_VISIBILITIES = ['public', 'unlisted', 'private'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ owner: string; repo: string }> },
) {
  const authResult = await requireAuth(request);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  const { owner, repo } = await params;

  if (user.handle !== owner) {
    return NextResponse.json({ error: 'Only the project owner can change settings' }, { status: 403 });
  }

  const store = getStore();
  const project = await store.getProject(owner, repo);
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Apply allowed fields
  if (body.visibility !== undefined) {
    if (!VALID_VISIBILITIES.includes(body.visibility)) {
      return NextResponse.json({ error: `Invalid visibility. Must be one of: ${VALID_VISIBILITIES.join(', ')}` }, { status: 400 });
    }
    project.visibility = body.visibility;
  }
  if (body.description !== undefined) {
    project.description = body.description;
  }

  project.updatedAt = new Date().toISOString();
  await store.upsertProject(project);

  return NextResponse.json(project);
}
