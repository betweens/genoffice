/**
 * Start the shell Electron process with renderer HMR URLs in the environment.
 *
 * `npm run dev` used to prefix this with the `cross-env` bin shim. Concurrently
 * execs that shim through `/bin/sh`, which fails with "Permission denied"
 * (exit 126) when `node_modules/.bin/cross-env` is not executable — common
 * after a zip/copy checkout. Invoking this file with `node` avoids the shim.
 */
import { spawn } from 'node:child_process'

const RENDERER_URLS = {
  DOCS_RENDERER_URL: 'http://localhost:5173',
  SHEETS_RENDERER_URL: 'http://localhost:5174',
  SLIDES_RENDERER_URL: 'http://localhost:5175',
  PDF_RENDERER_URL: 'http://localhost:5176',
  MARKDOWN_RENDERER_URL: 'http://localhost:5177',
  HTML_RENDERER_URL: 'http://localhost:5178',
}

const child = spawn('npm run dev -w @genoffice/shell', {
  env: { ...process.env, ...RENDERER_URLS },
  stdio: 'inherit',
  shell: true,
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('exit', (code, signal) => {
  if (signal) process.exit(1)
  process.exit(code ?? 1)
})
