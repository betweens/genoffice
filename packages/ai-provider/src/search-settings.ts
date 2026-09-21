import { ENTERPRISE_LOCKED_SEARCH_PROVIDER, type EnvLike } from './enterprise-policy'
import type {
  AiSearchProviderId,
  AiSearchProviderMeta,
  AiSearchSettings,
  AiSettings,
} from './types'

export const AI_SEARCH_PROVIDERS: AiSearchProviderMeta[] = [
  {
    id: 'genspark',
    label: 'Genspark',
    keyPlaceholder: 'Not required - sign in to Genspark',
    imageSearch: true,
  },
  { id: 'serper', label: 'Serper', keyPlaceholder: 'Serper API key', imageSearch: true },
  { id: 'tavily', label: 'Tavily', keyPlaceholder: 'tvly-...', imageSearch: false },
  { id: 'bocha', label: 'Bocha', keyPlaceholder: 'Bocha API key', imageSearch: false },
]

export function defaultAiSearchSettings(): AiSearchSettings {
  return {
    provider: ENTERPRISE_LOCKED_SEARCH_PROVIDER,
    providers: { serper: { apiKey: '' }, tavily: { apiKey: '' }, bocha: { apiKey: '' } },
  }
}

export function resolveAiSearchSettings(
  stored: Partial<AiSearchSettings> | undefined,
): AiSearchSettings {
  const defaults = defaultAiSearchSettings()
  if (!stored) return defaults
  const providers = { ...defaults.providers }
  for (const id of ['serper', 'tavily', 'bocha'] as const) {
    const key = stored.providers?.[id]?.apiKey
    if (typeof key === 'string') providers[id] = { apiKey: key.trim() }
  }
  return { provider: stored.provider ?? defaults.provider, providers }
}

/** Enterprise fork: web search is locked to Bocha; a missing key does not fall back to Genspark. */
export function activeSearchProvider(
  _settings: Pick<AiSettings, 'search'>,
  _env?: EnvLike,
): AiSearchProviderId {
  return ENTERPRISE_LOCKED_SEARCH_PROVIDER
}
