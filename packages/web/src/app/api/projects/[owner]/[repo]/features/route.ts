/**
 * GET /api/projects/[owner]/[repo]/features
 *
 * Returns the current main-branch vibe files for a project.
 * Used by the desktop app's "Pull" command to sync local .vibe/features/
 * with the merged state stored in the web backend.
 */
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/data/store';
import { requireReadAccess } from '@/lib/auth-middleware';

interface Params { params: { owner: string; repo: string } }

export async function GET(_req: Request, { params }: Params) {
  const store = getStore();
  const project = await store.getProject(params.owner, params.repo);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

  const denied = await requireReadAccess(_req, project);
  if (denied) return denied;

  const features = await store.listFeatures(project.id);
  const files = features.map((f) => ({
    path: `.vibe/features/${f.slug}.md`,
    content: f.content,
    updatedAt: f.updatedAt,
  }));

  return NextResponse.json(files);
}
