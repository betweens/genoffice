/**
 * Corporate HTTP proxy URL helpers (VW-group enterprise fork).
 *
 * Pure TS — no Electron / fs — so the Settings renderer can build and mask
 * the proxy URL with the same functions the main process uses to persist it.
 *
 * The password itself is never logged here. Persistence (electron safeStorage
 * or a plaintext userData fallback) lives in the shell main process.
 */

export const CORPORATE_PROXY_KEY = 'corporateProxy'
export const DEFAULT_PROXY_HOST = 'webproxy.cn.vwgroup.com'
export const DEFAULT_PROXY_PORT = 8080

/** Form / IPC payload (password in the clear only in-memory or over trusted IPC). */
export interface CorporateProxyDraft {
  enabled: boolean
  username: string
  password: string
  host: string
  port: number
}

/**
 * Shape stored under `corporateProxy` in userData/app-settings.json.
 * `passwordEnc` is base64 from electron safeStorage.encryptString.
 * `passwordPlain` is a last-resort fallback when OS encryption is unavailable
 * — anyone who can read userData can read the password. Never commit that
 * file; it is already outside the repo.
 */
export interface StoredCorporateProxy {
  enabled: boolean
  username: string
  host: string
  port: number
  passwordEnc?: string
  passwordPlain?: string
}

export type ProxyPasswordEncryption = 'safeStorage' | 'plaintext' | 'none'

export interface CorporateProxyView extends CorporateProxyDraft {
  maskedUrl: string
  passwordEncryption: ProxyPasswordEncryption
}

export function normalizeProxyPort(port: unknown): number {
  const n = typeof port === 'number' ? port : Number.parseInt(String(port ?? ''), 10)
  if (!Number.isInteger(n) || n < 1 || n > 65535) return DEFAULT_PROXY_PORT
  return n
}

export function buildProxyUrl(input: {
  username: string
  password: string
  host?: string
  port?: number
}): string {
  const username = input.username.trim()
  const host = (input.host ?? DEFAULT_PROXY_HOST).trim() || DEFAULT_PROXY_HOST
  const port = normalizeProxyPort(input.port)
  if (!username || !input.password || !host) return ''
  const user = encodeURIComponent(username)
  const pass = encodeURIComponent(input.password)
  return `http://${user}:${pass}@${host}:${port}`
}

/** Hide the password in a proxy URL (`user:****@host`) for display and logs. */
export function maskProxyUrl(url: string): string {
  return url.replace(/\/\/([^/@]+):([^@/]*)@/, '//$1:****@')
}

export function parseStoredCorporateProxy(raw: unknown): StoredCorporateProxy | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const v = raw as Record<string, unknown>
  const host = typeof v.host === 'string' && v.host.trim() ? v.host.trim() : DEFAULT_PROXY_HOST
  const username = typeof v.username === 'string' ? v.username.trim() : ''
  const stored: StoredCorporateProxy = {
    enabled: v.enabled === true,
    username,
    host,
    port: normalizeProxyPort(v.port),
  }
  if (typeof v.passwordEnc === 'string' && v.passwordEnc) stored.passwordEnc = v.passwordEnc
  if (typeof v.passwordPlain === 'string' && v.passwordPlain) stored.passwordPlain = v.passwordPlain
  return stored
}

export function passwordFromStored(
  stored: StoredCorporateProxy,
  decrypt: (cipher: string) => string | null,
): string {
  if (stored.passwordEnc) {
    const plain = decrypt(stored.passwordEnc)
    if (typeof plain === 'string' && plain) return plain
  }
  return stored.passwordPlain ?? ''
}

export function passwordEncryptionOf(stored: StoredCorporateProxy | null): ProxyPasswordEncryption {
  if (!stored) return 'none'
  if (stored.passwordEnc) return 'safeStorage'
  if (stored.passwordPlain) return 'plaintext'
  return 'none'
}

export function serializeCorporateProxy(
  draft: CorporateProxyDraft,
  encrypt: (plain: string) => string | null,
): StoredCorporateProxy {
  const stored: StoredCorporateProxy = {
    enabled: draft.enabled,
    username: draft.username.trim(),
    host: (draft.host.trim() || DEFAULT_PROXY_HOST).trim(),
    port: normalizeProxyPort(draft.port),
  }
  if (draft.password) {
    const enc = encrypt(draft.password)
    if (enc) stored.passwordEnc = enc
    else stored.passwordPlain = draft.password
  }
  return stored
}

/** Build the live proxy URL from a stored record, or null when it cannot be applied. */
export function corporateProxyUrlFromStored(
  stored: StoredCorporateProxy | null,
  decrypt: (cipher: string) => string | null,
): string | null {
  if (!stored?.enabled) return null
  const password = passwordFromStored(stored, decrypt)
  const url = buildProxyUrl({
    username: stored.username,
    password,
    host: stored.host,
    port: stored.port,
  })
  return url || null
}

export function corporateProxyUrlFromSettings(
  settings: Record<string, unknown>,
  decrypt: (cipher: string) => string | null,
): string | null {
  return corporateProxyUrlFromStored(
    parseStoredCorporateProxy(settings[CORPORATE_PROXY_KEY]),
    decrypt,
  )
}

export function parseCorporateProxyDraft(
  raw: unknown,
  fallbacks: { username: string; host?: string; port?: number },
): CorporateProxyDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const v = raw as Record<string, unknown>
  const username =
    typeof v.username === 'string' && v.username.trim() ? v.username.trim() : fallbacks.username
  const host =
    typeof v.host === 'string' && v.host.trim()
      ? v.host.trim()
      : (fallbacks.host ?? DEFAULT_PROXY_HOST)
  const password = typeof v.password === 'string' ? v.password : ''
  return {
    enabled: v.enabled === true,
    username,
    password,
    host,
    port: normalizeProxyPort(v.port ?? fallbacks.port),
  }
}

export function toCorporateProxyView(
  draft: CorporateProxyDraft,
  encryption: ProxyPasswordEncryption,
): CorporateProxyView {
  const url = buildProxyUrl(draft)
  return {
    ...draft,
    host: draft.host || DEFAULT_PROXY_HOST,
    port: normalizeProxyPort(draft.port),
    maskedUrl: url ? maskProxyUrl(url) : '',
    passwordEncryption: encryption,
  }
}

/** True when no proxy password is stored (or decrypt failed and the field is empty). */
export function proxyPasswordMissing(password: string | undefined | null): boolean {
  return typeof password !== 'string' || password.length === 0
}
