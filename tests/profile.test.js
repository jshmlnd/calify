import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicTracks, canPublish, cleanPatch, lastPlayedOf, lastPlayedPlan, likeOf, fresh, splitPath, HOUR, SIGN_SECONDS } from '../src/profiledata.js'
import { accentVars, contrast, SURFACE } from '../src/theme.js'

test('cleanPatch trims and enforces name 1–40 and bio ≤ 160', () => {
  assert.deepEqual(cleanPatch({ name: '  Mia ', bio: ' hi ' }), { name: 'Mia', bio: 'hi' })
  assert.throws(() => cleanPatch({ name: '   ' }), /Name/)
  assert.throws(() => cleanPatch({ name: 'x'.repeat(41) }), /Name/)
  assert.equal(cleanPatch({ name: 'x'.repeat(40) }).name.length, 40)
  assert.throws(() => cleanPatch({ bio: 'x'.repeat(161) }), /Bio/)
  assert.throws(() => cleanPatch({ theme: 'neon' }), /theme/)
  assert.throws(() => cleanPatch({ accent: 'red' }), /colour/)
  assert.deepEqual(cleanPatch({ last_played: { title: 'a' } }), { last_played: { title: 'a' } })
})

test('lastPlayedOf keeps only title, artist, art_path and stays small', () => {
  const lp = lastPlayedOf({ id: 'x', title: 'é'.repeat(999), artist: 'A', album: 'B', src: 'blob:z', duration: 3 }, 'covers/u/c.webp')
  assert.deepEqual(Object.keys(lp), ['title', 'artist', 'art_path'])
  assert.ok(new TextEncoder().encode(JSON.stringify(lp)).length < 1000)
  assert.deepEqual(lastPlayedOf({}), { title: '', artist: '', art_path: null })
})

test('signed URLs are reused until 1 h before their 24 h expiry', () => {
  const now = 1e12, hit = { url: 'u', exp: now + SIGN_SECONDS * 1000 }
  assert.equal(fresh(undefined, now), false)
  assert.equal(fresh(hit, now), true)
  assert.equal(fresh(hit, hit.exp - HOUR - 1), true)
  assert.equal(fresh(hit, hit.exp - HOUR), false)
})

test('storage paths carry their bucket', () => {
  assert.deepEqual(splitPath('avatars/uid-1/avatar-k.webp'), ['avatars', 'uid-1/avatar-k.webp'])
})

test('accentVars tints readably for the viewer theme', () => {
  const v = accentVars('#fff3a0', 'daylight')
  assert.ok(contrast(v['--accent'], SURFACE.daylight) >= 3)
  assert.equal(accentVars('nope', 'calico')['--accent'], '#f08a3c')
  assert.deepEqual(Object.keys(v), ['--accent', '--on-accent', '--accent-2'])
})

test('lastPlayedPlan skips, reuses the cover, or uploads', () => {
  const t = { id: 't2', artist: 'A', album: 'B' }, prev = { uid: 'u1', id: 't1', artist: 'A', album: 'B', art_path: 'covers/u/c.webp' }
  const ok = { signedIn: true, privateSession: false, online: true, track: t, prev, uid: 'u1' }
  assert.equal(lastPlayedPlan(ok), 'reuse')
  assert.equal(lastPlayedPlan({ ...ok, signedIn: false }), null)
  assert.equal(lastPlayedPlan({ ...ok, privateSession: true }), null)
  assert.equal(lastPlayedPlan({ ...ok, online: false }), null)
  assert.equal(lastPlayedPlan({ ...ok, track: { ...t, id: 't1' } }), null)
  assert.equal(lastPlayedPlan({ ...ok, uid: 'u2' }), 'upload') // other account never reuses u1's cover
  assert.equal(lastPlayedPlan({ ...ok, uid: 'u2', track: { ...t, id: 't1' } }), 'upload')
  assert.equal(lastPlayedPlan({ ...ok, prev: null }), 'upload')
  assert.equal(lastPlayedPlan({ ...ok, track: { ...t, album: 'C' } }), 'upload')
  assert.equal(lastPlayedPlan({ ...ok, track: { ...t, artist: 'Z' } }), 'upload')
  assert.equal(lastPlayedPlan({ ...ok, prev: { ...prev, art_path: null } }), 'upload')
  assert.equal(lastPlayedPlan({ ...ok, track: { id: 't2', artist: 'A' }, prev: { ...prev, album: undefined } }), 'upload') // no album: can't tell
})

test('likeOf escapes wildcards', () => {
  assert.equal(likeOf(' jo '), '%jo%')
  assert.equal(likeOf('50%_a\\'), '%50\\%\\_a\\\\%')
})

test('publicTracks keeps metadata only, caps count and string length', () => {
  const t = { id: 'x', title: 'a'.repeat(300), artist: 'b', album: undefined, duration: 12.6, art: 'blob:1', url: 'secret' }
  const out = publicTracks(Array(600).fill(t))
  assert.equal(out.length, 500)
  assert.deepEqual(Object.keys(out[0]), ['title', 'artist', 'album', 'duration'])
  assert.equal(out[0].title.length, 200)
  assert.equal(out[0].album, '')
  assert.equal(out[0].duration, 13)
  assert.deepEqual(publicTracks(null), [])
})

test('canPublish needs the signed-in uid to match the flag, and a connection', () => {
  assert.equal(canPublish({ uid: 'a', flag: 'a' }), true)
  assert.equal(canPublish({ uid: 'b', flag: 'a' }), false)
  assert.equal(canPublish({ uid: undefined, flag: 'a' }), false)
  assert.equal(canPublish({ uid: 'a', flag: false }), false)
  assert.equal(canPublish({ uid: 'a', flag: 'a', online: false }), false)
})

test('cleanReport enforces 10–2000 / ≤ 2000 and reportWait gates 60 s', async () => {
  const { cleanReport, reportWait } = await import('../src/profiledata.js')
  assert.deepEqual(cleanReport({ what: ' it crashes now ', expected: ' ' }), { what: 'it crashes now', expected: null })
  assert.throws(() => cleanReport({ what: 'short' }), /10/)
  assert.throws(() => cleanReport({ what: 'x'.repeat(10), expected: 'y'.repeat(2001) }), /2000/)
  assert.equal(reportWait(0, 1e6), 0)
  assert.equal(reportWait(1e6, 1e6 + 59e3), 1)
})
