import { useEffect, useState } from 'react'
import { useStore } from '../store'
import { Icon } from '../icons'
import { LikeButton, TrackArt, Eq, routeOf, trackMenu } from '../ui'
import { useColor } from '../color'
import { audio, playAtPos, playFromQueue } from '../player'
import { useLyrics, LyricsLines } from './Lyrics'
import { CaliCat } from './CaliCat'

export function RightPanel() {
  const panel = useStore(s => s.panel)
  if (!panel) return null
  return (
    <aside className="panel right" aria-label="Side panel">
      {panel === 'np' && <NowPlaying />}
      {panel === 'queue' && <Queue />}
      {panel === 'devices' && <Devices />}
      {panel === 'friends' && <Friends />}
    </aside>
  )
}

const Close = () => (
  <button className="icon-btn" aria-label="Close" title="Close" onClick={() => useStore.setState({ panel: null })}><Icon name="close" size={16} /></button>
)

function NowPlaying() {
  const { current, ctx, go, openMenu, upNext, order, pos, ctxTracks } = useStore()
  const artUrl = useStore(s => current && (current.art || s.localArt[current.id]))
  const color = useColor(artUrl, current?.title, 0.3, 0.45)
  const lyrics = useLyrics(current)
  if (!current) return <div className="rp-empty"><header className="rp-head"><h3>Now playing</h3><Close /></header><p>Play something to see it here.</p></div>
  const nextUp = upNext[0] || ctxTracks[order[pos + 1]]
  return (
    <div className="rp-scroll scroll-y">
      <header className="rp-head sticky">
        <h3 className="link" onClick={() => ctx && go(routeOf(ctx))}>{ctx?.name || current.title}</h3>
        <button className="icon-btn" aria-label="More options" onClick={e => openMenu(e, trackMenu(current))}><Icon name="dots" size={16} /></button>
        <Close />
      </header>
      <div className="np-body">
        <div className="cat-perch"><TrackArt track={current} /><CaliCat size={84} /></div>
        <div className="np-meta">
          <div>
            <h2>{current.title}</h2>
            <p>{current.artist}</p>
          </div>
          <LikeButton track={current} size={24} always />
        </div>
        {lyrics.status === 'ok' && (
          <section className="np-card np-lyrics" style={{ background: color }}>
            <header><h4>Lyrics</h4><button className="mini-pill" onClick={() => go({ name: 'lyrics' })}>Show lyrics</button></header>
            <div className="np-lyrics-box scroll-y"><LyricsLines lyrics={lyrics.data} /></div>
          </section>
        )}
        {nextUp && (
          <section className="np-card">
            <header><h4>Next in queue</h4><button className="mini-link" onClick={() => useStore.setState({ panel: 'queue' })}>Open queue</button></header>
            <QRow t={nextUp} onClick={() => (upNext[0] ? playFromQueue(0) : playAtPos(pos + 1))} />
          </section>
        )}
      </div>
    </div>
  )
}

function QRow({ t, current, onClick }) {
  const playing = useStore(s => s.playing)
  return (
    <div className={`q-row ${current ? 'current' : ''}`} onClick={onClick} onContextMenu={e => useStore.getState().openMenu(e, trackMenu(t))}>
      <div className="q-art"><TrackArt track={t} />{current && playing && <span className="q-eq"><Eq /></span>}</div>
      <div className="q-text"><b>{t.title}</b><small>{t.artist}</small></div>
    </div>
  )
}

export function Queue() {
  const { current, ctx, upNext, order, pos, ctxTracks, history } = useStore()
  const [tab, setTab] = useState('queue')
  const rest = order.slice(pos + 1).map((i, k) => ({ t: ctxTracks[i], p: pos + 1 + k })).slice(0, 80)
  return (
    <div className="rp-scroll scroll-y">
      <header className="rp-head sticky tabs">
        <button className={tab === 'queue' ? 'on' : ''} onClick={() => setTab('queue')}>Queue</button>
        <button className={tab === 'recent' ? 'on' : ''} onClick={() => setTab('recent')}>Recently played</button>
        <span className="grow" /><Close />
      </header>
      {tab === 'queue' ? (
        <div className="q-body">
          {current ? <><h4>Now playing</h4><QRow t={current} current /></> : <p className="sub">Your queue is empty.</p>}
          {upNext.length > 0 && <>
            <div className="q-sec"><h4>Next in queue</h4><button className="mini-link" onClick={() => useStore.setState({ upNext: [] })}>Clear queue</button></div>
            {upNext.map((t, i) => <QRow key={'u' + i} t={t} onClick={() => playFromQueue(i)} />)}
          </>}
          {rest.length > 0 && <>
            <h4>Next from: {ctx?.name || 'your queue'}</h4>
            {rest.map(({ t, p }) => <QRow key={'c' + p} t={t} onClick={() => playAtPos(p)} />)}
          </>}
        </div>
      ) : (
        <div className="q-body">
          {history.length ? history.map((t, i) => <QRow key={t.id + i} t={t} current={i === 0 && current?.id === t.id} />) : <p className="sub">Nothing played yet.</p>}
        </div>
      )}
    </div>
  )
}

function Devices() {
  const [devices, setDevices] = useState([])
  const [sink, setSink] = useState(audio.sinkId || 'default')
  useEffect(() => {
    navigator.mediaDevices?.enumerateDevices().then(d => setDevices(d.filter(x => x.kind === 'audiooutput' && x.deviceId !== 'communications'))).catch(() => {})
  }, [])
  const label = d => (d.label || 'This computer').replace(/^Default - /, '')
  const cur = devices.find(d => d.deviceId === sink) || devices[0]
  const others = devices.filter(d => d !== cur && d.deviceId !== 'default')
  const pick = d => audio.setSinkId?.(d.deviceId).then(() => setSink(d.deviceId)).catch(() => useStore.getState().toastMsg("Couldn't switch to that device"))
  return (
    <div className="rp-scroll scroll-y devices">
      <header className="rp-head"><h3>Connect</h3><Close /></header>
      <div className="dev-current"><Icon name="laptop" size={28} className="green" /><div><b className="green">{cur ? label(cur) : 'This computer'}</b><small>This computer</small></div></div>
      {others.length ? <>
        <h4>Select another device</h4>
        {others.map(d => <button key={d.deviceId} className="dev-row" onClick={() => pick(d)}><Icon name="laptop" size={24} /><span>{label(d)}</span></button>)}
      </> : <>
        <h4>No other devices found</h4>
        <div className="dev-tip"><Icon name="wifi" size={24} /><div><b>Check your WiFi</b><small>Connect the devices you're using to the same WiFi.</small></div></div>
        <div className="dev-tip"><Icon name="devices" size={24} /><div><b>Play from another device</b><small>It will automatically appear here.</small></div></div>
        <div className="dev-tip"><Icon name="power" size={24} /><div><b>Restart your speaker</b><small>Or follow setup instructions if it's a new device.</small></div></div>
      </>}
    </div>
  )
}

function Friends() {
  return (
    <div className="rp-scroll friends">
      <header className="rp-head"><h3>Listening activity</h3><Close /></header>
      <p>Let friends and followers on Calify see what you're listening to.</p>
      {[0, 1, 2].map(i => (
        <div key={i} className="friend-ph">
          <span className="fp-av"><Icon name="user" size={22} /><i /></span>
          <span className="fp-lines"><i /><i /><i /></span>
        </div>
      ))}
      <p>Friend activity is coming to Calify soon. Until then, your listening stays on this device.</p>
      <button className="white-btn" onClick={() => useStore.getState().go({ name: 'settings' })}>Settings</button>
    </div>
  )
}
