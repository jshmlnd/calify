// Listen together sessions on private Supabase Realtime channels (migration 20261118000000_together_private.sql):
// - together:CODE:lobby  any signed-in user while the session is active: join-req → host, join-ans → joiner.
// - together:CODE        host + session_members only: presence { id, name, avatar_path, role } and
//                         chat, queue-req, queued, now, library-req, library, rtc, end.
// - user:<id>            only that user: `invite` { code, from } from together_invite (migration 20261118000001).
// Clients can't broadcast directly: every send goes through the together_send RPC, which checks the sender's
// role, rate-limits, and stamps `from` with the sender's user id (so `from` can be trusted here).
import { supabase } from '../supabase'
import { useStore } from '../store'
import { audio, addToQueue, usePos } from '../player'
import { resizeImage } from '../image'
import { newCode, normalizeCode } from './codes'
import { JOIN_TIMEOUT_MS, hostGone, canQueue, cleanChat, queueFull } from './rules'
import { membersFrom, forMe, joinDecision, joinError, chatMsg, addChat, libraryMeta, chunks, libraryPart, hostPos, nextMeta, artOf } from './state'
import * as rtc from './rtc'

const S = () => useStore.getState()
const T = () => S().together
const setT = patch => useStore.setState(s => s.together ? { together: { ...s.together, ...(typeof patch === 'function' ? patch(s.together) : patch) } } : s)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const OFFLINE = "Couldn't reach Calify. Check your connection."
const fromHost = list => list.map(t => ({ ...t, fromHost: true }))   // metadata only: can't be played, liked or saved here

let ch, lobby, me, meta, code, sessionId, busy, waiting, libTimer, timers = [], hooks = [], libBuf = [], hostSeenAt = 0, lastQueue = 0
const memberIds = new Set()     // host: listeners it let in or invited (mirrors session_members)
const invited = new Set()       // host: invited, not yet joined
const libSending = new Set()    // host: one library send in flight per listener

// Resolves to null, or the error (callers that care check it).
const send = (event, payload = {}) => supabase.rpc('together_send', { p_code: code, p_event: event, p_payload: payload })
  .then(({ error }) => error, e => e)
const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id }
const every = (fn, ms) => timers.push(setInterval(fn, ms))
const profileName = id => supabase.from('profiles').select('name').eq('id', id).maybeSingle()
  .then(({ data }) => String(data?.name ?? '').slice(0, 40) || 'Someone', () => 'Someone')
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

// Host: the current song's art as a small inline image, made once per song and sent once per song
// (again when someone new arrives); 5-second progress updates go without it.
let art = { id: null, url: null }, artSent = null
const dataUrl = b => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = no; r.readAsDataURL(b) })
async function prepArt(t) {
  if (!t || art.id === t.id) return
  const mine = art = { id: t.id, url: null }, src = S().localArt[t.id] || t.art
  if (!src) return
  mine.url = artOf(await fetch(src).then(r => r.blob()).then(b => resizeImage(b, 200)).then(dataUrl).catch(() => null))
  if (mine.url && art === mine && S().current?.id === t.id) sendNow()
}
function nowMsg() {
  const { current, upNext } = S()
  prepArt(current)
  const withArt = current && art.id === current.id && art.url && artSent !== current.id
  if (withArt) artSent = current.id
  return { track: current ? libraryMeta([current])[0] : null, art: withArt ? art.url : null, next: nextMeta(upNext), playing: !audio.paused, t: audio.currentTime || 0 }
}
function sendNow() {
  if (T()?.role !== 'host') return
  const m = nowMsg()
  send('now', m).then(e => e && m.art && (artSent = null))   // art didn't go: try again with the next update
}

function onChat(p) {
  const m = chatMsg(p, T().hostId, nameOf(p.from))
  if (m) setT(t => ({ chat: addChat(t.chat, m) }))
}

// Presence is only writable by members (RLS); the host also filters it by who it actually let in.
function onPresence() {
  const t = T()
  if (!t || !ch) return
  const all = membersFrom(ch.presenceState(), t.hostId)
  const members = t.role === 'host' ? all.filter(m => m.id === me.id || memberIds.has(m.id)) : all
  setT({ members })
  if (t.role !== 'host') return
  // A listener appears on the main channel once let in (or back after a drop): send them audio.
  for (const m of members) if (m.id !== me.id && !rtc.hasPeer(m.id)) { rtc.offerTo(m.id); artSent = null; sendNow() }
}

// ---- main channel (ignored until we're in: host started, or listener let in)
const on = {
  chat: onChat,
  queued: onChat,
  'queue-req': p => {
    if (T().role !== 'host' || !memberIds.has(p.from)) return
    const lib = S().local
    if (!canQueue(new Set(lib.map(t => t.id)), p.trackId) || queueFull(S().upNext, p.from)) return
    const track = lib.find(t => t.id === p.trackId), name = nameOf(p.from)
    addToQueue([{ ...track, addedById: p.from }], name)
    event(`${name} queued "${track.title}"`, 'queued')
  },
  'library-req': async p => {
    if (T().role !== 'host' || !memberIds.has(p.from) || libSending.has(p.from)) return
    libSending.add(p.from)
    try {
      const parts = chunks(libraryMeta(S().local))
      // shortcut: paced to stay under Realtime's message rate; fine to ~20k songs.
      for (let part = 0; part < parts.length && T(); part++) {
        if (await send('library', { to: p.from, part, parts: parts.length, tracks: parts[part] })) return send('library', { to: p.from, failed: true })
        await sleep(100)
      }
    } finally { libSending.delete(p.from) }
  },
  library: p => {
    if (T().role !== 'listener' || !forMe(p, me.id) || p.from !== T().hostId) return
    if (p.failed || !Array.isArray(p.tracks)) { libBuf = []; return setT({ libError: true }) }
    const r = libraryPart(libBuf, { part: +p.part, parts: +p.parts, tracks: p.tracks })
    libBuf = r.buf
    if (r.lib) { clearTimeout(libTimer); setT({ hostLibrary: fromHost(libraryMeta(r.lib)), libError: false }) }
  },
  now: p => {
    if (T().role !== 'listener' || p.from !== T().hostId) return
    const prev = S().current, same = prev?.id === String(p.track?.id)
    const pic = artOf(p.art) || (same ? prev.art : null)   // art comes once per song
    // Keep the object while nothing changed, so the UI doesn't churn every 5 s.
    const track = !p.track?.id ? null : same && prev.art === pic ? prev : { ...fromHost(libraryMeta([p.track]))[0], art: pic }
    const hostNow = { track, next: nextMeta(p.next), playing: !!p.playing, t: Number(p.t) || 0, at: Date.now() }
    setT({ hostNow })
    // Mirror into the player state so the player bar, Now Playing and lyrics show the host's song
    // (store.js persists the listener's own track instead).
    useStore.setState({ current: track, playing: hostNow.playing })
    usePos.setState({ t: hostNow.t, d: track?.duration || 0 })
  },
  rtc: p => {
    if (!forMe(p, me.id)) return
    if (T().role === 'host' ? memberIds.has(p.from) : p.from === T().hostId) rtc.signal(p)
  },
  end: p => {
    if (T().role === 'listener' && p.from === T().hostId) return ended()
    if (T().role === 'host' && memberIds.has(p.from)) {   // a listener left
      event(`${nameOf(p.from)} left`)
      memberIds.delete(p.from)
      rtc.closePeer(p.from)
      supabase.from('session_members').delete().match({ session_id: sessionId, user_id: p.from }).then(() => {}, () => {})
      onPresence()
    }
  },
}

// ---- lobby (host side)
const lobbyOn = {
  'join-req': async p => {
    if (T()?.role !== 'host') return
    const d = joinDecision([{ id: me.id }, ...[...memberIds].map(id => ({ id }))], p.from)
    if (d === 'full') return send('join-ans', { to: p.from, ok: false, reason: 'full' })
    if (d === 'member') {   // invited (pre-approved, whatever the payload says), or a rejoin: fresh audio once they're in presence
      rtc.closePeer(p.from)
      send('join-ans', { to: p.from, ok: true })
      if (invited.delete(p.from)) event(`${await profileName(p.from)} joined`)
      return
    }
    // The name the host approves comes from profiles by the server-stamped `from`, never from the payload.
    const req = { id: String(p.from), name: await profileName(p.from) }
    if (T()?.role !== 'host') return
    setT(t => ({ pending: [...t.pending.filter(x => x.id !== req.id), req] }))
    later(() => setT(t => ({ pending: t.pending.filter(x => x !== req) })), JOIN_TIMEOUT_MS)
  },
}

async function open(topic, handlers) {
  await supabase.realtime.setAuth()   // private channels are authorized with the user's JWT
  const c = supabase.channel(topic, { config: { private: true, presence: { key: me.id } } })
  // realtime.send also echoes to the sender; skip our own.
  for (const [name, fn] of Object.entries(handlers)) c.on('broadcast', { event: name }, ({ payload }) => payload && payload.from !== me.id && (handlers !== on || T()) && fn(payload))
  if (handlers === on) c.on('presence', { event: 'sync' }, onPresence)
  await new Promise((res, rej) => c.subscribe(st => {
    if (st === 'SUBSCRIBED') { res(); if (handlers === on && meta) c.track(meta) }   // (re-)track on every join
    else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') rej(new Error(OFFLINE))
  }))
  return c
}

async function teardown() {
  timers.forEach(clearTimeout); timers = []
  hooks.forEach(([e, fn]) => audio.removeEventListener(e, fn)); hooks = []
  rtc.close()
  const cs = [ch, lobby], t = T()
  ch = lobby = meta = waiting = null; libBuf = []; art = { id: null, url: null }; artSent = null
  memberIds.clear(); invited.clear(); libSending.clear()
  if (t?.role === 'listener') {
    useStore.setState({ current: t.saved, playing: false })
    usePos.setState({ t: audio.currentTime || 0, d: Number.isFinite(audio.duration) ? audio.duration : t.saved?.duration || 0 })
  }
  useStore.setState({ together: null })
  for (const c of cs) if (c) await supabase.removeChannel(c).catch(() => {})
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
  code = row.code
  useStore.setState({ together: { code, role: 'host', hostId: me.id, members: [me], pending: [], chat: [], hostLibrary: null, libError: false, hostNow: null, saved: null } })
  meta = { ...me, role: 'host' }
  rtc.init(m => send('rtc', m), 'host')
  try {
    ch = await open(`together:${code}`, on)
    lobby = await open(`together:${code}:lobby`, lobbyOn)
  } catch (e) { await leaveSession(); throw e }
  for (const e of ['loadedmetadata', 'playing', 'pause', 'seeked']) { audio.addEventListener(e, sendNow); hooks.push([e, sendNow]) }
  every(() => !audio.paused && sendNow(), 5000)   // progress for listeners, and catches late joiners
  return code
})

export async function answerJoin(userId, allow) {
  const t = T()
  if (t?.role !== 'host') return
  const req = t.pending.find(x => x.id === userId)
  setT(t => ({ pending: t.pending.filter(x => x.id !== userId) }))
  if (!allow) return send('join-ans', { to: userId, ok: false })
  // The member row is what lets them read the main channel; the DB caps it at 4 listeners.
  const { error } = await supabase.from('session_members').insert({ session_id: sessionId, user_id: userId })
  if (error?.hint === 'full') return send('join-ans', { to: userId, ok: false, reason: 'full' })
  if (error && error.code !== '23505') return S().toastMsg("Couldn't let them in. Check your connection.")
  memberIds.add(userId)
  invited.delete(userId)
  await send('join-ans', { to: userId, ok: true })
  event(`${req?.name || 'Someone'} joined`)   // audio starts when they show up in presence (onPresence)
}

// Pre-approves someone the host follows (together_invite adds their member row) and pings their user channel.
// Not taken up within JOIN_TIMEOUT_MS, the invite lapses and their row goes, so it doesn't hold a seat.
export async function inviteUser(userId) {
  if (T()?.role !== 'host') throw new Error('Start a session first')
  if (memberIds.has(userId)) throw new Error(invited.has(userId) ? 'Already invited' : "They're already here")
  const { error } = await supabase.rpc('together_invite', { p_target: userId }).then(r => r, e => ({ error: e }))
  if (error) throw new Error(error.hint === 'full' ? 'Session is full' : error.hint === 'rate' ? 'Wait a moment, then try again' : error.code === '42501' ? error.message : OFFLINE)
  memberIds.add(userId); invited.add(userId)
  const sid = sessionId
  later(() => {
    if (!invited.delete(userId)) return
    memberIds.delete(userId)
    supabase.from('session_members').delete().match({ session_id: sid, user_id: userId }).then(() => {}, () => {})
  }, JOIN_TIMEOUT_MS)
}

// ---- listener
// invited: answering an invite (the host lets invitees straight in; it checks its own list, not this flag).
export const joinSession = once(async (input, { invited } = {}) => {
  if (T()) throw new Error('Leave this session first')
  const c = normalizeCode(input)
  if (!c) throw new Error("That doesn't look like a session code")
  me = self()
  const { data, error } = await supabase.rpc('session_lookup', { p_code: c })
  if (error) throw new Error(OFFLINE)
  const row = data?.[0]
  if (!row) throw new Error('No session with that code')
  if (row.host === me.id) throw new Error("That's your own session")
  code = c

  const answered = new Promise(r => { waiting = r })
  try {
    lobby = await open(`together:${code}:lobby`, { 'join-ans': p => forMe(p, me.id) && p.from === row.host && waiting?.(p) })
  } catch (e) { await teardown(); throw e }
  if (!waiting) return teardown()   // cancelled while the lobby was opening
  const sent = await send('join-req', { name: me.name, avatar_path: me.avatar_path, invited: !!invited })
  if (sent) { await teardown(); throw new Error(sent.hint === 'rate' ? 'Wait a moment, then try again' : OFFLINE) }
  const timer = later(() => waiting?.(null), JOIN_TIMEOUT_MS)
  const ans = await answered
  clearTimeout(timer)
  if (ans?.reason === 'cancelled') return teardown()
  const err = joinError(ans)
  if (err) { await teardown(); throw new Error(err) }

  // Let in: we're now in session_members, so the main channel authorizes us.
  waiting = null
  const saved = S().current
  audio.pause()
  useStore.setState({ together: { code, role: 'listener', hostId: row.host, members: [], pending: [], chat: [], hostLibrary: null, libError: false, hostNow: null, saved } })
  rtc.init(m => send('rtc', m), 'listener')
  meta = { ...me, role: 'listener' }
  try { ch = await open(`together:${code}`, on) } catch (e) { await teardown(); throw e }
  supabase.removeChannel(lobby).catch(() => {}); lobby = null
  hostSeenAt = Date.now()
  every(() => {
    const t = T()
    if (t?.hostNow?.playing) usePos.setState({ t: hostPos(t.hostNow, Date.now()) })
    // The host vanished from presence (crash, killed, lost network) for HOST_GONE_MS → over.
    if (Object.values(ch?.presenceState() || {}).flat().some(m => m.id === t?.hostId)) hostSeenAt = Date.now()
    else if (hostGone(hostSeenAt, Date.now())) ended()
  }, 500)
})

export function sendChat(text) {
  const t = T(), clean = cleanChat(text)
  if (!t || !clean) return
  const m = { id: Math.random().toString(36).slice(2), from: me.id, name: me.name, text: clean, at: Date.now(), kind: 'msg' }
  setT(t => ({ chat: addChat(t.chat, m) }))
  send('chat', m).then(e => e?.hint === 'rate' && S().toastMsg('Slow down a little'))
}

export async function requestQueue(trackId) {
  if (T()?.role !== 'listener') return
  if (Date.now() - lastQueue < 2000) return S().toastMsg('Wait a moment, then try again')
  lastQueue = Date.now()
  const e = await send('queue-req', { trackId })
  S().toastMsg(e ? (e.hint === 'rate' ? 'Wait a moment, then try again' : OFFLINE) : 'Sent to the host')
}
// The host answers in parts; no complete library within 30 s (host gone quiet, a send refused) shows an error.
export async function requestLibrary() {
  if (T()?.role !== 'listener') return
  libBuf = []
  clearTimeout(libTimer)
  setT({ libError: false })
  const e = await send('library-req')
  if (e) { setT({ libError: true }); return e.hint === 'rate' && S().toastMsg('Wait a moment, then try again') }
  libTimer = later(() => T() && !T().hostLibrary && setT({ libError: true }), 30000)
}

// ---- leaving: the host ends it for everyone; a listener just goes.
export async function leaveSession() {
  if (waiting) { const w = waiting; waiting = null; return w({ ok: false, reason: 'cancelled' }) }   // still joining: joinSession tears down
  const t = T()
  if (!t) return
  await send('end')
  await ch?.untrack().catch(() => {})
  await teardown()
  if (t.role === 'host') await supabase.from('sessions').update({ ended_at: new Date().toISOString() }).eq('id', sessionId).then(() => {}, () => {})
}

// Signing out or switching account leaves the session; closing the window tells the others right away.
useStore.subscribe((s, p) => s.user?.id !== p.user?.id && T() && leaveSession())
useStore.subscribe((s, p) => s.upNext !== p.upNext && sendNow())   // listeners see the host's Up Next
addEventListener('pagehide', () => T() && send('end'))

// ---- invites: user:<my id>, only while signed in and the app is visible (battery: no idle socket in the background).
let inv, invFor
async function syncInvites() {
  const uid = supabase && document.visibilityState === 'visible' ? S().user?.id || null : null
  if (uid === invFor) return
  invFor = uid
  if (inv) { const c = inv; inv = null; await supabase.removeChannel(c).catch(() => {}) }
  if (!uid) return
  await supabase.realtime.setAuth().catch(() => {})
  if (invFor !== uid || inv) return   // changed while we waited
  inv = supabase.channel(`user:${uid}`, { config: { private: true } })
    .on('broadcast', { event: 'invite' }, ({ payload }) => onInvite(payload))
    .subscribe()
}
async function onInvite(p) {
  const c = normalizeCode(p?.code)
  if (!c || T() || typeof p.from !== 'string') return
  const invite = { code: c, from: p.from, name: await profileName(p.from) }
  useStore.setState({ invite })
  setTimeout(() => S().invite === invite && useStore.setState({ invite: null }), JOIN_TIMEOUT_MS)   // the host's invite lapses then too
}
document.addEventListener('visibilitychange', syncInvites)
useStore.subscribe((s, p) => s.user?.id !== p.user?.id && syncInvites())
syncInvites()
