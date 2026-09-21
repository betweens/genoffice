import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import type { SystemInfo } from '../shared/home-api'

function trimOrEmpty(value: string | undefined | null): string {
  return typeof value === 'string' ? value.trim() : ''
}

/** macOS Settings → Sharing "Computer Name" (often CJK; hostname stays ASCII). */
function readDarwinComputerName(): string {
  try {
    return trimOrEmpty(
      execFileSync('scutil', ['--get', 'ComputerName'], {
        encoding: 'utf8',
        timeout: 1500,
        stdio: ['ignore', 'pipe', 'ignore'],
      }),
    )
  } catch {
    return ''
  }
}

/** systemd pretty hostname from /etc/machine-info, if the distro sets one. */
function readLinuxPrettyHostname(): string {
  try {
    const text = readFileSync('/etc/machine-info', 'utf8')
    const match = /^PRETTY_HOSTNAME=(.*)$/m.exec(text)
    if (!match) return ''
    let value = match[1].trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    return trimOrEmpty(value)
  } catch {
    return ''
  }
}

function readComputerName(hostname: string): string {
  if (process.platform === 'darwin') {
    const name = readDarwinComputerName()
    if (name) return name
  }
  if (process.platform === 'win32') {
    const name = trimOrEmpty(process.env.COMPUTERNAME)
    if (name) return name
  }
  if (process.platform === 'linux') {
    const pretty = readLinuxPrettyHostname()
    if (pretty) return pretty
  }
  return hostname
}

export function readUser(homedir: string): { username: string; homedir: string } {
  try {
    const info = os.userInfo()
    return {
      username: info.username || trimOrEmpty(process.env.USER) || trimOrEmpty(process.env.USERNAME),
      homedir: info.homedir || homedir,
    }
  } catch {
    return {
      username: trimOrEmpty(process.env.USER) || trimOrEmpty(process.env.USERNAME),
      homedir,
    }
  }
}

/** Same source as Settings → This computer "System user". */
export function systemUsername(): string {
  return readUser(os.homedir()).username
}

/** Collect a support-safe snapshot of this machine. Electron-only fields are
 * passed in so the collector can be unit-tested without booting Electron. */
export function collectSystemInfo(opts: {
  appVersion: string
  locale: string
  osVersion: string
  electronVersion: string
  chromeVersion: string
}): SystemInfo {
  const hostname = os.hostname()
  const cpus = os.cpus()
  const user = readUser(os.homedir())
  return {
    computerName: readComputerName(hostname),
    hostname,
    platform: process.platform,
    osType: os.type(),
    osRelease: os.release(),
    osVersion: opts.osVersion,
    arch: os.arch(),
    username: user.username,
    homedir: user.homedir,
    appVersion: opts.appVersion,
    electronVersion: opts.electronVersion,
    chromeVersion: opts.chromeVersion,
    locale: opts.locale,
    cpuModel: trimOrEmpty(cpus[0]?.model),
    cpuCores: cpus.length,
    totalMemoryBytes: os.totalmem(),
  }
}
