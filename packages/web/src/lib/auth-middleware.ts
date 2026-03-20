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

/** Validate a Bearer token (JWT signed with AUTH_SECRET). */
async function getUserFromToken(token: string): Promise<AuthUser | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  try {
    const { jwtVerify } = await import('jose');
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);

    if (!payload.sub || !payload.handle) return null;

    return {
      id: payload.sub,
      handle: payload.handle as string,
      email: (payload.email as string) ?? '',
      name: (payload.name as string) ?? (payload.handle as string),
      avatarUrl: (payload.avatarUrl as string) ?? null,
    };
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

/**
 * Check that the authenticated user owns the given project.
 * Returns a 403 response if not, or null if the check passes.
 */
export function requireOwnership(
  user: AuthUser,
  projectOwner: string,
): NextResponse | null {
  if (user.handle !== projectOwner) {
    return NextResponse.json(
      { error: 'You do not have write access to this project' },
      { status: 403 },
    );
  }
  return null;
}

/**
 * For private/unlisted projects, verify the requester has access.
 * Public projects are always readable. Private projects require the owner.
 * Unlisted projects are accessible to anyone with the URL (no check).
 *
 * Returns a 403/404 response if blocked, or null if access is allowed.
 */
export async function requireReadAccess(
  req: Request,
  project: { owner: string; visibility?: string },
): Promise<NextResponse | null> {
  const visibility = project.visibility ?? 'public';
  if (visibility === 'public' || visibility === 'unlisted') return null;

  // Private — only the owner can read
  const user = await getAuthUser(req);
  if (!user || user.handle !== project.owner) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}
