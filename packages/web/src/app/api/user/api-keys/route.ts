/**
 * GET    /api/user/api-keys — list which providers have keys configured (never returns actual keys)
 * POST   /api/user/api-keys — add/update an API key for a provider
 * DELETE /api/user/api-keys — remove an API key for a provider
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth, isAuthError } from '@/lib/auth-middleware';

// Simple symmetric encryption for API keys at rest.
// In production, use a KMS (e.g., GCP KMS, AWS KMS) instead.
function encrypt(text: string): string {
  const secret = process.env.AUTH_SECRET || 'dev-secret-do-not-use-in-prod';
  const key = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted: string): string {
  const secret = process.env.AUTH_SECRET || 'dev-secret-do-not-use-in-prod';
  const key = crypto.createHash('sha256').update(secret).digest();
  const [ivHex, encHex] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/** Exported for use by the model resolver when building compile jobs. */
export { decrypt as decryptApiKey };

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
