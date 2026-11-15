import { get, set, del } from 'idb-keyval'
import { parseBlob } from 'music-metadata'

const AUDIO = /\.(mp3|m4a|aac|flac|wav|ogg|oga|opus|webm|wma)$/i
const base = n => n.replace(/\.[^.]+$/, '')
const hash = s => { let h = 5381; for (const c of s) h = (h * 33) ^ c.charCodeAt(0); return (h >>> 0).toString(36) }

// Loads saved local tracks and builds object URLs for their cover art.
export async function loadLocal() {
  const tracks = (await get('localTracks')) || []
  const art = {}
  await Promise.all(tracks.map(async t => {
    const b = await get('art:' + t.id)
    if (b) art[t.id] = URL.createObjectURL(b)
  }))
  return { tracks, art }
}

// shortcut: files are copied into app storage (IndexedDB) so they survive restarts; doubles disk use for huge libraries.
export async function importFiles(fileList, onProgress) {
  const files = [...fileList]
  const lrcs = new Map(files.filter(f => /\.lrc$/i.test(f.name)).map(f => [base(f.name), f]))
  const audio = files.filter(f => f.type.startsWith('audio/') || AUDIO.test(f.name))
  const added = [], art = {}
  for (const [i, f] of audio.entries()) {
    onProgress?.(i + 1, audio.length)
    let meta = {}
    try { meta = await parseBlob(f, { duration: true }) } catch { /* untagged file: fall back to filename */ }
    const c = meta.common || {}
    const id = 'l:' + hash(f.name + f.size)
    const pic = c.picture?.[0]
    const lyric = c.lyrics?.[0]
    const lrcFile = lrcs.get(base(f.name))
    await set('file:' + id, f)
    if (pic) {
      const b = new Blob([pic.data], { type: pic.format })
      await set('art:' + id, b)
      art[id] = URL.createObjectURL(b)
    }
    added.push({
      id, source: 'local',
      title: c.title || base(f.name),
      artist: c.artists?.join(', ') || c.artist || 'Unknown artist',
      album: c.album || 'Local Files',
      duration: meta.format?.duration || 0,
      lrc: lrcFile ? await lrcFile.text() : (typeof lyric === 'string' ? lyric : lyric?.text) || null,
      addedAt: Date.now(),
    })
  }
  const prev = (await get('localTracks')) || []
  const all = [...prev.filter(p => !added.some(a => a.id === p.id)), ...added]
  await set('localTracks', all)
  return { tracks: all, art, count: added.length }
}

export async function removeLocal(id) {
  await Promise.all([del('file:' + id), del('art:' + id)])
  const all = ((await get('localTracks')) || []).filter(t => t.id !== id)
  await set('localTracks', all)
  return all
}

export const localFile = id => get('file:' + id)
