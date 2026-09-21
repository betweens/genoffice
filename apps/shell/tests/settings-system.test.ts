/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi, SystemInfo } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal } from '../src/renderer/src/SettingsModal'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const SAMPLE: SystemInfo = {
  computerName: '时光悠悠',
  hostname: 'awesome',
  platform: 'darwin',
  osType: 'Darwin',
  osRelease: '23.5.0',
  osVersion: '14.5.0',
  arch: 'arm64',
  username: 'alice',
  homedir: '/Users/alice',
  appVersion: '0.10.0',
  electronVersion: '43.3.0',
  chromeVersion: '140.0.7339.0',
  locale: 'zh-CN',
  cpuModel: 'Apple M2',
  cpuCores: 8,
  totalMemoryBytes: 16 * 1024 * 1024 * 1024,
}

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

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click()
    await Promise.resolve()
    await Promise.resolve()
  })
}

async function renderSettings(info: SystemInfo = SAMPLE, lang: 'en' | 'zh' = 'en'): Promise<void> {
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getAnalyticsEnabled: async () => true,
    getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
    getAiPanelPrefs: async () => ({ fontSize: 'default', spellcheck: true }),
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '0.10.0',
    githubStars: async () => null,
    getSystemInfo: async () => info,
  } as unknown as HomeApi

  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: lang },
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
}

function navItem(label: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-nav-item')).find((el) =>
    el.textContent?.includes(label),
  )
  expect(button).toBeTruthy()
  return button!
}

describe('Settings this-computer pane', () => {
  it('lists computer name, OS, and user from getSystemInfo', async () => {
    await renderSettings()
    await click(navItem('This computer'))

    expect(host.querySelector('.set-pane-title')?.textContent).toBe('This computer')
    expect(host.textContent).toContain('时光悠悠')
    expect(host.textContent).toContain('awesome')
    expect(host.textContent).toContain('macOS 14.5.0 (Darwin 23.5.0)')
    expect(host.textContent).toContain('alice')
    expect(host.textContent).toContain('/Users/alice')
    expect(host.textContent).toContain('Apple M2')
    expect(host.textContent).toContain('8 cores')
    expect(host.textContent).toContain('16 GB')
  })

  it('uses the Chinese nav label and field names', async () => {
    await renderSettings(SAMPLE, 'zh')
    await click(navItem('本机信息'))

    expect(host.querySelector('.set-pane-title')?.textContent).toBe('本机信息')
    expect(host.textContent).toContain('电脑名称')
    expect(host.textContent).toContain('操作系统')
    expect(host.textContent).toContain('系统用户')
    expect(host.textContent).toContain('时光悠悠')
  })

  it('copies every visible field as labeled text', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })

    await renderSettings()
    await click(navItem('This computer'))

    const copy = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-btn')).find((el) =>
      el.textContent?.includes('Copy all'),
    )
    expect(copy).toBeTruthy()
    await click(copy!)

    expect(writeText).toHaveBeenCalledTimes(1)
    const payload = writeText.mock.calls[0]![0]
    expect(payload).toContain('Computer name: 时光悠悠')
    expect(payload).toContain('Hostname: awesome')
    expect(payload).toContain('System user: alice')
    expect(payload).toContain('Home directory: /Users/alice')
  })

  it('hides the hostname row when it matches the computer name', async () => {
    await renderSettings({ ...SAMPLE, computerName: 'awesome', hostname: 'awesome' })
    await click(navItem('This computer'))

    expect(host.textContent).toContain('awesome')
    expect(host.textContent).not.toContain('Hostname')
  })
})
