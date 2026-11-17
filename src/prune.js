// Pure: removes tracks (and recents of gone kinds) from every list in the persisted state.
export function dropTracks(s, isGone, goneKinds) {
  const keep = t => !isGone(t)
  const out = { ...s }
  for (const k of ['liked', 'history', 'upNext']) out[k] = (s[k] || []).filter(keep)
  out.playlists = (s.playlists || []).map(p => ({ ...p, tracks: (p.tracks || []).filter(keep) }))
  out.recents = (s.recents || []).filter(i => !goneKinds.has(i.kind))
  out.recentSearches = (s.recentSearches || []).filter(i => !goneKinds.has(i.kind) && (i.kind !== 'track' || keep(i.track)))
  if ((s.ctxTracks || []).some(isGone)) {
    const old = s.ctxTracks[s.order?.[s.pos]]
    out.ctxTracks = s.ctxTracks.filter(keep)
    out.order = [...out.ctxTracks.keys()]
    out.pos = old && keep(old) ? out.ctxTracks.indexOf(old) : -1
  }
  if (s.current && isGone(s.current)) out.current = null
  return out
}
