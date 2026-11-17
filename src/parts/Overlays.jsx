import { useEffect } from 'react'
import { useStore } from '../store'
import { useColor } from '../color'
import { Icon } from '../icons'
import { LikeButton, TrackArt } from '../ui'
import { Controls, Progress, Volume } from './PlayerBar'
import { useLyrics, LyricsLines } from './Lyrics'
import { usePos, toggle } from '../player'
import { CaliCat } from './CaliCat'
import { createMenu } from './Library'

// Mobile: full-screen "Now Playing" sheet.
export function MobileNowPlaying() {
  const { current, ctx, npOpen, go, setPanel } = useStore()
  const art = useStore(s => current && (current.art || s.localArt[current.id]))
  const color = useColor(art, current?.title, 0.32, 0.55)
  const lyrics = useLyrics(npOpen ? current : null)
  if (!npOpen || !current) return null
  const close = () => useStore.setState({ npOpen: false })
  return (
    <div className="m-np scroll-y" style={{ '--c': color }}>
      <header className="m-np-head">
        <button className="icon-btn" aria-label="Close" onClick={close}><Icon name="down" /></button>
        <div><small>PLAYING FROM PLAYLIST</small><b>{ctx?.name || 'Calify'}</b></div>
        <button className="icon-btn" aria-label="Queue" onClick={() => { close(); setPanel('queue') }}><Icon name="queue" /></button>
      </header>
      <div className="m-np-art cat-perch"><TrackArt track={current} /><CaliCat size={92} /></div>
      <div className="m-np-meta">
        <div><h2>{current.title}</h2><p>{current.artist}</p></div>
        <LikeButton track={current} size={28} always />
      </div>
      <Progress />
      <Controls big />
      <div className="m-np-tools">
        <button className="icon-btn" aria-label="Connect to a device" onClick={() => { close(); setPanel('devices') }}><Icon name="devices" size={20} /></button>
        <button className="icon-btn" aria-label="Queue" onClick={() => { close(); setPanel('queue') }}><Icon name="queue" size={20} /></button>
      </div>
      {lyrics.status === 'ok' && (
        <section className="np-card np-lyrics m-lyrics" onClick={() => go({ name: 'lyrics' })}>
          <header><h4>Lyrics</h4><span className="mini-pill">Show lyrics</span></header>
          <div className="np-lyrics-box scroll-y"><LyricsLines lyrics={lyrics.data} /></div>
        </section>
      )}
    </div>
  )
}

// Mobile: floating mini player above the bottom nav.
export function MobileMini() {
  const { current, playing } = useStore()
  const art = useStore(s => current && (current.art || s.localArt[current.id]))
  const color = useColor(art, current?.title, 0.24, 0.5)
  if (!current) return null
  return (
    <div className="m-mini" style={{ background: color }} onClick={() => useStore.setState({ npOpen: true })}>
      <TrackArt track={current} size={40} />
      <div className="m-mini-text"><b>{current.title}</b><small>{current.artist}</small></div>
      <LikeButton track={current} size={24} always />
      <button className="icon-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={e => { e.stopPropagation(); toggle() }}>
        <Icon name={playing ? 'pause' : 'play'} size={24} />
      </button>
      <MiniProgress />
    </div>
  )
}
function MiniProgress() {
  const { t, d } = usePos()
  return <div className="m-mini-bar"><i style={{ width: `${d ? (t / d) * 100 : 0}%` }} /></div>
}

export function MobileNav() {
  const { go, nav, navI, openMenu } = useStore()
  const r = nav[navI].name
  const tab = (name, label, icon, iconOn, route) => (
    <button className={r === name ? 'on' : ''} onClick={() => go(route)}><Icon name={r === name ? iconOn : icon} size={24} /><span>{label}</span></button>
  )
  return (
    <nav className="m-nav">
      {tab('home', 'Home', 'homeO', 'home', { name: 'home' })}
      {tab('search', 'Search', 'search', 'searchF', { name: 'search', q: '' })}
      {tab('library', 'Your Library', 'library', 'libraryF', { name: 'library' })}
      <button onClick={e => openMenu(e, createMenu())}><Icon name="plus" size={24} /><span>Create</span></button>
    </nav>
  )
}

// Desktop: compact always-on-top window (Electron).
export function MiniWindow() {
  const current = useStore(s => s.current)
  const art = useStore(s => current && (current.art || s.localArt[current.id]))
  return (
    <div className="miniwin" style={{ backgroundImage: art ? `url(${art})` : undefined }}>
      <div className="miniwin-shade">
        <div className="miniwin-top drag" />
        <button className="icon-btn miniwin-exit nodrag" title="Exit Miniplayer" aria-label="Exit Miniplayer" onClick={() => { useStore.setState({ mini: false }); window.calify?.mini(false) }}>
          <Icon name="exitFull" size={18} />
        </button>
        <div className="miniwin-bottom">
          {current && <div className="miniwin-meta"><b>{current.title}</b><small>{current.artist}</small></div>}
          <Progress /><Controls />
        </div>
      </div>
    </div>
  )
}

// Desktop: full screen player.
export function FullScreen() {
  const current = useStore(s => s.current)
  const art = useStore(s => current && (current.art || s.localArt[current.id]))
  const ctx = useStore(s => s.ctx)
  const lyrics = useLyrics(current)
  const color = useColor(art, current?.title, 0.22, 0.5)
  const exit = () => { useStore.setState({ fullscreen: false }); document.fullscreenElement && document.exitFullscreen() }
  useEffect(() => {
    const f = () => !document.fullscreenElement && useStore.setState({ fullscreen: false })
    document.addEventListener('fullscreenchange', f)
    return () => document.removeEventListener('fullscreenchange', f)
  }, [])
  return (
    <div className="fs" style={{ '--art': art ? `url(${art})` : 'none', '--fs-c': color }}>
      <div className="fs-bg" />
      <header className="fs-head"><small>PLAYING FROM {ctx ? 'PLAYLIST' : 'CALIFY'}</small><b>{ctx?.name}</b></header>
      {lyrics.status === 'ok' && lyrics.data.synced && <div className="fs-lyrics scroll-y"><LyricsLines lyrics={lyrics.data} className="big" /></div>}
      <div className="fs-now">
        {current && <div className="cat-perch"><TrackArt track={current} /><CaliCat size={110} /></div>}
        {current && <div className="fs-meta"><h1>{current.title}</h1><p>{current.artist}</p></div>}
        <LikeButton track={current} size={32} always />
      </div>
      <div className="fs-bar">
        <Progress />
        <div className="fs-ctrl"><span /><Controls big /><div className="fs-right"><Volume /><button className="icon-btn" aria-label="Exit full screen" onClick={exit}><Icon name="exitFull" size={20} /></button></div></div>
      </div>
    </div>
  )
}

