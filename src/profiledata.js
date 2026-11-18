// Profile rules shared by social.js and the edit dialog. Node-importable (tests/profile.test.js).
import { THEMES } from './theme.js'

export const SIGN_SECONDS = 86400, HOUR = 3600e3
// Stored paths are "<bucket>/<uid>/<file>" so one string locates the object.
export const splitPath = p => { const i = p.indexOf('/'); return [p.slice(0, i), p.slice(i + 1)] }
// Cached signed URL is reused until 1 h before it expires.
export const fresh = (hit, now) => !!hit && now < hit.exp - HOUR

// Mirrors the profiles table checks so errors read well instead of coming back as Postgres codes.
export function cleanPatch(patch) {
  const out = { ...patch }
  if ('name' in out) {
    out.name = String(out.name ?? '').trim()
    if (!out.name || out.name.length > 40) throw new Error('Name must be 1–40 characters')
  }
  if ('bio' in out) {
    out.bio = String(out.bio ?? '').trim()
    if (out.bio.length > 160) throw new Error('Bio must be 160 characters or fewer')
  }
  if ('theme' in out && !THEMES.includes(out.theme)) throw new Error('Unknown theme')
  if ('accent' in out && !/^#[0-9a-f]{6}$/i.test(out.accent)) throw new Error('Pick an accent colour')
  return out
}

// last_played has a 2000-byte check: keep only what the profile shows, cut long tags.
const cut = (s, n) => String(s || '').slice(0, n)
export const lastPlayedOf = (t, art_path = null) => ({ title: cut(t.title, 120), artist: cut(t.artist, 120), art_path })

// setLastPlayed's decision: null = skip, 'reuse' = keep prev's cover (same artist and album), 'upload' = new cover.
// prev is the last saved { uid, id, artist, album, art_path } this session; another account's prev is ignored.
export function lastPlayedPlan({ signedIn, privateSession, online, track, prev: p, uid }) {
  const prev = p?.uid === uid ? p : null
  if (!signedIn || privateSession || online === false || !track || track.id === prev?.id) return null
  return prev?.art_path && track.album && prev.album === track.album && prev.artist === track.artist ? 'reuse' : 'upload'
}

// Escapes ilike wildcards so a search for "50%" matches text, not everything.
export const likeOf = q => `%${q.trim().replace(/[\\%_]/g, '\\$&')}%`

// public_playlists.tracks has no DB size cap: metadata only, at most 500 tracks, strings cut.
export const MAX_PUBLIC_TRACKS = 500
export const publicTracks = tracks => (tracks || []).slice(0, MAX_PUBLIC_TRACKS).map(t => ({
  title: cut(t.title, 200), artist: cut(t.artist, 200), album: cut(t.album, 200), duration: Number.isFinite(t.duration) ? Math.round(t.duration) : 0,
}))

// A playlist's `public` flag is the uid that published it; publish only for that signed-in user and never while offline.
export const canPublish = ({ uid, flag, online = true }) => !!uid && flag === uid && online !== false

// Bug report rules mirror the bug_reports table checks (what 10–2000, expected ≤ 2000).
export const REPORT_GAP = 60e3
export function cleanReport({ what, expected }) {
  what = String(what ?? '').trim(); expected = String(expected ?? '').trim()
  if (what.length < 10 || what.length > 2000) throw new Error('Describe what happened in 10–2000 characters')
  if (expected.length > 2000) throw new Error('What you expected must be 2000 characters or fewer')
  return { what, expected: expected || null }
}
// Seconds left before this device may send another report (0 = go ahead).
export const reportWait = (last, now) => Math.max(0, Math.ceil((last + REPORT_GAP - now) / 1000))
