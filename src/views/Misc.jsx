import { useStore, isDesktopApp } from '../store'
import { useColor } from '../color'
import { Icon } from '../icons'
import { Spinner, useMobile } from '../ui'
import { useLyrics, LyricsLines } from '../parts/Lyrics'
import { LibraryList, createMenu } from '../parts/Library'
import { Avatar } from '../parts/TopBar'
import { pickLocalFiles, pickPlaylistCsv, cmd } from '../commands'
import { removeLocal } from '../local'
import { del } from 'idb-keyval'
import { CaliCat } from '../parts/CaliCat'
import { useState } from 'react'
import * as sp from '../spotify'

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

export function Settings() {
  const { name, local, zoom, privateSession, spotifyClientId, spotifyUser, spotifyError } = useStore()
  const [busy, setBusy] = useState(false)
  const connect = async () => {
    setBusy(true)
    set({ spotifyError: null })
    try { await sp.login(); useStore.getState().toastMsg('Spotify connected') } catch (e) { set({ spotifyError: e.message }) } finally { setBusy(false) }
  }
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
      <section>
        <h2>Profile</h2>
        <label className="set-row"><span>Display name<small>Shown as the owner of your playlists.</small></span>
          <input value={name} maxLength={30} onChange={e => set({ name: e.target.value })} /></label>
        <div className="set-row"><span>Private session<small>Hide what you play from Recents and history.</small></span>
          <Toggle on={privateSession} onClick={cmd.privateSession} /></div>
      </section>
      <section>
        <h2>Spotify</h2>
        {spotifyError && !spotifyUser && <p className="set-error" role="alert">{spotifyError}</p>}
        {spotifyUser ? (
          <div className="set-row"><span>Connected as {spotifyUser.name}<small>Your Spotify playlists and Liked Songs are in Your Library. Full songs need Spotify Premium{sp.native ? ' and open in the Spotify app on this phone' : ''}.</small></span>
            <button className="outline-btn sm" onClick={sp.logout}>Disconnect</button></div>
        ) : sp.BUILT_IN_ID ? (
          <div className="set-row"><span>Log in with Spotify<small>Sign in with your Spotify account on Spotify's own page. Calify never sees your password.</small></span>
            <button className="spotify-btn" disabled={busy} onClick={connect}>{busy ? 'Waiting for Spotify…' : 'Log in with Spotify'}</button></div>
        ) : <>
          <label className="set-row"><span>Client ID<small>Create an app on the <a className="inline-link" onClick={e => { e.preventDefault(); sp.openLink('https://developer.spotify.com/dashboard') }}>Spotify developer dashboard</a> with Web API and Web Playback SDK enabled, and add the redirect URI http://127.0.0.1:43821/callback.</small></span>
            <input value={spotifyClientId} onChange={e => set({ spotifyClientId: e.target.value })} placeholder="Paste your Client ID" spellCheck="false" autoComplete="off" /></label>
          <div className="set-row"><span>Connect your account<small>Opens Spotify's sign-in page in your browser.</small></span>
            <button className="outline-btn sm" disabled={!spotifyClientId.trim() || busy} onClick={connect}>{busy ? 'Waiting for Spotify…' : 'Connect'}</button></div>
        </>}
        <div className="set-row"><span>Import playlists from Spotify<small>Export a playlist as CSV with a tool like Exportify, then import it here. No Premium needed. Calify finds each song in your music files, and on Spotify once you're logged in.</small></span>
          <button className="outline-btn sm" onClick={pickPlaylistCsv}>Import CSV</button></div>
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
        <p className="sub">Calify 1.0.0. Plays your music files and your Spotify library. Synced lyrics by LRCLIB.</p>
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

export function DialogHost() {
  const dialog = useStore(s => s.dialog)
  if (!dialog) return null
  const close = () => useStore.setState({ dialog: null })
  return (
    <div className="dialog-scrim" onPointerDown={e => e.target === e.currentTarget && close()}>
      <div className="dialog" role="dialog" aria-modal="true">
        <header><h2>{dialog === 'keys' ? 'Keyboard shortcuts' : 'About Calify'}</h2><button className="icon-btn" aria-label="Close" onClick={close}><Icon name="close" /></button></header>
        {dialog === 'keys' ? (
          <dl className="keys">{KEYS.map(([a, b]) => <div key={a}><dt>{a}</dt><dd><kbd>{b}</kbd></dd></div>)}</dl>
        ) : (
          <div className="about">
            <p><b>Calify 1.0.0</b></p>
            <p>Your music, your way. Play your own files and your Spotify library, and follow along with synced lyrics.</p>
            <p className="sub">Spotify Web API and Web Playback SDK · Lyrics: LRCLIB · Built with React, Electron and Capacitor.</p>
          </div>
        )}
      </div>
    </div>
  )
}
