import { describe, expect, it } from 'vitest'
import { defaultAiSettings, resolveAiSettings } from '../src/providers'
import {
  AI_SEARCH_PROVIDERS,
  activeSearchProvider,
  defaultAiSearchSettings,
  resolveAiSearchSettings,
} from '../src/search-settings'

const emptyKeys = { serper: { apiKey: '' }, tavily: { apiKey: '' }, bocha: { apiKey: '' } }

describe('search settings', () => {
  it('defaults to genspark with empty keys and rides along in defaultAiSettings', () => {
    expect(defaultAiSearchSettings()).toEqual({
      provider: 'genspark',
      providers: emptyKeys,
    })
    expect(defaultAiSettings().search?.provider).toBe('genspark')
    const resolved = resolveAiSettings(
      { provider: 'genspark', providers: {} as never },
      defaultAiSettings(),
    )
    expect(resolved.search).toEqual(defaultAiSearchSettings())
  })

  it('lists Bocha as a web-only BYOK provider', () => {
    expect(AI_SEARCH_PROVIDERS).toContainEqual({
      id: 'bocha',
      label: 'Bocha',
      keyPlaceholder: 'Bocha API key',
      imageSearch: false,
    })
  })

  it('merges and trims stored keys', () => {
    const s = resolveAiSearchSettings({
      provider: 'tavily',
      providers: { tavily: { apiKey: ' tvly-1 ' } } as never,
    })
    expect(s.provider).toBe('tavily')
    expect(s.providers.tavily.apiKey).toBe('tvly-1')
    expect(s.providers.serper.apiKey).toBe('')
    expect(s.providers.bocha.apiKey).toBe('')

    const bocha = resolveAiSearchSettings({
      provider: 'bocha',
      providers: { bocha: { apiKey: ' sk-bocha ' } } as never,
    })
    expect(bocha.provider).toBe('bocha')
    expect(bocha.providers.bocha.apiKey).toBe('sk-bocha')
    expect(bocha.providers.serper.apiKey).toBe('')
    expect(bocha.providers.tavily.apiKey).toBe('')
  })

  it('activates a BYOK search provider only with a key', () => {
    expect(activeSearchProvider({ search: undefined })).toBe('genspark')
    expect(
      activeSearchProvider({
        search: {
          provider: 'serper',
          providers: emptyKeys,
        },
      }),
    ).toBe('genspark')
    expect(
      activeSearchProvider({
        search: {
          provider: 'serper',
          providers: { ...emptyKeys, serper: { apiKey: 'k' } },
        },
      }),
    ).toBe('serper')
    expect(
      activeSearchProvider({
        search: {
          provider: 'serper',
          providers: { ...emptyKeys, serper: { apiKey: '   ' } },
        },
      }),
    ).toBe('genspark')
    expect(
      activeSearchProvider({
        search: {
          provider: 'bocha',
          providers: { ...emptyKeys, bocha: { apiKey: 'k' } },
        },
      }),
    ).toBe('bocha')
    expect(
      activeSearchProvider({
        search: {
          provider: 'bocha',
          providers: emptyKeys,
        },
      }),
    ).toBe('genspark')
    expect(activeSearchProvider({ search: { provider: 'bing', providers: {} } as never })).toBe(
      'genspark',
    )
  })
})
