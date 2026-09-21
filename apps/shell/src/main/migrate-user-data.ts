import { cpSync, existsSync, readdirSync, realpathSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Copy a previous product's userData into the current location once, when the
 * new directory is missing or empty.
 *
 * This fork renamed GenOffice → AI Office. Node's `cpSync` throws
 * "src and dest cannot be the same" when those paths resolve equal (the
 * leftover packaged-app crash: productName is already "AI Office", so a
 * source named "AI Office" is userData itself). Skip that case.
 */
export function migrateUserDataOnce(
  appData: string,
  userData: string,
  legacyNames: readonly string[],
): boolean {
  const dest = resolve(userData)
  if (!isEmptyOrMissing(dest)) return false

  for (const name of legacyNames) {
    const src = resolve(appData, name)
    if (sameUserDataPath(src, dest)) continue
    if (!existsSync(src)) continue
    try {
      cpSync(src, dest, { recursive: true })
      return true
    } catch {
      // A failed copy must not become an Uncaught Exception dialog on launch.
    }
  }
  return false
}

function isEmptyOrMissing(dir: string): boolean {
  if (!existsSync(dir)) return true
  try {
    return readdirSync(dir).length === 0
  } catch {
    return false
  }
}

function sameUserDataPath(a: string, b: string): boolean {
  if (resolvedEqual(a, b)) return true
  try {
    return resolvedEqual(realpathSync(a), realpathSync(b))
  } catch {
    return false
  }
}

function resolvedEqual(a: string, b: string): boolean {
  const ra = stripWinLongPath(resolve(a))
  const rb = stripWinLongPath(resolve(b))
  if (ra === rb) return true
  return process.platform === 'win32' && ra.toLowerCase() === rb.toLowerCase()
}

/** Electron/Node may prefix Windows paths with `\\?\`. */
function stripWinLongPath(p: string): string {
  return p.startsWith('\\\\?\\') ? p.slice(4) : p
}
