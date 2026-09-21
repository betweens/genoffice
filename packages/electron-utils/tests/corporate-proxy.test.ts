import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PROXY_HOST,
  DEFAULT_PROXY_PORT,
  buildProxyUrl,
  corporateProxyUrlFromSettings,
  corporateProxyUrlFromStored,
  maskProxyUrl,
  parseCorporateProxyDraft,
  parseStoredCorporateProxy,
  passwordEncryptionOf,
  passwordFromStored,
  serializeCorporateProxy,
  toCorporateProxyView,
} from '../src/corporate-proxy'

describe('buildProxyUrl', () => {
  it('encodes username and password for URL safety', () => {
    expect(
      buildProxyUrl({
        username: 'alice@corp',
        password: 'p@ss:word',
        host: DEFAULT_PROXY_HOST,
        port: DEFAULT_PROXY_PORT,
      }),
    ).toBe(`http://alice%40corp:p%40ss%3Aword@${DEFAULT_PROXY_HOST}:${DEFAULT_PROXY_PORT}`)
  })

  it('does not hardcode a username', () => {
    const url = buildProxyUrl({
      username: 'os-user',
      password: 'secret',
    })
    expect(url).toContain('os-user')
    expect(url).not.toContain('humingfei')
  })

  it('returns empty when username or password is missing', () => {
    expect(buildProxyUrl({ username: 'alice', password: '' })).toBe('')
    expect(buildProxyUrl({ username: '', password: 'secret' })).toBe('')
  })
})

describe('maskProxyUrl', () => {
  it('hides the password but keeps the user and host', () => {
    const url = buildProxyUrl({
      username: 'alice',
      password: 'super-secret',
      host: DEFAULT_PROXY_HOST,
      port: 8080,
    })
    expect(maskProxyUrl(url)).toBe(`http://alice:****@${DEFAULT_PROXY_HOST}:8080`)
    expect(maskProxyUrl(url)).not.toContain('super-secret')
  })
})

describe('serialize / restore', () => {
  it('prefers encrypted storage and round-trips the password', () => {
    const stored = serializeCorporateProxy(
      {
        enabled: true,
        username: 'alice',
        password: 'hunter2',
        host: DEFAULT_PROXY_HOST,
        port: 8080,
      },
      (plain) => Buffer.from(plain, 'utf8').toString('base64'),
    )
    expect(stored.passwordEnc).toBeTruthy()
    expect(stored.passwordPlain).toBeUndefined()
    expect(stored.username).toBe('alice')
    expect(
      passwordFromStored(stored, (cipher) => Buffer.from(cipher, 'base64').toString('utf8')),
    ).toBe('hunter2')
    expect(passwordEncryptionOf(stored)).toBe('safeStorage')
  })

  it('falls back to plaintext in the stored object when encryption is unavailable', () => {
    const stored = serializeCorporateProxy(
      {
        enabled: true,
        username: 'alice',
        password: 'hunter2',
        host: DEFAULT_PROXY_HOST,
        port: 8080,
      },
      () => null,
    )
    expect(stored.passwordEnc).toBeUndefined()
    expect(stored.passwordPlain).toBe('hunter2')
    expect(passwordEncryptionOf(stored)).toBe('plaintext')
  })

  it('does not apply a stored record that is disabled or missing credentials', () => {
    expect(
      corporateProxyUrlFromStored(
        {
          enabled: false,
          username: 'alice',
          host: DEFAULT_PROXY_HOST,
          port: 8080,
          passwordPlain: 'hunter2',
        },
        () => null,
      ),
    ).toBeNull()
    expect(
      corporateProxyUrlFromStored(
        { enabled: true, username: 'alice', host: DEFAULT_PROXY_HOST, port: 8080 },
        () => null,
      ),
    ).toBeNull()
  })

  it('reads an enabled record from app-settings.json shape', () => {
    const url = corporateProxyUrlFromSettings(
      {
        language: 'zh',
        corporateProxy: {
          enabled: true,
          username: 'alice',
          host: DEFAULT_PROXY_HOST,
          port: 8080,
          passwordPlain: 'hunter2',
        },
      },
      () => null,
    )
    expect(url).toBe(`http://alice:hunter2@${DEFAULT_PROXY_HOST}:8080`)
  })
})

describe('parseCorporateProxyDraft', () => {
  it('fills username from the OS fallback, not a hardcoded value', () => {
    const draft = parseCorporateProxyDraft(
      { enabled: true, password: 'x', host: DEFAULT_PROXY_HOST, port: 8080 },
      { username: 'from-os' },
    )
    expect(draft?.username).toBe('from-os')
    expect(draft?.username).not.toBe('humingfei')
  })
})

describe('toCorporateProxyView', () => {
  it('exposes a masked URL for the settings pane', () => {
    const view = toCorporateProxyView(
      {
        enabled: true,
        username: 'alice',
        password: 'secret',
        host: DEFAULT_PROXY_HOST,
        port: 8080,
      },
      'safeStorage',
    )
    expect(view.maskedUrl).toBe(`http://alice:****@${DEFAULT_PROXY_HOST}:8080`)
    expect(view.passwordEncryption).toBe('safeStorage')
  })
})

describe('parseStoredCorporateProxy', () => {
  it('returns null for garbage', () => {
    expect(parseStoredCorporateProxy(null)).toBeNull()
    expect(parseStoredCorporateProxy('nope')).toBeNull()
  })
})
