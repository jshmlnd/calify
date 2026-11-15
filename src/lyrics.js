// Synced lyrics from LRCLIB (public, keyless, CORS-enabled), or a local .lrc/embedded lyric.
const lyricCache = new Map()
export function fetchLyrics(t) {
  if (t.lrc) return Promise.resolve(parseLyrics(t.lrc))
  if (!lyricCache.has(t.id)) lyricCache.set(t.id, (async () => {
    const p = new URLSearchParams({ artist_name: t.artist, track_name: t.title })
    if (t.duration) p.set('duration', Math.round(t.duration))
    let r = await fetch('https://lrclib.net/api/get?' + p)
    let d = r.ok ? await r.json() : null
    if (!d) {
      r = await fetch('https://lrclib.net/api/search?' + new URLSearchParams({ q: `${t.artist} ${t.title}` }))
      const list = r.ok ? await r.json() : []
      d = list.find(x => x.syncedLyrics) || list[0]
    }
    return d ? parseLyrics(d.syncedLyrics || d.plainLyrics) : null
  })().catch(() => { lyricCache.delete(t.id); return null }))
  return lyricCache.get(t.id)
}

// Parses LRC ("[01:02.30] words") or plain text into { synced, lines: [{ t, text }] }.
export function parseLyrics(text) {
  if (!text) return null
  const lines = []
  let synced = false
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)]
    const words = raw.replace(/\[[^\]]*\]/g, '').trim()
    if (stamps.length) {
      synced = true
      for (const s of stamps) lines.push({ t: +s[1] * 60 + +s[2], text: words || '♪' })
    } else if (words) lines.push({ t: null, text: words })
  }
  if (synced) return { synced, lines: lines.filter(l => l.t != null).sort((a, b) => a.t - b.t) }
  return lines.length ? { synced, lines } : null
}
