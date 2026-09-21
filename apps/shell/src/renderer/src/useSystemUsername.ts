import { useEffect, useState } from 'react'

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
