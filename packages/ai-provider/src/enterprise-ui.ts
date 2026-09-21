import type {
  AiMediaProviderId,
  AiMediaProviderMeta,
  AiProviderId,
  AiProviderMeta,
  AiSearchProviderId,
  AiSearchProviderMeta,
} from './types'

export type EnvLike = Record<string, string | undefined>

export const ENTERPRISE_LOCKED_PROVIDER: AiProviderId = 'custom'
export const ENTERPRISE_ALLOWED_PROVIDERS = ['custom'] as const satisfies readonly AiProviderId[]
export const ENTERPRISE_LOCKED_MEDIA_PROVIDER: AiMediaProviderId = 'custom'
export const ENTERPRISE_LOCKED_SEARCH_PROVIDER: AiSearchProviderId = 'bocha'

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
  /** Genspark-only cloud-tools switch — hidden; settings always persist false. */
  readonly hideGskTools: true
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
  hideGskTools: true,
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

/**
 * Upstream Custom is `videoAnalysis: false` (OpenAI-compatible image + chat
 * only). This fork's gateway serves qwen3-vl on that same chat protocol, so
 * locked Custom must advertise video analysis to Settings and media tools.
 */
export function withEnterpriseMediaCapabilities<T extends { id: string }>(meta: T): T {
  if (meta.id !== ENTERPRISE_LOCKED_MEDIA_PROVIDER) return meta
  return { ...meta, videoAnalysis: true } as T
}

export function filterAiMediaProviderCatalog<T extends Pick<AiMediaProviderMeta, 'id'>>(
  catalog: readonly T[],
): T[] {
  return catalog
    .filter((entry) => entry.id === ENTERPRISE_LOCKED_MEDIA_PROVIDER)
    .map((entry) => withEnterpriseMediaCapabilities(entry))
}

export function filterAiSearchProviderCatalog<T extends Pick<AiSearchProviderMeta, 'id'>>(
  catalog: readonly T[],
): T[] {
  return catalog.filter((entry) => entry.id === ENTERPRISE_LOCKED_SEARCH_PROVIDER)
}
