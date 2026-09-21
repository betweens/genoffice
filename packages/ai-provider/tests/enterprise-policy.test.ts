import { describe, expect, it } from 'vitest'
import {
  ENTERPRISE_ALLOWED_PROVIDERS,
  ENTERPRISE_LOCKED_PROVIDER,
  allowsKeylessChat,
  applyEnterpriseAiPolicy,
  enterpriseAiPolicy,
  filterAiProviderCatalog,
  isMaskedApiKey,
  maskApiKey,
  persistEnterpriseAiSettings,
  readEnterpriseAiEnv,
  resolveLockedChatRequest,
} from '../src/enterprise-policy'
import {
  AI_PROVIDERS,
  activeProvider,
  defaultAiSettings,
  resolveAiSettings,
} from '../src/providers'
import type { AiSettings } from '../src/types'

/** Tests never read the real process env — placeholders only. */
const EMPTY_ENV = {}
const SEEDED_ENV = {
  GENOFFICE_AI_PROVIDER: 'openai',
  GENOFFICE_AI_BASE_URL: ' https://llm.example.internal/v1 ',
  GENOFFICE_AI_API_KEY: ' sk-enterprise-placeholder-1234 ',
  GENOFFICE_AI_MODEL: ' acme-chat ',
}

function byokKimi(): AiSettings {
  const settings = defaultAiSettings(undefined, EMPTY_ENV)
  settings.provider = 'kimi'
  settings.providers.kimi.apiKey = 'sk-user-placeholder'
  return settings
}

describe('readEnterpriseAiEnv', () => {
  it('hardcodes custom even when GENOFFICE_AI_PROVIDER names another vendor', () => {
    expect(readEnterpriseAiEnv(SEEDED_ENV)).toEqual({
      provider: 'custom',
      baseUrl: 'https://llm.example.internal/v1',
      apiKey: 'sk-enterprise-placeholder-1234',
      model: 'acme-chat',
    })
  })

  it('leaves key/url/model empty when unset so ops can see missing config', () => {
    expect(readEnterpriseAiEnv(EMPTY_ENV)).toEqual({
      provider: 'custom',
      baseUrl: '',
      apiKey: '',
      model: '',
    })
  })
})

describe('enterpriseAiPolicy', () => {
  it('locks the catalog to custom and marks key/url read-only', () => {
    const policy = enterpriseAiPolicy(SEEDED_ENV)
    expect(policy.lockProvider).toBe(true)
    expect(policy.readOnlyKey).toBe(true)
    expect(policy.readOnlyBaseUrl).toBe(true)
    expect(policy.provider).toBe('custom')
    expect(policy.allowedProviders).toEqual(ENTERPRISE_ALLOWED_PROVIDERS)
    expect([...policy.allowedProviders]).toEqual(['custom'])
  })
})

describe('applyEnterpriseAiPolicy', () => {
  it('forces custom and overlays env key/url/model onto an empty slot', () => {
    const locked = applyEnterpriseAiPolicy(byokKimi(), SEEDED_ENV)
    expect(locked.provider).toBe('custom')
    expect(locked.providers.custom).toMatchObject({
      apiKey: 'sk-enterprise-placeholder-1234',
      baseUrl: 'https://llm.example.internal/v1',
      model: 'acme-chat',
    })
    // other adapters stay in the map for tests / upstream merge
    expect(locked.providers.kimi.apiKey).toBe('sk-user-placeholder')
  })

  it('does not invent a key or URL when env is unset', () => {
    const locked = applyEnterpriseAiPolicy(defaultAiSettings(undefined, EMPTY_ENV), EMPTY_ENV)
    expect(locked.provider).toBe('custom')
    expect(locked.providers.custom.apiKey).toBe('')
    expect(locked.providers.custom.baseUrl).toBe('')
  })

  it('prefills model from env only when the stored model is empty', () => {
    const settings = defaultAiSettings(undefined, EMPTY_ENV)
    settings.providers.custom.model = 'user-picked-model'
    const locked = applyEnterpriseAiPolicy(settings, SEEDED_ENV)
    expect(locked.providers.custom.model).toBe('user-picked-model')
    expect(locked.providers.custom.apiKey).toBe('sk-enterprise-placeholder-1234')
  })
})

describe('resolveAiSettings + activeProvider honor the lock', () => {
  it('wins over a hand-edited genspark/openai/claude selection', () => {
    const stored = {
      provider: 'openai' as const,
      providers: {
        openai: { apiKey: 'sk-stored-placeholder', model: 'gpt-5.6-terra' },
      } as never,
    }
    const resolved = resolveAiSettings(stored, defaultAiSettings(undefined, EMPTY_ENV), SEEDED_ENV)
    expect(resolved.provider).toBe('custom')
    expect(resolved.providers.custom.apiKey).toBe('sk-enterprise-placeholder-1234')
    expect(resolved.providers.custom.baseUrl).toBe('https://llm.example.internal/v1')
    expect(resolved.providers.openai.apiKey).toBe('sk-stored-placeholder')
    expect(activeProvider(resolved, SEEDED_ENV)).toBe('custom')
  })

  it('still locks to custom when env is unset and custom is unconfigured', () => {
    const resolved = resolveAiSettings(
      { provider: 'genspark', providers: {} as never },
      defaultAiSettings(undefined, EMPTY_ENV),
      EMPTY_ENV,
    )
    expect(resolved.provider).toBe(ENTERPRISE_LOCKED_PROVIDER)
    expect(activeProvider(resolved, EMPTY_ENV)).toBe('custom')
    expect(resolved.providers.custom.apiKey).toBe('')
    expect(resolved.providers.custom.baseUrl).toBe('')
  })
})

describe('persistEnterpriseAiSettings', () => {
  it('does not write the env API key or base URL to the payload that hits disk', () => {
    const incoming = applyEnterpriseAiPolicy(defaultAiSettings(undefined, EMPTY_ENV), SEEDED_ENV)
    const persisted = persistEnterpriseAiSettings(incoming, { providers: {} as never }, SEEDED_ENV)
    expect(persisted.provider).toBe('custom')
    expect(persisted.providers.custom.apiKey).toBe('')
    expect(persisted.providers.custom.baseUrl).toBe('')
    expect(persisted.providers.custom.model).toBe('acme-chat')
  })

  it('refuses a masked or blank key so Save cannot wipe a stored secret', () => {
    const previous = defaultAiSettings(undefined, EMPTY_ENV)
    previous.providers.custom.apiKey = 'sk-on-disk-placeholder'
    previous.providers.custom.baseUrl = 'http://localhost:11434/v1'
    const incoming = defaultAiSettings(undefined, EMPTY_ENV)
    incoming.providers.custom.apiKey = '****lder'
    incoming.providers.custom.model = 'llama3'
    const persisted = persistEnterpriseAiSettings(incoming, previous, EMPTY_ENV)
    expect(persisted.providers.custom.apiKey).toBe('sk-on-disk-placeholder')
    expect(persisted.providers.custom.baseUrl).toBe('http://localhost:11434/v1')
    expect(persisted.providers.custom.model).toBe('llama3')

    incoming.providers.custom.apiKey = ''
    incoming.providers.custom.baseUrl = ''
    const wiped = persistEnterpriseAiSettings(incoming, previous, EMPTY_ENV)
    expect(wiped.providers.custom.apiKey).toBe('sk-on-disk-placeholder')
    expect(wiped.providers.custom.baseUrl).toBe('http://localhost:11434/v1')
  })
})

describe('maskApiKey', () => {
  it('uses a last-4 mask and never echoes the full placeholder', () => {
    expect(maskApiKey('')).toBe('')
    expect(maskApiKey('abcd')).toBe('****')
    expect(maskApiKey('sk-enterprise-placeholder-1234')).toBe('****1234')
    expect(maskApiKey('sk-enterprise-placeholder-1234')).not.toContain('sk-enterprise')
    expect(isMaskedApiKey('****1234')).toBe(true)
    expect(isMaskedApiKey('sk-enterprise-placeholder-1234')).toBe(false)
  })
})

describe('filterAiProviderCatalog', () => {
  it('hides every non-custom vendor from the Settings picker', () => {
    const visible = filterAiProviderCatalog(AI_PROVIDERS)
    expect(visible.map((p) => p.id)).toEqual(['custom'])
    expect(visible[0]?.label).toBe('Custom')
  })
})

describe('resolveLockedChatRequest', () => {
  it('ignores a renderer-supplied OpenAI selection and uses env-injected custom', () => {
    const request = defaultAiSettings(undefined, EMPTY_ENV)
    request.provider = 'openai'
    request.providers.openai.apiKey = 'sk-renderer-placeholder'
    const { provider, config, settings } = resolveLockedChatRequest(request, SEEDED_ENV)
    expect(provider).toBe('custom')
    expect(settings.provider).toBe('custom')
    expect(config.apiKey).toBe('sk-enterprise-placeholder-1234')
    expect(config.baseUrl).toBe('https://llm.example.internal/v1')
    expect(allowsKeylessChat(provider)).toBe(true)
  })
})
