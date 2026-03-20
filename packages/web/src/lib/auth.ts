/**
 * NextAuth v5 configuration — Google OAuth with Drizzle-backed user storage.
 *
 * Desktop apps authenticate by opening the browser login flow, then capturing
 * the session token via a callback redirect to a custom scheme (vibehub://).
 */

import NextAuth, { type NextAuthResult } from 'next-auth';
import Google from 'next-auth/providers/google';
import crypto from 'crypto';

const nextAuth: NextAuthResult = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === 'production'
        ? '__Secure-authjs.session-token'
        : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 30 * 24 * 60 * 60, // 30 days — persists across browser restarts
      },
    },
  },

  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== 'google') return false;

      // Upsert user in our DB
      const googleId = account.providerAccountId;
      const email = user.email!;
      const name = user.name ?? email.split('@')[0];
      const avatarUrl = user.image ?? null;

      // Generate handle from email prefix, sanitized
      const baseHandle = email.split('@')[0].replace(/[^a-z0-9_-]/gi, '-').toLowerCase();

      if (process.env.DATABASE_URL) {
        const { db } = await import('./db/client');
        const { users } = await import('./db/schema');
        const { eq } = await import('drizzle-orm');

        const [existing] = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);

        if (existing) {
          // Update profile info on each login
          await db.update(users).set({
            email,
            name,
            avatarUrl,
            updatedAt: new Date(),
          }).where(eq(users.id, existing.id));
        } else {
          // New user — ensure unique handle
          let handle = baseHandle;
          let suffix = 0;
          while (true) {
            const [conflict] = await db.select().from(users).where(eq(users.handle, handle)).limit(1);
            if (!conflict) break;
            suffix++;
            handle = `${baseHandle}-${suffix}`;
          }

          await db.insert(users).values({
            id: crypto.randomUUID(),
            googleId,
            email,
            name,
            avatarUrl,
            handle,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      }

      return true;
    },

    async jwt({ token, account }) {
      if (account?.provider === 'google') {
        token.googleId = account.providerAccountId;
      }
      // Attach our DB user info to the token
      if (token.googleId && process.env.DATABASE_URL) {
        try {
          const { db } = await import('./db/client');
          const { users } = await import('./db/schema');
          const { eq } = await import('drizzle-orm');
          const [dbUser] = await db.select().from(users).where(eq(users.googleId, token.googleId as string)).limit(1);
          if (dbUser) {
            token.userId = dbUser.id;
            token.handle = dbUser.handle;
            token.avatarUrl = dbUser.avatarUrl;
          }
        } catch {
          // DB not available (local dev without postgres) — fall through
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.userId) {
        (session as any).userId = token.userId;
        (session as any).handle = token.handle;
        (session as any).avatarUrl = token.avatarUrl;
        if (token.avatarUrl && session.user) {
          session.user.image = token.avatarUrl as string;
        }
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
  },
});

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;
export const auth: NextAuthResult['auth'] = nextAuth.auth;

/** Helper to get current user ID from a server-side context. Returns null if unauthenticated. */
export async function getCurrentUser(): Promise<{ id: string; handle: string; email: string; name: string; avatarUrl: string | null } | null> {
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

/** Helper for API routes — returns user or throws a 401-like error. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('Authentication required');
  return user;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
