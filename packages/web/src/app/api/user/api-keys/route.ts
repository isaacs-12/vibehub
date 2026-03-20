/**
 * GET    /api/user/api-keys — list which providers have keys configured (never returns actual keys)
 * POST   /api/user/api-keys — add/update an API key for a provider
 * DELETE /api/user/api-keys — remove an API key for a provider
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth, isAuthError } from '@/lib/auth-middleware';
import { encrypt } from '@/lib/crypto';

const VALID_PROVIDERS = ['google', 'anthropic', 'openai'];

export async function GET(req: Request) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ keys: [] });
  }

  const { db } = await import('@/lib/db/client');
  const { userApiKeys } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const rows = await db.select({
    provider: userApiKeys.provider,
    updatedAt: userApiKeys.updatedAt,
  }).from(userApiKeys).where(eq(userApiKeys.userId, user.id));

  return NextResponse.json({
    keys: rows.map((r) => ({
      provider: r.provider,
      // Show masked hint, never the actual key
      configured: true,
      updatedAt: r.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  const body = await req.json().catch(() => null);
  if (!body?.provider || !body?.apiKey) {
    return NextResponse.json({ error: 'provider and apiKey required' }, { status: 400 });
  }
  if (!VALID_PROVIDERS.includes(body.provider)) {
    return NextResponse.json({ error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true });
  }

  const { db } = await import('@/lib/db/client');
  const { userApiKeys } = await import('@/lib/db/schema');

  const encryptedKey = encrypt(body.apiKey);

  await db.insert(userApiKeys).values({
    id: crypto.randomUUID(),
    userId: user.id,
    provider: body.provider,
    encryptedApiKey: encryptedKey,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: [userApiKeys.userId, userApiKeys.provider],
    set: { encryptedApiKey: encryptedKey, updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  const body = await req.json().catch(() => null);
  if (!body?.provider) {
    return NextResponse.json({ error: 'provider required' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true });
  }

  const { db } = await import('@/lib/db/client');
  const { userApiKeys } = await import('@/lib/db/schema');
  const { eq, and } = await import('drizzle-orm');

  await db.delete(userApiKeys).where(
    and(eq(userApiKeys.userId, user.id), eq(userApiKeys.provider, body.provider)),
  );

  return NextResponse.json({ ok: true });
}
