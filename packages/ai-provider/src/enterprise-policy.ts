import {
  EMPTY_ENTERPRISE_AI_BUILD_DEFAULTS,
  type EnterpriseAiBuildDefaults,
} from './enterprise-defaults'
import { ENTERPRISE_AI_BUILD_DEFAULTS } from './enterprise-defaults.generated'
import {
  ENTERPRISE_AI_UI_POLICY,
  ENTERPRISE_LOCKED_MEDIA_PROVIDER,
  ENTERPRISE_LOCKED_PROVIDER,
  ENTERPRISE_LOCKED_SEARCH_PROVIDER,
  isMaskedApiKey,
  type EnterpriseAiUiPolicy,
  type EnvLike,
} from './enterprise-ui'
import type {
  AiMediaProviderConfig,
  AiMediaSettings,
  AiProviderConfig,
  AiProviderId,
  AiSearchSettings,
  AiSettings,
} from './types'

export {
  ENTERPRISE_AI_UI_POLICY,
  ENTERPRISE_ALLOWED_PROVIDERS,
  ENTERPRISE_LOCKED_MEDIA_PROVIDER,
  ENTERPRISE_LOCKED_PROVIDER,
  ENTERPRISE_LOCKED_SEARCH_PROVIDER,
  filterAiMediaProviderCatalog,
  filterAiProviderCatalog,
  filterAiSearchProviderCatalog,
  isMaskedApiKey,
  maskApiKey,
  withEnterpriseMediaCapabilities,
} from './enterprise-ui'
export type { EnterpriseAiUiPolicy, EnvLike } from './enterprise-ui'

/**
 * Enterprise fork: chat and media are locked to the OpenAI-compatible `custom`
 * provider; web search is locked to Bocha; Genspark cloud tools stay off (the
 * Settings switch is hidden). Runtime credentials come from process env first,
 * then packager-baked defaults (`enterprise-defaults.generated.ts`), then
 * empty. Nothing here hardcodes secrets.
 *
 *   GENOFFICE_AI_PROVIDER         coerced to `custom`
 *   GENOFFICE_AI_BASE_URL         OpenAI-compatible base URL (chat; media fallback)
 *   GENOFFICE_AI_API_KEY          API key (chat; media fallback)
 *   GENOFFICE_AI_MODEL            prefills the chat model id when stored is empty
 *   GENOFFICE_AI_MEDIA_API_KEY    media custom key (falls back to GENOFFICE_AI_API_KEY)
 *   GENOFFICE_AI_MEDIA_BASE_URL   media custom URL (falls back to GENOFFICE_AI_BASE_URL)
 *   GENOFFICE_AI_IMAGE_MODEL      prefills Custom image model when stored is empty
 *   GENOFFICE_AI_ANALYSIS_MODEL   prefills Custom analysis model when stored is empty
 *   GENOFFICE_AI_VIDEO_MODEL      prefills Custom video model when stored is empty
 *                                 (falls back to GENOFFICE_AI_ANALYSIS_MODEL)
 *   GENOFFICE_AI_SEARCH_API_KEY   Bocha key (falls back to BOCHA_API_KEY)
 *
 * Packaged apps do not inherit the packager's shell env on double-click.
 * Export the vars above before `npm run dist:*` so
 * `tools/generate-enterprise-defaults.mjs` bakes them into the bundle.
 */
export const GENOFFICE_AI_PROVIDER_ENV = 'GENOFFICE_AI_PROVIDER'
export const GENOFFICE_AI_BASE_URL_ENV = 'GENOFFICE_AI_BASE_URL'
export const GENOFFICE_AI_API_KEY_ENV = 'GENOFFICE_AI_API_KEY'
export const GENOFFICE_AI_MODEL_ENV = 'GENOFFICE_AI_MODEL'
export const GENOFFICE_AI_MEDIA_API_KEY_ENV = 'GENOFFICE_AI_MEDIA_API_KEY'
export const GENOFFICE_AI_MEDIA_BASE_URL_ENV = 'GENOFFICE_AI_MEDIA_BASE_URL'
export const GENOFFICE_AI_IMAGE_MODEL_ENV = 'GENOFFICE_AI_IMAGE_MODEL'
export const GENOFFICE_AI_ANALYSIS_MODEL_ENV = 'GENOFFICE_AI_ANALYSIS_MODEL'
export const GENOFFICE_AI_VIDEO_MODEL_ENV = 'GENOFFICE_AI_VIDEO_MODEL'
export const GENOFFICE_AI_SEARCH_API_KEY_ENV = 'GENOFFICE_AI_SEARCH_API_KEY'
export const BOCHA_API_KEY_ENV = 'BOCHA_API_KEY'

export interface EnterpriseAiPolicy extends EnterpriseAiUiPolicy {
  readonly apiKey: string
  readonly baseUrl: string
  readonly model: string
  readonly mediaApiKey: string
  readonly mediaBaseUrl: string
  readonly imageModel: string
  readonly analysisModel: string
  readonly videoModel: string
  readonly searchApiKey: string
}

function processEnv(): EnvLike {
  return typeof process !== 'undefined' && process.env ? process.env : {}
}

function trimEnv(value: string | undefined): string {
  return value?.trim() ?? ''
}

function firstNonEmpty(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = trimEnv(value)
    if (trimmed) return trimmed
  }
  return ''
}

/** When `env` is omitted (production), overlay process.env then baked defaults. Tests pass `env` to isolate from the generated file. */
function resolveOverlaySources(
  env?: EnvLike,
  baked?: EnvLike,
): { runtime: EnvLike; defaults: EnvLike } {
  const runtime = env ?? processEnv()
  const defaults: EnvLike =
    baked ?? (env === undefined ? ENTERPRISE_AI_BUILD_DEFAULTS : EMPTY_ENTERPRISE_AI_BUILD_DEFAULTS)
  return { runtime, defaults }
}

function overlayField(runtime: EnvLike, defaults: EnvLike, key: string): string {
  return firstNonEmpty(runtime[key], defaults[key])
}

/**
 * Unicode dashes (NB hyphen, en/em dash, minus, fullwidth) → ASCII '-' so a
 * baked id like `qwen3‑vl` matches the API's `qwen3-vl`.
 */
export function normalizeEnterpriseModelId(value: string): string {
  return value.replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
}

function overlayModelField(runtime: EnvLike, defaults: EnvLike, key: string): string {
  return normalizeEnterpriseModelId(overlayField(runtime, defaults, key))
}

/** Env/bake model fills an empty stored slot; a user-picked id stays put. */
function overlayStoredModel(stored: string | undefined, seeded: string): string {
  return stored?.trim() ? stored : seeded || stored || ''
}

/** Read the enterprise env overlay. Chat/media provider is always `custom`; search is Bocha. */
export function readEnterpriseAiEnv(
  env?: EnvLike,
  baked?: EnvLike | EnterpriseAiBuildDefaults,
): {
  provider: typeof ENTERPRISE_LOCKED_PROVIDER
  baseUrl: string
  apiKey: string
  model: string
  mediaApiKey: string
  mediaBaseUrl: string
  imageModel: string
  analysisModel: string
  videoModel: string
  searchApiKey: string
} {
  const { runtime, defaults } = resolveOverlaySources(env, baked)
  const apiKey = overlayField(runtime, defaults, GENOFFICE_AI_API_KEY_ENV)
  const baseUrl = overlayField(runtime, defaults, GENOFFICE_AI_BASE_URL_ENV)
  return {
    provider: ENTERPRISE_LOCKED_PROVIDER,
    baseUrl,
    apiKey,
    model: overlayModelField(runtime, defaults, GENOFFICE_AI_MODEL_ENV),
    mediaApiKey: overlayField(runtime, defaults, GENOFFICE_AI_MEDIA_API_KEY_ENV) || apiKey,
    mediaBaseUrl: overlayField(runtime, defaults, GENOFFICE_AI_MEDIA_BASE_URL_ENV) || baseUrl,
    imageModel: overlayModelField(runtime, defaults, GENOFFICE_AI_IMAGE_MODEL_ENV),
    analysisModel: overlayModelField(runtime, defaults, GENOFFICE_AI_ANALYSIS_MODEL_ENV),
    // Same VL checkpoint as image analysis when the packager omits VIDEO_MODEL.
    videoModel:
      overlayModelField(runtime, defaults, GENOFFICE_AI_VIDEO_MODEL_ENV) ||
      overlayModelField(runtime, defaults, GENOFFICE_AI_ANALYSIS_MODEL_ENV),
    searchApiKey: firstNonEmpty(
      runtime[GENOFFICE_AI_SEARCH_API_KEY_ENV],
      runtime[BOCHA_API_KEY_ENV],
      defaults[GENOFFICE_AI_SEARCH_API_KEY_ENV],
      defaults[BOCHA_API_KEY_ENV],
    ),
  }
}

export function enterpriseAiPolicy(
  env?: EnvLike,
  baked?: EnvLike | EnterpriseAiBuildDefaults,
): EnterpriseAiPolicy {
  const seeded = readEnterpriseAiEnv(env, baked)
  return {
    ...ENTERPRISE_AI_UI_POLICY,
    apiKey: seeded.apiKey,
    baseUrl: seeded.baseUrl,
    model: seeded.model,
    mediaApiKey: seeded.mediaApiKey,
    mediaBaseUrl: seeded.mediaBaseUrl,
    imageModel: seeded.imageModel,
    analysisModel: seeded.analysisModel,
    videoModel: seeded.videoModel,
    searchApiKey: seeded.searchApiKey,
  }
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
      videoModel: '',
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
    imageModel: overlayStoredModel(current.imageModel, policy.imageModel),
    analysisModel: overlayStoredModel(current.analysisModel, policy.analysisModel),
    videoModel: overlayStoredModel(current.videoModel, policy.videoModel),
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
 * Genspark cloud tools off, and overlay env-supplied keys / URLs / model.
 * Env key and URL always win when set. Env/bake chat and media model ids only
 * fill an empty slot so a Settings free-text pick stays after a prefill.
 */
export function applyEnterpriseAiPolicy(
  settings: AiSettings,
  env?: EnvLike,
  baked?: EnvLike | EnterpriseAiBuildDefaults,
): AiSettings {
  const policy = enterpriseAiPolicy(env, baked)
  const current = customSlot(settings)
  const custom: AiProviderConfig = {
    ...current,
    apiKey: policy.apiKey || current.apiKey || '',
    baseUrl: policy.baseUrl || current.baseUrl || '',
    model: overlayStoredModel(current.model, policy.model),
  }
  return {
    ...settings,
    provider: ENTERPRISE_LOCKED_PROVIDER,
    gskToolsEnabled: false,
    providers: {
      ...settings.providers,
      custom,
    },
    media: lockMediaSettings(settings.media, policy),
    search: lockSearchSettings(settings.search, policy),
  }
}

/**
 * Save path: lock chat/media/search providers, force Genspark cloud tools off,
 * refuse masked keys, and keep env-owned key/URL off disk (they are
 * re-injected on every resolve). A blank/masked incoming key restores the
 * previous on-disk value so Save cannot wipe policy.
 */
export function persistEnterpriseAiSettings(
  incoming: AiSettings,
  previous?: Pick<Partial<AiSettings>, 'providers' | 'media' | 'search'> | undefined,
  env?: EnvLike,
  baked?: EnvLike | EnterpriseAiBuildDefaults,
): AiSettings {
  const policy = enterpriseAiPolicy(env, baked)
  const next = applyEnterpriseAiPolicy(
    { ...incoming, provider: ENTERPRISE_LOCKED_PROVIDER },
    env,
    baked,
  )
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
    gskToolsEnabled: false,
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
  baked?: EnvLike | EnterpriseAiBuildDefaults,
): { settings: AiSettings; provider: AiProviderId; config: AiProviderConfig } {
  const effective = applyEnterpriseAiPolicy(settings, env, baked)
  return {
    settings: effective,
    provider: ENTERPRISE_LOCKED_PROVIDER,
    config: effective.providers[ENTERPRISE_LOCKED_PROVIDER],
  }
}
