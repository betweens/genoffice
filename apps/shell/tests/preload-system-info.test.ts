import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HomeApi } from '../src/shared/home-api'
import { EMPTY_SYSTEM_INFO, HOME_CHANNELS } from '../src/shared/home-api'

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

describe('getSystemInfo preload API', () => {
  it('forwards the home:get-system-info channel and keeps well-formed fields', async () => {
    electronMocks.invoke.mockResolvedValue({
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
      chromeVersion: '140.0.0.0',
      locale: 'zh-CN',
      cpuModel: 'Apple M2',
      cpuCores: 8,
      totalMemoryBytes: 17179869184,
    })

    await expect(homeApi.getSystemInfo()).resolves.toMatchObject({
      computerName: '时光悠悠',
      hostname: 'awesome',
      username: 'alice',
      cpuCores: 8,
    })
    expect(electronMocks.invoke).toHaveBeenCalledWith(HOME_CHANNELS.getSystemInfo)
  })

  it('falls back to empty defaults when main returns garbage', async () => {
    electronMocks.invoke.mockResolvedValue('nope')
    await expect(homeApi.getSystemInfo()).resolves.toEqual(EMPTY_SYSTEM_INFO)
  })
})
