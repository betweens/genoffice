/**
 * Shape of the packager-baked enterprise AI overlay.
 *
 * `tools/generate-enterprise-defaults.mjs` writes the gitignored twin
 * `enterprise-defaults.generated.ts` from `GENOFFICE_AI_*` / `BOCHA_API_KEY`
 * on the packager machine before `electron-vite build`. This committed
 * object stays empty so clones, tests, and `npm run dev` never ship secrets.
 *
 * Packagers: export those env vars before `npm run dist:mac|win|linux`
 * (or `npm run build:all`). `apps/shell/electron-builder.env` is loaded too
 * late — after the JS bundle is compiled — so it cannot bake AI keys.
 */
export const ENTERPRISE_AI_BUILD_DEFAULT_KEYS = [
  'GENOFFICE_AI_BASE_URL',
  'GENOFFICE_AI_API_KEY',
  'GENOFFICE_AI_MODEL',
  'GENOFFICE_AI_MEDIA_BASE_URL',
  'GENOFFICE_AI_MEDIA_API_KEY',
  'GENOFFICE_AI_IMAGE_MODEL',
  'GENOFFICE_AI_ANALYSIS_MODEL',
  'GENOFFICE_AI_VIDEO_MODEL',
  'GENOFFICE_AI_SEARCH_API_KEY',
  'BOCHA_API_KEY',
] as const

export type EnterpriseAiBuildDefaultKey = (typeof ENTERPRISE_AI_BUILD_DEFAULT_KEYS)[number]

export type EnterpriseAiBuildDefaults = Record<EnterpriseAiBuildDefaultKey, string>

export const EMPTY_ENTERPRISE_AI_BUILD_DEFAULTS: EnterpriseAiBuildDefaults = {
  GENOFFICE_AI_BASE_URL: '',
  GENOFFICE_AI_API_KEY: '',
  GENOFFICE_AI_MODEL: '',
  GENOFFICE_AI_MEDIA_BASE_URL: '',
  GENOFFICE_AI_MEDIA_API_KEY: '',
  GENOFFICE_AI_IMAGE_MODEL: '',
  GENOFFICE_AI_ANALYSIS_MODEL: '',
  GENOFFICE_AI_VIDEO_MODEL: '',
  GENOFFICE_AI_SEARCH_API_KEY: '',
  BOCHA_API_KEY: '',
}
