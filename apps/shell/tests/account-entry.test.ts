/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AccountStatus, HomeApi, SystemInfo } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'

vi.mock('../src/renderer/src/SettingsModal', () => ({
  SettingsModal: () => null,
}))
vi.mock('../src/renderer/src/IntegrationsPane', () => ({
  skillUpdateDue: () => false,
}))

import { AccountEntry } from '../src/renderer/src/AccountEntry'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const SAMPLE: SystemInfo = {
  computerName: 'box',
  hostname: 'box',
  platform: 'linux',
  osType: 'Linux',
  osRelease: '6.1',
  osVersion: '6.1',
  arch: 'x64',
  username: 'humingfei',
  homedir: '/home/humingfei',
  appVersion: '0.10.0',
  electronVersion: '43.3.0',
  chromeVersion: '140.0.7339.0',
  locale: 'zh-CN',
  cpuModel: 'test',
  cpuCores: 4,
  totalMemoryBytes: 8 * 1024 * 1024 * 1024,
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

async function renderChip(opts: {
  username: string
  account: AccountStatus
  lang?: 'zh' | 'en'
}): Promise<void> {
  window.aiOffice = {
    getSystemInfo: async () => ({ ...SAMPLE, username: opts.username }),
    accountStatus: async () => opts.account,
    onAccountLogin: () => () => {},
  } as unknown as HomeApi

  await act(async () => {
    root.render(
      createElement(LocaleProvider, { initial: opts.lang ?? 'zh' }, createElement(AccountEntry)),
    )
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('sidebar account chip identity', () => {
  it('shows the OS username and a user icon instead of 登录 when Genspark is signed out', async () => {
    await renderChip({ username: 'humingfei', account: { loggedIn: false } })

    expect(host.querySelector('.account-name')?.textContent).toBe('humingfei')
    expect(host.querySelector('.account-name')?.textContent).not.toBe('登录')
    expect(host.querySelector('.account-avatar')?.textContent).not.toContain('?')
    expect(host.querySelector('.account-user-icon')).not.toBeNull()
    expect(host.querySelector('.account-avatar')?.classList.contains('identified')).toBe(true)
    expect(host.querySelector('.account-avatar')?.classList.contains('logged-in')).toBe(false)
    expect(host.querySelector('.account-btn')?.getAttribute('data-tip')).toBe('系统用户: humingfei')
  })

  it('prefers the Genspark email local-part when signed in', async () => {
    await renderChip({
      username: 'humingfei',
      account: { loggedIn: true, email: 'ada@genspark.ai' },
    })

    expect(host.querySelector('.account-name')?.textContent).toBe('ada')
    expect(host.querySelector('.account-avatar')?.textContent).toContain('A')
    expect(host.querySelector('.account-user-icon')).toBeNull()
    expect(host.querySelector('.account-avatar')?.classList.contains('logged-in')).toBe(true)
    expect(host.querySelector('.account-avatar')?.classList.contains('identified')).toBe(false)
  })

  it('keeps 登录 and ? when no OS username and not signed in', async () => {
    await renderChip({ username: '', account: { loggedIn: false } })

    expect(host.querySelector('.account-name')?.textContent).toBe('登录')
    expect(host.querySelector('.account-avatar')?.textContent).toContain('?')
    expect(host.querySelector('.account-user-icon')).toBeNull()
  })
})
