/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_MEDIA_PROVIDERS,
  AI_SEARCH_PROVIDERS,
  filterAiMediaProviderCatalog,
  filterAiSearchProviderCatalog,
} from '@genoffice/ai-provider/browser'
import type { AiSettings } from '@genoffice/ai-provider'
import type { HomeApi } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal } from '../src/renderer/src/SettingsModal'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function click(el: Element | null | undefined): Promise<void> {
  expect(el).toBeTruthy()
  await act(async () => {
    ;(el as HTMLButtonElement).click()
    await Promise.resolve()
  })
  await flush()
}

function bakedMediaSettings(): AiSettings {
  return {
    provider: 'custom',
    providers: {
      custom: {
        apiKey: 'sk-enterprise',
        model: 'acme-chat',
        baseUrl: 'https://llm.example.internal/v1',
      },
    } as never,
    gskToolsEnabled: false,
    media: {
      imageProvider: 'custom',
      analysisProvider: 'custom',
      videoAnalysisProvider: 'custom',
      providers: {
        custom: {
          apiKey: 'sk-enterprise',
          baseUrl: 'https://llm.example.internal/v1',
          imageModel: 'flux-schnell',
          analysisModel: 'qwen3-vl',
          videoModel: '',
        },
      } as never,
    },
    search: {
      provider: 'bocha',
      providers: {
        serper: { apiKey: '' },
        tavily: { apiKey: '' },
        bocha: { apiKey: 'bocha-key' },
      },
    },
  }
}

async function openAiMediaPane(): Promise<void> {
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(SettingsModal, {
          status: null,
          loggingOut: false,
          loginWaiting: false,
          loginUrl: null,
          urlCopied: false,
          onOpenLoginUrl: vi.fn(),
          onCopyLoginUrl: vi.fn(),
          onClose: vi.fn(),
          onLogin: vi.fn(),
          onLogout: vi.fn(),
        }),
      ),
    )
    await Promise.resolve()
  })
  await flush()

  const mediaNav = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-nav-item')).find(
    (button) => button.textContent?.includes('AI Media'),
  )
  await click(mediaNav)
  await flush()
}

function mockAiOffice(settings: AiSettings = bakedMediaSettings()): void {
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getAnalyticsEnabled: async () => true,
    getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
    getAiPanelPrefs: async () => ({ fontSize: 'default', spellcheck: true }),
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '1.0.0',
    githubStars: async () => null,
    getAiSettings: async () => settings,
    getAiMediaProviders: () => filterAiMediaProviderCatalog(AI_MEDIA_PROVIDERS),
    getAiSearchProviders: () => filterAiSearchProviderCatalog(AI_SEARCH_PROVIDERS),
  } as unknown as HomeApi
}

function paneSubtitles(): string[] {
  return Array.from(host.querySelectorAll('.set-pane-subtitle')).map((el) => el.textContent ?? '')
}

describe('Settings AI Media pane', () => {
  it('shows baked Custom image/analysis models as read-only when other media fields are locked', async () => {
    mockAiOffice()
    await openAiMediaPane()

    const image = host.querySelector<HTMLInputElement>('#set-ai-image-model')
    const analysis = host.querySelector<HTMLInputElement>('#set-ai-analysis-model')
    expect(image?.value).toBe('flux-schnell')
    expect(analysis?.value).toBe('qwen3-vl')
    expect(image?.readOnly).toBe(true)
    expect(analysis?.readOnly).toBe(true)
  })

  it('hides video analysis when enterprise-locked Custom has no video-capable model', async () => {
    mockAiOffice()
    await openAiMediaPane()

    expect(paneSubtitles()).toEqual(['Web search', 'Image generation', 'Image analysis'])
    expect(host.querySelector('#set-ai-search-key')).toBeTruthy()
    expect(host.querySelector('#set-ai-image-model')).toBeTruthy()
    expect(host.querySelector('#set-ai-analysis-model')).toBeTruthy()
    expect(host.querySelector('#set-ai-video-model')).toBeNull()
    expect(host.textContent).not.toContain('Video analysis')
  })
})
