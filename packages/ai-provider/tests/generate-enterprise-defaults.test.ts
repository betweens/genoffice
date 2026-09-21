import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const SCRIPT = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../tools/generate-enterprise-defaults.mjs',
)

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) rmSync(dir, { recursive: true, force: true })
  }
})

function generate(args: string[], env: NodeJS.ProcessEnv) {
  const dir = mkdtempSync(join(tmpdir(), 'enterprise-defaults-'))
  tempDirs.push(dir)
  const out = join(dir, 'enterprise-defaults.generated.ts')
  const stdout = execFileSync(process.execPath, [SCRIPT, '--out', out, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return { out, stdout, source: readFileSync(out, 'utf8') }
}

describe('generate-enterprise-defaults', () => {
  it('writes empty strings with --empty even when the packager env is set', () => {
    const { source, stdout } = generate(['--empty'], {
      GENOFFICE_AI_API_KEY: 'sk-should-not-bake',
      GENOFFICE_AI_BASE_URL: 'https://should-not-bake.example/v1',
    })
    expect(source).toContain('GENOFFICE_AI_API_KEY: ""')
    expect(source).toContain('GENOFFICE_AI_BASE_URL: ""')
    expect(source).not.toContain('sk-should-not-bake')
    expect(stdout).toContain('empty')
    expect(stdout).not.toContain('sk-should-not-bake')
  })

  it('bakes trim()ed env values and JSON-escapes them', () => {
    const { source, stdout } = generate([], {
      GENOFFICE_AI_BASE_URL: ' https://llm.packager.internal/v1 ',
      GENOFFICE_AI_API_KEY: ' sk-packager-"quote" ',
      GENOFFICE_AI_MODEL: 'packager-chat',
      GENOFFICE_AI_SEARCH_API_KEY: 'bocha-packager',
    })
    expect(source).toContain('GENOFFICE_AI_BASE_URL: "https://llm.packager.internal/v1"')
    expect(source).toContain('GENOFFICE_AI_API_KEY: "sk-packager-\\"quote\\""')
    expect(source).toContain('GENOFFICE_AI_MODEL: "packager-chat"')
    expect(source).toContain('GENOFFICE_AI_SEARCH_API_KEY: "bocha-packager"')
    expect(stdout).toContain('GENOFFICE_AI_API_KEY')
    expect(stdout).toContain('GENOFFICE_AI_SEARCH_API_KEY')
    expect(stdout).not.toContain('sk-packager')
    expect(stdout).not.toContain('bocha-packager')
  })
})
