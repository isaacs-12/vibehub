/**
 * Desktop auth utilities.
 *
 * Flow:
 * 1. User clicks "Sign in" → opens system browser to VIBEHUB_WEB_URL/login?desktop=1
 * 2. After Google OAuth, web redirects to /api/auth/desktop-callback
 * 3. Callback creates a JWT and redirects to vibehub://auth?token=...
 * 4. Tauri captures the deep link, decodes the JWT payload
 * 5. Token + user info are stored in localStorage via Zustand
 */

import { useVibeStore, type AuthUser } from '../store';

const WEB_URL = import.meta.env.VITE_VIBEHUB_WEB_URL || 'http://localhost:3000';

/** The login URL for the desktop auth flow. */
export function getLoginUrl() {
  return `${WEB_URL}/login?desktop=1`;
}

/** Open system browser to start the Google login flow. */
export async function startLogin() {
  const { open } = await import('@tauri-apps/plugin-shell');
  await open(getLoginUrl());
}

/** Decode a JWT payload without verification (the server signed it, we trust it). */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
}

/** Handle the vibehub://auth?token=... deep link callback. */
export async function handleAuthDeepLink(url: string) {
  const parsed = new URL(url);
  const token = parsed.searchParams.get('token');
  if (!token) return;

  // Decode user info from the JWT payload
  const payload = decodeJwtPayload(token);
  if (!payload?.sub || !payload?.handle) return;

  const user: AuthUser = {
    id: payload.sub as string,
    handle: payload.handle as string,
    email: (payload.email as string) ?? '',
    name: (payload.name as string) ?? (payload.handle as string),
    avatarUrl: (payload.avatarUrl as string) ?? null,
  };

  useVibeStore.getState().setAuth(user, token);
}

/** Restore auth from localStorage on app startup. */
export function restoreAuth() {
  try {
    const token = localStorage.getItem('vibehub_auth_token');
    const userJson = localStorage.getItem('vibehub_auth_user');
    if (token && userJson) {
      const user = JSON.parse(userJson) as AuthUser;
      useVibeStore.setState({ authUser: user, authToken: token });

      // Check if JWT is expired
      const payload = decodeJwtPayload(token);
      if (payload?.exp && (payload.exp as number) * 1000 < Date.now()) {
        useVibeStore.getState().clearAuth();
      }
    }
  } catch {
    // localStorage not available or corrupt
  }
}

/** Get auth headers for API requests. */
export function getAuthHeaders(): Record<string, string> {
  const token = useVibeStore.getState().authToken;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
