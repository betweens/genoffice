import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: (plain: string) => Buffer.from(plain, 'utf8'),
    decryptString: (buf: Buffer) => buf.toString('utf8'),
  },
}))

import { DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT } from '@genoffice/electron-utils/corporate-proxy'
import {
  loadProxySettings,
  saveProxySettings,
  savedCorporateProxyUrl,
  testProxySettings,
  type ProxyCrypto,
} from '../src/main/proxy-settings'
import { systemUsername } from '../src/main/system-info'

let dir: string
let settingsPath: string

const memoryCrypto = (): ProxyCrypto => ({
  encrypt: (plain) => Buffer.from(plain, 'utf8').toString('base64'),
  decrypt: (cipher) => Buffer.from(cipher, 'base64').toString('utf8'),
})

const unavailableCrypto = (): ProxyCrypto => ({
  encrypt: () => null,
  decrypt: () => null,
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'proxy-settings-'))
  settingsPath = join(dir, 'app-settings.json')
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadProxySettings', () => {
  it('prefills username from the OS user, not a hardcoded account', () => {
    const view = loadProxySettings(settingsPath, memoryCrypto())
    expect(view.username).toBe(systemUsername())
    expect(view.username.length).toBeGreaterThan(0)
    expect(view.username).not.toBe('humingfei')
    expect(view.host).toBe(DEFAULT_PROXY_HOST)
    expect(view.port).toBe(DEFAULT_PROXY_PORT)
    expect(view.maskedUrl).toBe('')
  })
})

describe('saveProxySettings', () => {
  it('persists an encrypted password and never writes it in the clear', () => {
    const view = saveProxySettings(
      settingsPath,
      {
        enabled: true,
        username: systemUsername(),
        password: 's3cret!',
        host: DEFAULT_PROXY_HOST,
        port: DEFAULT_PROXY_PORT,
      },
      memoryCrypto(),
    )
    expect(view.maskedUrl).toBe(
      `http://${encodeURIComponent(systemUsername())}:****@${DEFAULT_PROXY_HOST}:${DEFAULT_PROXY_PORT}`,
    )
    expect(view.password).toBe('s3cret!')
    expect(view.passwordEncryption).toBe('safeStorage')

    const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      corporateProxy: { passwordEnc?: string; passwordPlain?: string }
    }
    expect(raw.corporateProxy.passwordEnc).toBeTruthy()
    expect(raw.corporateProxy.passwordPlain).toBeUndefined()
    expect(JSON.stringify(raw)).not.toContain('s3cret!')
  })

  it('keeps a previously stored password when the field is left blank', () => {
    saveProxySettings(
      settingsPath,
      {
        enabled: true,
        username: 'alice',
        password: 'keep-me',
        host: DEFAULT_PROXY_HOST,
        port: 8080,
      },
      memoryCrypto(),
    )
    const view = saveProxySettings(
      settingsPath,
      {
        enabled: true,
        username: 'alice',
        password: '',
        host: DEFAULT_PROXY_HOST,
        port: 8080,
      },
      memoryCrypto(),
    )
    expect(view.password).toBe('keep-me')
    expect(savedCorporateProxyUrl(settingsPath, memoryCrypto())).toContain('keep-me')
  })

  it('documents plaintext fallback when OS encryption is unavailable', () => {
    saveProxySettings(
      settingsPath,
      {
        enabled: true,
        username: 'alice',
        password: 'plain-secret',
        host: DEFAULT_PROXY_HOST,
        port: 8080,
      },
      unavailableCrypto(),
    )
    const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      corporateProxy: { passwordPlain?: string; passwordEnc?: string }
    }
    expect(raw.corporateProxy.passwordPlain).toBe('plain-secret')
    expect(raw.corporateProxy.passwordEnc).toBeUndefined()
    const view = loadProxySettings(settingsPath, unavailableCrypto())
    expect(view.passwordEncryption).toBe('plaintext')
  })

  it('does not apply a disabled saved proxy', () => {
    saveProxySettings(
      settingsPath,
      {
        enabled: false,
        username: 'alice',
        password: 'x',
        host: DEFAULT_PROXY_HOST,
        port: 8080,
      },
      memoryCrypto(),
    )
    expect(savedCorporateProxyUrl(settingsPath, memoryCrypto())).toBeNull()
  })
})

describe('testProxySettings', () => {
  it('reports missing credentials without calling fetch', async () => {
    const fetch = async () => {
      throw new Error('should not fetch')
    }
    await expect(
      testProxySettings(
        { enabled: true, username: '', password: '', host: DEFAULT_PROXY_HOST, port: 8080 },
        { settingsPath, crypto: memoryCrypto(), fetch, ProxyAgent: class {} },
      ),
    ).resolves.toEqual({ ok: false, error: 'missing credentials' })
  })

  it('returns ok when the probe fetch succeeds and redacts the password on failure', async () => {
    const ok = await testProxySettings(
      {
        enabled: true,
        username: 'alice',
        password: 's3cret!',
        host: DEFAULT_PROXY_HOST,
        port: 8080,
      },
      {
        settingsPath,
        crypto: memoryCrypto(),
        ProxyAgent: class {
          constructor(public url: string) {}
        },
        fetch: async () => ({ ok: true, status: 204 }),
      },
    )
    expect(ok).toEqual({ ok: true })

    const fail = await testProxySettings(
      {
        enabled: true,
        username: 'alice',
        password: 's3cret!',
        host: DEFAULT_PROXY_HOST,
        port: 8080,
      },
      {
        settingsPath,
        crypto: memoryCrypto(),
        ProxyAgent: class {
          constructor(public url: string) {}
        },
        fetch: async () => {
          throw new Error(`connect failed http://alice:s3cret!@${DEFAULT_PROXY_HOST}:8080`)
        },
      },
    )
    expect(fail.ok).toBe(false)
    expect(fail.error).not.toContain('s3cret!')
    expect(fail.error).toContain('alice:****')
  })
})
