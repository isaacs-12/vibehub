/**
 * GET  /api/user/preferences — get current user's model preferences
 * PUT  /api/user/preferences — update preferred model
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { requireAuth, isAuthError } from '@/lib/auth-middleware';
import { FREE_TIER_MODELS, MODEL_CATALOG, DEFAULT_LOGGED_IN_MODEL } from '@/lib/models';

export async function GET(req: Request) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ preferredModel: DEFAULT_LOGGED_IN_MODEL, hasApiKeys: {} });
  }

  const { db } = await import('@/lib/db/client');
  const { userModelPreferences, userApiKeys } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const [prefs] = await db.select().from(userModelPreferences).where(eq(userModelPreferences.userId, user.id)).limit(1);
  const keys = await db.select({ provider: userApiKeys.provider }).from(userApiKeys).where(eq(userApiKeys.userId, user.id));

  const hasApiKeys: Record<string, boolean> = {};
  for (const k of keys) hasApiKeys[k.provider] = true;

  return NextResponse.json({
    preferredModel: prefs?.preferredModel ?? DEFAULT_LOGGED_IN_MODEL,
    hasApiKeys,
    availableModels: MODEL_CATALOG.map((m) => ({
      ...m,
      available: m.tier === 'free' || hasApiKeys[m.provider] === true,
    })),
  });
}

export async function PUT(req: Request) {
  const authResult = await requireAuth(req);
  if (isAuthError(authResult)) return authResult;
  const user = authResult;

  const body = await req.json().catch(() => null);
  if (!body?.preferredModel) {
    return NextResponse.json({ error: 'preferredModel required' }, { status: 400 });
  }

  const model = MODEL_CATALOG.find((m) => m.id === body.preferredModel);
  if (!model) {
    return NextResponse.json({ error: 'Unknown model' }, { status: 400 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, preferredModel: body.preferredModel });
  }

  const { db } = await import('@/lib/db/client');
  const { userModelPreferences } = await import('@/lib/db/schema');

  await db.insert(userModelPreferences).values({
    id: crypto.randomUUID(),
    userId: user.id,
    preferredModel: body.preferredModel,
    createdAt: new Date(),
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: userModelPreferences.userId,
    set: { preferredModel: body.preferredModel, updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, preferredModel: body.preferredModel });
}
