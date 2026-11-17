// Profiles and their images (Supabase). Callers only reach this when signed in.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useStore } from './store'
import { resizeImage } from './image'
import { cleanPatch, lastPlayedOf, lastPlayedPlan, fresh, splitPath, SIGN_SECONDS } from './profiledata.js'

const me = () => useStore.getState().user?.id
const must = ({ data, error }) => { if (error) throw error; return data }

export async function getProfile(id) {
  const p = must(await supabase.from('profiles').select('*').eq('id', id).maybeSingle())
  if (!p) throw new Error('This profile doesn’t exist')
  if (id === me()) useStore.setState({ profile: p })
  return p
}

// Upsert: the sign-up trigger makes the row, but an account older than it would have none.
export async function saveProfile(patch) {
  const p = must(await supabase.from('profiles').upsert({ ...cleanPatch(patch), id: me(), updated_at: new Date().toISOString() }).select().single())
  useStore.setState({ profile: p })
  return p
}

// Task 8/9 make these lists; for now the header shows the numbers.
export async function getCounts(id) {
  const n = (table, col) => supabase.from(table).select('*', { count: 'exact', head: true }).eq(col, id).then(r => { must(r); return r.count })
  const [playlists, followers, following] = await Promise.all([n('public_playlists', 'owner'), n('follows', 'followee'), n('follows', 'follower')])
  return { playlists, followers, following }
}

const BUCKET = { avatar: 'avatars', background: 'backgrounds', cover: 'covers' }
// A fresh name per upload, so a cached signed URL never shows the old picture.
export async function uploadImage(kind, blob) {
  const bucket = BUCKET[kind], name = `${me()}/${kind}-${Date.now().toString(36)}.webp`
  must(await supabase.storage.from(bucket).upload(name, blob, { contentType: blob.type || 'image/webp' }))
  return `${bucket}/${name}`
}
export const removeImage = path => path && supabase.storage.from(splitPath(path)[0]).remove([splitPath(path)[1]]).catch(() => {})

const urls = new Map() // path -> { url: Promise<string>, exp }
export function imageUrl(path) {
  const hit = urls.get(path)
  if (fresh(hit, Date.now())) return hit.url
  const [bucket, name] = splitPath(path)
  const url = supabase.storage.from(bucket).createSignedUrl(name, SIGN_SECONDS).then(r => must(r).signedUrl)
  url.catch(() => urls.delete(path))
  urls.set(path, { url, exp: Date.now() + SIGN_SECONDS * 1000 })
  return url
}
export function useImageUrl(path) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let on = true
    setUrl(null)
    if (path && supabase) imageUrl(path).then(u => on && setUrl(u), () => {})
    return () => { on = false }
  }, [path])
  return url
}

// Called from player.load. Saves only once a track has stayed current for 5 s, so skip bursts cost nothing.
let timer, last = null, turn = 0 // last: what was saved this session
export async function setLastPlayed(track) {
  clearTimeout(timer)
  timer = setTimeout(() => saveLastPlayed(track).catch(() => {}), 5000)
}
async function saveLastPlayed(track) {
  const s = useStore.getState()
  const plan = lastPlayedPlan({ signedIn: !!(supabase && s.user), privateSession: s.privateSession, online: navigator.onLine, track, prev: last })
  if (!plan) return
  const my = ++turn, src = s.localArt[track.id] || track.art
  let art = plan === 'reuse' ? last.art_path : null
  // Local art is a blob URL; fetch turns it (or any URL) back into a blob to shrink and upload.
  if (plan === 'upload' && src) art = await fetch(src).then(r => r.blob()).then(b => resizeImage(b, 300)).then(b => uploadImage('cover', b)).catch(() => null)
  if (my !== turn) return plan === 'upload' && removeImage(art) // a slow upload was overtaken by the next save
  const old = useStore.getState().profile?.last_played?.art_path
  await saveProfile({ last_played: lastPlayedOf(track, art) })
  last = { id: track.id, artist: track.artist, album: track.album, art_path: art }
  if (old !== art) removeImage(old)
}
