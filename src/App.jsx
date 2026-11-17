import { useEffect } from 'react'
import { applyTheme } from './theme'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { useStore, useRoute } from './store'
import { MenuHost, Toast, useMobile } from './ui'
import { onKey } from './commands'
import { loadLocal } from './local'
import { APP_VERSION } from './changelog'
import { initAuth, finishSignIn } from './supabase'
import { TopBar } from './parts/TopBar'
import { Library } from './parts/Library'
import { PlayerBar } from './parts/PlayerBar'
import { RightPanel } from './parts/RightPanel'
import { InvitePrompt, join } from './parts/Together'
import { FullScreen, MiniWindow, MobileMini, MobileNav, MobileNowPlaying } from './parts/Overlays'
import { Home, Section } from './views/Home'
import { Search } from './views/Search'
import { Collection } from './views/Collection'
import { Profile, PublicPlaylist } from './views/Profile'
import { People } from './views/People'
import { DialogHost, LibraryPage, LyricsView, Settings, WhatsNew } from './views/Misc'

function View() {
  const r = useRoute()
  switch (r.name) {
    case 'search': return <Search q={r.q} />
    case 'collection': return <Collection key={r.kind + r.id} kind={r.kind} id={r.id} />
    case 'lyrics': return <LyricsView />
    case 'whatsnew': return <WhatsNew />
    case 'settings': return <Settings />
    case 'library': return <LibraryPage />
    case 'profile': return <Profile key={r.id} id={r.id} />
    case 'pplaylist': return <PublicPlaylist key={r.id} id={r.id} />
    case 'people': return <People key={r.id + r.which} id={r.id} which={r.which} />
    case 'section': return <Section k={r.key} />
    default: return <Home />
  }
}

function Resizer() {
  const move = e => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    const w = e.clientX - 8
    if (w < 200) useStore.setState({ libCollapsed: true })
    else useStore.setState({ libCollapsed: false, libWidth: Math.min(600, Math.max(280, w)) })
  }
  return <div className="resizer" role="separator" aria-label="Resize Your Library" onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)} onPointerMove={move} />
}

export default function App() {
  const { mini, fullscreen, libCollapsed, libWidth, panel, navI } = useStore()
  const mobile = useMobile()
  const profile = useStore(s => s.profile), user = useStore(s => s.user)
  // Persisted profile applies at boot (before any network); signed out is always Calico + ginger.
  useEffect(() => { applyTheme(user && profile ? profile : {}) }, [profile, user])

  useEffect(() => {
    // Show What's New once per version; a fresh install (nothing stored, empty library) just records it.
    const welcome = () => {
      const s = useStore.getState()
      if (s.lastSeenVersion === APP_VERSION) return
      const fresh = !s.lastSeenVersion && !s.playlists.length && !s.liked.length && !s.local.length
      useStore.setState({ lastSeenVersion: APP_VERSION })
      if (!fresh) s.go({ name: 'whatsnew' })
    }
    loadLocal().then(({ tracks, art }) => useStore.setState({ local: tracks, localArt: art })).catch(() => {}).then(welcome)
    window.calify?.zoom(useStore.getState().zoom)
    initAuth()
    const offJoin = window.calify?.onJoin?.(join)   // calify://join/CODE handed over by the Electron main process
    addEventListener('keydown', onKey)
    const vis = () => document.documentElement.classList.toggle('is-hidden', document.visibilityState === 'hidden')
    document.addEventListener('visibilitychange', vis)
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('backButton', () => {
        const s = useStore.getState()
        if (s.menu || s.dialog) useStore.setState({ menu: null, dialog: null })
        else if (s.panel) useStore.setState({ panel: null })
        else if (s.npOpen) useStore.setState({ npOpen: false })
        else if (s.navI > 0) s.back()
        else CapApp.minimizeApp()
      })
      const joinUrl = url => url?.startsWith('calify://join/') && join(url.slice(14).split(/[/?#]/)[0])
      CapApp.addListener('appUrlOpen', ({ url }) => {
        if (url.startsWith('calify://auth')) finishSignIn(url).catch(e => useStore.getState().toastMsg(e.message))
        else joinUrl(url)
      })
      CapApp.getLaunchUrl().then(r => joinUrl(r?.url), () => {})   // appUrlOpen only covers links that arrive while Calify runs
    }
    return () => { removeEventListener('keydown', onKey); document.removeEventListener('visibilitychange', vis); offJoin?.() }
  }, [])

  if (mini) return <MiniWindow />

  if (mobile) return (
    <div className="app mobile">
      <main className="m-main" key={navI}><View /></main>
      <MobileMini />
      <MobileNav />
      <MobileNowPlaying />
      {panel && <div className="m-panel"><RightPanel /></div>}
      <MenuHost /><Toast /><DialogHost /><InvitePrompt />
    </div>
  )

  return (
    <div className={`app ${window.calify ? 'desktop' : ''}`} style={{ '--lib': libCollapsed ? '72px' : libWidth + 'px' }}>
      <TopBar />
      <div className="main">
        <Library />
        <Resizer />
        <main className="panel center" key={navI}><View /></main>
        <RightPanel />
      </div>
      <PlayerBar />
      {fullscreen && <FullScreen />}
      <MenuHost /><Toast /><DialogHost /><InvitePrompt />
    </div>
  )
}
