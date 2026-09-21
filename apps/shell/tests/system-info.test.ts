import os from 'node:os'
import { describe, expect, it } from 'vitest'
import { EMPTY_SYSTEM_INFO, parseSystemInfo } from '../src/shared/home-api'
import { collectSystemInfo, systemUsername } from '../src/main/system-info'
import { formatMemory, formatOsDisplay } from '../src/renderer/src/system-info-format'

describe('collectSystemInfo', () => {
  it('reads live os fields and the injected Electron versions', () => {
    const info = collectSystemInfo({
      appVersion: '0.10.0-test',
      locale: 'zh-CN',
      osVersion: '14.5.0',
      electronVersion: '43.3.0',
      chromeVersion: '140.0.0.0',
    })

    expect(info.hostname).toBe(os.hostname())
    expect(info.computerName.length).toBeGreaterThan(0)
    expect(info.platform).toBe(process.platform)
    expect(info.osType).toBe(os.type())
    expect(info.osRelease).toBe(os.release())
    expect(info.osVersion).toBe('14.5.0')
    expect(info.arch).toBe(os.arch())
    expect(info.username).toBe(systemUsername())
    expect(info.username).not.toBe('humingfei')
    expect(info.homedir).toBe(os.homedir())
    expect(info.appVersion).toBe('0.10.0-test')
    expect(info.electronVersion).toBe('43.3.0')
    expect(info.chromeVersion).toBe('140.0.0.0')
    expect(info.locale).toBe('zh-CN')
    expect(info.cpuCores).toBe(os.cpus().length)
    expect(info.totalMemoryBytes).toBe(os.totalmem())
  })
})

describe('parseSystemInfo', () => {
  it('returns empty defaults for garbage IPC payloads', () => {
    expect(parseSystemInfo(null)).toEqual(EMPTY_SYSTEM_INFO)
    expect(parseSystemInfo('nope')).toEqual(EMPTY_SYSTEM_INFO)
    expect(parseSystemInfo({ computerName: 12, cpuCores: '8' }).computerName).toBe('')
    expect(parseSystemInfo({ computerName: 12, cpuCores: '8' }).cpuCores).toBe(0)
  })

  it('keeps well-formed string and number fields', () => {
    const parsed = parseSystemInfo({
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
      totalMemoryBytes: 16 * 1024 * 1024 * 1024,
      serial: 'should-be-ignored',
    })
    expect(parsed.computerName).toBe('时光悠悠')
    expect(parsed.hostname).toBe('awesome')
    expect(parsed.cpuCores).toBe(8)
    expect(parsed).not.toHaveProperty('serial')
  })
})

describe('system info display helpers', () => {
  it('formats macOS with kernel when it adds information', () => {
    expect(
      formatOsDisplay({
        platform: 'darwin',
        osType: 'Darwin',
        osRelease: '23.5.0',
        osVersion: '14.5.0',
      }),
    ).toBe('macOS 14.5.0 (Darwin 23.5.0)')
  })

  it('does not duplicate the kernel when osVersion already matches it', () => {
    expect(
      formatOsDisplay({
        platform: 'linux',
        osType: 'Linux',
        osRelease: '6.12.94',
        osVersion: '6.12.94',
      }),
    ).toBe('Linux 6.12.94')
  })

  it('formats total memory in GB', () => {
    expect(formatMemory(16 * 1024 * 1024 * 1024, 'en-US')).toBe('16 GB')
    expect(formatMemory(0, 'en-US')).toBe('—')
  })
})
