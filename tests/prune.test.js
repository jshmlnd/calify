import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropTracks } from '../src/prune.js'

const g = { id: 'g' }, k = { id: 'k' }, k2 = { id: 'k2' }, isGone = t => !!t && t.id === 'g'

test('removes gone tracks from every list and gone kinds from recents', () => {
  const out = dropTracks({
    liked: [g, k], history: [g], upNext: [k, g], playlists: [{ id: 'p', tracks: [g, k] }],
    recents: [{ kind: 'x' }, { kind: 'playlist' }],
    recentSearches: [{ kind: 'track', track: g }, { kind: 'track', track: k }],
    volume: 1,
  }, isGone, new Set(['x']))
  assert.deepEqual(out.liked, [k]); assert.deepEqual(out.history, []); assert.deepEqual(out.upNext, [k])
  assert.deepEqual(out.playlists, [{ id: 'p', tracks: [k] }])
  assert.deepEqual(out.recents, [{ kind: 'playlist' }])
  assert.deepEqual(out.recentSearches, [{ kind: 'track', track: k }])
  assert.equal(out.volume, 1)
})

test('rebuilds the queue around survivors and clears a gone current', () => {
  const out = dropTracks({ ctxTracks: [k, g, k2], order: [2, 1, 0], pos: 2, current: k }, isGone, new Set())
  assert.deepEqual([out.ctxTracks, out.order, out.pos, out.current], [[k, k2], [0, 1], 0, k])
  const gone = dropTracks({ ctxTracks: [k, g], order: [0, 1], pos: 1, current: g }, isGone, new Set())
  assert.deepEqual([gone.ctxTracks, gone.order, gone.pos, gone.current], [[k], [0], -1, null])
})

test('removing the playing track leaves current null and the queue without it', () => {
  const out = dropTracks({ ctxTracks: [k, g, k2], order: [0, 1, 2], pos: 1, current: g }, isGone, new Set())
  assert.equal(out.current, null); assert.deepEqual(out.ctxTracks, [k, k2])
})

test('removing a non-current track keeps the queue pointer on the same track', () => {
  const s = { ctxTracks: [g, k, k2], order: [2, 0, 1], pos: 2, current: k }
  const out = dropTracks(s, isGone, new Set())
  assert.equal(out.ctxTracks[out.order[out.pos]], s.ctxTracks[s.order[s.pos]])
})
