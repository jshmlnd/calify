import { create } from 'zustand'
import { MediaSession } from '@capgo/capacitor-media-session'
import { useStore as S } from './store'
import { localFile } from './local'
import { setLastPlayed } from './social'
import { hostOnly } from './together/rules'

export const audio = new Audio()
audio.preload = 'auto'
if (import.meta.env.DEV) window.__audio = audio
export const usePos = create(() => ({ t: 0, d: 0 }))

let localUrl, token = 0, errors = 0
// Listen together: every playback control below is host-only (keys, media keys and UI all call these).
const guard = fn => hostOnly(S.getState, fn)

async function srcFor(t) {
  if (t.source !== 'local') return t.src
  if (localUrl) URL.revokeObjectURL(localUrl)
  const f = await localFile(t.id)
  return (localUrl = f ? URL.createObjectURL(f) : '')
}

export async function load(track, autoplay = true) {
  const my = ++token
  S.setState({ current: track })
  usePos.setState({ t: 0, d: track.duration || 0 })
  const src = await srcFor(track)
  if (my !== token) return
  if (!src) { S.getState().toastMsg('This file is no longer available'); return }
  audio.src = src
  if (autoplay) audio.play().catch(() => {})
  S.getState().pushHistory(track)
  setLastPlayed(track).catch(() => {})
  setSession(track)
}

// Queue model: a context (playlist/album) in play order, plus a user "Next in queue" list that plays first.
function makeOrder(n, first, shuffle) {
  const idx = [...Array(n).keys()]
  if (!shuffle) return { order: idx, pos: first }
  const rest = idx.filter(i => i !== first)
  for (let i = rest.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [rest[i], rest[j]] = [rest[j], rest[i]] }
  return { order: [first, ...rest], pos: 0 }
}

export const playContext = guard((tracks, start = 0, ctx = null) => {
  if (!tracks?.length) return
  S.setState({ ctxTracks: tracks, ctx, ...makeOrder(tracks.length, start, S.getState().shuffle) })
  if (ctx) S.getState().addRecent(ctx)
  load(tracks[start])
})

export const next = guard((auto = false) => {
  const s = S.getState()
  if (auto && s.repeat === 'one') { seek(0); resume(); return }
  if (s.upNext.length) {
    const [t, ...rest] = s.upNext
    S.setState({ upNext: rest })
    return load(t)
  }
  if (!s.order.length) return
  let pos = s.pos + 1, play = true
  if (pos >= s.order.length) { pos = 0; play = s.repeat !== 'off' }
  S.setState({ pos })
  load(s.ctxTracks[s.order[pos]], play)
})

export const prev = guard(() => {
  const s = S.getState()
  if (usePos.getState().t > 3 || s.pos <= 0) { seek(0); return }
  S.setState({ pos: s.pos - 1 })
  load(s.ctxTracks[s.order[s.pos - 1]])
})

export const toggle = guard(() => {
  const { current } = S.getState()
  if (!current) return
  if (!audio.src) return load(current)
  audio.paused ? audio.play().catch(() => {}) : audio.pause()
})

export const resume = guard(() => audio.play().catch(() => {}))
export const pause = guard(() => audio.pause())
export const seek = guard(t => {
  if (!Number.isFinite(t)) return
  t = Math.max(0, t)
  audio.currentTime = t
})
export const seekBy = guard(d => seek(usePos.getState().t + d))

export const setShuffle = guard(on => {
  const s = S.getState()
  const cur = s.order[s.pos]
  S.setState(cur == null ? { shuffle: on } : { shuffle: on, ...makeOrder(s.ctxTracks.length, cur, on) })
})
export const cycleRepeat = guard(() => S.setState(s => ({ repeat: { off: 'all', all: 'one', one: 'off' }[s.repeat] })))
export const setVolume = v => S.setState({ volume: Math.min(1, Math.max(0, v)), muted: false })

// addedBy: a Listen together listener's name, shown on the Up Next row (their request shows in chat instead of a toast).
export function addToQueue(tracks, addedBy) {
  if (!addedBy && tracks.some(t => t.fromHost)) return S.getState().toastMsg("This song is on the host's device. Use Add to queue in the session.")
  S.setState(s => ({ upNext: [...s.upNext, ...(addedBy ? tracks.map(t => ({ ...t, addedBy })) : tracks)] }))
  if (!addedBy) S.getState().toastMsg('Added to queue')
}
// Listen together host: the × on an Up Next row.
export const removeFromUpNext = i => S.setState(s => ({ upNext: s.upNext.filter((_, k) => k !== i) }))
export const playFromQueue = guard(i => {
  const t = S.getState().upNext[i]
  S.setState(s => ({ upNext: s.upNext.slice(i + 1) }))
  load(t)
})
export const playAtPos = guard(pos => {
  const s = S.getState()
  S.setState({ pos })
  load(s.ctxTracks[s.order[pos]])
})

// Resolve a collection item (card / library row) into tracks and play it.
export async function tracksOf(item) {
  const s = S.getState()
  switch (item.kind) {
    case 'liked': return s.liked
    case 'local': return s.local
    case 'history': return s.history
    case 'playlist': return s.playlists.find(p => p.id === item.id)?.tracks || []
    case 'track': return [item.track]
    default: return []
  }
}
export const playItem = guard(async (item, start = 0) => {
  const s = S.getState()
  if (s.ctx?.kind === item.kind && s.ctx?.id === item.id && s.current) return toggle()
  try {
    const tracks = await tracksOf(item)
    if (!tracks.length) return s.toastMsg('Nothing to play here yet')
    playContext(tracks, start, item)
  } catch { s.toastMsg("Couldn't load that. Check your connection.") }
})

// Listen together host: a captured track goes silent once audio.src changes (checked on Android WebView), so re-capture per src.
let captured, capturedSrc
export function capture() {
  if (captured && capturedSrc === audio.src) return captured
  captured?.getTracks().forEach(t => t.stop())
  capturedSrc = audio.src
  return (captured = audio.captureStream())
}

// ---- audio events
audio.addEventListener('timeupdate', () => usePos.setState({ t: audio.currentTime }))
audio.addEventListener('durationchange', () => Number.isFinite(audio.duration) && usePos.setState({ d: audio.duration }))
audio.addEventListener('playing', () => { errors = 0 })
audio.addEventListener('play', () => { S.setState({ playing: true }); MediaSession.setPlaybackState({ playbackState: 'playing' }).catch(() => {}) })
audio.addEventListener('pause', () => { S.setState({ playing: false }); MediaSession.setPlaybackState({ playbackState: 'paused' }).catch(() => {}) })
audio.addEventListener('ended', () => next(true))
audio.addEventListener('error', () => {
  if (!audio.getAttribute('src')) return
  S.getState().toastMsg("Can't play this song right now")
  if (++errors < 4) setTimeout(() => next(true), 800)  // skip, but don't spin forever when offline
})

const applyVolume = s => { audio.volume = s.muted ? 0 : s.volume }
applyVolume(S.getState())
S.subscribe(applyVolume)

// ---- OS media controls: Windows SMTC / media keys (via Chromium) and Android notification (via plugin)
function setSession(t) {
  const art = S.getState().localArt[t.id] || t.art
  MediaSession.setMetadata({
    title: t.title, artist: t.artist, album: t.album,
    artwork: art && /^https?:/.test(art) ? [{ src: art, sizes: '480x480', type: 'image/jpeg' }] : [],
  }).catch(() => {})
}
const handlers = {
  play: resume, pause, stop: pause,
  nexttrack: () => next(), previoustrack: () => prev(),
  seekforward: () => seekBy(10), seekbackward: () => seekBy(-10),
  seekto: d => seek(d.seekTime),
}
for (const [action, fn] of Object.entries(handlers)) MediaSession.setActionHandler({ action }, fn).catch(() => {})
let lastPos = 0
audio.addEventListener('timeupdate', () => {
  if (Math.abs(audio.currentTime - lastPos) < 1 || !Number.isFinite(audio.duration)) return
  lastPos = audio.currentTime
  MediaSession.setPositionState({ duration: audio.duration, position: Math.min(audio.currentTime, audio.duration), playbackRate: 1 }).catch(() => {})
})
