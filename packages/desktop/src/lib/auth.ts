/**
 * Desktop auth utilities.
 *
 * Flow:
 * 1. User clicks "Sign in" → opens system browser to VIBEHUB_WEB_URL/login?desktop=1
 * 2. After Google OAuth, web redirects to /api/auth/desktop-callback
 * 3. Callback creates a persistent token and redirects to vibehub://auth?token=...
 * 4. Tauri captures the deep link, extracts the token, fetches /api/auth/me
 * 5. Token + user info are stored in localStorage via Zustand
 */

import { useVibeStore, type AuthUser } from '../store';

const WEB_URL = import.meta.env.VITE_VIBEHUB_WEB_URL || 'http://localhost:3000';

/** Open system browser to start the Google login flow. */
export async function startLogin() {
  const { open } = await import('@tauri-apps/plugin-shell');
  await open(`${WEB_URL}/login?desktop=1`);
}

/** Handle the vibehub://auth?token=... deep link callback. */
export async function handleAuthDeepLink(url: string) {
  const parsed = new URL(url);
  const token = parsed.searchParams.get('token');
  if (!token) return;

  // Fetch user info using the token
  const res = await fetch(`${WEB_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return;

  const { user } = await res.json() as { user: AuthUser };
  if (!user) return;

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

      // Validate the token is still valid in the background
      fetch(`${WEB_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => {
        if (!res.ok) {
          useVibeStore.getState().clearAuth();
        }
      }).catch(() => {});
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
