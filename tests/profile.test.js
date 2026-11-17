import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cleanPatch, lastPlayedOf, fresh, splitPath, HOUR, SIGN_SECONDS } from '../src/profiledata.js'
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
