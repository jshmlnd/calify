// v1 → v2: Audius was removed as a music source, so drop everything that pointed at it (it can't play any more).
const GONE = new Set(['aplaylist', 'artist', 'genre', 'trending', 'underground', 'news'])
const playable = t => !!t && t.source !== 'audius'

export function dropAudius(s) {
  const out = { ...s }
  delete out.saved
  out.liked = (s.liked || []).filter(playable)
  out.history = (s.history || []).filter(playable)
  out.upNext = (s.upNext || []).filter(playable)
  out.playlists = (s.playlists || []).map(p => ({ ...p, tracks: (p.tracks || []).filter(playable) }))
  out.recents = (s.recents || []).filter(i => !GONE.has(i.kind))
  out.recentSearches = (s.recentSearches || []).filter(i => !GONE.has(i.kind) && (i.kind !== 'track' || playable(i.track)))
  out.pinned = (s.pinned || []).filter(id => out.playlists.some(p => p.id === id) || ['liked', 'local', 'sliked'].includes(id) || (s.spotifyPlaylists || []).some(p => p.id === id))
  if (['playlist', 'artist'].includes(s.libFilter)) out.libFilter = null
  // The play-order indexes point into ctxTracks, so a context containing Audius songs is reset rather than filtered.
  if ((s.ctxTracks || []).some(t => !playable(t)) || GONE.has(s.ctx?.kind)) Object.assign(out, { ctx: null, ctxTracks: [], order: [], pos: -1 })
  if (s.current && !playable(s.current)) out.current = null
  return out
}
