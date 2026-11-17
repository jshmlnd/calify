// Profiles and their images (Supabase). Callers only reach this when signed in.
import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useStore } from './store'
import { resizeImage } from './image'
import { Capacitor } from '@capacitor/core'
import { APP_VERSION } from './changelog'
import { cleanReport, reportWait, cleanPatch, publicTracks, canPublish, lastPlayedOf, lastPlayedPlan, likeOf, fresh, splitPath, SIGN_SECONDS } from './profiledata.js'

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

export async function counts(id) {
  const n = (table, col) => supabase.from(table).select('*', { count: 'exact', head: true }).eq(col, id).then(r => { must(r); return r.count })
  const [playlists, followers, following] = await Promise.all([n('public_playlists', 'owner'), n('follows', 'followee'), n('follows', 'follower')])
  return { playlists, followers, following }
}

export const follow = id => supabase.from('follows').insert({ follower: me(), followee: id }).then(must)
export const unfollow = id => supabase.from('follows').delete().eq('follower', me()).eq('followee', id).then(must)
export async function isFollowing(id) {
  return !!must(await supabase.from('follows').select('followee').eq('follower', me()).eq('followee', id).maybeSingle())
}
const LITE = 'id, name, avatar_path'
async function people(col, other, id) {
  const ids = must(await supabase.from('follows').select(other).eq(col, id).order('created_at', { ascending: false })).map(r => r[other])
  if (!ids.length) return []
  const rows = must(await supabase.from('profiles').select(LITE).in('id', ids))
  return ids.map(i => rows.find(r => r.id === i)).filter(Boolean) // keep newest-first
}
export const followers = id => people('followee', 'follower', id)
export const following = id => people('follower', 'followee', id)
export async function searchPeople(q) {
  return must(await supabase.from('profiles').select(LITE).ilike('name', likeOf(q)).neq('id', me()).limit(20))
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
  const uid = me()
  timer = setTimeout(() => saveLastPlayed(track, uid).catch(() => {}), 5000)
}
async function saveLastPlayed(track, uid) {
  const s = useStore.getState()
  if (me() !== uid) return // signed out or switched account while waiting
  const plan = lastPlayedPlan({ signedIn: !!(supabase && s.user), privateSession: s.privateSession, online: navigator.onLine, track, prev: last, uid })
  if (!plan) return
  const my = ++turn, src = s.localArt[track.id] || track.art
  let art = plan === 'reuse' ? last.art_path : null
  // Local art is a blob URL; fetch turns it (or any URL) back into a blob to shrink and upload.
  if (plan === 'upload' && src) art = await fetch(src).then(r => r.blob()).then(b => resizeImage(b, 300)).then(b => uploadImage('cover', b)).catch(() => null)
  // A slow upload was overtaken by the next save, or the account changed meanwhile (saveProfile would write to the new one).
  if (my !== turn || me() !== uid) return plan === 'upload' && removeImage(art)
  const old = useStore.getState().profile?.last_played?.art_path
  await saveProfile({ last_played: lastPlayedOf(track, art) })
  last = { uid, id: track.id, artist: track.artist, album: track.album, art_path: art }
  if (old !== art) removeImage(old)
}

// ---------- Public playlists (metadata only). Published rows are keyed (owner, local_id).
// A playlist's `public` flag holds the uid that published it, so another account on this device never republishes it.
const covers = new Map() // local_id -> id of the track whose art is the uploaded cover
const chain = new Map() // local_id -> tail of that playlist's publish/unpublish queue (they must not overlap)
const serial = (id, fn) => {
  const run = (chain.get(id) || Promise.resolve()).catch(() => {}).then(fn)
  chain.set(id, run)
  return run
}
const mine = (id, uid) => canPublish({ uid: me(), flag: useStore.getState().playlists.find(x => x.id === id)?.public }) && me() === uid
export const publishPlaylist = p => { const uid = me(); return serial(p.id, () => publish(p, uid)) }
async function publish(p, uid) {
  if (!mine(p.id, uid)) return
  const s = useStore.getState()
  const old = must(await supabase.from('public_playlists').select('cover_path').eq('owner', uid).eq('local_id', p.id).maybeSingle())?.cover_path || null
  const first = p.tracks[0], src = first && (s.localArt[first.id] || first.art)
  let cover = old
  if (!old || covers.get(p.id) !== first?.id) {
    cover = null
    if (src) cover = await fetch(src).then(r => r.blob()).then(b => resizeImage(b, 300)).then(b => uploadImage('cover', b)).catch(() => null)
    covers.set(p.id, first?.id)
  }
  // The awaits above can outlast a "Make private", delete or sign-out: don't resurrect the row.
  if (!mine(p.id, uid)) return cover !== old && removeImage(cover)
  try {
    must(await supabase.from('public_playlists').upsert({ owner: uid, local_id: p.id, name: p.name, cover_path: cover, tracks: publicTracks(p.tracks), updated_at: new Date().toISOString() }, { onConflict: 'owner,local_id' }))
  } catch (e) { if (cover !== old) removeImage(cover); throw e }
  if (old && old !== cover) removeImage(old)
}
export const unpublishPlaylist = localId => { const uid = me(); return serial(localId, async () => {
  const rows = must(await supabase.from('public_playlists').delete().eq('owner', uid).eq('local_id', localId).select('cover_path'))
  covers.delete(localId)
  rows?.forEach(r => removeImage(r.cover_path))
}) }
export const publicPlaylists = async userId =>
  must(await supabase.from('public_playlists').select('id, name, cover_path, updated_at').eq('owner', userId).order('updated_at', { ascending: false }))
export const publicPlaylist = async id => must(await supabase.from('public_playlists').select('*').eq('id', id).maybeSingle())

// Keeps published copies in step with the local playlist: publish/unpublish at once on toggle, others debounced 2 s.
// Edits that couldn't go out (offline, signed out) wait in `dirty` for the next sign-in or reconnect.
const timers = new Map(), dirty = new Set()
const toast = m => useStore.getState().toastMsg(m)
const sync = (id, uid) => {
  clearTimeout(timers.get(id)); timers.delete(id)
  const p = useStore.getState().playlists.find(x => x.id === id)
  if (!p || me() !== uid) return
  if (!canPublish({ uid, flag: p.public, online: navigator.onLine })) return void (p.public === uid && dirty.add(id))
  dirty.delete(id)
  publishPlaylist(p).catch(e => { dirty.add(id); navigator.onLine && toast(e.message || "Couldn't update the public playlist") })
}
const flush = () => { const uid = me(); uid && [...dirty].forEach(id => sync(id, uid)) }
const clearTimers = () => { timers.forEach(clearTimeout); timers.clear() }
if (supabase) {
  addEventListener('online', flush)
  useStore.subscribe((s, prev) => {
    const uid = s.user?.id
    if (uid !== prev.user?.id) { clearTimers(); flush() }
    if (s.playlists === prev.playlists) return
    for (const p of s.playlists) {
      const o = prev.playlists.find(x => x.id === p.id)
      if (!o || o === p) continue
      if (p.public !== o.public) {
        if (p.public === uid) { // just made public: failing to publish undoes the toggle
          clearTimeout(timers.get(p.id))
          if (canPublish({ uid, flag: p.public, online: navigator.onLine }))
            publishPlaylist(p).catch(e => { s.updatePlaylist(p.id, { public: false }); toast(`Couldn't make it public: ${e.message}`) })
          else dirty.add(p.id)
        } else if (o.public === uid) unpublishPlaylist(p.id).catch(e => toast(e.message || "Couldn't make it private"))
      } else if (p.public && (p.name !== o.name || p.tracks !== o.tracks)) {
        const own = p.public
        if (!uid) { dirty.add(p.id); continue } // signed out: send after the next sign-in
        if (own !== uid) continue // another account's published playlist: leave it alone
        clearTimeout(timers.get(p.id)); timers.set(p.id, setTimeout(() => sync(p.id, own), 2000))
      }
    }
    for (const pp of prev.playlists) if (pp.public && pp.public === uid && !s.playlists.some(x => x.id === pp.id)) unpublishPlaylist(pp.id).catch(e => toast(e.message))
  })
}

// Anyone may insert (no select policy, so no .select() here). Client guard: one report a minute per device.
export async function submitBugReport(r) {
  const body = cleanReport(r)
  let last = 0
  try { last = +localStorage.getItem('calify.lastReport') || 0 } catch {}
  const wait = reportWait(last, Date.now())
  if (wait) throw new Error(`Please wait ${wait} s before sending another report`)
  const platform = window.calify ? 'windows' : Capacitor.isNativePlatform() ? 'android' : 'web'
  must(await supabase.from('bug_reports').insert({ ...body, app_version: APP_VERSION, platform, user_id: me() ?? null }))
  try { localStorage.setItem('calify.lastReport', String(Date.now())) } catch {}
}
