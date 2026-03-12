import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { features } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }
  const rows = await db.select().from(features).where(eq(features.projectId, projectId));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const { id, projectId, name, slug, content } = body;
  if (!id || !projectId || !name || !content) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  await db
    .insert(features)
    .values({ id, projectId, name, slug: slug ?? name.toLowerCase().replace(/\s+/g, '-'), content })
    .onConflictDoUpdate({
      target: features.id,
      set: { content, name, updatedAt: new Date() },
    });
  return NextResponse.json({ ok: true });
}
