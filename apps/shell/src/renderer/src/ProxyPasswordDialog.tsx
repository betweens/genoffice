import { useEffect, useState } from 'react'
import { DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT } from '@genoffice/electron-utils/corporate-proxy'
import { useI18n } from './locale'
import './proxy-gate.css'

interface ProxyPasswordDialogProps {
  /** called after the password is persisted and applied via existing proxy IPC */
  onSaved: () => void
}

/**
 * Blocking first-launch gate: ask for the corporate proxy password when none
 * is stored yet. Username / host / port reuse Settings → 网络代理 defaults;
 * host and port are not shown in this dialog.
 */
export function ProxyPasswordDialog({ onSaved }: ProxyPasswordDialogProps) {
  const { t } = useI18n()
  const [username, setUsername] = useState('')
  const [host, setHost] = useState(DEFAULT_PROXY_HOST)
  const [port, setPort] = useState(DEFAULT_PROXY_PORT)
  const [password, setPassword] = useState('')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    const apply = (nextUser: string, nextHost: string, nextPort: number) => {
      if (!alive) return
      setUsername(nextUser)
      setHost(nextHost || DEFAULT_PROXY_HOST)
      setPort(nextPort || DEFAULT_PROXY_PORT)
      setReady(true)
    }
    void window.aiOffice
      .getProxySettings()
      .then((s) => apply(s.username, s.host, s.port))
      .catch(() => {
        void window.aiOffice
          .getSystemInfo()
          .then((info) => apply(info.username, DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT))
          .catch(() => apply('', DEFAULT_PROXY_HOST, DEFAULT_PROXY_PORT))
      })
    return () => {
      alive = false
    }
  }, [])

  const submit = () => {
    if (saving) return
    if (!password) {
      setError(t('proxyGateNeedPassword'))
      return
    }
    setSaving(true)
    setError(null)
    void window.aiOffice
      .setProxySettings({
        enabled: true,
        username,
        password,
        host,
        port,
      })
      .then(() => {
        onSaved()
      })
      .catch(() => {
        // generic copy only — never surface the typed password in UI or logs
        setError(t('proxyGateSaveFailed'))
        setSaving(false)
      })
  }

  return (
    <div className="proxy-gate-overlay">
      <div
        className="proxy-gate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="proxy-gate-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="proxy-gate-title">{t('proxyGateTitle')}</h3>
        <p>{t('proxyGateBody')}</p>
        <label className="proxy-gate-field" htmlFor="proxy-gate-user">
          <span className="proxy-gate-label">{t('setProxyUsername')}</span>
          <input
            id="proxy-gate-user"
            className="proxy-gate-input"
            type="text"
            value={username}
            readOnly
            spellCheck={false}
            autoComplete="username"
          />
        </label>
        <label className="proxy-gate-field" htmlFor="proxy-gate-pass">
          <span className="proxy-gate-label">{t('setProxyPassword')}</span>
          <input
            id="proxy-gate-pass"
            className="proxy-gate-input"
            type="password"
            value={password}
            spellCheck={false}
            autoComplete="off"
            disabled={!ready || saving}
            autoFocus
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
          />
        </label>
        {error && (
          <p className="proxy-gate-error" role="alert">
            {error}
          </p>
        )}
        <div className="proxy-gate-actions">
          <button
            className="btn btn-primary"
            disabled={!ready || saving || !password}
            onClick={submit}
          >
            {t('proxyGateConfirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
