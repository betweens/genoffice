/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi, ProxySettings } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'

vi.mock('../src/renderer/src/Home', () => ({
  Home: () => createElement('div', { 'data-testid': 'home' }),
}))
vi.mock('../src/renderer/src/TabBar', () => ({
  TabBar: () => createElement('div', { 'data-testid': 'tabbar' }),
}))
vi.mock('../src/renderer/src/StarPromptCard', () => ({
  StarPromptCard: () => null,
}))

import { AppFrame } from '../src/renderer/src/AppFrame'

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true

const EMPTY: ProxySettings = {
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

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  getProxySettings = vi.fn(async () => EMPTY)
  window.aiOffice = {
    getProxySettings,
    setProxySettings: vi.fn(),
    starPromptShouldShow: vi.fn(async () => ({ show: false, docOpens: 0 })),
  } as unknown as HomeApi
  window.aiOfficeTabs = {
    list: async () => [{ id: 'home', kind: 'home' as const, title: 'Home', active: true }],
    onChanged: () => () => {},
  } as unknown as Window['aiOfficeTabs']
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function renderFrame(seen: boolean): Promise<void> {
  await act(async () => {
    root.render(
      createElement(
        LocaleProvider,
        { initial: 'en' },
        createElement(AppFrame, { initialOnboardingSeen: seen }),
      ),
    )
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('enterprise AppFrame', () => {
  it('never shows onboarding even when the seen flag is false', async () => {
    await renderFrame(false)
    expect(host.querySelector('.onb-overlay')).toBeNull()
    expect(host.querySelector('.proxy-gate-overlay')).not.toBeNull()
  })

  it('skips the proxy password dialog when a password is already saved', async () => {
    getProxySettings.mockResolvedValue({
      ...EMPTY,
      password: 'saved',
      passwordEncryption: 'safeStorage',
    })
    await renderFrame(true)
    expect(host.querySelector('.proxy-gate-overlay')).toBeNull()
    expect(host.querySelector('.onb-overlay')).toBeNull()
  })
})
