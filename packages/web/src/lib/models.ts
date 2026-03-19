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
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', provider: 'google' as const, tier: 'free' as const, description: 'Fast and cheap, great for simple projects' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' as const, tier: 'free' as const, description: 'Good balance of speed and quality' },
  // Google — requires own key
  { id: 'gemini-2.5-flash-preview', name: 'Gemini 2.5 Flash', provider: 'google' as const, tier: 'byok' as const, description: 'Latest Gemini, strong reasoning' },
  { id: 'gemini-2.5-pro-preview', name: 'Gemini 2.5 Pro', provider: 'google' as const, tier: 'byok' as const, description: 'Top-tier Gemini model' },
  // Anthropic — requires own key
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', provider: 'anthropic' as const, tier: 'byok' as const, description: 'Fast, excellent code quality' },
  { id: 'claude-opus-4-6', name: 'Claude Opus 4.6', provider: 'anthropic' as const, tier: 'byok' as const, description: 'Most capable, best for complex projects' },
  // OpenAI — requires own key
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' as const, tier: 'byok' as const, description: 'OpenAI flagship' },
  { id: 'o3-mini', name: 'o3-mini', provider: 'openai' as const, tier: 'byok' as const, description: 'OpenAI reasoning model' },
] as const;

export type ModelId = (typeof MODEL_CATALOG)[number]['id'];
export type Provider = 'google' | 'anthropic' | 'openai';

/** The model anonymous users get (cheapest possible). */
export const ANONYMOUS_MODEL = 'gemini-2.0-flash-lite';

/** The model logged-in users get by default (free tier). */
export const DEFAULT_LOGGED_IN_MODEL = 'gemini-2.0-flash';

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
