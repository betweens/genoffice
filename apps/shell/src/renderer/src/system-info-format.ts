import type { SystemInfo } from '../../shared/home-api'

/** macOS / Windows / Linux marketing name plus kernel when it adds information. */
export function formatOsDisplay(
  info: Pick<SystemInfo, 'platform' | 'osType' | 'osRelease' | 'osVersion'>,
): string {
  const name =
    info.platform === 'darwin'
      ? 'macOS'
      : info.platform === 'win32'
        ? 'Windows'
        : info.platform === 'linux'
          ? 'Linux'
          : info.osType || info.platform
  const version = info.osVersion || info.osRelease
  const kernel = [info.osType, info.osRelease].filter(Boolean).join(' ')
  if (name && version && kernel && !kernel.includes(version)) {
    return `${name} ${version} (${kernel})`
  }
  if (name && version) return `${name} ${version}`
  return [name, version, kernel].filter(Boolean).join(' ') || '—'
}

export function formatMemory(bytes: number, locale: string): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—'
  const gb = bytes / (1024 * 1024 * 1024)
  return `${gb.toLocaleString(locale, { maximumFractionDigits: 1 })} GB`
}
