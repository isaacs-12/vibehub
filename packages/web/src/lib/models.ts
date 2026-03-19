/**
 * Model tier system.
 *
 * Determines which model and API key to use based on:
 * 1. User auth status (anonymous vs logged in)
 * 2. User's preferred model setting
 * 3. Whether the user has provided their own API key
 *
 * Tiers:
 *   - Anonymous:    cheapest platform model (free tier)
 *   - Logged in:    default platform model (free tier, slightly better)
 *   - Own API key:  any model the user selects (user's key)
 *   - (Future) Platform billing: any model, platform's key, metered usage
 */

/** All supported model definitions. */
export const MODEL_CATALOG = [
  // Google — free tier eligible
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', provider: 'google' as const, tier: 'free' as const, description: 'Best for simple, single-purpose apps' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'google' as const, tier: 'free' as const, description: 'Best for standard apps with basic logic' },
  // Google — requires own key
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', provider: 'google' as const, tier: 'byok' as const, description: 'Builds smart apps with advanced features' },
  { id: 'gemini-3.1-flash-lite-preview', name: 'Gemini 3.1 Flash Lite Preview', provider: 'google' as const, tier: 'byok' as const, description: 'Fastest way to build functional prototypes' },
  { id: 'gemini-3.1-pro-preview ', name: 'Gemini 3.1 Preview', provider: 'google' as const, tier: 'byok' as const, description: 'Builds complex, professional-grade systems' },
  // Anthropic — requires own key
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' as const, tier: 'byok' as const, description: 'Building polished, production-ready apps that look and feel professional' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' as const, tier: 'byok' as const, description: 'Massive, complex apps with deep logic and a high degree of creative nuance' },
  // OpenAI — requires own key
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' as const, tier: 'byok' as const, description: 'Quick, versatile apps with great vision and UI design' },
  { id: 'o3-mini', name: 'o3-mini', provider: 'openai' as const, tier: 'byok' as const, description: 'Heavy-duty, data-driven apps that require complex math or flawless logic' },
] as const;

export type ModelId = (typeof MODEL_CATALOG)[number]['id'];
export type Provider = 'google' | 'anthropic' | 'openai';

/** The model anonymous users get (cheapest possible). */
export const ANONYMOUS_MODEL = 'gemini-2.5-flash-lite';

/** The model logged-in users get by default (free tier). */
export const DEFAULT_LOGGED_IN_MODEL = 'gemini-2.5-flash';

/** Models available without a user-provided API key (platform-subsidized). */
export const FREE_TIER_MODELS = MODEL_CATALOG.filter((m) => m.tier === 'free').map((m) => m.id);

export function getModelDef(modelId: string) {
  return MODEL_CATALOG.find((m) => m.id === modelId) ?? null;
}

export function getProviderForModel(modelId: string): Provider {
  const model = getModelDef(modelId);
  if (model) return model.provider;
  // Infer from name
  if (modelId.startsWith('gemini')) return 'google';
  if (modelId.startsWith('claude')) return 'anthropic';
  if (modelId.startsWith('gpt') || modelId.startsWith('o3') || modelId.startsWith('o4')) return 'openai';
  return 'google'; // fallback
}

export interface ResolvedModel {
  modelId: string;
  provider: Provider;
  /** 'platform' = using platform's API key (free tier); 'user' = using user's own key */
  keySource: 'platform' | 'user';
  /** The actual API key to use (never sent to client — server-side only). */
  apiKey: string;
}

/**
 * Resolve which model and API key to use for a given context.
 *
 * @param userId - null for anonymous users
 * @param preferredModel - user's preferred model ID (from their settings)
 * @param userApiKeys - map of provider → decrypted API key (from user_api_keys table)
 */
export function resolveModel(
  userId: string | null,
  preferredModel: string | null,
  userApiKeys: Partial<Record<Provider, string>>,
): ResolvedModel {
  // Anonymous users: always cheapest platform model
  if (!userId) {
    return {
      modelId: ANONYMOUS_MODEL,
      provider: 'google',
      keySource: 'platform',
      apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    };
  }

  const modelId = preferredModel ?? DEFAULT_LOGGED_IN_MODEL;
  const model = getModelDef(modelId);
  const provider = model?.provider ?? getProviderForModel(modelId);

  // Check if this model requires a user key (BYOK tier)
  const isByok = model?.tier === 'byok';

  if (isByok) {
    const userKey = userApiKeys[provider];
    if (!userKey) {
      // User selected a BYOK model but hasn't provided a key — fall back to free tier
      return {
        modelId: DEFAULT_LOGGED_IN_MODEL,
        provider: 'google',
        keySource: 'platform',
        apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
      };
    }
    return { modelId, provider, keySource: 'user', apiKey: userKey };
  }

  // Free tier model — use platform key
  const platformKey = getPlatformKey(provider);
  return { modelId, provider, keySource: 'platform', apiKey: platformKey };
}

function getPlatformKey(provider: Provider): string {
  switch (provider) {
    case 'google': return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
    case 'anthropic': return process.env.ANTHROPIC_API_KEY || '';
    case 'openai': return process.env.OPENAI_API_KEY || '';
  }
}
