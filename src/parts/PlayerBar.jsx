import { useStore, useRoute, isDesktopApp } from '../store'
import { Icon } from '../icons'
import { LikeButton, Slider, TrackArt, fmt, routeOf } from '../ui'
import { usePos, toggle, next, prev, seek, setShuffle, cycleRepeat, setVolume } from '../player'

export function Controls({ big }) {
  const { playing, shuffle, repeat, current } = useStore()
  const s = big ? 28 : 16
  return (
    <div className="controls">
      <button className={`icon-btn tog ${shuffle ? 'on' : ''}`} title={shuffle ? 'Disable shuffle' : 'Enable shuffle'} aria-label="Shuffle" aria-pressed={shuffle} onClick={() => setShuffle(!shuffle)}>
        <Icon name="shuffle" size={s} />
      </button>
      <button className="icon-btn" title="Previous" aria-label="Previous" onClick={prev}><Icon name="prev" size={s} /></button>
      <button className="play-btn" title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause' : 'Play'} onClick={toggle} disabled={!current}>
        <Icon name={playing ? 'pause' : 'play'} size={big ? 28 : 16} />
      </button>
      <button className="icon-btn" title="Next" aria-label="Next" onClick={() => next()}><Icon name="next" size={s} /></button>
      <button className={`icon-btn tog ${repeat !== 'off' ? 'on' : ''}`} title={{ off: 'Enable repeat', all: 'Enable repeat one', one: 'Disable repeat' }[repeat]} aria-label="Repeat" onClick={cycleRepeat}>
        <Icon name="repeat" size={s} />{repeat === 'one' && <b className="rep1">1</b>}
      </button>
    </div>
  )
}

export function Progress() {
  const { t, d } = usePos()
  const dur = d || useStore.getState().current?.duration || 0
  return (
    <div className="progress">
      <span className="time">{fmt(t)}</span>
      <Slider value={t} max={dur} onCommit={seek} label="Change progress" />
      <span className="time">{fmt(dur)}</span>
    </div>
  )
}

export function Volume() {
  const { volume, muted } = useStore()
  const v = muted ? 0 : volume
  return (
    <div className="volume">
      <button className="icon-btn" aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'} onClick={() => useStore.setState({ muted: !muted })}>
        <Icon name={v === 0 ? 'mute' : v < 0.5 ? 'volumeLow' : 'volume'} size={16} />
      </button>
      <Slider value={v} max={1} onChange={setVolume} label="Change volume" />
    </div>
  )
}

export function PlayerBar() {
  const { current, ctx, panel, setPanel, go, fullscreen } = useStore()
  const r = useRoute()
  const lyricsOn = r.name === 'lyrics'
  return (
    <footer className="playerbar">
      <div className="pb-left">
        {current && <>
          <button className="pb-art" title={panel === 'np' ? 'Hide Now Playing view' : 'Now Playing view'} onClick={() => setPanel('np')}>
            <TrackArt track={current} size={56} />
          </button>
          <div className="pb-meta">
            <a className="pb-title" onClick={() => ctx && go(routeOf(ctx))}>{current.title}</a>
            <span className="pb-artist">{current.artist}</span>
          </div>
          <LikeButton track={current} always />
        </>}
      </div>
      <div className="pb-center">
        <Controls />
        <Progress />
      </div>
      <div className="pb-right">
        <button className={`icon-btn tog ${panel === 'np' ? 'on' : ''}`} title="Now playing view" aria-label="Now playing view" onClick={() => setPanel('np')}><Icon name="npv" size={16} /></button>
        <button className={`icon-btn tog ${lyricsOn ? 'on' : ''}`} title="Lyrics" aria-label="Lyrics" onClick={() => lyricsOn ? useStore.getState().back() : go({ name: 'lyrics' })}><Icon name="mic" size={16} /></button>
        <button className={`icon-btn tog ${panel === 'queue' ? 'on' : ''}`} title="Queue" aria-label="Queue" onClick={() => setPanel('queue')}><Icon name="queue" size={16} /></button>
        <button className={`icon-btn tog ${panel === 'devices' ? 'on' : ''}`} title="Connect to a device" aria-label="Connect to a device" onClick={() => setPanel('devices')}><Icon name="devices" size={16} /></button>
        <Volume />
        {isDesktopApp && <button className="icon-btn" title="Open Miniplayer" aria-label="Open Miniplayer" onClick={() => { useStore.setState({ mini: true }); window.calify.mini(true) }}><Icon name="mini" size={16} /></button>}
        <button className="icon-btn" title="Full screen" aria-label="Full screen" onClick={() => {
          useStore.setState({ fullscreen: !fullscreen })
          if (!fullscreen) document.documentElement.requestFullscreen?.().catch(() => {})
        }}><Icon name="full" size={16} /></button>
      </div>
    </footer>
  )
}
