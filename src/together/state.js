// Pure Listen together helpers (node-testable): presence, addressing, chat, library chunks, position, SDP.
import { admit, cleanChat } from './rules.js'

const pick = m => ({ id: m.id, name: m.name, avatar_path: m.avatar_path ?? null })

// channel.presenceState() → members, host first, one row per user.
export function membersFrom(presence, hostId) {
  const seen = new Map()
  for (const metas of Object.values(presence || {})) for (const m of metas) if (m?.id && !seen.has(m.id)) seen.set(m.id, pick(m))
  return [...seen.values()].sort((a, b) => (b.id === hostId) - (a.id === hostId))
}

export const forMe = (msg, me) => !!msg && msg.to === me

// Host's answer to a join-req: a current member (rejoin) is let back in; otherwise ask, unless full.
export const joinDecision = (members, id) => members.some(m => m.id === id) ? 'member' : admit(members.length) === 'full' ? 'full' : 'ask'
export const joinError = ans => ans?.ok ? null : ans?.reason === 'full' ? 'Session is full' : "The host didn't let you in"

// Incoming chat comes from other clients: clean it, and only the host may post events.
export function chatMsg(p, hostId) {
  const text = cleanChat(p?.text)
  if (!text) return null
  return { id: String(p.id ?? Math.random()).slice(0, 40), from: String(p.from), name: String(p.name ?? '').slice(0, 40) || 'Someone', text, at: Number(p.at) || Date.now(), kind: p.kind === 'event' && p.from === hostId ? 'event' : 'msg' }
}
export const addChat = (chat, msg) => [...chat, msg].slice(-200)

// Also used on payloads from the host, so every field is coerced and capped.
const str = v => String(v ?? '').slice(0, 300)
export const libraryMeta = tracks => tracks.map(t => ({ id: str(t?.id), title: str(t?.title), artist: str(t?.artist), album: str(t?.album), duration: Math.max(0, Number(t?.duration) || 0) }))
export const chunks = (list, n) => list.length ? Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n)) : [[]]
// Reassembles `library` parts (in order on one channel); part 0 starts over.
export function libraryPart(buf, { part, parts, tracks }) {
  const next = [...(part === 0 ? [] : buf), ...tracks]
  return part === parts - 1 ? { buf: [], lib: next } : { buf: next, lib: null }
}

// hostNow.at is the listener's own receive time, so clocks needn't agree.
export function hostPos(n, now) {
  if (!n) return 0
  const t = n.t + (n.playing ? (now - n.at) / 1000 : 0)
  return Math.min(t, n.track?.duration || Infinity)
}

// Music, not voice: ask the sender for stereo Opus at up to 128 kbps (applied to the listener's answer).
export function stereo(sdp) {
  const pt = sdp.match(/a=rtpmap:(\d+) opus\/48000/i)?.[1]
  if (!pt) return sdp
  return sdp.replace(new RegExp(`a=fmtp:${pt} [^\r\n]*`), l => l.includes('stereo=') ? l : l + ';stereo=1;sprop-stereo=1;maxaveragebitrate=128000')
}
