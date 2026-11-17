// Listen together sessions over a Supabase Realtime channel `together:CALI-0000`:
// presence = members { id, name, avatar_path, role }; broadcast = join-req, join-ans, chat, queue-req, queued, now, library, rtc, end.
import { supabase } from '../supabase'
import { useStore } from '../store'
import { audio, addToQueue, usePos } from '../player'
import { newCode, normalizeCode } from './codes'
import { JOIN_TIMEOUT_MS, hostGone, canQueue, cleanChat } from './rules'
import { membersFrom, forMe, joinDecision, joinError, chatMsg, addChat, libraryMeta, chunks, libraryPart, hostPos } from './state'
import * as rtc from './rtc'

const S = () => useStore.getState()
const T = () => S().together
const setT = patch => useStore.setState(s => s.together ? { together: { ...s.together, ...(typeof patch === 'function' ? patch(s.together) : patch) } } : s)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const OFFLINE = "Couldn't reach Calify. Check your connection."

let ch, me, meta, sessionId, busy, waiting, timers = [], hooks = [], libBuf = [], saved, hostSeenAt = 0

const send = (event, payload = {}) => ch?.send({ type: 'broadcast', event, payload: { ...payload, from: me.id } })
const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id }
const every = (fn, ms) => timers.push(setInterval(fn, ms))
const isMember = id => !!T()?.members.some(m => m.id === id)
const nameOf = id => T()?.members.find(m => m.id === id)?.name || 'Someone'

function self() {
  const { user, profile } = S()
  if (!supabase || !user) throw new Error('Sign in to listen together')
  return { id: user.id, name: profile?.name || user.name || 'Someone', avatar_path: profile?.avatar_path ?? null }
}

// Host-only chat events ("Mia joined"); `queued` is the same message under its own event name.
function event(text, name = 'chat') {
  const m = { id: Math.random().toString(36).slice(2), from: me.id, name: me.name, text, at: Date.now(), kind: 'event' }
  setT(t => ({ chat: addChat(t.chat, m) }))
  send(name, m)
}

// ---- incoming broadcasts (ignored until we're in: host started, or listener allowed)
const nowMsg = () => {
  const { current } = S()
  return { track: current ? libraryMeta([current])[0] : null, playing: !audio.paused, t: audio.currentTime || 0 }
}
const sendNow = () => T()?.role === 'host' && send('now', nowMsg())

function onChat(p) {
  if (!isMember(p.from)) return
  const m = chatMsg(p, T().hostId)
  if (m) setT(t => ({ chat: addChat(t.chat, m) }))
}

const on = {
  'join-req': p => {
    if (T().role !== 'host' || !p.from) return
    const d = joinDecision(T().members, p.from)
    if (d === 'full') return send('join-ans', { to: p.from, ok: false, reason: 'full' })
    if (d === 'member') return admit(p.from)
    const req = { id: String(p.from), name: String(p.name ?? '').slice(0, 40) || 'Someone' }
    setT(t => ({ pending: [...t.pending.filter(x => x.id !== req.id), req] }))
    later(() => setT(t => ({ pending: t.pending.filter(x => x !== req) })), JOIN_TIMEOUT_MS)
  },
  chat: onChat,
  queued: onChat,
  'queue-req': p => {
    if (T().role !== 'host' || !isMember(p.from)) return
    const lib = S().local
    if (!canQueue(new Set(lib.map(t => t.id)), p.trackId)) return
    const track = lib.find(t => t.id === p.trackId), name = nameOf(p.from)
    addToQueue([track], name)
    event(`${name} queued "${track.title}"`, 'queued')
  },
  library: async p => {
    if (T().role === 'host') {
      if (!p.req || !isMember(p.from)) return
      const parts = chunks(libraryMeta(S().local), 200)
      // shortcut: paced so a big library stays under Realtime's per-second message limit; fine to ~20k songs.
      for (let part = 0; part < parts.length && ch; part++) { await send('library', { to: p.from, part, parts: parts.length, tracks: parts[part] }); await sleep(100) }
    } else if (forMe(p, me.id) && p.from === T().hostId && Array.isArray(p.tracks)) {
      const r = libraryPart(libBuf, p)
      libBuf = r.buf
      if (r.lib) setT({ hostLibrary: r.lib })
    }
  },
  now: p => {
    if (T().role !== 'listener' || p.from !== T().hostId) return
    const same = S().current?.id === p.track?.id   // keep the object so the UI doesn't churn every 5 s
    const track = !p.track?.id ? null : same ? S().current : libraryMeta([p.track])[0]
    const hostNow = { track, playing: !!p.playing, t: +p.t || 0, at: Date.now() }
    setT({ hostNow })
    // Mirror into the player state so the player bar, Now Playing and lyrics show the host's song.
    useStore.setState({ current: track, playing: hostNow.playing })
    usePos.setState({ t: hostNow.t, d: track?.duration || 0 })
  },
  rtc: p => forMe(p, me.id) && (T().role === 'host' ? isMember(p.from) : p.from === T().hostId) && rtc.signal(p),
  end: p => {
    if (T().role === 'listener' && p.from === T().hostId) return ended()
    if (T().role === 'host' && isMember(p.from)) { event(`${nameOf(p.from)} left`); rtc.closePeer(p.from) }
  },
}

async function open(code, onAnswer) {
  const c = supabase.channel(`together:${code}`, { config: { broadcast: { self: false }, presence: { key: me.id } } })
  for (const [name, fn] of Object.entries(on)) c.on('broadcast', { event: name }, ({ payload }) => T()?.code === code && payload && fn(payload))
  c.on('broadcast', { event: 'join-ans' }, ({ payload }) => onAnswer?.(payload))
  c.on('presence', { event: 'sync' }, () => T()?.code === code && setT(t => ({ members: membersFrom(c.presenceState(), t.hostId) })))
  ch = c
  await new Promise((res, rej) => c.subscribe(st => {
    if (st === 'SUBSCRIBED') { res(); if (meta) c.track(meta) }   // re-track after a reconnect
    else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') rej(new Error(OFFLINE))
  }))
}

async function teardown() {
  timers.forEach(clearTimeout); timers = []
  hooks.forEach(([e, fn]) => audio.removeEventListener(e, fn)); hooks = []
  rtc.close()
  const c = ch, t = T()
  ch = meta = waiting = null; libBuf = []
  if (t?.role === 'listener' && saved) {
    useStore.setState({ current: saved, playing: false })
    usePos.setState({ t: audio.currentTime || 0, d: Number.isFinite(audio.duration) ? audio.duration : saved?.duration || 0 })
  }
  saved = null
  useStore.setState({ together: null })
  if (c) await supabase.removeChannel(c).catch(() => {})
}

function ended(msg = 'The session ended') {
  teardown()
  S().toastMsg(msg)
}

const once = fn => (...a) => busy || (busy = fn(...a).finally(() => { busy = null }))

// ---- host
export const startSession = once(async () => {
  if (T()) { if (T().role === 'host') return T().code; throw new Error('Leave this session first') }
  me = self()
  let row
  try {
    // One active session per host (DB index), so end one a crash left behind before inserting.
    const { error } = await supabase.from('sessions').update({ ended_at: new Date().toISOString() }).eq('host', me.id).is('ended_at', null)
    if (error) throw error
    for (let i = 0; i < 5 && !row; i++) {
      const { data, error } = await supabase.from('sessions').insert({ code: newCode() }).select('id, code').single()
      if (error && error.code !== '23505') throw error   // 23505: code taken, try another
      row = data
    }
  } catch { throw new Error(OFFLINE) }
  if (!row) throw new Error("Couldn't start a session. Try again.")
  sessionId = row.id
  useStore.setState({ together: { code: row.code, role: 'host', hostId: me.id, members: [me], pending: [], chat: [], hostLibrary: null, hostNow: null } })
  meta = { ...me, role: 'host' }
  try { await open(row.code) } catch (e) { await leaveSession(); throw e }
  rtc.setSend(m => send('rtc', m))
  for (const e of ['loadedmetadata', 'playing', 'pause', 'seeked']) { audio.addEventListener(e, sendNow); hooks.push([e, sendNow]) }
  every(() => !audio.paused && sendNow(), 5000)   // progress for listeners, and catches late joiners
  return row.code
})

function admit(id, name) {
  send('join-ans', { to: id, ok: true })
  rtc.offerTo(id)
  sendNow()
  if (name) event(`${name} joined`)
}

export function answerJoin(userId, allow) {
  const t = T()
  if (t?.role !== 'host') return
  const req = t.pending.find(x => x.id === userId)
  setT(t => ({ pending: t.pending.filter(x => x.id !== userId) }))
  if (!allow) return send('join-ans', { to: userId, ok: false })
  if (joinDecision(t.members, userId) === 'full') return send('join-ans', { to: userId, ok: false, reason: 'full' })
  admit(userId, req?.name || 'Someone')
}

// ---- listener
export const joinSession = once(async input => {
  if (T()) throw new Error('Leave this session first')
  const code = normalizeCode(input)
  if (!code) throw new Error("That doesn't look like a session code")
  me = self()
  const { data: row, error } = await supabase.from('sessions').select('host').eq('code', code).is('ended_at', null).maybeSingle()
  if (error) throw new Error(OFFLINE)
  if (!row) throw new Error('No session with that code')
  if (row.host === me.id) throw new Error("That's your own session")

  const answered = new Promise(r => { waiting = r })
  try { await open(code, p => forMe(p, me.id) && p.from === row.host && waiting?.(p)) } catch (e) { await teardown(); throw e }
  send('join-req', { name: me.name, avatar_path: me.avatar_path })
  const timer = later(() => waiting?.(null), JOIN_TIMEOUT_MS)
  const ans = await answered
  clearTimeout(timer)
  if (ans?.reason === 'cancelled') return
  const err = joinError(ans)
  if (err) { await teardown(); throw new Error(err) }

  // In: set state before anything else so the host's offer (right behind join-ans) is handled.
  waiting = null
  saved = S().current
  audio.pause()
  useStore.setState({ together: { code, role: 'listener', hostId: row.host, members: membersFrom(ch.presenceState(), row.host), pending: [], chat: [], hostLibrary: null, hostNow: null } })
  rtc.setSend(m => send('rtc', m))
  hostSeenAt = Date.now()
  every(() => {
    const t = T()
    if (t?.hostNow?.playing) usePos.setState({ t: hostPos(t.hostNow, Date.now()) })
    // The host vanished from presence (crash, killed, lost network) for HOST_GONE_MS → over.
    if (Object.values(ch?.presenceState() || {}).flat().some(m => m.id === t?.hostId)) hostSeenAt = Date.now()
    else if (hostGone(hostSeenAt, Date.now())) ended()
  }, 500)
  meta = { ...me, role: 'listener' }
  await ch.track(meta)
})

export function sendChat(text) {
  const t = T(), clean = cleanChat(text)
  if (!t || !clean) return
  const m = { id: Math.random().toString(36).slice(2), from: me.id, name: me.name, text: clean, at: Date.now(), kind: 'msg' }
  setT(t => ({ chat: addChat(t.chat, m) }))
  send('chat', m)
}

export const requestQueue = trackId => T()?.role === 'listener' && send('queue-req', { trackId })
export const requestLibrary = () => T()?.role === 'listener' && send('library', { req: true })

// ---- leaving: the host ends it for everyone; a listener just goes.
export async function leaveSession() {
  if (waiting) return waiting({ ok: false, reason: 'cancelled' })   // still waiting for the host: cancel the request
  const t = T()
  if (!t) return
  try { await send('end'); await ch?.untrack() } catch {}
  await teardown()
  if (t.role === 'host') await supabase.from('sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId).then(() => {}, () => {})
}

// Signing out or switching account leaves the session; closing the window tells the others right away.
useStore.subscribe((s, p) => s.user?.id !== p.user?.id && T() && leaveSession())
addEventListener('pagehide', () => T() && send('end'))
