import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { getStore } from '@/lib/data/store';

interface Params { params: { id: string } }

export async function GET(_req: Request, { params }: Params) {
  const comments = await getStore().listComments(params.id);
  return NextResponse.json(comments);
}

export async function POST(request: Request, { params }: Params) {
  const body = await request.json().catch(() => null);
  if (!body?.content) return NextResponse.json({ error: 'content is required' }, { status: 400 });

  const comment = {
    id: crypto.randomUUID(),
    prId: params.id,
    author: body.author ?? 'anonymous',
    content: body.content,
    createdAt: new Date().toISOString(),
  };

  await getStore().addComment(comment);
  return NextResponse.json(comment, { status: 201 });
}
