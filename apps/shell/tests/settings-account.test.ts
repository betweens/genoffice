/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiSettings } from '@genoffice/ai-provider'
import type { AccountStatus, HomeApi, SystemInfo } from '../src/shared/home-api'
import { AccountEntry } from '../src/renderer/src/AccountEntry'
import { LocaleProvider } from '../src/renderer/src/locale'
import {
  defaultSettingsSection,
  ENTERPRISE_HIDE_ACCOUNT,
  SettingsModal,
} from '../src/renderer/src/SettingsModal'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const SAMPLE_INFO: SystemInfo = {
  computerName: 'box',
  hostname: 'box',
  platform: 'linux',
  osType: 'Linux',
  osRelease: '6.1',
  osVersion: '6.1',
  arch: 'x64',
  username: 'alice',
  homedir: '/home/alice',
  appVersion: '0.10.0',
  electronVersion: '43.3.0',
  chromeVersion: '140.0.7339.0',
  locale: 'en-US',
  cpuModel: 'test',
  cpuCores: 4,
  totalMemoryBytes: 8 * 1024 * 1024 * 1024,
}

function bakedAiSettings(): AiSettings {
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
  }
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getAnalyticsEnabled: async () => true,
    getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
    getAiPanelPrefs: async () => ({ fontSize: 'default', spellcheck: true }),
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '1.0.0',
    githubStars: async () => null,
    getAiSettings: async () => bakedAiSettings(),
    getAiProviders: () => [],
    getSystemInfo: async () => SAMPLE_INFO,
    accountStatus: async () => ({ loggedIn: false }) satisfies AccountStatus,
    onAccountLogin: () => () => {},
  } as unknown as HomeApi
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

function navLabels(): string[] {
  return Array.from(host.querySelectorAll('.set-nav-item')).map((el) => el.textContent ?? '')
}

async function renderSettings(opts?: {
  lang?: 'en' | 'zh'
  initialSection?: 'account' | 'aiModel' | 'general'
}): Promise<void> {
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: opts?.lang ?? 'en' },
        createElement(SettingsModal, {
          status: { loggedIn: false },
          loggingOut: false,
          loginWaiting: false,
          loginUrl: null,
          urlCopied: false,
          onOpenLoginUrl: vi.fn(),
          onCopyLoginUrl: vi.fn(),
          onClose: vi.fn(),
          onLogin: vi.fn(),
          onLogout: vi.fn(),
          initialSection: opts?.initialSection,
        }),
      ),
    )
    await Promise.resolve()
  })
  await flush()
}

describe('enterprise Settings → Account', () => {
  it('keeps the hide flag on so Account can be restored by flipping it', () => {
    expect(ENTERPRISE_HIDE_ACCOUNT).toBe(true)
    expect(defaultSettingsSection()).toBe('aiModel')
    expect(defaultSettingsSection()).not.toBe('account')
  })

  it('hides the Account nav item and opens on AI Model', async () => {
    await renderSettings()

    expect(navLabels().some((label) => label.includes('Account'))).toBe(false)
    const current = host.querySelector('.set-nav-item[aria-current="true"]')
    expect(current?.textContent).toContain('AI Model')
    expect(host.querySelector('.set-pane-title')?.textContent).toBe('AI Model')
    expect(host.textContent).not.toContain('Not signed in')
  })

  it('hides the Chinese 账户 nav item and email/login pane', async () => {
    await renderSettings({ lang: 'zh' })

    expect(navLabels().some((label) => label.includes('账户'))).toBe(false)
    expect(host.querySelector('.set-nav-item[aria-current="true"]')?.textContent).toContain(
      'AI 模型',
    )
    expect(host.querySelector('.set-pane-title')?.textContent).toBe('AI 模型')
    expect(host.textContent).not.toContain('未登录')
    expect(host.textContent).not.toContain('登录 Genspark 账号')
  })

  it('does not land on Account even when initialSection requests it', async () => {
    await renderSettings({ initialSection: 'account' })

    expect(host.querySelector('.set-nav-item[aria-current="true"]')?.textContent).toContain(
      'AI Model',
    )
    expect(host.querySelector('.set-pane-title')?.textContent).toBe('AI Model')
  })
})

describe('sidebar account chip opens a visible Settings section', () => {
  it('opens Settings on AI Model, not the hidden Account pane', async () => {
    await act(async () => {
      root.render(
        createElement(LocaleProvider, { initial: 'en' }, createElement(AccountEntry)),
      )
      await Promise.resolve()
      await Promise.resolve()
    })

    const chip = host.querySelector<HTMLButtonElement>('.account-btn')
    expect(chip).toBeTruthy()
    await act(async () => {
      chip!.click()
      await Promise.resolve()
      await Promise.resolve()
    })
    await flush()

    expect(host.querySelector('.set-dialog')).not.toBeNull()
    expect(navLabels().some((label) => /\bAccount\b/.test(label) || label.includes('账户'))).toBe(
      false,
    )
    expect(host.querySelector('.set-nav-item[aria-current="true"]')?.textContent).toContain(
      'AI Model',
    )
    expect(host.querySelector('.set-pane-title')?.textContent).toBe('AI Model')
  })
})
