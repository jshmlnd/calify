import { useState } from 'react'
import { useStore, isDesktopApp } from '../store'
import { submitBugReport } from '../social'
import { useColor } from '../color'
import { Icon } from '../icons'
import { Spinner, useMobile } from '../ui'
import { useLyrics, LyricsLines } from '../parts/Lyrics'
import { LibraryList, createMenu } from '../parts/Library'
import { Avatar, signInCmd, signOutCmd } from '../parts/TopBar'
import { supabase } from '../supabase'
import { pickLocalFiles, cmd } from '../commands'
import { removeLocal } from '../local'
import { del } from 'idb-keyval'
import { CaliCat } from '../parts/CaliCat'
import { APP_VERSION, CHANGELOG } from '../changelog'

export function LyricsView() {
  const current = useStore(s => s.current)
  const art = useStore(s => current && (current.art || s.localArt[current.id]))
  const color = useColor(art, current?.title, 0.28, 0.35)
  const lyrics = useLyrics(current)
  return (
    <div className="view scroll-y lyrics-view" style={{ background: color }}>
      {!current ? <div className="empty"><h2>Play a song to see its lyrics</h2></div>
        : lyrics.status === 'loading' ? <Spinner />
        : lyrics.status === 'none' ? <div className="empty"><CaliCat size={110} state="asleep" /><h2>Hmm. We don't know the lyrics for this one.</h2></div>
        : <>
          {!lyrics.data.synced && <p className="lyrics-note">These lyrics haven't been synced to the song yet.</p>}
          <LyricsLines lyrics={lyrics.data} className="big" />
          <p className="lyrics-credit">Lyrics provided by LRCLIB</p>
        </>}
    </div>
  )
}

export function LibraryPage() {
  const openMenu = useStore(s => s.openMenu)
  const mobile = useMobile()
  return (
    <div className="view scroll-y pad-view library-page">
      <header className="lp-head">
        {mobile && <button className="chip-av" onClick={() => useStore.getState().go({ name: 'settings' })} aria-label="Settings"><Avatar /></button>}
        <h1>Your Library</h1><span className="grow" />
        <button className="icon-btn" aria-label="Create" onClick={e => openMenu(e, createMenu())}><Icon name="plus" /></button>
      </header>
      <LibraryList big={!mobile} />
      <div className="view-foot" />
    </div>
  )
}

export function WhatsNew() {
  return (
    <div className="view scroll-y pad-view">
      <div className="empty" style={{ paddingBottom: 0 }}><CaliCat size={96} state="awake" /></div>
      <h1 className="section-title">What's New</h1>
      {CHANGELOG.map(e => (
        <section key={e.version}>
          <h2>Calify {e.version} <span className="sub">{e.date}</span></h2>
          {[['New', e.new], ['Fixed', e.fixed]].filter(([, l]) => l.length).map(([h, l]) => (
            <div key={h}><h3 className="sub">{h}</h3><ul>{l.map(x => <li key={x}>{x}</li>)}</ul></div>
          ))}
        </section>
      ))}
      <div className="view-foot" />
    </div>
  )
}

export function Settings() {
  const { name, local, zoom, privateSession, user, go } = useStore()
  const set = useStore.setState
  const clearLocal = async () => {
    if (!confirm(`Remove all ${local.length} local files from Calify? The original files on your device are not touched.`)) return
    for (const t of local) await removeLocal(t.id)
    await del('localTracks')
    set({ local: [], localArt: {} })
  }
  return (
    <div className="view scroll-y pad-view settings">
      <h1 className="section-title">Settings</h1>
      {supabase && (
        <section>
          <h2>Account</h2>
          {user ? (
            <div className="set-row"><span>{user.name}<small>Signed in with Google as {user.email}</small></span>
              <span className="set-btns">
                <button className="outline-btn sm" onClick={() => go({ name: 'profile', id: user.id })}>Profile</button>
                <button className="outline-btn sm" onClick={signOutCmd}>Sign out</button>
              </span></div>
          ) : (
            <div className="set-row"><span>Sign in<small>Optional. Your music files never leave this device.</small></span>
              <button className="outline-btn sm" onClick={signInCmd}>Sign in with Google</button></div>
          )}
        </section>
      )}
      <section>
        <h2>Profile</h2>
        <label className="set-row"><span>Display name<small>Shown as the owner of your playlists.</small></span>
          <input value={name} maxLength={30} onChange={e => set({ name: e.target.value })} /></label>
        <div className="set-row"><span>Private session<small>Hide what you play from Recents and history.</small></span>
          <Toggle on={privateSession} onClick={cmd.privateSession} /></div>
      </section>
      <section>
        <h2>Local Files</h2>
        <div className="set-row"><span>Your music files<small>{local.length} song{local.length === 1 ? '' : 's'} imported. Add .lrc files with the same name for synced lyrics.</small></span>
          <button className="outline-btn sm" onClick={pickLocalFiles}>Import files</button></div>
        {local.length > 0 && <div className="set-row"><span>Remove imported files<small>Frees the space Calify uses. Your original files stay where they are.</small></span>
          <button className="outline-btn sm" onClick={clearLocal}>Remove all</button></div>}
      </section>
      {isDesktopApp && (
        <section>
          <h2>Display</h2>
          <div className="set-row"><span>Zoom level<small>Ctrl + / Ctrl − to change, Ctrl 0 to reset.</small></span>
            <span className="zoom">
              <button className="outline-btn sm" onClick={cmd.zoomOut} aria-label="Zoom out">−</button><b>{Math.round(zoom * 100)}%</b>
              <button className="outline-btn sm" onClick={cmd.zoomIn} aria-label="Zoom in">+</button>
            </span></div>
        </section>
      )}
      <section>
        <h2>About</h2>
        <p className="sub">Calify {APP_VERSION}. Plays your music files. Synced lyrics by LRCLIB.</p>
      </section>
      <div className="view-foot" />
    </div>
  )
}

export const Toggle = ({ on, onClick }) => <button role="switch" aria-checked={on} className={`toggle ${on ? 'on' : ''}`} onClick={onClick}><i /></button>

const KEYS = [
  ['Play / Pause', 'Space'], ['Next', 'Ctrl + →'], ['Previous', 'Ctrl + ←'], ['Seek forward / back', 'Shift + → / ←'],
  ['Shuffle', 'Ctrl + S'], ['Repeat', 'Ctrl + R'], ['Volume up / down', 'Ctrl + ↑ / ↓'], ['Search', 'Ctrl + L'],
  ['Filter library', 'Ctrl + F'], ['New playlist', 'Ctrl + N'], ['Preferences', 'Ctrl + P'], ['Zoom', 'Ctrl + = / − / 0'],
]

function BugDialog({ close }) {
  const [what, setWhat] = useState(''), [expected, setExpected] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('')
  const send = async e => {
    e.preventDefault()
    setBusy(true); setErr('')
    try { await submitBugReport({ what, expected }); useStore.getState().toastMsg('Thanks! Your report was sent.'); close() }
    catch (x) { setErr(x.message.startsWith('Please wait') ? x.message : 'Couldn’t send. Check your connection and try again.'); setBusy(false) }
  }
  return (
    <form onSubmit={send} className="bug-form" style={{ display: 'contents' }}>
      <label className="field"><span>What happened?</span><textarea autoFocus required minLength={10} maxLength={2000} value={what} onChange={e => setWhat(e.target.value)} /></label>
      <label className="field"><span>What did you expect? (optional)</span><textarea maxLength={2000} value={expected} onChange={e => setExpected(e.target.value)} /></label>
      {err && <p className="sub" role="alert">{err}</p>}
      <button className="white-btn right" disabled={busy || what.trim().length < 10}>{busy ? 'Sending…' : 'Send'}</button>
    </form>
  )
}

export function DialogHost() {
  const dialog = useStore(s => s.dialog)
  if (!dialog) return null
  const close = () => useStore.setState({ dialog: null })
  return (
    <div className="dialog-scrim" onPointerDown={e => e.target === e.currentTarget && close()}>
      <div className="dialog" role="dialog" aria-modal="true">
        <header><h2>{dialog === 'keys' ? 'Keyboard shortcuts' : dialog === 'bug' ? 'Report a bug' : 'About Calify'}</h2><button className="icon-btn" aria-label="Close" onClick={close}><Icon name="close" /></button></header>
        {dialog === 'bug' ? <BugDialog close={close} /> : dialog === 'keys' ? (
          <dl className="keys">{KEYS.map(([a, b]) => <div key={a}><dt>{a}</dt><dd><kbd>{b}</kbd></dd></div>)}</dl>
        ) : (
          <div className="about">
            <p><b>Calify {APP_VERSION}</b></p>
            <p>Your music, your way. Play your own files and follow along with synced lyrics.</p>
            <p className="sub">Lyrics: LRCLIB · Built with React, Electron and Capacitor.</p>
          </div>
        )}
      </div>
    </div>
  )
}
