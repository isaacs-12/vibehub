import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth-middleware';

export async function GET(req: Request) {
  // Supports both NextAuth session cookies (web) and Bearer tokens (desktop/CLI)
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}
