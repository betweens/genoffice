import { useEffect, useState } from 'react'
import { Home } from './Home'
import { ProxyPasswordDialog } from './ProxyPasswordDialog'
import { StarPromptCard } from './StarPromptCard'
import { TabBar } from './TabBar'
import { proxyPasswordMissing } from '@genoffice/electron-utils/corporate-proxy'
// enterprise: onboarding disabled
// import { Onboarding } from './Onboarding'

interface AppFrameProps {
  /** resolved before first paint (main.tsx) so home never flashes under the overlay */
  initialOnboardingSeen: boolean
}

export function AppFrame({ initialOnboardingSeen }: AppFrameProps) {
  const [homeActive, setHomeActive] = useState(true)
  // enterprise: onboarding disabled
  const [showOnboarding] = useState(false)
  void initialOnboardingSeen
  // const [showOnboarding, setShowOnboarding] = useState(!initialOnboardingSeen)
  const [starPromptDocOpens, setStarPromptDocOpens] = useState<number | null>(null)
  const [proxyGate, setProxyGate] = useState<'pending' | 'needed' | 'ready'>('pending')

  useEffect(() => {
    const applyTabs = (tabs: Awaited<ReturnType<typeof window.aiOfficeTabs.list>>) => {
      const active = tabs.find((tab) => tab.active)
      setHomeActive(!active || active.kind === 'home')
    }
    void window.aiOfficeTabs.list().then(applyTabs)
    return window.aiOfficeTabs.onChanged(applyTabs)
  }, [])

  useEffect(() => {
    let alive = true
    void window.aiOffice
      .getProxySettings()
      .then((settings) => {
        if (!alive) return
        setProxyGate(proxyPasswordMissing(settings.password) ? 'needed' : 'ready')
      })
      .catch(() => {
        if (alive) setProxyGate('needed')
      })
    return () => {
      alive = false
    }
  }, [])

  // The "star us" invitation is decided (and counted as shown) by the main
  // process; ask once per session, and never while onboarding is up — a
  // first-run user can't have met the value threshold anyway.
  useEffect(() => {
    if (showOnboarding || proxyGate === 'needed') return
    let alive = true
    void window.aiOffice.starPromptShouldShow?.().then((result) => {
      if (alive && result.show) setStarPromptDocOpens(result.docOpens)
    })
    return () => {
      alive = false
    }
  }, [showOnboarding, proxyGate])

  // enterprise: onboarding disabled
  // const finishOnboarding = async (): Promise<boolean> => {
  //   try {
  //     const persisted = await window.aiOffice.setOnboardingSeen()
  //     if (!persisted) return false
  //     setShowOnboarding(false)
  //     return true
  //   } catch {
  //     return false
  //   }
  // }

  return (
    <div className="app-frame">
      <TabBar />
      {/* docs/sheets tabs render as WebContentsView children of this window, positioned
       * by the main process to cover this area — only Home paints its own content here. */}
      <div className="app-frame-content" style={{ visibility: homeActive ? 'visible' : 'hidden' }}>
        <Home />
      </div>
      {/* editor WebContentsViews paint above ALL shell DOM, so the overlay only
       * renders while the home tab is active — it comes back when home does */}
      {/* enterprise: onboarding disabled
      {showOnboarding && homeActive && <Onboarding onDone={finishOnboarding} />}
      */}
      {proxyGate === 'needed' && <ProxyPasswordDialog onSaved={() => setProxyGate('ready')} />}
      {starPromptDocOpens !== null && !showOnboarding && proxyGate !== 'needed' && homeActive && (
        <StarPromptCard docOpens={starPromptDocOpens} onClose={() => setStarPromptDocOpens(null)} />
      )}
    </div>
  )
}
