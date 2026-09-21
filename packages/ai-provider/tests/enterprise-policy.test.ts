import { describe, expect, it } from 'vitest'
import {
  ENTERPRISE_ALLOWED_PROVIDERS,
  ENTERPRISE_LOCKED_MEDIA_PROVIDER,
  ENTERPRISE_LOCKED_PROVIDER,
  ENTERPRISE_LOCKED_SEARCH_PROVIDER,
  allowsKeylessChat,
  applyEnterpriseAiPolicy,
  enterpriseAiPolicy,
  filterAiMediaProviderCatalog,
  filterAiProviderCatalog,
  filterAiSearchProviderCatalog,
  isMaskedApiKey,
  maskApiKey,
  persistEnterpriseAiSettings,
  readEnterpriseAiEnv,
  resolveLockedChatRequest,
} from '../src/enterprise-policy'
import { AI_MEDIA_PROVIDERS } from '../src/media'
import {
  AI_PROVIDERS,
  activeProvider,
  defaultAiSettings,
  resolveAiSettings,
} from '../src/providers'
import { AI_SEARCH_PROVIDERS } from '../src/search-settings'
import type { AiSettings } from '../src/types'

/** Tests never read the real process env — placeholders only. */
const EMPTY_ENV = {}
const SEEDED_ENV = {
  GENOFFICE_AI_PROVIDER: 'openai',
  GENOFFICE_AI_BASE_URL: ' https://llm.example.internal/v1 ',
  GENOFFICE_AI_API_KEY: ' sk-enterprise-placeholder-1234 ',
  GENOFFICE_AI_MODEL: ' acme-chat ',
  GENOFFICE_AI_SEARCH_API_KEY: ' bocha-placeholder-5678 ',
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
      mediaApiKey: 'sk-enterprise-placeholder-1234',
      mediaBaseUrl: 'https://llm.example.internal/v1',
      searchApiKey: 'bocha-placeholder-5678',
    })
  })

  it('seeds the Bocha key from BOCHA_API_KEY when GENOFFICE_AI_SEARCH_API_KEY is unset', () => {
    expect(readEnterpriseAiEnv({ BOCHA_API_KEY: ' bocha-env-placeholder ' }).searchApiKey).toBe(
      'bocha-env-placeholder',
    )
  })

  it('leaves key/url/model empty when unset so ops can see missing config', () => {
    expect(readEnterpriseAiEnv(EMPTY_ENV)).toEqual({
      provider: 'custom',
      baseUrl: '',
      apiKey: '',
      model: '',
      mediaApiKey: '',
      mediaBaseUrl: '',
      searchApiKey: '',
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
    expect(policy.mediaProvider).toBe('custom')
    expect(policy.searchProvider).toBe('bocha')
    expect(policy.lockMediaProvider).toBe(true)
    expect(policy.lockSearchProvider).toBe(true)
    expect(policy.hideGskTools).toBe(true)
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
    expect(locked.search?.provider).toBe('bocha')
    expect(locked.search?.providers.bocha.apiKey).toBe('bocha-placeholder-5678')
    expect(locked.gskToolsEnabled).toBe(false)
    expect(locked.media?.imageProvider).toBe('custom')
    expect(locked.media?.analysisProvider).toBe('custom')
    expect(locked.media?.videoAnalysisProvider).toBe('custom')
    expect(locked.media?.providers.custom.apiKey).toBe('sk-enterprise-placeholder-1234')
    expect(locked.media?.providers.custom.baseUrl).toBe('https://llm.example.internal/v1')
  })

  it('turns Genspark cloud tools off even when the stored file left them on', () => {
    const settings = defaultAiSettings(undefined, EMPTY_ENV)
    settings.gskToolsEnabled = true
    expect(applyEnterpriseAiPolicy(settings, EMPTY_ENV).gskToolsEnabled).toBe(false)
  })

  it('does not invent a key or URL when env is unset', () => {
    const locked = applyEnterpriseAiPolicy(defaultAiSettings(undefined, EMPTY_ENV), EMPTY_ENV)
    expect(locked.provider).toBe('custom')
    expect(locked.providers.custom.apiKey).toBe('')
    expect(locked.providers.custom.baseUrl).toBe('')
    expect(locked.search?.provider).toBe('bocha')
    expect(locked.search?.providers.bocha.apiKey).toBe('')
    expect(locked.media?.imageProvider).toBe('custom')
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
    expect(resolved.search?.provider).toBe(ENTERPRISE_LOCKED_SEARCH_PROVIDER)
    expect(resolved.media?.imageProvider).toBe(ENTERPRISE_LOCKED_MEDIA_PROVIDER)
    expect(resolved.gskToolsEnabled).toBe(false)
  })

  it('wins over a hand-edited search/media vendor selection', () => {
    const resolved = resolveAiSettings(
      {
        provider: 'openai',
        providers: {} as never,
        search: {
          provider: 'serper',
          providers: { serper: { apiKey: 'serper-placeholder' } } as never,
        },
        media: {
          imageProvider: 'openai',
          analysisProvider: 'gemini',
          videoAnalysisProvider: 'gemini',
          providers: {
            openai: {
              apiKey: 'sk-media-placeholder',
              imageModel: 'gpt-image-2',
              analysisModel: '',
            },
          } as never,
        },
      },
      defaultAiSettings(undefined, EMPTY_ENV),
      SEEDED_ENV,
    )
    expect(resolved.search?.provider).toBe('bocha')
    expect(resolved.search?.providers.bocha.apiKey).toBe('bocha-placeholder-5678')
    expect(resolved.media?.imageProvider).toBe('custom')
    expect(resolved.media?.analysisProvider).toBe('custom')
    expect(resolved.media?.videoAnalysisProvider).toBe('custom')
    expect(resolved.media?.providers.custom.apiKey).toBe('sk-enterprise-placeholder-1234')
  })
})

describe('persistEnterpriseAiSettings', () => {
  it('does not write the env API key or base URL to the payload that hits disk', () => {
    const incoming = applyEnterpriseAiPolicy(defaultAiSettings(undefined, EMPTY_ENV), SEEDED_ENV)
    const persisted = persistEnterpriseAiSettings(incoming, { providers: {} as never }, SEEDED_ENV)
    expect(persisted.provider).toBe('custom')
    expect(persisted.gskToolsEnabled).toBe(false)
    expect(persisted.providers.custom.apiKey).toBe('')
    expect(persisted.providers.custom.baseUrl).toBe('')
    expect(persisted.providers.custom.model).toBe('acme-chat')
    expect(persisted.search?.provider).toBe('bocha')
    expect(persisted.search?.providers.bocha.apiKey).toBe('')
    expect(persisted.media?.imageProvider).toBe('custom')
    expect(persisted.media?.providers.custom.apiKey).toBe('')
    expect(persisted.media?.providers.custom.baseUrl).toBe('')
  })

  it('writes gskToolsEnabled false even if the renderer sent true', () => {
    const incoming = defaultAiSettings(undefined, EMPTY_ENV)
    incoming.gskToolsEnabled = true
    expect(persistEnterpriseAiSettings(incoming, incoming, EMPTY_ENV).gskToolsEnabled).toBe(false)
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

    previous.search = {
      provider: 'serper',
      providers: {
        serper: { apiKey: '' },
        tavily: { apiKey: '' },
        bocha: { apiKey: 'bocha-on-disk' },
      },
    }
    incoming.search = {
      provider: 'tavily',
      providers: { serper: { apiKey: '' }, tavily: { apiKey: '' }, bocha: { apiKey: '****disk' } },
    }
    const searchPersisted = persistEnterpriseAiSettings(incoming, previous, EMPTY_ENV)
    expect(searchPersisted.search?.provider).toBe('bocha')
    expect(searchPersisted.search?.providers.bocha.apiKey).toBe('bocha-on-disk')
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

  it('hides non-custom media vendors and non-Bocha search vendors', () => {
    expect(filterAiMediaProviderCatalog(AI_MEDIA_PROVIDERS).map((p) => p.id)).toEqual(['custom'])
    expect(filterAiSearchProviderCatalog(AI_SEARCH_PROVIDERS).map((p) => p.id)).toEqual(['bocha'])
    expect(filterAiSearchProviderCatalog(AI_SEARCH_PROVIDERS)[0]?.label).toBe('Bocha')
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
