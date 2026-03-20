/**
 * GET /api/auth/desktop-callback
 *
 * After Google login completes, the desktop app redirects here.
 * This endpoint reads the NextAuth session cookie and issues a
 * long-lived API token that the desktop app stores in the OS keychain.
 *
 * The desktop flow:
 *  1. Desktop opens system browser to /login?desktop=1
 *  2. User completes Google OAuth (handled by NextAuth)
 *  3. After login, user lands on this callback page
 *  4. This page generates a token and redirects to vibehub://auth?token=...
 *  5. Tauri captures the deep link and stores the token
 */
import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { auth } from '@/lib/auth';

export async function GET() {
  const session = await auth();
  const userId = (session as any)?.userId;

  if (!userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Create a persistent session token for the desktop app
  if (process.env.DATABASE_URL) {
    const { db } = await import('@/lib/db/client');
    const { sessions } = await import('@/lib/db/schema');

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year

    await db.insert(sessions).values({
      id: token,
      userId,
      expiresAt,
      createdAt: new Date(),
    });

    // Redirect to the custom scheme that Tauri will intercept
    return NextResponse.redirect(`vibehub://auth?token=${token}`);
  }

  return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
}
