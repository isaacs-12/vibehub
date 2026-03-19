/**
 * Resolves which model and API key to use for a compile job.
 * Called when a PR is created or merged to populate the CompileJob with model info.
 */
import { resolveModel, type Provider, DEFAULT_LOGGED_IN_MODEL, ANONYMOUS_MODEL } from './models';

interface ResolveResult {
  model: string;
  provider: string;
  keySource: string;
  apiKey?: string;
}

/**
 * Look up a user's preferred model and API keys, then resolve the compile config.
 * Falls back gracefully if DB is unavailable.
 */
export async function resolveCompileModel(userId: string | null): Promise<ResolveResult> {
  if (!userId || !process.env.DATABASE_URL) {
    return {
      model: userId ? DEFAULT_LOGGED_IN_MODEL : ANONYMOUS_MODEL,
      provider: 'google',
      keySource: 'platform',
    };
  }

  try {
    const { db } = await import('./db/client');
    const { userModelPreferences, userApiKeys } = await import('./db/schema');
    const { eq } = await import('drizzle-orm');

    // Get user's preferred model
    const [prefs] = await db.select().from(userModelPreferences).where(eq(userModelPreferences.userId, userId)).limit(1);
    const preferredModel = prefs?.preferredModel ?? DEFAULT_LOGGED_IN_MODEL;

    // Get user's API keys (encrypted)
    const keys = await db.select().from(userApiKeys).where(eq(userApiKeys.userId, userId));
    const userKeys: Partial<Record<Provider, string>> = {};
    for (const k of keys) {
      userKeys[k.provider as Provider] = k.encryptedApiKey; // keep encrypted — agent decrypts
    }

    const resolved = resolveModel(userId, preferredModel, userKeys);

    return {
      model: resolved.modelId,
      provider: resolved.provider,
      keySource: resolved.keySource,
      // Pass encrypted key if using user's key (agent will decrypt server-side)
      apiKey: resolved.keySource === 'user' ? userKeys[resolved.provider] : undefined,
    };
  } catch {
    return {
      model: DEFAULT_LOGGED_IN_MODEL,
      provider: 'google',
      keySource: 'platform',
    };
  }
}
