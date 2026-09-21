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
  normalizeEnterpriseModelId,
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
import { ENTERPRISE_AI_BUILD_DEFAULTS } from '../src/enterprise-defaults.generated'

/** Tests never read the real process env — placeholders only. */
const EMPTY_ENV = {}
const SEEDED_ENV = {
  GENOFFICE_AI_PROVIDER: 'openai',
  GENOFFICE_AI_BASE_URL: ' https://llm.example.internal/v1 ',
  GENOFFICE_AI_API_KEY: ' sk-enterprise-placeholder-1234 ',
  GENOFFICE_AI_MODEL: ' acme-chat ',
  GENOFFICE_AI_IMAGE_MODEL: ' flux-schnell ',
  GENOFFICE_AI_ANALYSIS_MODEL: ' qwen3\u2011vl ',
  GENOFFICE_AI_VIDEO_MODEL: ' qwen3\u2011vl ',
  GENOFFICE_AI_SEARCH_API_KEY: ' bocha-placeholder-5678 ',
}
const BAKED_DEFAULTS = {
  GENOFFICE_AI_BASE_URL: 'https://llm.baked.internal/v1',
  GENOFFICE_AI_API_KEY: 'sk-baked-placeholder-9999',
  GENOFFICE_AI_MODEL: 'baked-chat',
  GENOFFICE_AI_MEDIA_BASE_URL: '',
  GENOFFICE_AI_MEDIA_API_KEY: '',
  GENOFFICE_AI_IMAGE_MODEL: 'flux-schnell',
  GENOFFICE_AI_ANALYSIS_MODEL: 'qwen3-vl',
  GENOFFICE_AI_VIDEO_MODEL: 'qwen3-vl',
  GENOFFICE_AI_SEARCH_API_KEY: 'bocha-baked-placeholder',
  BOCHA_API_KEY: '',
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
      imageModel: 'flux-schnell',
      analysisModel: 'qwen3-vl',
      videoModel: 'qwen3-vl',
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
      imageModel: '',
      analysisModel: '',
      videoModel: '',
      searchApiKey: '',
    })
  })

  it('uses baked defaults when process.env overlay is empty', () => {
    expect(readEnterpriseAiEnv(EMPTY_ENV, BAKED_DEFAULTS)).toEqual({
      provider: 'custom',
      baseUrl: 'https://llm.baked.internal/v1',
      apiKey: 'sk-baked-placeholder-9999',
      model: 'baked-chat',
      mediaApiKey: 'sk-baked-placeholder-9999',
      mediaBaseUrl: 'https://llm.baked.internal/v1',
      imageModel: 'flux-schnell',
      analysisModel: 'qwen3-vl',
      videoModel: 'qwen3-vl',
      searchApiKey: 'bocha-baked-placeholder',
    })
  })

  it('lets process.env win over baked defaults', () => {
    expect(
      readEnterpriseAiEnv(
        { GENOFFICE_AI_API_KEY: ' sk-runtime-placeholder ', GENOFFICE_AI_MODEL: 'runtime-chat' },
        BAKED_DEFAULTS,
      ),
    ).toMatchObject({
      apiKey: 'sk-runtime-placeholder',
      model: 'runtime-chat',
      baseUrl: 'https://llm.baked.internal/v1',
      searchApiKey: 'bocha-baked-placeholder',
    })
  })

  it('lets a runtime BOCHA_API_KEY win over a baked GENOFFICE_AI_SEARCH_API_KEY', () => {
    expect(
      readEnterpriseAiEnv({ BOCHA_API_KEY: ' bocha-runtime ' }, BAKED_DEFAULTS).searchApiKey,
    ).toBe('bocha-runtime')
  })

  it('uses dedicated baked media url/key when set instead of the chat fallback', () => {
    expect(
      readEnterpriseAiEnv(EMPTY_ENV, {
        ...BAKED_DEFAULTS,
        GENOFFICE_AI_MEDIA_API_KEY: 'sk-media-baked',
        GENOFFICE_AI_MEDIA_BASE_URL: 'https://media.baked.internal/v1',
      }),
    ).toMatchObject({
      apiKey: 'sk-baked-placeholder-9999',
      mediaApiKey: 'sk-media-baked',
      mediaBaseUrl: 'https://media.baked.internal/v1',
    })
  })

  it('seeds search from a baked BOCHA_API_KEY when GENOFFICE_AI_SEARCH_API_KEY is unset', () => {
    expect(
      readEnterpriseAiEnv(EMPTY_ENV, {
        ...BAKED_DEFAULTS,
        GENOFFICE_AI_SEARCH_API_KEY: '',
        BOCHA_API_KEY: 'bocha-baked-alias',
      }).searchApiKey,
    ).toBe('bocha-baked-alias')
  })

  it('falls back to the generated module when env is omitted and process.env is empty', () => {
    const names = [
      'GENOFFICE_AI_BASE_URL',
      'GENOFFICE_AI_API_KEY',
      'GENOFFICE_AI_MODEL',
      'GENOFFICE_AI_MEDIA_BASE_URL',
      'GENOFFICE_AI_MEDIA_API_KEY',
      'GENOFFICE_AI_IMAGE_MODEL',
      'GENOFFICE_AI_ANALYSIS_MODEL',
      'GENOFFICE_AI_VIDEO_MODEL',
      'GENOFFICE_AI_SEARCH_API_KEY',
      'BOCHA_API_KEY',
    ] as const
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]))
    for (const name of names) delete process.env[name]
    try {
      const seeded = readEnterpriseAiEnv()
      expect(seeded.baseUrl).toBe(ENTERPRISE_AI_BUILD_DEFAULTS.GENOFFICE_AI_BASE_URL)
      expect(seeded.apiKey).toBe(ENTERPRISE_AI_BUILD_DEFAULTS.GENOFFICE_AI_API_KEY)
      expect(seeded.model).toBe(ENTERPRISE_AI_BUILD_DEFAULTS.GENOFFICE_AI_MODEL)
      expect(seeded.imageModel).toBe(ENTERPRISE_AI_BUILD_DEFAULTS.GENOFFICE_AI_IMAGE_MODEL)
      expect(seeded.analysisModel).toBe(ENTERPRISE_AI_BUILD_DEFAULTS.GENOFFICE_AI_ANALYSIS_MODEL)
      expect(seeded.videoModel).toBe(
        ENTERPRISE_AI_BUILD_DEFAULTS.GENOFFICE_AI_VIDEO_MODEL ||
          ENTERPRISE_AI_BUILD_DEFAULTS.GENOFFICE_AI_ANALYSIS_MODEL,
      )
      expect(seeded.searchApiKey).toBe(
        ENTERPRISE_AI_BUILD_DEFAULTS.GENOFFICE_AI_SEARCH_API_KEY ||
          ENTERPRISE_AI_BUILD_DEFAULTS.BOCHA_API_KEY,
      )
    } finally {
      for (const name of names) {
        const value = saved[name]
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }
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
    expect(locked.media?.providers.custom.imageModel).toBe('flux-schnell')
    expect(locked.media?.providers.custom.analysisModel).toBe('qwen3-vl')
    expect(locked.media?.providers.custom.videoModel).toBe('qwen3-vl')
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

  it('overlays baked defaults onto custom chat/media and Bocha when env is empty', () => {
    const locked = applyEnterpriseAiPolicy(
      defaultAiSettings(undefined, EMPTY_ENV),
      EMPTY_ENV,
      BAKED_DEFAULTS,
    )
    expect(locked.providers.custom).toMatchObject({
      apiKey: 'sk-baked-placeholder-9999',
      baseUrl: 'https://llm.baked.internal/v1',
      model: 'baked-chat',
    })
    expect(locked.search?.providers.bocha.apiKey).toBe('bocha-baked-placeholder')
    expect(locked.media?.providers.custom.apiKey).toBe('sk-baked-placeholder-9999')
    expect(locked.media?.providers.custom.baseUrl).toBe('https://llm.baked.internal/v1')
    expect(locked.media?.providers.custom.imageModel).toBe('flux-schnell')
    expect(locked.media?.providers.custom.analysisModel).toBe('qwen3-vl')
    expect(locked.media?.providers.custom.videoModel).toBe('qwen3-vl')
  })

  it('prefills Custom media models from bake when process.env is empty', () => {
    const locked = applyEnterpriseAiPolicy(
      defaultAiSettings(undefined, EMPTY_ENV),
      EMPTY_ENV,
      BAKED_DEFAULTS,
    )
    expect(locked.media?.providers.custom).toMatchObject({
      imageModel: 'flux-schnell',
      analysisModel: 'qwen3-vl',
      videoModel: 'qwen3-vl',
    })
  })

  it('prefills media models from env only when the stored models are empty', () => {
    const settings = defaultAiSettings(undefined, EMPTY_ENV)
    settings.media!.providers.custom.imageModel = 'user-flux'
    settings.media!.providers.custom.analysisModel = 'user-vl'
    settings.media!.providers.custom.videoModel = 'user-video'
    const locked = applyEnterpriseAiPolicy(settings, SEEDED_ENV)
    expect(locked.media?.providers.custom.imageModel).toBe('user-flux')
    expect(locked.media?.providers.custom.analysisModel).toBe('user-vl')
    expect(locked.media?.providers.custom.videoModel).toBe('user-video')
  })

  it('defaults Custom video model to the analysis model when VIDEO_MODEL is unset', () => {
    expect(readEnterpriseAiEnv({ GENOFFICE_AI_ANALYSIS_MODEL: 'qwen3-vl' }, {}).videoModel).toBe(
      'qwen3-vl',
    )
    const locked = applyEnterpriseAiPolicy(defaultAiSettings(undefined, EMPTY_ENV), EMPTY_ENV, {
      ...BAKED_DEFAULTS,
      GENOFFICE_AI_VIDEO_MODEL: '',
    })
    expect(locked.media?.providers.custom.videoModel).toBe('qwen3-vl')
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
    expect(persisted.media?.providers.custom.imageModel).toBe('flux-schnell')
    expect(persisted.media?.providers.custom.analysisModel).toBe('qwen3-vl')
    expect(persisted.media?.providers.custom.videoModel).toBe('qwen3-vl')
  })

  it('does not write baked defaults to the payload that hits disk', () => {
    const incoming = applyEnterpriseAiPolicy(
      defaultAiSettings(undefined, EMPTY_ENV),
      EMPTY_ENV,
      BAKED_DEFAULTS,
    )
    const persisted = persistEnterpriseAiSettings(
      incoming,
      { providers: {} as never },
      EMPTY_ENV,
      BAKED_DEFAULTS,
    )
    expect(persisted.providers.custom.apiKey).toBe('')
    expect(persisted.providers.custom.baseUrl).toBe('')
    expect(persisted.providers.custom.model).toBe('baked-chat')
    expect(persisted.search?.providers.bocha.apiKey).toBe('')
    expect(persisted.media?.providers.custom.apiKey).toBe('')
    expect(persisted.media?.providers.custom.baseUrl).toBe('')
    expect(persisted.media?.providers.custom.imageModel).toBe('flux-schnell')
    expect(persisted.media?.providers.custom.analysisModel).toBe('qwen3-vl')
    expect(persisted.media?.providers.custom.videoModel).toBe('qwen3-vl')
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

describe('normalizeEnterpriseModelId', () => {
  it('rewrites unicode hyphens to ASCII so qwen3‑vl matches the API id', () => {
    expect(normalizeEnterpriseModelId('qwen3\u2011vl')).toBe('qwen3-vl')
    expect(normalizeEnterpriseModelId('qwen3\u2010vl')).toBe('qwen3-vl')
    expect(normalizeEnterpriseModelId('flux-schnell')).toBe('flux-schnell')
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
    const media = filterAiMediaProviderCatalog(AI_MEDIA_PROVIDERS)
    expect(media.map((p) => p.id)).toEqual(['custom'])
    expect(media[0]?.videoAnalysis).toBe(true)
    expect(AI_MEDIA_PROVIDERS.find((p) => p.id === 'custom')?.videoAnalysis).toBe(false)
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
