import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useStore, useArt } from './store'
import { Icon } from './icons'
import { playContext, playItem, addToQueue, toggle } from './player'

export const fmt = s => {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60), sec = Math.floor(s % 60)
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}
export const fmtLong = s => {
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60)
  return h ? `about ${h} hr ${m} min` : `${m} min ${Math.round(s % 60)} sec`
}
const ago = ts => {
  const d = (Date.now() - ts) / 1000
  if (d < 3600) return `${Math.max(1, Math.round(d / 60))} minutes ago`
  if (d < 86400) return `${Math.round(d / 3600)} hours ago`
  if (d < 86400 * 30) return `${Math.round(d / 86400)} days ago`
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const mq = window.matchMedia('(max-width: 768px)')
export const useMobile = () => useSyncExternalStore(cb => { mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb) }, () => mq.matches)

export function useAsync(fn, deps) {
  const [st, set] = useState({ loading: true })
  useEffect(() => {
    let on = true
    set({ loading: true })
    fn().then(data => on && set({ data }), error => on && set({ error }))
    return () => { on = false }
  }, deps)
  return st
}

export const routeOf = item => ({ name: 'collection', kind: item.kind, id: item.id })

// ---------- Art
export function Art({ item, track, size, round, className = '' }) {
  const localArt = useArt(track)
  const kind = item?.kind
  const style = size ? { width: size, height: size } : undefined
  const cls = `art ${round ? 'round ' : ''}${className}`
  if (kind === 'liked') return <div className={cls + ' art-liked'} style={style}><Icon name="heart" size="45%" /></div>
  if (kind === 'local') return <div className={cls + ' art-local'} style={style}><Icon name="file" size="45%" /></div>
  if (kind === 'history') return <div className={cls + ' art-history'} style={style}><Icon name="clock" size="45%" /></div>
  const src = track ? localArt : item?.art
  if (src) return <img className={cls} style={style} src={src} alt="" loading="lazy" draggable="false" />
  const p = kind === 'playlist' && useStore.getState().playlists.find(x => x.id === item.id)
  const mosaic = p && p.tracks.map(t => t.art).filter(Boolean)
  if (mosaic?.length >= 4) return <div className={cls + ' mosaic'} style={style}>{mosaic.slice(0, 4).map((s, i) => <img key={i} src={s} alt="" />)}</div>
  if (mosaic?.length) return <img className={cls} style={style} src={mosaic[0]} alt="" />
  return <div className={cls + ' art-empty'} style={style}><Icon name="note" size="40%" /></div>
}

// ---------- Slider (seek + volume)
export function Slider({ value, max = 1, onChange, onCommit, label, className = '' }) {
  const ref = useRef()
  const [drag, setDrag] = useState(null)
  const v = drag ?? value
  const pct = max ? Math.min(100, (v / max) * 100) : 0
  const at = e => {
    const r = ref.current.getBoundingClientRect()
    return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * max
  }
  const step = max / 20
  return (
    <div ref={ref} className={`slider ${drag != null ? 'dragging ' : ''}${className}`} role="slider" tabIndex={0}
      aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(v)}
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); const x = at(e); setDrag(x); onChange?.(x) }}
      onPointerMove={e => { if (drag == null) return; const x = at(e); setDrag(x); onChange?.(x) }}
      onPointerUp={e => { if (drag == null) return; const x = at(e); setDrag(null); onCommit?.(x) }}
      onPointerCancel={() => setDrag(null)}
      onKeyDown={e => {
        const d = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
        if (!d) return
        e.preventDefault(); e.stopPropagation()
        const x = Math.min(max, Math.max(0, value + d)); onChange?.(x); onCommit?.(x)
      }}>
      <div className="slider-track"><div className="slider-fill" style={{ width: pct + '%' }} /></div>
      <div className="slider-knob" style={{ left: pct + '%' }} />
    </div>
  )
}

// ---------- Context menu (also used for the app "..." menu)
export function MenuHost() {
  const menu = useStore(s => s.menu)
  if (!menu) return null
  const close = () => useStore.setState({ menu: null })
  return (
    <div className="menu-scrim" onPointerDown={close} onContextMenu={e => { e.preventDefault(); close() }}>
      <MenuList items={menu.items} x={menu.x} y={menu.y} close={close} />
    </div>
  )
}

function MenuList({ items, x, y, close, side }) {
  const ref = useRef()
  const [pos, setPos] = useState({ left: x, top: y, opacity: 0 })
  const [open, setOpen] = useState(null)
  useLayoutEffect(() => {
    const r = ref.current.getBoundingClientRect()
    let left = side ? side.right : x, top = y
    if (left + r.width > innerWidth - 8) left = side ? side.left - r.width : innerWidth - r.width - 8
    if (top + r.height > innerHeight - 8) top = Math.max(8, innerHeight - r.height - 8)
    setPos({ left: Math.max(8, left), top, opacity: 1 })
  }, [x, y])
  useEffect(() => {
    const k = e => e.key === 'Escape' && close()
    addEventListener('keydown', k)
    return () => removeEventListener('keydown', k)
  }, [])
  return (
    <ul ref={ref} className="menu" style={pos} role="menu" onPointerDown={e => e.stopPropagation()} onMouseDown={e => e.preventDefault()}>
      {items.map((it, i) => it === '-' ? <li key={i} className="menu-sep" role="separator" /> : (
        <li key={i} role="menuitem" className={`menu-item${it.disabled ? ' disabled' : ''}${open === i ? ' open' : ''}`}
          onPointerEnter={() => setOpen(it.sub ? i : null)}
          onClick={e => {
            if (it.sub) return setOpen(open === i ? null : i)
            if (it.disabled) return
            close(); it.onClick?.(e)
          }}>
          {it.icon && <Icon name={it.icon} size={16} className={it.checked ? 'green' : ''} />}
          <span className="menu-label">{it.label}</span>
          {it.shortcut && <span className="menu-kbd">{it.shortcut}</span>}
          {it.checked && !it.icon && <Icon name="check" size={16} />}
          {it.sub && <Icon name="right" size={16} />}
          {it.sub && open === i && <SubMenu items={it.sub} close={close} />}
        </li>
      ))}
    </ul>
  )
}
function SubMenu({ items, close }) {
  const anchor = useRef()
  const [r, setR] = useState(null)
  useLayoutEffect(() => setR(anchor.current.parentElement.getBoundingClientRect()), [])
  return <span ref={anchor}>{r && <MenuList items={items} x={r.right} y={r.top - 4} side={r} close={close} />}</span>
}

export function trackMenu(t, { playlistId } = {}) {
  const s = useStore.getState()
  const liked = s.liked.some(x => x.id === t.id)
  return [
    { label: 'Add to playlist', icon: 'plus', sub: [
      { label: 'New playlist', icon: 'plus', onClick: () => s.createPlaylist([t]) },
      ...(s.playlists.length ? ['-'] : []),
      ...s.playlists.map(p => ({ label: p.name, onClick: () => s.addToPlaylist(p.id, [t]) })),
    ] },
    playlistId && { label: 'Remove from this playlist', icon: 'trash', onClick: () => s.removeFromPlaylist(playlistId, t.id) },
    { label: liked ? 'Remove from your Liked Songs' : 'Save to your Liked Songs', icon: liked ? 'check' : 'addCircle', onClick: () => s.toggleLike(t) },
    { label: 'Add to queue', icon: 'queue', onClick: () => addToQueue([t]) },
    '-',
    { label: 'Show lyrics', icon: 'mic', onClick: () => { if (useStore.getState().current?.id !== t.id) playContext([t], 0); s.go({ name: 'lyrics' }) } },
  ].filter(Boolean)
}

// ---------- Small pieces
// "Now playing" marker: a paw whose toe beans tap in turn.
export function Eq() {
  return (
    <svg className="eq" viewBox="0 0 16 16" width="14" height="14" role="img" aria-label="Now playing">
      <ellipse cx="8" cy="11.2" rx="4.2" ry="3.5" />
      <circle className="toe" cx="2.9" cy="6.6" r="1.75" /><circle className="toe" cx="6.1" cy="3.4" r="1.85" />
      <circle className="toe" cx="9.9" cy="3.4" r="1.85" /><circle className="toe" cx="13.1" cy="6.6" r="1.75" />
    </svg>
  )
}

export function LikeButton({ track, size = 16, always }) {
  const liked = useStore(s => !!track && s.liked.some(x => x.id === track.id))
  if (!track) return null
  return (
    <button className={`icon-btn like ${liked ? 'on' : ''} ${always ? 'always' : ''}`} aria-label={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
      title={liked ? 'Remove from Liked Songs' : 'Save to Liked Songs'} onClick={e => { e.stopPropagation(); useStore.getState().toggleLike(track) }}>
      <Icon name={liked ? 'check' : 'addCircle'} size={size} />
    </button>
  )
}

export function BigPlay({ item, size = 56, className = '' }) {
  const active = useStore(s => s.playing && s.ctx?.kind === item.kind && s.ctx?.id === item.id)
  return (
    <button className={`big-play ${className}`} style={{ width: size, height: size }} aria-label={active ? 'Pause' : 'Play'}
      onClick={e => { e.stopPropagation(); playItem(item) }}>
      <Icon name={active ? 'pause' : 'play'} size={size * 0.43} />
    </button>
  )
}

// ---------- Cards & shelves
export function Card({ item, onClick }) {
  const go = useStore(s => s.go)
  return (
    <div className="card" role="link" tabIndex={0} onClick={onClick || (() => go(routeOf(item)))}
      onKeyDown={e => e.key === 'Enter' && (onClick || (() => go(routeOf(item))))()}>
      <div className="card-art">
        <Art item={item} />
        <BigPlay item={item} size={48} className="card-play" />
      </div>
      <div className="card-title">{item.name}</div>
      <div className="card-sub">{item.sub}</div>
    </div>
  )
}

export function Shelf({ title, items, onShowAll, children }) {
  if (!items?.length && !children) return null
  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2>{onShowAll ? <a onClick={onShowAll}>{title}</a> : title}</h2>
        {onShowAll && <a className="show-all" onClick={onShowAll}>Show all</a>}
      </header>
      {children || <div className="card-row">{items.map(it => <Card key={it.kind + it.id} item={it} />)}</div>}
    </section>
  )
}

// ---------- Track list (playlist table, search songs, artist popular)
export function TrackList({ tracks, ctx, playlistId, showAlbum = true, showAdded, header = true, limit, onPlay }) {
  const current = useStore(s => s.current)
  const playing = useStore(s => s.playing)
  const openMenu = useStore(s => s.openMenu)
  const mobile = useMobile()
  const [sel, setSel] = useState(null)
  const list = limit ? tracks.slice(0, limit) : tracks
  const cols = showAlbum && !mobile ? (showAdded ? 'cols-5' : 'cols-4') : 'cols-3'
  const play = i => onPlay ? onPlay(i) : (current?.id === list[i].id && ctx?.id === useStore.getState().ctx?.id ? toggle() : playContext(tracks, i, ctx))
  return (
    <div className={`tracklist ${cols}`} role="grid">
      {header && !mobile && (
        <div className="tl-row tl-head" role="row">
          <span>#</span><span>Title</span>{showAlbum && <span>Album</span>}{showAlbum && showAdded && <span>Date added</span>}
          <span className="tl-dur"><Icon name="clock" size={16} /></span>
        </div>
      )}
      {list.map((t, i) => {
        const isCur = current?.id === t.id
        return (
          <div key={t.id + i} role="row" className={`tl-row${isCur ? ' current' : ''}${sel === i ? ' selected' : ''}`}
            onClick={() => (mobile ? play(i) : setSel(i))} onDoubleClick={() => play(i)}
            onContextMenu={e => openMenu(e, trackMenu(t, { playlistId }))}>
            {!mobile && (
              <span className="tl-num">
                {isCur && playing ? <Eq /> : <span className="n">{i + 1}</span>}
                <button className="tl-play" aria-label={`Play ${t.title}`} onClick={e => { e.stopPropagation(); play(i) }}>
                  <Icon name={isCur && playing ? 'pause' : 'play'} size={16} />
                </button>
              </span>
            )}
            <span className="tl-title">
              <TrackArt track={t} />
              <span className="tl-text">
                <span className="tl-name">{t.title}</span>
                <span className="tl-artist">
                  {t.artist}
                </span>
              </span>
            </span>
            {showAlbum && !mobile && <span className="tl-album">{t.album}</span>}
            {showAlbum && showAdded && !mobile && <span className="tl-added">{t.addedAt ? ago(t.addedAt) : ''}</span>}
            <span className="tl-dur">
              {!mobile && <LikeButton track={t} />}
              {!mobile && <span className="d">{fmt(t.duration)}</span>}
              <button className="icon-btn tl-more" aria-label="More options" onClick={e => { e.stopPropagation(); openMenu(e, trackMenu(t, { playlistId })) }}>
                <Icon name="dots" size={16} />
              </button>
            </span>
          </div>
        )
      })}
    </div>
  )
}

export function TrackArt({ track, size }) {
  const src = useArt(track)
  return src ? <img className="art" src={src} alt="" loading="lazy" style={size && { width: size, height: size }} />
    : <div className="art art-empty" style={size && { width: size, height: size }}><Icon name="note" size={16} /></div>
}

export function Toast() {
  const toast = useStore(s => s.toast)
  return toast ? <div className="toast" role="status">{toast}</div> : null
}

export function Spinner() { return <div className="spinner" aria-label="Loading" /> }
