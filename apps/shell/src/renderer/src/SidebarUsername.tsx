import { useEffect, useState } from 'react'
import { useI18n } from './locale'

/** OS username from Settings → 本机信息 (`getSystemInfo`). Empty until resolved. */
export function useSystemUsername(): string {
  const [username, setUsername] = useState('')

  useEffect(() => {
    let alive = true
    void window.aiOffice
      .getSystemInfo()
      .then((info) => {
        if (alive && info.username) setUsername(info.username)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  return username
}

/** OS username in the shell sidebar footer (same source as Settings → 本机信息). */
export function SidebarUsername() {
  const { t } = useI18n()
  const username = useSystemUsername()

  if (!username) return null

  return (
    <div className="sidebar-username" title={`${t('setSysUser')}: ${username}`}>
      <span className="sidebar-username-label">{t('setSysUser')}</span>
      <span className="sidebar-username-value">{username}</span>
    </div>
  )
}
