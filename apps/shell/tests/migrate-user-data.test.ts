import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateUserDataOnce } from '../src/main/migrate-user-data'

/**
 * Packaged userData rename (src/main/migrate-user-data.ts): GenOffice → AI Office.
 * Same-path must be a no-op — Node's cpSync throws if src === dest.
 */

let appData: string

beforeEach(() => {
  appData = mkdtempSync(join(tmpdir(), 'migrate-user-data-'))
})

afterEach(() => {
  rmSync(appData, { recursive: true, force: true })
})

describe('migrateUserDataOnce', () => {
  it('is a no-op when the legacy name resolves to the current userData', () => {
    const userData = join(appData, 'AI Office')
    mkdirSync(userData)
    expect(() => migrateUserDataOnce(appData, userData, ['AI Office'])).not.toThrow()
    expect(readdirSync(userData)).toEqual([])
    expect(migrateUserDataOnce(appData, userData, ['AI Office'])).toBe(false)
  })

  it('copies GenOffice into empty AI Office userData', () => {
    const oldDir = join(appData, 'GenOffice')
    const userData = join(appData, 'AI Office')
    mkdirSync(oldDir)
    writeFileSync(join(oldDir, 'settings.json'), '{"lang":"zh"}')
    mkdirSync(join(oldDir, 'Cache'))
    writeFileSync(join(oldDir, 'Cache', 'blob'), 'x')

    expect(migrateUserDataOnce(appData, userData, ['GenOffice'])).toBe(true)
    expect(readFileSync(join(userData, 'settings.json'), 'utf8')).toBe('{"lang":"zh"}')
    expect(readFileSync(join(userData, 'Cache', 'blob'), 'utf8')).toBe('x')
    expect(existsSync(oldDir)).toBe(true)
  })

  it('copies GenOffice when AI Office exists but is empty', () => {
    const oldDir = join(appData, 'GenOffice')
    const userData = join(appData, 'AI Office')
    mkdirSync(oldDir)
    writeFileSync(join(oldDir, 'prefs.json'), '{}')
    mkdirSync(userData)

    expect(migrateUserDataOnce(appData, userData, ['GenOffice'])).toBe(true)
    expect(readFileSync(join(userData, 'prefs.json'), 'utf8')).toBe('{}')
  })

  it('does not overwrite a non-empty AI Office directory', () => {
    const oldDir = join(appData, 'GenOffice')
    const userData = join(appData, 'AI Office')
    mkdirSync(oldDir)
    writeFileSync(join(oldDir, 'old.json'), 'old')
    mkdirSync(userData)
    writeFileSync(join(userData, 'new.json'), 'new')

    expect(migrateUserDataOnce(appData, userData, ['GenOffice'])).toBe(false)
    expect(readFileSync(join(userData, 'new.json'), 'utf8')).toBe('new')
    expect(existsSync(join(userData, 'old.json'))).toBe(false)
  })

  it('is a no-op when no legacy directory exists', () => {
    const userData = join(appData, 'AI Office')
    expect(migrateUserDataOnce(appData, userData, ['GenOffice'])).toBe(false)
    expect(existsSync(userData)).toBe(false)
  })

  it('does not copy GenOffice Dev (unrelated unpacked userData)', () => {
    const devDir = join(appData, 'GenOffice Dev')
    const userData = join(appData, 'AI Office')
    mkdirSync(devDir)
    writeFileSync(join(devDir, 'dev-only.json'), 'dev')

    expect(migrateUserDataOnce(appData, userData, ['GenOffice'])).toBe(false)
    expect(existsSync(userData)).toBe(false)
  })
})
