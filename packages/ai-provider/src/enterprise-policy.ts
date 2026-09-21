import type {
  AiMediaProviderConfig,
  AiMediaProviderId,
  AiMediaProviderMeta,
  AiMediaSettings,
  AiProviderConfig,
  AiProviderId,
  AiProviderMeta,
  AiSearchProviderId,
  AiSearchProviderMeta,
  AiSearchSettings,
  AiSettings,
} from './types'

/**
 * Enterprise fork: chat and media are locked to the OpenAI-compatible `custom`
 * provider; web search is locked to Bocha. Runtime credentials come from
 * process env (Electron inherits launch env); nothing here hardcodes secrets.
 *
 *   GENOFFICE_AI_PROVIDER       coerced to `custom`
 *   GENOFFICE_AI_BASE_URL       OpenAI-compatible base URL (chat; media fallback)
 *   GENOFFICE_AI_API_KEY        API key (chat; media fallback)
 *   GENOFFICE_AI_MODEL          prefills the chat model id when stored is empty
 *   GENOFFICE_AI_MEDIA_API_KEY  media custom key (falls back to GENOFFICE_AI_API_KEY)
 *   GENOFFICE_AI_MEDIA_BASE_URL media custom URL (falls back to GENOFFICE_AI_BASE_URL)
 *   GENOFFICE_AI_SEARCH_API_KEY Bocha key (falls back to BOCHA_API_KEY)
 */
export const GENOFFICE_AI_PROVIDER_ENV = 'GENOFFICE_AI_PROVIDER'
export const GENOFFICE_AI_BASE_URL_ENV = 'GENOFFICE_AI_BASE_URL'
export const GENOFFICE_AI_API_KEY_ENV = 'GENOFFICE_AI_API_KEY'
export const GENOFFICE_AI_MODEL_ENV = 'GENOFFICE_AI_MODEL'
export const GENOFFICE_AI_MEDIA_API_KEY_ENV = 'GENOFFICE_AI_MEDIA_API_KEY'
export const GENOFFICE_AI_MEDIA_BASE_URL_ENV = 'GENOFFICE_AI_MEDIA_BASE_URL'
export const GENOFFICE_AI_SEARCH_API_KEY_ENV = 'GENOFFICE_AI_SEARCH_API_KEY'
export const BOCHA_API_KEY_ENV = 'BOCHA_API_KEY'

export const ENTERPRISE_LOCKED_PROVIDER: AiProviderId = 'custom'
export const ENTERPRISE_ALLOWED_PROVIDERS = ['custom'] as const satisfies readonly AiProviderId[]
export const ENTERPRISE_LOCKED_MEDIA_PROVIDER: AiMediaProviderId = 'custom'
export const ENTERPRISE_LOCKED_SEARCH_PROVIDER: AiSearchProviderId = 'bocha'

export type EnvLike = Record<string, string | undefined>

export interface EnterpriseAiUiPolicy {
  readonly lockProvider: true
  readonly allowedProviders: typeof ENTERPRISE_ALLOWED_PROVIDERS
  readonly readOnlyKey: true
  readonly readOnlyBaseUrl: true
  readonly provider: typeof ENTERPRISE_LOCKED_PROVIDER
  readonly lockMediaProvider: true
  readonly mediaProvider: typeof ENTERPRISE_LOCKED_MEDIA_PROVIDER
  readonly lockSearchProvider: true
  readonly searchProvider: typeof ENTERPRISE_LOCKED_SEARCH_PROVIDER
}

/** UI lock flags — no secrets, safe to ship in the renderer bundle. */
export const ENTERPRISE_AI_UI_POLICY: EnterpriseAiUiPolicy = {
  lockProvider: true,
  allowedProviders: ENTERPRISE_ALLOWED_PROVIDERS,
  readOnlyKey: true,
  readOnlyBaseUrl: true,
  provider: ENTERPRISE_LOCKED_PROVIDER,
  lockMediaProvider: true,
  mediaProvider: ENTERPRISE_LOCKED_MEDIA_PROVIDER,
  lockSearchProvider: true,
  searchProvider: ENTERPRISE_LOCKED_SEARCH_PROVIDER,
}

export interface EnterpriseAiPolicy extends EnterpriseAiUiPolicy {
  readonly apiKey: string
  readonly baseUrl: string
  readonly model: string
  readonly mediaApiKey: string
  readonly mediaBaseUrl: string
  readonly searchApiKey: string
}

function processEnv(): EnvLike {
  return typeof process !== 'undefined' && process.env ? process.env : {}
}

function trimEnv(value: string | undefined): string {
  return value?.trim() ?? ''
}

/** Read the enterprise env overlay. Chat/media provider is always `custom`; search is Bocha. */
export function readEnterpriseAiEnv(env?: EnvLike): {
  provider: typeof ENTERPRISE_LOCKED_PROVIDER
  baseUrl: string
  apiKey: string
  model: string
  mediaApiKey: string
  mediaBaseUrl: string
  searchApiKey: string
} {
  const source = env ?? processEnv()
  const apiKey = trimEnv(source[GENOFFICE_AI_API_KEY_ENV])
  const baseUrl = trimEnv(source[GENOFFICE_AI_BASE_URL_ENV])
  return {
    provider: ENTERPRISE_LOCKED_PROVIDER,
    baseUrl,
    apiKey,
    model: trimEnv(source[GENOFFICE_AI_MODEL_ENV]),
    mediaApiKey: trimEnv(source[GENOFFICE_AI_MEDIA_API_KEY_ENV]) || apiKey,
    mediaBaseUrl: trimEnv(source[GENOFFICE_AI_MEDIA_BASE_URL_ENV]) || baseUrl,
    searchApiKey:
      trimEnv(source[GENOFFICE_AI_SEARCH_API_KEY_ENV]) || trimEnv(source[BOCHA_API_KEY_ENV]),
  }
}

export function enterpriseAiPolicy(env?: EnvLike): EnterpriseAiPolicy {
  const seeded = readEnterpriseAiEnv(env)
  return {
    ...ENTERPRISE_AI_UI_POLICY,
    apiKey: seeded.apiKey,
    baseUrl: seeded.baseUrl,
    model: seeded.model,
    mediaApiKey: seeded.mediaApiKey,
    mediaBaseUrl: seeded.mediaBaseUrl,
    searchApiKey: seeded.searchApiKey,
  }
}

/** Last-4 mask for Settings. Empty stays empty so ops can see that config is missing. */
export function maskApiKey(apiKey: string | undefined): string {
  const key = apiKey?.trim() ?? ''
  if (!key) return ''
  if (isMaskedApiKey(key)) return key
  if (key.length <= 4) return '****'
  return `****${key.slice(-4)}`
}

/** Display masks start with asterisks; a real key must never be persisted from one. */
export function isMaskedApiKey(apiKey: string | undefined): boolean {
  const key = apiKey?.trim() ?? ''
  return key.length > 0 && key.startsWith('*')
}

export function filterAiProviderCatalog<T extends Pick<AiProviderMeta, 'id'>>(
  catalog: readonly T[],
): T[] {
  return catalog.filter((entry) => entry.id === ENTERPRISE_LOCKED_PROVIDER)
}

export function filterAiMediaProviderCatalog<T extends Pick<AiMediaProviderMeta, 'id'>>(
  catalog: readonly T[],
): T[] {
  return catalog.filter((entry) => entry.id === ENTERPRISE_LOCKED_MEDIA_PROVIDER)
}

export function filterAiSearchProviderCatalog<T extends Pick<AiSearchProviderMeta, 'id'>>(
  catalog: readonly T[],
): T[] {
  return catalog.filter((entry) => entry.id === ENTERPRISE_LOCKED_SEARCH_PROVIDER)
}

function customSlot(settings?: {
  providers?: AiSettings['providers'] | undefined
}): AiProviderConfig {
  return settings?.providers?.custom ?? { apiKey: '', model: '', baseUrl: '' }
}

function mediaCustomSlot(
  media?: Pick<Partial<AiMediaSettings>, 'providers'>,
): AiMediaProviderConfig {
  return (
    media?.providers?.custom ?? {
      apiKey: '',
      imageModel: '',
      analysisModel: '',
      baseUrl: '',
    }
  )
}

function restoreReadOnlySecret(
  incoming: string | undefined,
  previous: string | undefined,
  envOwned: string,
): string {
  const value = incoming ?? ''
  if (envOwned || isMaskedApiKey(value) || !value.trim()) return previous ?? ''
  return value
}

function lockSearchSettings(
  search: AiSearchSettings | undefined,
  policy: EnterpriseAiPolicy,
): AiSearchSettings {
  const providers = {
    serper: { apiKey: '' },
    tavily: { apiKey: '' },
    bocha: { apiKey: '' },
    ...search?.providers,
  }
  const current = providers.bocha?.apiKey ?? ''
  providers.bocha = { apiKey: policy.searchApiKey || current || '' }
  return {
    provider: ENTERPRISE_LOCKED_SEARCH_PROVIDER,
    providers,
  }
}

function lockMediaSettings(
  media: AiMediaSettings | undefined,
  policy: EnterpriseAiPolicy,
): AiMediaSettings | undefined {
  if (!media) return media
  const current = mediaCustomSlot(media)
  const custom: AiMediaProviderConfig = {
    ...current,
    apiKey: policy.mediaApiKey || current.apiKey || '',
    baseUrl: policy.mediaBaseUrl || current.baseUrl || '',
  }
  return {
    ...media,
    imageProvider: ENTERPRISE_LOCKED_MEDIA_PROVIDER,
    analysisProvider: ENTERPRISE_LOCKED_MEDIA_PROVIDER,
    videoAnalysisProvider: ENTERPRISE_LOCKED_MEDIA_PROVIDER,
    providers: {
      ...media.providers,
      custom,
    },
  }
}

/**
 * Force chat `provider = custom`, media caps to `custom`, search to `bocha`,
 * and overlay env-supplied keys / URLs / model. Env key and URL always win
 * when set. Env chat model only fills an empty slot so the Settings free-text
 * field stays editable after a prefill.
 */
export function applyEnterpriseAiPolicy(settings: AiSettings, env?: EnvLike): AiSettings {
  const policy = enterpriseAiPolicy(env)
  const current = customSlot(settings)
  const custom: AiProviderConfig = {
    ...current,
    apiKey: policy.apiKey || current.apiKey || '',
    baseUrl: policy.baseUrl || current.baseUrl || '',
    model: current.model?.trim() ? current.model : policy.model || current.model || '',
  }
  return {
    ...settings,
    provider: ENTERPRISE_LOCKED_PROVIDER,
    providers: {
      ...settings.providers,
      custom,
    },
    media: lockMediaSettings(settings.media, policy),
    search: lockSearchSettings(settings.search, policy),
  }
}

/**
 * Save path: lock chat/media/search providers, refuse masked keys, and keep
 * env-owned key/URL off disk (they are re-injected on every resolve). A
 * blank/masked incoming key restores the previous on-disk value so Save cannot
 * wipe policy.
 */
export function persistEnterpriseAiSettings(
  incoming: AiSettings,
  previous?: Pick<Partial<AiSettings>, 'providers' | 'media' | 'search'> | undefined,
  env?: EnvLike,
): AiSettings {
  const policy = enterpriseAiPolicy(env)
  const next = applyEnterpriseAiPolicy({ ...incoming, provider: ENTERPRISE_LOCKED_PROVIDER }, env)
  const incomingCustom = customSlot(incoming)
  const previousCustom = customSlot(previous)
  const apiKey = restoreReadOnlySecret(incomingCustom.apiKey, previousCustom.apiKey, policy.apiKey)
  const baseUrl = restoreReadOnlySecret(
    incomingCustom.baseUrl,
    previousCustom.baseUrl,
    policy.baseUrl,
  )

  const incomingMedia = mediaCustomSlot(incoming.media)
  const previousMedia = mediaCustomSlot(previous?.media)
  const mediaApiKey = restoreReadOnlySecret(
    incomingMedia.apiKey,
    previousMedia.apiKey,
    policy.mediaApiKey,
  )
  const mediaBaseUrl = restoreReadOnlySecret(
    incomingMedia.baseUrl,
    previousMedia.baseUrl,
    policy.mediaBaseUrl,
  )

  const incomingBocha = incoming.search?.providers.bocha?.apiKey
  const previousBocha = previous?.search?.providers.bocha?.apiKey
  const searchApiKey = restoreReadOnlySecret(incomingBocha, previousBocha, policy.searchApiKey)

  const media = next.media
    ? {
        ...next.media,
        imageProvider: ENTERPRISE_LOCKED_MEDIA_PROVIDER,
        analysisProvider: ENTERPRISE_LOCKED_MEDIA_PROVIDER,
        videoAnalysisProvider: ENTERPRISE_LOCKED_MEDIA_PROVIDER,
        providers: {
          ...next.media.providers,
          custom: {
            ...next.media.providers.custom,
            apiKey: mediaApiKey,
            baseUrl: mediaBaseUrl,
          },
        },
      }
    : next.media

  return {
    ...next,
    provider: ENTERPRISE_LOCKED_PROVIDER,
    providers: {
      ...next.providers,
      custom: {
        ...next.providers.custom,
        apiKey,
        baseUrl,
      },
    },
    media,
    search: {
      provider: ENTERPRISE_LOCKED_SEARCH_PROVIDER,
      providers: {
        serper: { apiKey: '' },
        tavily: { apiKey: '' },
        ...next.search?.providers,
        bocha: { apiKey: searchApiKey },
      },
    },
  }
}

/** Codex auto-discovers; custom OpenAI-compatible endpoints may be anonymous. */
export function allowsKeylessChat(provider: AiProviderId): boolean {
  return provider === 'codex' || provider === ENTERPRISE_LOCKED_PROVIDER
}

/** Apply the lock to an IPC chat/stream payload so the renderer cannot switch away. */
export function resolveLockedChatRequest(
  settings: AiSettings,
  env?: EnvLike,
): { settings: AiSettings; provider: AiProviderId; config: AiProviderConfig } {
  const effective = applyEnterpriseAiPolicy(settings, env)
  return {
    settings: effective,
    provider: ENTERPRISE_LOCKED_PROVIDER,
    config: effective.providers[ENTERPRISE_LOCKED_PROVIDER],
  }
}
