import type { AiProviderConfig, AiProviderId, AiProviderMeta, AiSettings } from './types'

/**
 * Enterprise fork: chat is locked to the OpenAI-compatible `custom` provider.
 * Runtime credentials come from process env (Electron inherits launch env);
 * nothing here hardcodes secrets, and callers must not commit them.
 *
 *   GENOFFICE_AI_PROVIDER  ignored except that non-custom values are coerced
 *   GENOFFICE_AI_BASE_URL  OpenAI-compatible base URL (plaintext in Settings)
 *   GENOFFICE_AI_API_KEY   API key (masked in Settings; overlaid on chat)
 *   GENOFFICE_AI_MODEL     default model id (prefills the free-text field)
 */
export const GENOFFICE_AI_PROVIDER_ENV = 'GENOFFICE_AI_PROVIDER'
export const GENOFFICE_AI_BASE_URL_ENV = 'GENOFFICE_AI_BASE_URL'
export const GENOFFICE_AI_API_KEY_ENV = 'GENOFFICE_AI_API_KEY'
export const GENOFFICE_AI_MODEL_ENV = 'GENOFFICE_AI_MODEL'

export const ENTERPRISE_LOCKED_PROVIDER: AiProviderId = 'custom'
export const ENTERPRISE_ALLOWED_PROVIDERS = ['custom'] as const satisfies readonly AiProviderId[]

export type EnvLike = Record<string, string | undefined>

export interface EnterpriseAiUiPolicy {
  readonly lockProvider: true
  readonly allowedProviders: typeof ENTERPRISE_ALLOWED_PROVIDERS
  readonly readOnlyKey: true
  readonly readOnlyBaseUrl: true
  readonly provider: typeof ENTERPRISE_LOCKED_PROVIDER
}

/** UI lock flags — no secrets, safe to ship in the renderer bundle. */
export const ENTERPRISE_AI_UI_POLICY: EnterpriseAiUiPolicy = {
  lockProvider: true,
  allowedProviders: ENTERPRISE_ALLOWED_PROVIDERS,
  readOnlyKey: true,
  readOnlyBaseUrl: true,
  provider: ENTERPRISE_LOCKED_PROVIDER,
}

export interface EnterpriseAiPolicy extends EnterpriseAiUiPolicy {
  readonly apiKey: string
  readonly baseUrl: string
  readonly model: string
}

function processEnv(): EnvLike {
  return typeof process !== 'undefined' && process.env ? process.env : {}
}

function trimEnv(value: string | undefined): string {
  return value?.trim() ?? ''
}

/** Read the enterprise env overlay. Provider is always `custom` in this fork. */
export function readEnterpriseAiEnv(env?: EnvLike): {
  provider: typeof ENTERPRISE_LOCKED_PROVIDER
  baseUrl: string
  apiKey: string
  model: string
} {
  const source = env ?? processEnv()
  return {
    provider: ENTERPRISE_LOCKED_PROVIDER,
    baseUrl: trimEnv(source[GENOFFICE_AI_BASE_URL_ENV]),
    apiKey: trimEnv(source[GENOFFICE_AI_API_KEY_ENV]),
    model: trimEnv(source[GENOFFICE_AI_MODEL_ENV]),
  }
}

export function enterpriseAiPolicy(env?: EnvLike): EnterpriseAiPolicy {
  const seeded = readEnterpriseAiEnv(env)
  return {
    ...ENTERPRISE_AI_UI_POLICY,
    apiKey: seeded.apiKey,
    baseUrl: seeded.baseUrl,
    model: seeded.model,
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

function customSlot(settings?: {
  providers?: AiSettings['providers'] | undefined
}): AiProviderConfig {
  return settings?.providers?.custom ?? { apiKey: '', model: '', baseUrl: '' }
}

/**
 * Force `provider = custom` and overlay env-supplied key / URL / model.
 * Env key and URL always win when set. Env model only fills an empty slot so
 * the Settings free-text field stays editable after a prefill.
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
  }
}

/**
 * Save path: lock provider to custom, refuse masked keys, and keep env-owned
 * key/URL off disk (they are re-injected on every resolve). A blank/masked
 * incoming key restores the previous on-disk value so Save cannot wipe policy.
 */
export function persistEnterpriseAiSettings(
  incoming: AiSettings,
  previous?: Pick<Partial<AiSettings>, 'providers'> | undefined,
  env?: EnvLike,
): AiSettings {
  const policy = enterpriseAiPolicy(env)
  const next = applyEnterpriseAiPolicy({ ...incoming, provider: ENTERPRISE_LOCKED_PROVIDER }, env)
  const incomingCustom = customSlot(incoming)
  const previousCustom = customSlot(previous)
  let apiKey = incomingCustom.apiKey ?? ''
  let baseUrl = incomingCustom.baseUrl ?? previousCustom.baseUrl ?? ''

  // Read-only fields: env-owned values stay off disk, and empty/masked writes
  // must not wipe a previously stored key or URL.
  if (policy.apiKey || isMaskedApiKey(apiKey) || !apiKey.trim()) {
    apiKey = previousCustom.apiKey ?? ''
  }
  if (policy.baseUrl || !String(baseUrl).trim()) {
    baseUrl = previousCustom.baseUrl ?? ''
  }

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
