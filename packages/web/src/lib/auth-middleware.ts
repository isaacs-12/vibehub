/**
 * Auth helpers for API routes.
 *
 * Supports two auth methods:
 * 1. NextAuth session cookie (web app)
 * 2. Bearer token in Authorization header (desktop app / CLI)
 */
import { NextResponse } from 'next/server';
import { auth, AuthError } from './auth';

export interface AuthUser {
  id: string;
  handle: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}

/** Extract the authenticated user from either session cookie or Bearer token. */
export async function getAuthUser(req: Request): Promise<AuthUser | null> {
  // 1. Check for Bearer token (desktop / CLI)
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    return getUserFromToken(token);
  }

  // 2. Fall back to NextAuth session cookie
  const session = await auth();
  if (!session?.user?.email) return null;
  const s = session as any;
  if (!s.userId) return null;
  return {
    id: s.userId,
    handle: s.handle,
    email: session.user.email,
    name: session.user.name ?? s.handle,
    avatarUrl: s.avatarUrl ?? session.user.image ?? null,
  };
}

/** Validate a Bearer token against the sessions table. */
async function getUserFromToken(token: string): Promise<AuthUser | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const { db } = await import('./db/client');
    const { sessions, users } = await import('./db/schema');
    const { eq, and, gt } = await import('drizzle-orm');

    const [row] = await db
      .select({
        id: users.id,
        handle: users.handle,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl,
      })
      .from(sessions)
      .innerJoin(users, eq(sessions.userId, users.id))
      .where(and(eq(sessions.id, token), gt(sessions.expiresAt, new Date())))
      .limit(1);

    if (!row) return null;
    return { ...row, name: row.name ?? row.handle, avatarUrl: row.avatarUrl ?? null };
  } catch {
    return null;
  }
}

/** Require auth or return a 401 response. Use in API routes. */
export async function requireAuth(req: Request): Promise<AuthUser | NextResponse> {
  const user = await getAuthUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return user;
}

/** Type guard for use after requireAuth */
export function isAuthError(result: AuthUser | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
