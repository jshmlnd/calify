import { useState } from 'react'
import { useStore, useRoute } from '../store'
import { Icon } from '../icons'
import { Art, TrackArt, routeOf } from '../ui'
import { appMenu, cmd, pickLocalFiles } from '../commands'
import { playContext } from '../player'
import { supabase, signInWithGoogle, signOut } from '../supabase'

export function Avatar({ size = 32 }) {
  const name = useStore(s => s.name)
  const priv = useStore(s => s.privateSession)
  const photo = useStore(s => s.user?.avatarUrl)
  const [broken, setBroken] = useState(null)
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {photo && broken !== photo ? <img src={photo} alt="" referrerPolicy="no-referrer" onError={() => setBroken(photo)} /> : <>
      {/* cat head drawn inside its own box so the ears never overflow and get cut */}
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M6.5 18 L7.5 2.5 L18 10 Z" fill="var(--accent)" />
        <path d="M33.5 18 L32.5 2.5 L22 10 Z" fill="var(--ink)" stroke="var(--accent)" strokeWidth="1.6" strokeLinejoin="round" />
        <circle cx="20" cy="23" r="15.5" fill="var(--accent)" />
      </svg>
      <b>{(name || 'Y')[0].toUpperCase()}</b></>}
      {priv && <i className="avatar-dot" title="Private session" />}
    </span>
  )
}

const toastErr = e => useStore.getState().toastMsg(e.message)
export const signInCmd = () => signInWithGoogle().catch(toastErr)
export const signOutCmd = () => signOut().catch(toastErr)
// Signed out: "Sign in with Google"; signed in: "Profile", "Sign out". Nothing when this build has no Supabase env.
export const accountItems = () => {
  const user = useStore.getState().user
  if (!supabase) return []
  return user ? [
    { label: 'Profile', icon: 'user', onClick: () => useStore.getState().go({ name: 'profile', id: user.id }) },
    { label: 'Sign out', icon: 'power', onClick: signOutCmd },
  ] : [{ label: 'Sign in with Google', icon: 'user', onClick: signInCmd }]
}

export const avatarMenu = () => [
  ...(supabase ? [...accountItems(), '-'] : []),
  { label: 'Settings', icon: 'sliders', onClick: cmd.prefs },
  { label: 'Import local files', icon: 'file', onClick: pickLocalFiles },
  { label: 'Private session', icon: 'user', checked: useStore.getState().privateSession, onClick: cmd.privateSession },
  '-',
  { label: "What's New", onClick: () => useStore.getState().go({ name: 'whatsnew' }) },
  { label: 'About Calify', onClick: cmd.about },
  ...(window.calify ? [{ label: 'Exit', onClick: cmd.exit }] : []),
].filter(Boolean)

export function TopBar() {
  const { navI, nav, back, fwd, go, openMenu, setPanel } = useStore()
  const panel = useStore(s => s.panel)
  const r = useRoute()
  return (
    <header className="topbar">
      <div className="tb-side">
        <button className="icon-btn nodrag" aria-label="Menu" title="Menu" onClick={e => openMenu(e, appMenu())}><Icon name="dots" size={20} /></button>
        <button className="icon-btn nodrag" aria-label="Go back" title="Go back" disabled={navI === 0} onClick={back}><Icon name="back" size={20} /></button>
        <button className="icon-btn nodrag" aria-label="Go forward" title="Go forward" disabled={navI >= nav.length - 1} onClick={fwd}><Icon name="fwd" size={20} /></button>
      </div>
      <div className="tb-center">
        <button className={`home-btn nodrag ${r.name === 'home' ? 'on' : ''}`} aria-label="Home" title="Home" onClick={() => go({ name: 'home' })}>
          <Icon name={r.name === 'home' ? 'home' : 'homeO'} />
        </button>
        <SearchBox />
      </div>
      <div className="tb-side tb-right">
        <button className={`icon-btn nodrag ${panel === 'friends' ? 'on' : ''}`} aria-label="Friend Activity" title="Friend Activity" onClick={() => setPanel('friends')}><Icon name="friends" size={20} /></button>
        <button className="avatar-btn nodrag" aria-label="Account" title="Account" onClick={e => openMenu(e, avatarMenu())}><Avatar /></button>
      </div>
    </header>
  )
}

function SearchBox() {
  const r = useRoute()
  const { recentSearches, go } = useStore()
  const [focus, setFocus] = useState(false)
  const q = r.name === 'search' ? r.q || '' : ''
  const setQ = v => {
    if (r.name === 'search') useStore.setState(s => { const nav = [...s.nav]; nav[s.navI] = { name: 'search', q: v }; return { nav } })
    else go({ name: 'search', q: v })
  }
  const pick = it => {
    setFocus(false)
    if (it.kind === 'track') playContext([it.track], 0)
    else go(routeOf(it))
  }
  return (
    <div className={`searchbox nodrag ${focus ? 'focus' : ''}`}>
      <Icon name="search" size={22} className="sb-icon" />
      <input id="search-input" placeholder="What do you want to play?" value={q} autoComplete="off" spellCheck="false"
        onChange={e => setQ(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)}
        onKeyDown={e => e.key === 'Escape' && e.currentTarget.blur()} aria-label="Search" />
      {focus && !q && <span className="sb-kbd"><kbd>Ctrl</kbd><kbd>L</kbd></span>}
      {q && <button className="icon-btn sb-clear" aria-label="Clear search" onClick={() => setQ('')}><Icon name="close" size={18} /></button>}
      <span className="sb-div" />
      <button className={`icon-btn sb-browse ${r.name === 'search' && !q ? 'on' : ''}`} aria-label="Browse" title="Browse" onClick={() => go({ name: 'search', q: '' })}>
        <Icon name="browse" size={22} />
      </button>
      {focus && !q && recentSearches.length > 0 && (
        <div className="sb-drop" onMouseDown={e => e.preventDefault()}>
          <h4>Recent searches</h4>
          {recentSearches.map(it => (
            <div key={it.kind + it.id} className="sb-item" onClick={() => pick(it)}>
              {it.kind === 'track' ? <TrackArt track={it.track} /> : <Art item={it} />}
              <span className="sb-text">
                <b>{it.name}</b>
                <small>{it.kind === 'track' ? `Song • ${it.track.artist}` : it.sub}</small>
              </span>
              <button className="icon-btn" aria-label="Remove" onClick={e => { e.stopPropagation(); useStore.setState(s => ({ recentSearches: s.recentSearches.filter(x => x !== it) })) }}>
                <Icon name="close" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
