/**
 * Corporate HTTP proxy: persist credentials, apply to undici / gsk, test
 * connectivity. The password is stored in userData via electron safeStorage
 * when the OS keychain/DPAPI is available; otherwise it is written as
 * plaintext in app-settings.json (anyone with filesystem access to userData
 * can read it). The password is never logged and never committed.
 */
import { safeStorage } from 'electron'
import {
  CORPORATE_PROXY_KEY,
  DEFAULT_PROXY_HOST,
  DEFAULT_PROXY_PORT,
  buildProxyUrl,
  corporateProxyUrlFromStored,
  maskProxyUrl,
  parseCorporateProxyDraft,
  parseStoredCorporateProxy,
  passwordEncryptionOf,
  passwordFromStored,
  proxyPasswordMissing,
  serializeCorporateProxy,
  toCorporateProxyView,
  type CorporateProxyDraft,
  type CorporateProxyView,
  type StoredCorporateProxy,
} from '@genoffice/electron-utils/corporate-proxy'
import { readAppSettings, writeAppSettings } from './app-settings'
import { systemUsername } from './system-info'

export const PROXY_TEST_URL = 'https://www.gstatic.com/generate_204'
const TEST_TIMEOUT_MS = 10_000

export type ProxyCrypto = {
  encrypt(plain: string): string | null
  decrypt(cipher: string): string | null
}

export function electronProxyCrypto(): ProxyCrypto {
  return {
    encrypt(plain) {
      try {
        if (!safeStorage.isEncryptionAvailable()) return null
        return safeStorage.encryptString(plain).toString('base64')
      } catch {
        return null
      }
    },
    decrypt(cipher) {
      try {
        if (!safeStorage.isEncryptionAvailable()) return null
        return safeStorage.decryptString(Buffer.from(cipher, 'base64'))
      } catch {
        return null
      }
    },
  }
}

function readStored(settingsPath: string): StoredCorporateProxy | null {
  return parseStoredCorporateProxy(readAppSettings(settingsPath)[CORPORATE_PROXY_KEY])
}

function emptyDraft(): CorporateProxyDraft {
  return {
    enabled: true,
    username: systemUsername(),
    password: '',
    host: DEFAULT_PROXY_HOST,
    port: DEFAULT_PROXY_PORT,
  }
}

export function loadProxySettings(
  settingsPath: string,
  crypto: ProxyCrypto = electronProxyCrypto(),
): CorporateProxyView {
  const stored = readStored(settingsPath)
  const base = emptyDraft()
  if (!stored) return toCorporateProxyView(base, 'none')
  const password = passwordFromStored(stored, (cipher) => crypto.decrypt(cipher))
  return toCorporateProxyView(
    {
      enabled: stored.enabled,
      username: stored.username || base.username,
      password,
      host: stored.host || DEFAULT_PROXY_HOST,
      port: stored.port || DEFAULT_PROXY_PORT,
    },
    passwordEncryptionOf(stored),
  )
}

export function saveProxySettings(
  settingsPath: string,
  raw: unknown,
  crypto: ProxyCrypto = electronProxyCrypto(),
): CorporateProxyView {
  const previous = readStored(settingsPath)
  const previousPassword = previous
    ? passwordFromStored(previous, (cipher) => crypto.decrypt(cipher))
    : ''
  const draft = parseCorporateProxyDraft(raw, {
    username: previous?.username || systemUsername(),
    host: previous?.host || DEFAULT_PROXY_HOST,
    port: previous?.port || DEFAULT_PROXY_PORT,
  })
  if (!draft) {
    throw new Error('Invalid proxy settings.')
  }
  if (!draft.password && previousPassword) draft.password = previousPassword
  if (!draft.username) draft.username = systemUsername()
  const stored = serializeCorporateProxy(draft, (plain) => crypto.encrypt(plain))
  writeAppSettings(settingsPath, { [CORPORATE_PROXY_KEY]: stored })
  return loadProxySettings(settingsPath, crypto)
}

/** URL to apply at startup / after save, or null when the saved proxy is off. */
export function savedCorporateProxyUrl(
  settingsPath: string,
  crypto: ProxyCrypto = electronProxyCrypto(),
): string | null {
  return corporateProxyUrlFromStored(readStored(settingsPath), (cipher) => crypto.decrypt(cipher))
}

/** True when no usable proxy password is persisted yet (startup gate). */
export function savedProxyPasswordMissing(
  settingsPath: string,
  crypto: ProxyCrypto = electronProxyCrypto(),
): boolean {
  return proxyPasswordMissing(loadProxySettings(settingsPath, crypto).password)
}

function redactProxyUrl(message: string, proxyUrl: string): string {
  if (!proxyUrl) return message
  return message.split(proxyUrl).join(maskProxyUrl(proxyUrl))
}

type ProxyTestFetch = (
  url: string,
  init: RequestInit & { dispatcher?: unknown },
) => Promise<{ ok: boolean; status: number }>

/**
 * Probe the proxy with a short HTTPS GET through an isolated ProxyAgent
 * (does not mutate the process-wide dispatcher — Save does that).
 */
export async function testProxySettings(
  raw: unknown,
  opts: {
    settingsPath: string
    crypto?: ProxyCrypto
    fetch?: ProxyTestFetch
    ProxyAgent?: new (url: string) => unknown
  },
): Promise<{ ok: boolean; error?: string }> {
  const crypto = opts.crypto ?? electronProxyCrypto()
  const current = loadProxySettings(opts.settingsPath, crypto)
  const draft = parseCorporateProxyDraft(raw, {
    username: current.username || systemUsername(),
    host: current.host,
    port: current.port,
  })
  if (!draft) return { ok: false, error: 'invalid settings' }
  const password = draft.password || current.password
  const proxyUrl = buildProxyUrl({ ...draft, password })
  if (!proxyUrl) return { ok: false, error: 'missing credentials' }

  try {
    const Agent = opts.ProxyAgent ?? (await import('undici')).ProxyAgent
    const dispatcher = new Agent(proxyUrl)
    const doFetch = opts.fetch ?? (fetch as unknown as ProxyTestFetch)
    const res = await doFetch(PROXY_TEST_URL, {
      dispatcher,
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      redirect: 'manual',
    })
    if (res.status === 407) return { ok: false, error: 'proxy authentication required' }
    if (res.ok || res.status === 204 || (res.status >= 200 && res.status < 400)) {
      return { ok: true }
    }
    return { ok: false, error: `HTTP ${res.status}` }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, error: redactProxyUrl(message, proxyUrl) }
  }
}
