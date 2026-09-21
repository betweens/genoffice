import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AI_CUSTOM_FONT_MAX_PX,
  AI_CUSTOM_FONT_MIN_PX,
  DEFAULT_AI_PANEL_PREFS,
  Dropdown,
  aiPanelFontPx,
  clampAiCustomFontSize,
} from '@genoffice/ui'
import type { AiFontSize, AiPanelPrefs, AiPanelSide } from '@genoffice/ui'
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  ENTERPRISE_AI_UI_POLICY,
  ENTERPRISE_LOCKED_MEDIA_PROVIDER,
  ENTERPRISE_LOCKED_PROVIDER,
  ENTERPRISE_LOCKED_SEARCH_PROVIDER,
  MAX_MAX_OUTPUT_TOKENS,
  MIN_MAX_OUTPUT_TOKENS,
  clampMaxOutputTokens,
  maskApiKey,
} from '@genoffice/ai-provider/browser'
import type {
  AiMediaProviderId,
  AiMediaProviderMeta,
  AiMediaSettings,
  AiSearchProviderMeta,
  AiSearchSettings,
  AiSettings,
} from '@genoffice/ai-provider'
import { useI18n } from './locale'
import type { StringKey, TFunc } from './locale'
import type {
  AccountStatus,
  AiCatalogEntry,
  ProxySettings,
  SystemInfo,
  UiTheme,
} from '../../shared/home-api'
import { ProviderLogo } from './provider-logos'
import { IntegrationsPane, skillUpdateDue } from './IntegrationsPane'
import { formatMemory, formatOsDisplay } from './system-info-format'
import { buildProxyUrl, maskProxyUrl } from '@genoffice/electron-utils/corporate-proxy'
import './settings.css'

// ── Settings modal (opened from the account menu) ─────────
// Genspark-style two-pane dialog: section nav on the left, fields on the right.
// All values go through the existing home IPC; nothing is stored locally.

// sorted by ISO 639 language code — native-script labels have no natural
// shared alphabet, so the code is the ordering key
const LANG_OPTIONS = [
  { value: 'ar', label: 'العربية' },
  { value: 'cs', label: 'Čeština' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'he', label: 'עברית' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pl', label: 'Polski' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
  { value: 'th', label: 'ไทย' },
  { value: 'zh', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
] as const

// GenMail's option order: follow-system first, then the manual picks
const THEME_OPTIONS = [
  { value: 'system', labelKey: 'themeSystem' },
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
] as const satisfies readonly { value: UiTheme; labelKey: StringKey }[]

const AI_FONT_SIZE_OPTIONS = [
  { value: 'default', labelKey: 'aiFontSizeDefault' },
  { value: 'large', labelKey: 'aiFontSizeLarge' },
  { value: 'xlarge', labelKey: 'aiFontSizeXLarge' },
  { value: 'custom', labelKey: 'aiFontSizeCustom' },
] as const satisfies readonly { value: AiFontSize; labelKey: StringKey }[]

const CHANNEL_OPTIONS = [
  { value: 'stable', labelKey: 'channelStable' },
  { value: 'beta', labelKey: 'channelBeta' },
] as const satisfies readonly { value: 'stable' | 'beta'; labelKey: StringKey }[]

/** GitHub-style abbreviated stargazer count (2591 → "2.6k") — the number is
 * social proof, not a metric; the cached/exact value would only look stale */
function formatStars(n: number): string {
  if (n < 1000) return String(n)
  const k = n / 1000
  return `${k >= 100 ? Math.round(k) : (Math.round(k * 10) / 10).toString().replace(/\.0$/, '')}k`
}

/** px stepper for the custom AI panel text size; in-range values apply live,
 * out-of-range or partial input is clamped on blur */
function CustomFontSizeInput({
  value,
  label,
  onCommit,
}: {
  value: number
  label: string
  onCommit: (px: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const [editing, setEditing] = useState(false)
  const shown = editing ? draft : String(value)
  const commit = (raw: string) => {
    const px = clampAiCustomFontSize(raw)
    if (px !== null && px !== value) onCommit(px)
  }
  return (
    <label className="set-num">
      <input
        type="number"
        className="set-input set-num-input"
        aria-label={label}
        min={AI_CUSTOM_FONT_MIN_PX}
        max={AI_CUSTOM_FONT_MAX_PX}
        step={1}
        value={shown}
        onFocus={() => {
          setDraft(String(value))
          setEditing(true)
        }}
        onChange={(e) => {
          setDraft(e.target.value)
          const n = Number(e.target.value)
          if (Number.isInteger(n) && n >= AI_CUSTOM_FONT_MIN_PX && n <= AI_CUSTOM_FONT_MAX_PX) {
            onCommit(n)
          }
        }}
        onBlur={() => {
          commit(draft)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
        }}
      />
      <span className="set-num-unit">px</span>
    </label>
  )
}

type SectionId =
  'account' | 'aiModel' | 'aiMedia' | 'general' | 'integrations' | 'system' | 'proxy' | 'about'

const SECTIONS: readonly { id: SectionId; labelKey: StringKey }[] = [
  { id: 'account', labelKey: 'setSecAccount' },
  { id: 'aiModel', labelKey: 'setSecAiModel' },
  { id: 'aiMedia', labelKey: 'setSecAiMedia' },
  { id: 'general', labelKey: 'setSecGeneral' },
  { id: 'integrations', labelKey: 'setSecIntegrations' },
  { id: 'system', labelKey: 'setSecSystem' },
  { id: 'proxy', labelKey: 'setSecProxy' },
  { id: 'about', labelKey: 'setSecAbout' },
]

function SectionIcon({ id }: { id: SectionId }) {
  if (id === 'aiModel') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M8 1.8 9.5 6l4.2 1.5L9.5 9 8 13.2 6.5 9 2.3 7.5 6.5 6 8 1.8Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M12.8 11.2v3M11.3 12.7h3"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (id === 'aiMedia') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M2.5 11.5 6 8l2.5 2.5L10.5 9l3 2.8"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="10.5" cy="6" r="1.1" fill="currentColor" />
      </svg>
    )
  }
  if (id === 'account') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5.2" r="2.9" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M2.7 13.6a5.5 5.5 0 0 1 10.6 0"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (id === 'integrations') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M5.5 2v3M10.5 2v3M4 5h8v2.5a4 4 0 0 1-8 0V5ZM8 11.5V14"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (id === 'general') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2 5h8M13 5h1M2 11h1M6 11h8"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="11.5" cy="5" r="1.7" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="4.5" cy="11" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    )
  }
  if (id === 'system') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect
          x="2"
          y="2.5"
          width="12"
          height="8.5"
          rx="1.4"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <path d="M5.5 14h5M8 11v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'proxy') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2.2 8h11.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path
          d="M8 1.7c2.4 2.2 2.4 10.4 0 12.6M8 1.7C5.6 3.9 5.6 12.1 8 14.3"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.4v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5.1" r="0.8" fill="currentColor" />
    </svg>
  )
}

/** label-over-value field row with an optional right-aligned action */
function Field({
  label,
  value,
  valueTitle,
  action,
}: {
  label: string
  value: string
  valueTitle?: string
  action?: ReactNode
}) {
  return (
    <div className="set-field">
      <div className="set-field-text">
        <div className="set-field-label">{label}</div>
        <div className="set-field-value" data-tip={valueTitle}>
          {value}
        </div>
      </div>
      {action}
    </div>
  )
}

function dash(value: string | number | undefined | null): string {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? String(value) : '—'
  return value && value.trim() ? value : '—'
}

function systemInfoRows(
  info: SystemInfo,
  t: TFunc,
  dateLocale: string,
): { key: string; label: string; value: string }[] {
  const rows: { key: string; label: string; value: string }[] = [
    {
      key: 'computerName',
      label: t('setSysComputerName'),
      value: dash(info.computerName || info.hostname),
    },
  ]
  if (info.hostname && info.hostname !== info.computerName) {
    rows.push({ key: 'hostname', label: t('setSysHostname'), value: info.hostname })
  }
  const cpu =
    info.cpuModel && info.cpuCores > 0
      ? `${info.cpuModel} · ${t('setSysCores', { n: info.cpuCores })}`
      : info.cpuModel || (info.cpuCores > 0 ? t('setSysCores', { n: info.cpuCores }) : '')
  rows.push(
    { key: 'os', label: t('setSysOs'), value: formatOsDisplay(info) },
    { key: 'arch', label: t('setSysArch'), value: dash(info.arch) },
    { key: 'user', label: t('setSysUser'), value: dash(info.username) },
    { key: 'home', label: t('setSysHome'), value: dash(info.homedir) },
    { key: 'app', label: t('setSysAppVersion'), value: dash(info.appVersion) },
    { key: 'electron', label: t('setSysElectron'), value: dash(info.electronVersion) },
    { key: 'chrome', label: t('setSysChrome'), value: dash(info.chromeVersion) },
    { key: 'locale', label: t('setSysLocale'), value: dash(info.locale) },
    { key: 'cpu', label: t('setSysCpu'), value: dash(cpu) },
    {
      key: 'memory',
      label: t('setSysMemory'),
      value: formatMemory(info.totalMemoryBytes, dateLocale),
    },
  )
  return rows
}

function SystemInfoPane({ t, dateLocale }: { t: TFunc; dateLocale: string }) {
  const [info, setInfo] = useState<SystemInfo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    void window.aiOffice.getSystemInfo?.().then((next) => {
      if (alive && next) setInfo(next)
    })
    return () => {
      alive = false
    }
  }, [])

  const rows = info
    ? systemInfoRows(info, t, dateLocale)
    : [
        { key: 'computerName', label: t('setSysComputerName'), value: '—' },
        { key: 'os', label: t('setSysOs'), value: '—' },
        { key: 'user', label: t('setSysUser'), value: '—' },
      ]

  const copyAll = () => {
    const text = rows.map((row) => `${row.label}: ${row.value}`).join('\n')
    void navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1600)
      },
      () => {},
    )
  }

  return (
    <>
      <h3 className="set-pane-title">{t('setSecSystem')}</h3>
      {rows.map((row) => (
        <Field key={row.key} label={row.label} value={row.value} valueTitle={row.value} />
      ))}
      <div className="set-pane-footer">
        <button className="set-btn" disabled={!info} onClick={copyAll}>
          {copied ? t('setMcpCopied') : t('setSysCopyAll')}
        </button>
      </div>
    </>
  )
}

function ProxyPane({ t }: { t: TFunc }) {
  const [draft, setDraft] = useState<{
    enabled: boolean
    username: string
    password: string
    host: string
    port: number
  } | null>(null)
  const [encryption, setEncryption] = useState<ProxySettings['passwordEncryption']>('none')
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    let alive = true
    void window.aiOffice.getProxySettings?.().then((s) => {
      if (!alive || !s) return
      setDraft({
        enabled: s.enabled,
        username: s.username,
        password: s.password,
        host: s.host,
        port: s.port,
      })
      setEncryption(s.passwordEncryption)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!draft) return null

  const generatedUrl = buildProxyUrl(draft)
  const maskedUrl = generatedUrl ? maskProxyUrl(generatedUrl) : ''

  const touch = () => {
    setDirty(true)
    setSaved(false)
    setTestResult(null)
  }
  const patch = (next: Partial<typeof draft>) => {
    setDraft({ ...draft, ...next })
    touch()
  }

  const save = () => {
    window.aiOffice
      .setProxySettings?.(draft)
      .then((next) => {
        setDraft({
          enabled: next.enabled,
          username: next.username,
          password: next.password,
          host: next.host,
          port: next.port,
        })
        setEncryption(next.passwordEncryption)
        setDirty(false)
        setSaved(true)
        setTestResult(null)
      })
      .catch((error) => {
        window.alert(error instanceof Error ? error.message : String(error))
      })
  }

  const test = () => {
    if (!draft.username.trim() || !draft.password) {
      setTestResult({ ok: false, error: t('setProxyTestNeedCreds') })
      return
    }
    setTesting(true)
    setTestResult(null)
    window.aiOffice
      .testProxySettings?.(draft)
      .then((r) => setTestResult(r ?? { ok: false }))
      .catch((error) =>
        setTestResult({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      )
      .finally(() => setTesting(false))
  }

  return (
    <>
      <h3 className="set-pane-title">{t('setSecProxy')}</h3>
      <div className="set-field-desc set-ai-note">{t('setProxyDesc')}</div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <div className="set-field-label">{t('setProxyEnabled')}</div>
            <div className="set-field-desc">{t('setProxyEnabledDesc')}</div>
          </div>
        </div>
        <button
          className="set-switch"
          role="switch"
          aria-checked={draft.enabled}
          aria-label={t('setProxyEnabled')}
          onClick={() => patch({ enabled: !draft.enabled })}
        />
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <label className="set-field-label" htmlFor="set-proxy-user">
              {t('setProxyUsername')}
            </label>
            <div className="set-field-desc">{t('setProxyUsernameHint')}</div>
          </div>
        </div>
        <input
          id="set-proxy-user"
          className="set-input"
          type="text"
          value={draft.username}
          spellCheck={false}
          autoComplete="username"
          onChange={(e) => patch({ username: e.target.value })}
        />
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <label className="set-field-label" htmlFor="set-proxy-pass">
              {t('setProxyPassword')}
            </label>
            <div className="set-field-desc">{t('setProxyPasswordHint')}</div>
          </div>
        </div>
        <input
          id="set-proxy-pass"
          className="set-input"
          type="password"
          value={draft.password}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => patch({ password: e.target.value })}
        />
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <label className="set-field-label" htmlFor="set-proxy-host">
            {t('setProxyHost')}
          </label>
        </div>
        <input
          id="set-proxy-host"
          className="set-input"
          type="text"
          value={draft.host}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => patch({ host: e.target.value })}
        />
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <label className="set-field-label" htmlFor="set-proxy-port">
            {t('setProxyPort')}
          </label>
        </div>
        <input
          id="set-proxy-port"
          className="set-input"
          type="number"
          min={1}
          max={65535}
          step={1}
          value={draft.port}
          onChange={(e) => patch({ port: Number.parseInt(e.target.value, 10) || 0 })}
        />
      </div>
      <Field
        label={t('setProxyUrl')}
        value={maskedUrl || t('setProxyUrlEmpty')}
        valueTitle={maskedUrl || undefined}
      />
      {encryption === 'plaintext' && (
        <div className="set-field-desc set-ai-note">{t('setProxyPlaintextWarn')}</div>
      )}
      <div className="set-pane-footer">
        <AiStatusPill
          status={
            testing
              ? { kind: 'testing', text: t('setAiTesting') }
              : testResult
                ? testResult.ok
                  ? { kind: 'ok', text: t('setProxyTestOk') }
                  : { kind: 'err', text: testResult.error || t('setProxyTestFail') }
                : saved
                  ? { kind: 'ok', text: t('setAiSaved') }
                  : null
          }
        />
        <button className="set-btn" disabled={testing} onClick={test}>
          {t('setAiTest')}
        </button>
        <button className="set-btn primary" disabled={!dirty} onClick={save}>
          {t('setAiSave')}
        </button>
      </div>
    </>
  )
}

/** Enterprise lock: static provider name — no Dropdown, no caret, not selectable. */
function LockedProviderField({
  id,
  label,
  providerId,
  providerLabel,
}: {
  id: string
  label: string
  providerId: string
  providerLabel: string
}) {
  return (
    <div className="set-field">
      <div className="set-field-text">
        <label className="set-field-label" htmlFor={id}>
          {label}
        </label>
      </div>
      <div
        id={id}
        className="set-input set-provider-static"
        role="text"
        aria-readonly="true"
        aria-label={label}
      >
        <ProviderLogo id={providerId} />
        <span>{providerLabel}</span>
      </div>
    </div>
  )
}

/** AI model pane: provider / model / key / base URL, saved to userData/ai-settings.json */
function AiModelPane({ t }: { t: TFunc }) {
  const [catalog, setCatalog] = useState<AiCatalogEntry[]>(
    () => window.aiOffice.getAiProviders?.() ?? [],
  )
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  /** free-typed value of the output-cap field; committed (and clamped) on blur */
  const [maxTokensDraft, setMaxTokensDraft] = useState<string | null>(null)

  const refreshCodexModels = useCallback(async (cliPath = '', selectedModel = '') => {
    if (!window.aiOffice.getCodexModels) return
    const live = await window.aiOffice.getCodexModels(cliPath)
    setCatalog((current) =>
      current.map((entry) => {
        if (entry.id !== 'codex') return entry
        const models =
          selectedModel && !live.models.includes(selectedModel)
            ? [selectedModel, ...live.models]
            : live.models
        return { ...entry, models, defaultModel: live.defaultModel }
      }),
    )
  }, [])

  useEffect(() => {
    let alive = true
    void window.aiOffice.getAiSettings?.().then((s) => {
      if (!alive || !s) return
      setSettings({
        ...s,
        provider: ENTERPRISE_LOCKED_PROVIDER,
        gskToolsEnabled: false,
      })
      const codex = s.providers.codex
      if (codex) {
        void refreshCodexModels(codex.cliPath ?? '', codex.model).catch(() => undefined)
      }
    })
    return () => {
      alive = false
    }
  }, [refreshCodexModels])

  if (!settings) return null
  const provider = ENTERPRISE_LOCKED_PROVIDER
  const meta = catalog.find((c) => c.id === provider) ?? catalog[0]
  const config = settings.providers[provider] ?? {
    apiKey: '',
    model: meta?.defaultModel ?? '',
    baseUrl: undefined,
    cliPath: undefined,
  }
  const isGenspark = provider === 'genspark'
  const isCodex = provider === 'codex'
  const keyReadOnly = ENTERPRISE_AI_UI_POLICY.readOnlyKey
  const baseUrlReadOnly = ENTERPRISE_AI_UI_POLICY.readOnlyBaseUrl

  const touch = () => {
    setDirty(true)
    setSaved(false)
    setTestResult(null)
  }
  const updateConfig = (patch: Partial<typeof config>) => {
    setSettings({
      ...settings,
      providers: { ...settings.providers, [provider]: { ...config, ...patch } },
    })
    touch()
  }
  /** Commit the output-cap input: clamp what was typed and drop a no-op edit */
  const commitMaxTokens = () => {
    if (maxTokensDraft === null) return
    setMaxTokensDraft(null)
    const next = clampMaxOutputTokens(Number.parseInt(maxTokensDraft, 10))
    if (next === (settings.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS)) return
    setSettings({ ...settings, maxOutputTokens: next })
    touch()
  }
  const save = () => {
    window.aiOffice
      .setAiSettings?.(settings)
      .then(() => {
        setDirty(false)
        setSaved(true)
      })
      .catch((error) => {
        window.alert(error instanceof Error ? error.message : String(error))
      })
  }
  const test = () => {
    setTesting(true)
    setTestResult(null)
    window.aiOffice
      .testAiSettings?.(settings)
      .then((r) => {
        setTestResult(r ?? { ok: false })
        if (r?.ok && isCodex) {
          void refreshCodexModels(config.cliPath ?? '', config.model).catch(() => undefined)
        }
      })
      .catch((error) =>
        setTestResult({ ok: false, error: error instanceof Error ? error.message : String(error) }),
      )
      .finally(() => setTesting(false))
  }

  return (
    <>
      <h3 className="set-pane-title">{t('setSecAiModel')}</h3>
      <LockedProviderField
        id="set-ai-provider"
        label={t('setAiProvider')}
        providerId={ENTERPRISE_LOCKED_PROVIDER}
        providerLabel={meta?.label ?? 'Custom'}
      />
      <div className="set-field-desc set-ai-note">
        {isGenspark ? t('setAiGensparkHint') : isCodex ? t('setAiCodexHint') : t('setAiByokNote')}
      </div>
      <div className="set-field">
        <div className="set-field-text">
          <label className="set-field-label">{t('setAiModelId')}</label>
        </div>
        {meta && meta.models.length > 0 ? (
          <Dropdown
            className="set-dd"
            value={config.model || meta.defaultModel}
            ariaLabel={t('setAiModelId')}
            options={meta.models.map((m) => ({ value: m, label: m }))}
            onPick={(m) => updateConfig({ model: m })}
          />
        ) : (
          <input
            id="set-ai-model"
            className="set-input"
            type="text"
            value={config.model}
            placeholder="model-id"
            spellCheck={false}
            onChange={(e) => updateConfig({ model: e.target.value })}
          />
        )}
      </div>
      {isCodex ? (
        <div className="set-field">
          <div className="set-field-text">
            <div className="set-field-stack">
              <label className="set-field-label" htmlFor="set-ai-cli-path">
                {t('setAiCodexPath')}
              </label>
              <div className="set-field-desc">{t('setAiCodexPathHint')}</div>
            </div>
          </div>
          <input
            id="set-ai-cli-path"
            className="set-input"
            type="text"
            value={config.cliPath ?? ''}
            placeholder={t('setAiCodexAutoPlaceholder')}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => updateConfig({ cliPath: e.target.value.trim() })}
            onBlur={(e) => {
              const cliPath = e.target.value.trim()
              void refreshCodexModels(cliPath, config.model).catch(() => undefined)
            }}
          />
        </div>
      ) : !isGenspark ? (
        <>
          <div className="set-field">
            <div className="set-field-text">
              <div className="set-field-stack">
                <label className="set-field-label" htmlFor="set-ai-key">
                  {t('setAiApiKey')}
                </label>
                <div className="set-field-desc">{t('setAiKeyHint')}</div>
              </div>
            </div>
            <input
              id="set-ai-key"
              className="set-input"
              type="text"
              readOnly={keyReadOnly}
              aria-readonly={keyReadOnly || undefined}
              value={keyReadOnly ? maskApiKey(config.apiKey) : config.apiKey}
              placeholder={meta?.keyPlaceholder ?? 'API Key'}
              spellCheck={false}
              autoComplete="off"
              onChange={
                keyReadOnly ? undefined : (e) => updateConfig({ apiKey: e.target.value.trim() })
              }
            />
          </div>
          <div className="set-field">
            <div className="set-field-text">
              <div className="set-field-stack">
                <label className="set-field-label" htmlFor="set-ai-base-url">
                  {t('setAiBaseUrl')}
                </label>
                {!meta?.needsBaseUrl && (
                  <div className="set-field-desc">{t('setAiBaseUrlHint')}</div>
                )}
              </div>
            </div>
            <input
              id="set-ai-base-url"
              className="set-input"
              type="text"
              readOnly={baseUrlReadOnly}
              aria-readonly={baseUrlReadOnly || undefined}
              value={config.baseUrl ?? ''}
              placeholder={meta?.needsBaseUrl ? 'https://…/v1' : meta?.defaultBaseUrl}
              spellCheck={false}
              onChange={
                baseUrlReadOnly
                  ? undefined
                  : (e) => updateConfig({ baseUrl: e.target.value.trim() })
              }
            />
          </div>
        </>
      ) : null}
      <div className="set-field">
        <div className="set-field-text">
          <div className="set-field-stack">
            <label className="set-field-label" htmlFor="set-ai-max-tokens">
              {t('setAiMaxTokens')}
            </label>
            <div className="set-field-desc">{t('setAiMaxTokensDesc')}</div>
          </div>
        </div>
        <input
          id="set-ai-max-tokens"
          className="set-input"
          type="number"
          min={MIN_MAX_OUTPUT_TOKENS}
          max={MAX_MAX_OUTPUT_TOKENS}
          step={1024}
          value={maxTokensDraft ?? String(settings.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS)}
          onChange={(e) => setMaxTokensDraft(e.target.value)}
          onBlur={commitMaxTokens}
        />
      </div>
      <div className="set-pane-footer">
        <AiStatusPill
          status={
            testing
              ? { kind: 'testing', text: t('setAiTesting') }
              : testResult
                ? testResult.ok
                  ? { kind: 'ok', text: t('setAiTestOk') }
                  : { kind: 'err', text: testResult.error || t('setAiTestFail') }
                : saved
                  ? { kind: 'ok', text: t('setAiSaved') }
                  : null
          }
        />
        <button className="set-btn" disabled={testing} onClick={test}>
          {t('setAiTest')}
        </button>
        <button className="set-btn primary" disabled={!dirty} onClick={save}>
          {t('setAiSave')}
        </button>
      </div>
    </>
  )
}

type Capability = 'image' | 'analysis' | 'video' | 'search'

/**
 * AI media & search pane, one block per capability — web search, image
 * generation, image analysis, video analysis — each with the same
 * provider / model / key / base URL rows as the AI Model pane. A vendor's key
 * and base URL are stored once and shared by every block that picks it.
 * Saved into the same ai-settings.json as the chat provider.
 */
function AiMediaPane({ t }: { t: TFunc }) {
  const [mediaCatalog] = useState<AiMediaProviderMeta[]>(
    () => window.aiOffice.getAiMediaProviders?.() ?? [],
  )
  const [searchCatalog] = useState<AiSearchProviderMeta[]>(
    () => window.aiOffice.getAiSearchProviders?.() ?? [],
  )
  const [settings, setSettings] = useState<AiSettings | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  useEffect(() => {
    let alive = true
    void window.aiOffice.getAiSettings?.().then((s) => {
      if (!alive || !s) return
      setSettings({
        ...s,
        search: s.search ? { ...s.search, provider: ENTERPRISE_LOCKED_SEARCH_PROVIDER } : s.search,
        media: s.media
          ? {
              ...s.media,
              imageProvider: ENTERPRISE_LOCKED_MEDIA_PROVIDER,
              analysisProvider: ENTERPRISE_LOCKED_MEDIA_PROVIDER,
              videoAnalysisProvider: ENTERPRISE_LOCKED_MEDIA_PROVIDER,
            }
          : s.media,
      })
    })
    return () => {
      alive = false
    }
  }, [])

  if (!settings?.media || !settings.search) return null
  const media: AiMediaSettings = settings.media
  const search: AiSearchSettings = settings.search

  const touch = () => {
    setDirty(true)
    setSaved(false)
    setTestResult(null)
  }
  const setMedia = (next: AiMediaSettings) => {
    setSettings({ ...settings, media: next })
    touch()
  }
  const setSearch = (next: AiSearchSettings) => {
    setSettings({ ...settings, search: next })
    touch()
  }
  const mediaConfigOf = (id: AiMediaProviderId) => {
    const meta = mediaCatalog.find((m) => m.id === id)
    return (
      media.providers[id] ?? {
        apiKey: '',
        imageModel: meta?.defaultImageModel ?? '',
        analysisModel: meta?.defaultAnalysisModel ?? '',
        videoModel: '',
      }
    )
  }
  const updateMediaConfig = (
    id: AiMediaProviderId,
    patch: Partial<AiMediaSettings['providers'][AiMediaProviderId]>,
  ) =>
    setMedia({
      ...media,
      providers: { ...media.providers, [id]: { ...mediaConfigOf(id), ...patch } },
    })

  const save = () => {
    window.aiOffice
      .setAiSettings?.(settings)
      .then(() => {
        setDirty(false)
        setSaved(true)
      })
      .catch((error) => {
        window.alert(error instanceof Error ? error.message : String(error))
      })
  }
  // every distinct BYOK vendor the four blocks point at is checked once; first failure wins
  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const vendors = new Set<AiMediaProviderId>(
        [media.imageProvider, media.analysisProvider, media.videoAnalysisProvider].filter(
          (id) => id !== 'genspark',
        ),
      )
      const checks: Promise<{ ok: boolean; error?: string } | undefined>[] = [...vendors].map(
        (id) =>
          window.aiOffice.testAiMediaSettings?.({ provider: id, config: mediaConfigOf(id) }) ??
          Promise.resolve(undefined),
      )
      if (search.provider !== 'genspark') {
        checks.push(
          window.aiOffice.testAiSearchSettings?.({
            provider: search.provider,
            apiKey: search.providers[search.provider]?.apiKey ?? '',
          }) ?? Promise.resolve(undefined),
        )
      }
      if (checks.length === 0) {
        checks.push(
          window.aiOffice.testAiMediaSettings?.({
            provider: 'genspark',
            config: mediaConfigOf('genspark'),
          }) ?? Promise.resolve(undefined),
        )
      }
      const results = await Promise.all(checks)
      setTestResult(results.find((r) => r && !r.ok) ?? { ok: true })
    } catch (error) {
      setTestResult({ ok: false, error: error instanceof Error ? error.message : String(error) })
    } finally {
      setTesting(false)
    }
  }

  const keyReadOnly = ENTERPRISE_AI_UI_POLICY.readOnlyKey
  const baseUrlReadOnly = ENTERPRISE_AI_UI_POLICY.readOnlyBaseUrl

  const providerRow = (htmlId: string, providerId: string, providerLabel: string) => (
    <LockedProviderField
      id={htmlId}
      label={t('setAiProvider')}
      providerId={providerId}
      providerLabel={providerLabel}
    />
  )

  const modelRow = (
    id: string,
    models: string[],
    fallback: string,
    value: string,
    onChange: (v: string) => void,
    readOnly = false,
  ) => (
    <div className="set-field">
      <div className="set-field-text">
        <label className="set-field-label" htmlFor={id}>
          {t('setAiModelId')}
        </label>
      </div>
      {models.length > 0 ? (
        <Dropdown
          className="set-dd"
          value={value || fallback}
          ariaLabel={t('setAiModelId')}
          options={models.map((m) => ({ value: m, label: m }))}
          onPick={readOnly ? () => undefined : onChange}
        />
      ) : (
        <input
          id={id}
          className="set-input"
          type="text"
          readOnly={readOnly}
          aria-readonly={readOnly || undefined}
          value={value}
          placeholder="model-id"
          spellCheck={false}
          onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
        />
      )}
    </div>
  )

  const keyRow = (
    id: string,
    value: string,
    placeholder: string,
    onChange: (v: string) => void,
  ) => (
    <div className="set-field">
      <div className="set-field-text">
        <div className="set-field-stack">
          <label className="set-field-label" htmlFor={id}>
            {t('setAiApiKey')}
          </label>
          <div className="set-field-desc">{t('setAiKeyHint')}</div>
        </div>
      </div>
      <input
        id={id}
        className="set-input"
        type="text"
        readOnly={keyReadOnly}
        aria-readonly={keyReadOnly || undefined}
        value={keyReadOnly ? maskApiKey(value) : value}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        onChange={keyReadOnly ? undefined : (e) => onChange(e.target.value.trim())}
      />
    </div>
  )

  const baseUrlRow = (
    id: string,
    meta: AiMediaProviderMeta,
    value: string,
    onChange: (v: string) => void,
  ) => (
    <div className="set-field">
      <div className="set-field-text">
        <div className="set-field-stack">
          <label className="set-field-label" htmlFor={id}>
            {t('setAiBaseUrl')}
          </label>
          {!meta.needsBaseUrl && <div className="set-field-desc">{t('setAiBaseUrlHint')}</div>}
        </div>
      </div>
      <input
        id={id}
        className="set-input"
        type="text"
        readOnly={baseUrlReadOnly}
        aria-readonly={baseUrlReadOnly || undefined}
        value={value}
        placeholder={meta.needsBaseUrl ? 'https://…/v1' : meta.defaultBaseUrl}
        spellCheck={false}
        onChange={baseUrlReadOnly ? undefined : (e) => onChange(e.target.value.trim())}
      />
    </div>
  )

  /** one media block: provider → model → key → base URL (key/base URL shared per vendor) */
  const mediaBlock = (cap: Exclude<Capability, 'search'>) => {
    const title =
      cap === 'image'
        ? t('setAiCapImage')
        : cap === 'analysis'
          ? t('setAiCapAnalysis')
          : t('setAiCapVideo')
    const options = mediaCatalog.filter((m) =>
      cap === 'image'
        ? !!m.imageProtocol
        : cap === 'video'
          ? !!m.analysisProtocol && m.videoAnalysis
          : !!m.analysisProtocol,
    )
    // Enterprise lock is always Custom (`videoAnalysis: false`) and the catalog
    // is filtered to that one vendor, so skip the empty video-analysis block.
    if (cap === 'video' && options.length === 0) return null
    const id = ENTERPRISE_LOCKED_MEDIA_PROVIDER
    const meta =
      mediaCatalog.find((m) => m.id === id) ?? options.find((m) => m.id === id) ?? options[0]!
    const config = mediaConfigOf(id)
    const modelReadOnly = keyReadOnly || baseUrlReadOnly
    const modelField =
      cap === 'image' ? 'imageModel' : cap === 'video' ? 'videoModel' : 'analysisModel'
    const modelValue =
      cap === 'image'
        ? config.imageModel
        : cap === 'video'
          ? config.videoModel || config.analysisModel
          : config.analysisModel
    return (
      <section key={cap}>
        <h4 className="set-pane-subtitle">{title}</h4>
        {providerRow(`set-ai-${cap}-provider`, id, meta.label)}
        <div className="set-field-desc set-ai-note">{meta.description}</div>
        {id !== 'genspark' && (
          <>
            {modelRow(
              `set-ai-${cap}-model`,
              cap === 'image' ? meta.imageModels : meta.analysisModels,
              cap === 'image' ? meta.defaultImageModel : meta.defaultAnalysisModel,
              modelValue,
              (m) => updateMediaConfig(id, { [modelField]: m }),
              modelReadOnly,
            )}
            {keyRow(`set-ai-${cap}-key`, config.apiKey, meta.keyPlaceholder, (v) =>
              updateMediaConfig(id, { apiKey: v }),
            )}
            {baseUrlRow(`set-ai-${cap}-base-url`, meta, config.baseUrl ?? '', (v) =>
              updateMediaConfig(id, { baseUrl: v }),
            )}
          </>
        )}
      </section>
    )
  }

  const searchMeta =
    searchCatalog.find((m) => m.id === ENTERPRISE_LOCKED_SEARCH_PROVIDER) ?? searchCatalog[0]
  const searchKey = search.providers.bocha?.apiKey ?? ''

  return (
    <>
      <h3 className="set-pane-title">{t('setSecAiMedia')}</h3>
      <div className="set-field-desc set-ai-note">{t('setAiSharedKeyHint')}</div>
      <section>
        <h4 className="set-pane-subtitle">{t('setAiCapSearch')}</h4>
        {providerRow(
          'set-ai-search-provider',
          ENTERPRISE_LOCKED_SEARCH_PROVIDER,
          searchMeta?.label ?? 'Bocha',
        )}
        <div className="set-field-desc set-ai-note">{t('setAiSearchBochaHint')}</div>
        {keyRow('set-ai-search-key', searchKey, searchMeta?.keyPlaceholder ?? 'API Key', (v) =>
          setSearch({
            ...search,
            provider: ENTERPRISE_LOCKED_SEARCH_PROVIDER,
            providers: { ...search.providers, bocha: { apiKey: v } },
          }),
        )}
      </section>
      {mediaBlock('image')}
      {mediaBlock('analysis')}
      {mediaBlock('video')}
      <div className="set-pane-footer">
        <AiStatusPill
          status={
            testing
              ? { kind: 'testing', text: t('setAiTesting') }
              : testResult
                ? testResult.ok
                  ? { kind: 'ok', text: t('setAiTestOk') }
                  : { kind: 'err', text: testResult.error || t('setAiTestFail') }
                : saved
                  ? { kind: 'ok', text: t('setAiSaved') }
                  : null
          }
        />
        <button className="set-btn" disabled={testing} onClick={() => void test()}>
          {t('setAiTest')}
        </button>
        <button className="set-btn primary" disabled={!dirty} onClick={save}>
          {t('setAiSave')}
        </button>
      </div>
    </>
  )
}

interface AiStatus {
  kind: 'testing' | 'ok' | 'err'
  text: string
}

/** colored feedback pill in the AI pane footer: spinner while testing, then success/error */
function AiStatusPill({ status }: { status: AiStatus | null }) {
  if (!status) return null
  return (
    <span
      className={`set-ai-status ${status.kind}`}
      role="status"
      // error text (HTTP body, network message) can be long — full text via native tooltip
      title={status.kind === 'err' ? status.text : undefined}
    >
      {status.kind === 'testing' ? (
        <span className="set-ai-spin" aria-hidden="true" />
      ) : status.kind === 'ok' ? (
        <svg
          className="set-ai-status-icon"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="6.3" fill="currentColor" opacity="0.16" />
          <path
            d="M4.2 7.3l1.9 1.9 3.7-4.3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      ) : (
        <svg
          className="set-ai-status-icon"
          width="14"
          height="14"
          viewBox="0 0 14 14"
          aria-hidden="true"
        >
          <circle cx="7" cy="7" r="6.3" fill="currentColor" opacity="0.16" />
          <path d="M7 3.8v3.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="7" cy="10.1" r="1" fill="currentColor" />
        </svg>
      )}
      <span className="set-ai-status-text">{status.text}</span>
    </span>
  )
}

export interface SettingsModalProps {
  status: AccountStatus | null
  loggingOut: boolean
  /** browser sign-in in progress (spinner shows on the account entry) */
  loginWaiting: boolean
  /** device auth URL while waiting — rescue actions when the browser did not auto-open */
  loginUrl: string | null
  urlCopied: boolean
  onOpenLoginUrl: () => void
  onCopyLoginUrl: () => void
  onClose: () => void
  /** closes the modal and launches the Genspark login flow (progress shows on the account entry) */
  onLogin: () => void
  onLogout: () => void
  /** an installed skill is older than the bundled one: dot on the Integrations entry */
  skillUpdateDue?: boolean
  onSkillUpdateDue?: (due: boolean) => void
}

export function SettingsModal({
  status,
  loggingOut,
  loginWaiting,
  loginUrl,
  urlCopied,
  onOpenLoginUrl,
  onCopyLoginUrl,
  onClose,
  onLogin,
  onLogout,
  skillUpdateDue: updateDue = false,
  onSkillUpdateDue,
}: SettingsModalProps) {
  const { lang, setLang, t, dateLocale } = useI18n()
  const [section, setSection] = useState<SectionId>('account')
  const [theme, setTheme] = useState<UiTheme>('system')
  const [saveDir, setSaveDir] = useState('')
  const [analyticsOn, setAnalyticsOn] = useState(true)
  const [analyticsSaving, setAnalyticsSaving] = useState(false)
  const [autoSaveOn, setAutoSaveOn] = useState(false)
  const [aiPrefs, setAiPrefs] = useState<AiPanelPrefs>(DEFAULT_AI_PANEL_PREFS)
  const [channel, setChannel] = useState<'stable' | 'beta'>('stable')
  const [appVersion, setAppVersion] = useState('')
  const [githubStars, setGithubStars] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void window.aiOffice.getTheme?.().then((th) => {
      if (alive) setTheme(th)
    })
    void window.aiOffice.getDefaultSaveDir?.().then((dir) => {
      if (alive && dir) setSaveDir(dir)
    })
    void window.aiOffice.getAnalyticsEnabled?.().then((on) => {
      if (alive) setAnalyticsOn(on !== false)
    })
    void window.aiOffice.getAutoSaveDefault?.().then((v) => {
      if (alive) setAutoSaveOn(v.on)
    })
    void window.aiOffice.getAiPanelPrefs?.().then((prefs) => {
      if (alive) setAiPrefs(prefs)
    })
    void window.aiOffice.getUpdateChannel?.().then((ch) => {
      if (alive) setChannel(ch)
    })
    void window.aiOffice.getAppVersion?.().then((v) => {
      if (alive && v) setAppVersion(v)
    })
    void window.aiOffice.githubStars?.().then((n) => {
      if (alive && n !== null) setGithubStars(n)
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const applyTheme = (next: UiTheme) => {
    setTheme(next)
    void window.aiOffice.setTheme(next)
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
  }

  const updateAiPrefs = (patch: Partial<AiPanelPrefs>) => {
    setAiPrefs((prev) => ({ ...prev, ...patch }))
    void window.aiOffice.setAiPanelPrefs(patch).then(setAiPrefs)
  }

  const changeSaveDir = () => {
    void window.aiOffice.pickDefaultSaveDir?.().then((dir) => {
      if (dir) setSaveDir(dir)
    })
  }

  const loggedIn = status?.loggedIn ?? false
  const email = status?.email ?? ''

  return (
    <div
      className="set-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="set-dialog" role="dialog" aria-modal="true" aria-label={t('settings')}>
        <div className="set-header">
          <h2 className="set-title">{t('settings')}</h2>
          <button className="set-close" onClick={onClose} aria-label={t('cancel')}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="set-body">
          <nav className="set-nav" aria-label={t('settings')}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`set-nav-item${section === s.id ? ' active' : ''}`}
                aria-current={section === s.id}
                onClick={() => setSection(s.id)}
              >
                <SectionIcon id={s.id} />
                {t(s.labelKey)}
                {s.id === 'integrations' && updateDue && (
                  <span className="set-nav-dot" role="img" aria-label={t('intgUpdateDue')} />
                )}
              </button>
            ))}
          </nav>
          <div className="set-pane">
            {section === 'account' && (
              <>
                <h3 className="set-pane-title">{t('setSecAccount')}</h3>
                <Field label={t('setEmail')} value={loggedIn ? email : t('setNotLoggedIn')} />
                {loggedIn && (
                  <Field
                    label={t('credits')}
                    value={
                      status?.creditBalance === undefined
                        ? '—'
                        : Math.floor(status.creditBalance).toLocaleString('en-US')
                    }
                    action={
                      <button
                        className="set-btn"
                        data-tip={t('creditsTip')}
                        onClick={() => void window.aiOffice.openCreditUsage?.()}
                      >
                        {t('setViewUsage')}
                      </button>
                    }
                  />
                )}
                <div className="set-pane-footer">
                  {loggedIn ? (
                    <button className="set-btn danger" disabled={loggingOut} onClick={onLogout}>
                      {loggingOut ? t('loggingOut') : t('logout')}
                    </button>
                  ) : (
                    <>
                      {loginWaiting && loginUrl && (
                        <>
                          <button className="set-btn" onClick={onOpenLoginUrl}>
                            {t('loginOpenManually')}
                          </button>
                          <button className="set-btn" onClick={onCopyLoginUrl}>
                            {urlCopied ? t('loginCopied') : t('loginCopyUrl')}
                          </button>
                        </>
                      )}
                      <button className="set-btn primary" onClick={onLogin}>
                        {loginWaiting ? t('waitingShort') : t('loginGenspark')}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
            {section === 'aiModel' && <AiModelPane t={t} />}
            {section === 'aiMedia' && <AiMediaPane t={t} />}
            {section === 'general' && (
              <>
                <h3 className="set-pane-title">{t('setSecGeneral')}</h3>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label">{t('language')}</label>
                  </div>
                  <Dropdown
                    className="set-dd"
                    value={lang}
                    ariaLabel={t('language')}
                    options={LANG_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
                    onPick={(v) => setLang(v as typeof lang)}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label">{t('theme')}</label>
                  </div>
                  <Dropdown
                    className="set-dd"
                    value={theme}
                    ariaLabel={t('theme')}
                    options={THEME_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                    }))}
                    onPick={(v) => applyTheme(v as UiTheme)}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label">{t('setAiPanelSide')}</label>
                  </div>
                  <Dropdown
                    className="set-dd"
                    value={aiPrefs.side}
                    ariaLabel={t('setAiPanelSide')}
                    options={[
                      { value: 'left', label: t('aiPanelSideLeft') },
                      { value: 'right', label: t('aiPanelSideRight') },
                    ]}
                    onPick={(side) => updateAiPrefs({ side: side as AiPanelSide })}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label">{t('setAiFontSize')}</label>
                  </div>
                  {aiPrefs.fontSize === 'custom' && (
                    <CustomFontSizeInput
                      value={aiPrefs.customFontSize}
                      label={t('aiFontSizeCustom')}
                      onCommit={(px) => updateAiPrefs({ customFontSize: px })}
                    />
                  )}
                  <Dropdown
                    className="set-dd"
                    value={aiPrefs.fontSize}
                    ariaLabel={t('setAiFontSize')}
                    options={AI_FONT_SIZE_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                    }))}
                    onPick={(v) => {
                      const fontSize = v as AiFontSize
                      // start the custom size from the preset being left so nothing jumps
                      updateAiPrefs(
                        fontSize === 'custom' && aiPrefs.fontSize !== 'custom'
                          ? { fontSize, customFontSize: aiPanelFontPx(aiPrefs) }
                          : { fontSize },
                      )
                    }}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <div className="set-field-stack">
                      <div className="set-field-label">{t('setAiSpellcheck')}</div>
                      <div className="set-field-desc">{t('setAiSpellcheckDesc')}</div>
                    </div>
                  </div>
                  <button
                    className="set-switch"
                    role="switch"
                    aria-checked={aiPrefs.spellcheck}
                    aria-label={t('setAiSpellcheck')}
                    onClick={() => updateAiPrefs({ spellcheck: !aiPrefs.spellcheck })}
                  />
                </div>
                <Field
                  label={t('saveLocation')}
                  value={saveDir || '—'}
                  valueTitle={saveDir}
                  action={
                    <button className="set-btn" onClick={changeSaveDir}>
                      {t('setChange')}
                    </button>
                  }
                />
                <div className="set-field">
                  <div className="set-field-text">
                    <div className="set-field-stack">
                      <div className="set-field-label">{t('setAutoSave')}</div>
                      <div className="set-field-desc">{t('setAutoSaveDesc')}</div>
                    </div>
                  </div>
                  <button
                    className="set-switch"
                    role="switch"
                    aria-checked={autoSaveOn}
                    aria-label={t('setAutoSave')}
                    onClick={() => {
                      const next = !autoSaveOn
                      setAutoSaveOn(next)
                      void window.aiOffice.setAutoSaveDefault?.(next).catch(() => {})
                    }}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <div className="set-field-stack">
                      <div className="set-field-label">{t('setAnalytics')}</div>
                      <div className="set-field-desc">{t('setAnalyticsDesc')}</div>
                    </div>
                  </div>
                  <button
                    className="set-switch"
                    role="switch"
                    aria-checked={analyticsOn}
                    aria-label={t('setAnalytics')}
                    disabled={analyticsSaving}
                    onClick={() => {
                      const next = !analyticsOn
                      setAnalyticsSaving(true)
                      void window.aiOffice
                        .setAnalyticsEnabled(next)
                        .then((persisted) => {
                          if (persisted) setAnalyticsOn(next)
                        })
                        .catch(() => {})
                        .finally(() => setAnalyticsSaving(false))
                    }}
                  />
                </div>
              </>
            )}
            {section === 'integrations' && (
              <IntegrationsPane t={t} onStatus={(st) => onSkillUpdateDue?.(skillUpdateDue(st))} />
            )}
            {section === 'system' && <SystemInfoPane t={t} dateLocale={dateLocale} />}
            {section === 'proxy' && <ProxyPane t={t} />}
            {section === 'about' && (
              <>
                <h3 className="set-pane-title">{t('setSecAbout')}</h3>
                <Field label={t('versionLabel')} value={appVersion || '—'} />
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label">{t('updateChannel')}</label>
                  </div>
                  <Dropdown
                    className="set-dd"
                    value={channel}
                    ariaLabel={t('updateChannel')}
                    options={CHANNEL_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                    }))}
                    onPick={(v) => {
                      const next = v === 'beta' ? 'beta' : 'stable'
                      setChannel(next)
                      void window.aiOffice.setUpdateChannel(next)
                    }}
                  />
                </div>
                <Field
                  label={t('setGithub')}
                  value={
                    githubStars === null
                      ? 'github.com/genspark-ai/genoffice'
                      : `github.com/genspark-ai/genoffice · ★ ${formatStars(githubStars)}`
                  }
                  action={
                    <button
                      className="set-btn"
                      onClick={() => void window.aiOffice.openGitHubRepo?.()}
                    >
                      {t('starOnGitHub')}
                    </button>
                  }
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
