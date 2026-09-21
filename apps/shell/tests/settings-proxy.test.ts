/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi, ProxySettings } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SettingsModal } from '../src/renderer/src/SettingsModal'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const SAMPLE: ProxySettings = {
  enabled: true,
  username: 'alice',
  password: '',
  host: 'webproxy.cn.vwgroup.com',
  port: 8080,
  maskedUrl: '',
  passwordEncryption: 'none',
}

let host: HTMLDivElement
let root: Root
let getProxySettings: ReturnType<typeof vi.fn>
let setProxySettings: ReturnType<typeof vi.fn>
let testProxySettings: ReturnType<typeof vi.fn>

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  getProxySettings = vi.fn(async () => SAMPLE)
  setProxySettings = vi.fn(async (next: ProxySettings) => ({
    ...SAMPLE,
    ...next,
    maskedUrl: `http://${next.username}:****@${next.host}:${next.port}`,
    passwordEncryption: 'safeStorage' as const,
  }))
  testProxySettings = vi.fn(async () => ({ ok: true }))
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

async function renderSettings(lang: 'en' | 'zh' = 'en'): Promise<void> {
  window.aiOffice = {
    getTheme: async () => 'system',
    getDefaultSaveDir: async () => '',
    getAnalyticsEnabled: async () => true,
    getAutoSaveDefault: async () => ({ on: false, updatedAt: 0 }),
    getAiPanelPrefs: async () => ({ fontSize: 'default', spellcheck: true }),
    getUpdateChannel: async () => 'stable',
    getAppVersion: async () => '0.10.0',
    githubStars: async () => null,
    getSystemInfo: async () => ({ username: 'alice' }),
    getProxySettings,
    setProxySettings,
    testProxySettings,
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

function fieldInput(id: string): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>(id)
  expect(input).toBeTruthy()
  return input!
}

const setInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!

async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  await act(async () => {
    setInputValue.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Promise.resolve()
  })
}

describe('Settings proxy pane', () => {
  it('prefills the OS username and default host, not a hardcoded account', async () => {
    await renderSettings()
    await click(navItem('Proxy'))

    expect(host.querySelector('.set-pane-title')?.textContent).toBe('Proxy')
    expect(fieldInput('#set-proxy-user').value).toBe('alice')
    expect(fieldInput('#set-proxy-user').value).not.toBe('humingfei')
    expect(fieldInput('#set-proxy-host').value).toBe('webproxy.cn.vwgroup.com')
    expect(fieldInput('#set-proxy-port').value).toBe('8080')
    expect(fieldInput('#set-proxy-pass').type).toBe('password')
    expect(host.textContent).toContain('Generated after username and password are entered')
  })

  it('shows a masked proxy URL as the password is typed', async () => {
    await renderSettings()
    await click(navItem('Proxy'))

    await typeInto(fieldInput('#set-proxy-pass'), 's3cret!')

    expect(host.textContent).toContain('http://alice:****@webproxy.cn.vwgroup.com:8080')
    expect(host.textContent).not.toContain('s3cret!')
  })

  it('tests then saves through the home IPC', async () => {
    await renderSettings()
    await click(navItem('Proxy'))

    await typeInto(fieldInput('#set-proxy-pass'), 's3cret!')

    const test = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-btn')).find((el) =>
      el.textContent?.includes('Test connection'),
    )
    expect(test).toBeTruthy()
    await click(test!)
    expect(testProxySettings).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'alice', password: 's3cret!' }),
    )
    expect(host.textContent).toContain('Proxy reachable')

    const save = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-btn')).find((el) =>
      el.textContent?.includes('Save'),
    )
    expect(save).toBeTruthy()
    await click(save!)
    expect(setProxySettings).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        username: 'alice',
        password: 's3cret!',
        host: 'webproxy.cn.vwgroup.com',
        port: 8080,
      }),
    )
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(host.textContent).toContain('Saved')
  })

  it('uses the Chinese nav label and field names', async () => {
    await renderSettings('zh')
    await click(navItem('网络代理'))

    expect(host.querySelector('.set-pane-title')?.textContent).toBe('网络代理')
    expect(host.textContent).toContain('用户名')
    expect(host.textContent).toContain('密码')
    expect(host.textContent).toContain('代理地址')
    expect(host.textContent).toContain('测试连接')
  })

  it('asks for credentials before testing an empty password', async () => {
    await renderSettings()
    await click(navItem('Proxy'))

    const test = Array.from(host.querySelectorAll<HTMLButtonElement>('.set-btn')).find((el) =>
      el.textContent?.includes('Test connection'),
    )
    expect(test).toBeTruthy()
    await click(test!)
    expect(testProxySettings).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Enter a username and password first')
  })
})
