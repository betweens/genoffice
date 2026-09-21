/**
 * @vitest-environment jsdom
 */
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import type { Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { HomeApi, SystemInfo } from '../src/shared/home-api'
import { LocaleProvider } from '../src/renderer/src/locale'
import { SidebarUsername } from '../src/renderer/src/SidebarUsername'

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

async function render(info: SystemInfo | null): Promise<void> {
  window.aiOffice = {
    getSystemInfo: async () => {
      if (!info) throw new Error('unavailable')
      return info
    },
  } as unknown as HomeApi

  await act(async () => {
    root.render(createElement(LocaleProvider, { initial: 'zh' }, createElement(SidebarUsername)))
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('sidebar OS username', () => {
  it('shows the system user in the sidebar footer', async () => {
    await render(SAMPLE)
    expect(host.querySelector('.sidebar-username-value')?.textContent).toBe('alice')
    expect(host.querySelector('.sidebar-username-value')?.textContent).not.toBe('humingfei')
    expect(host.querySelector('.sidebar-username-label')?.textContent).toBe('系统用户')
  })

  it('hides the row when the OS username is unknown', async () => {
    await render({ ...SAMPLE, username: '' })
    expect(host.querySelector('.sidebar-username')).toBeNull()
  })
})
