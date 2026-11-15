// Spotify playlist exports (Exportify, TuneMyMusic, …) → rows, and fuzzy matching of a row against a catalog track.

// RFC 4180-ish: quoted fields, "" escapes, commas/newlines inside quotes, CRLF, BOM.
export function parseCsv(text) {
  const rows = []
  let row = [], field = '', quoted = false
  text = text.replace(/^﻿/, '')
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some(f => f !== '')) rows.push(row)
      row = []
    } else field += c
  }
  row.push(field)
  if (row.some(f => f !== '')) rows.push(row)
  return rows
}

const COLS = {
  title: ['track name', 'name', 'title', 'song', 'track'],
  artist: ['artist name(s)', 'artist name', 'artists', 'artist'],
  album: ['album name', 'album'],
  duration: ['duration (ms)', 'duration_ms', 'duration'],
}

// Turn CSV text into [{ title, artist, album, duration (s) }]; null if it doesn't look like a playlist export.
export function readPlaylistCsv(text) {
  const [head, ...rows] = parseCsv(text)
  if (!head) return null
  const h = head.map(x => x.trim().toLowerCase())
  const col = Object.fromEntries(Object.entries(COLS).map(([k, names]) => [k, names.map(n => h.indexOf(n)).find(i => i >= 0) ?? -1]))
  if (col.title < 0) return null
  return rows.map(r => {
    const ms = Number(r[col.duration])
    return {
      title: (r[col.title] || '').trim(),
      artist: (r[col.artist] || '').trim(),
      album: (r[col.album] || '').trim(),
      duration: Number.isFinite(ms) && ms > 0 ? (ms > 10000 ? ms / 1000 : ms) : 0,
    }
  }).filter(r => r.title)
}

// Lowercase, drop accents, "(feat. …)" / "- Remastered 2011" tails and punctuation.
export const norm = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/\s*[([][^)\]]*\b(feat|ft|with|remaster|remastered|version|edit|mix|live|mono|stereo)\b[^)\]]*[)\]]/g, '')
  .replace(/\s+-\s+.*\b(remaster|remastered|version|edit|live|mono|stereo|mix)\b.*$/, '')
  .replace(/[^a-z0-9]+/g, ' ').trim()

const artistsOf = s => (s || '').split(/\s*[,;&]\s*|\s+(?:feat\.?|ft\.?|x|and)\s+/i).map(norm).filter(Boolean)

// 0 = not the same song. Needs a title match and an artist overlap; duration breaks ties.
export function matchScore(row, track) {
  const a = norm(row.title), b = norm(track.title)
  if (!a || !b) return 0
  const title = a === b ? 3 : (b.includes(a) || a.includes(b)) && Math.min(a.length, b.length) >= 4 ? 2 : 0
  if (!title) return 0
  const want = artistsOf(row.artist), have = norm(track.artist)
  const artist = !want.length || want.some(x => have.includes(x) || (have && x.includes(have))) ? 2 : 0
  if (!artist) return 0
  const close = row.duration && track.duration && Math.abs(row.duration - track.duration) <= 10 ? 1 : 0
  return title + artist + close
}

export const bestMatch = (row, tracks) => tracks.reduce((best, t) => {
  const s = matchScore(row, t)
  return s > best.s ? { s, t } : best
}, { s: 0, t: null }).t
