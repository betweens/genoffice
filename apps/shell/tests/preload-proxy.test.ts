import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi } from '../src/shared/home-api'
import { EMPTY_PROXY_SETTINGS, HOME_CHANNELS } from '../src/shared/home-api'

const electronMocks = vi.hoisted(() => ({
  exposed: new Map<string, unknown>(),
  invoke: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (name: string, api: unknown) => electronMocks.exposed.set(name, api),
  },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    send: electronMocks.send,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
  webUtils: { getPathForFile: () => '' },
}))

import '../src/preload/index'

const homeApi = electronMocks.exposed.get('aiOffice') as HomeApi

beforeEach(() => {
  electronMocks.invoke.mockReset()
  electronMocks.send.mockReset()
})

describe('proxy settings preload API', () => {
  it('forwards get/set/test channels and keeps well-formed fields', async () => {
    electronMocks.invoke.mockResolvedValue({
      enabled: true,
      username: 'alice',
      password: 'x',
      host: 'webproxy.cn.vwgroup.com',
      port: 8080,
      maskedUrl: 'http://alice:****@webproxy.cn.vwgroup.com:8080',
      passwordEncryption: 'safeStorage',
    })

    await expect(homeApi.getProxySettings()).resolves.toMatchObject({
      username: 'alice',
      host: 'webproxy.cn.vwgroup.com',
      passwordEncryption: 'safeStorage',
    })
    expect(electronMocks.invoke).toHaveBeenCalledWith(HOME_CHANNELS.getProxySettings)

    await homeApi.setProxySettings({
      enabled: true,
      username: 'alice',
      password: 'x',
      host: 'webproxy.cn.vwgroup.com',
      port: 8080,
    })
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      HOME_CHANNELS.setProxySettings,
      expect.objectContaining({ username: 'alice' }),
    )
  })

  it('falls back to empty defaults when main returns garbage', async () => {
    electronMocks.invoke.mockResolvedValue('nope')
    await expect(homeApi.getProxySettings()).resolves.toEqual(EMPTY_PROXY_SETTINGS)
  })

  it('maps a failed probe to an error result', async () => {
    electronMocks.invoke.mockResolvedValue({ ok: false, error: 'HTTP 407' })
    await expect(
      homeApi.testProxySettings({
        username: 'alice',
        password: 'x',
        host: 'webproxy.cn.vwgroup.com',
        port: 8080,
      }),
    ).resolves.toEqual({ ok: false, error: 'HTTP 407' })
    expect(electronMocks.invoke).toHaveBeenCalledWith(
      HOME_CHANNELS.testProxySettings,
      expect.objectContaining({ username: 'alice' }),
    )
  })
})
