import { dropTracks } from './prune.js'

// v1 → v2: Audius was removed as a music source, so drop everything that pointed at it (it can't play any more).
const GONE = new Set(['aplaylist', 'artist', 'genre', 'trending', 'underground', 'news'])

export function dropAudius(s) {
  const gone = t => !!t && t.source === 'audius'
  // The play-order indexes point into ctxTracks, so an Audius context is reset rather than filtered.
  const reset = (s.ctxTracks || []).some(gone) || GONE.has(s.ctx?.kind)
  const out = dropTracks(s, gone, GONE)
  delete out.saved
  out.pinned = (s.pinned || []).filter(id => out.playlists.some(p => p.id === id) || ['liked', 'local', 'sliked'].includes(id) || (s.spotifyPlaylists || []).some(p => p.id === id))
  if (['playlist', 'artist'].includes(s.libFilter)) out.libFilter = null
  if (reset) Object.assign(out, { ctx: null, ctxTracks: [], order: [], pos: -1 })
  return out
}

// v2 → v3: Spotify (and CSV import) was removed, so drop its songs, collections and settings.
export function dropSpotify(s) {
  const kinds = new Set(['sliked', 'splaylist'])
  const reset = (s.ctxTracks || []).some(t => t?.source === 'spotify') || kinds.has(s.ctx?.kind)
  const out = dropTracks(s, t => !!t && t.source === 'spotify', kinds)
  for (const k of ['spotifyClientId', 'spotifyUser', 'spotifyPlaylists']) delete out[k]
  out.pinned = (s.pinned || []).filter(id => id !== 'sliked' && !(s.spotifyPlaylists || []).some(p => p.id === id))
  if (['calify', 'spotify'].includes(s.libFilter)) out.libFilter = null
  if (reset) Object.assign(out, { ctx: null, ctxTracks: [], order: [], pos: -1 })
  return out
}
