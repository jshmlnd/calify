import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dropAudius, dropSpotify } from '../src/migrate.js'

const a = { id: 'a:1', source: 'audius' }, l = { id: 'l:1', source: 'local' }, s = { id: 's:1', source: 'spotify' }

test('drops Audius songs and entries, keeps local and Spotify ones', () => {
  const out = dropAudius({
    saved: [{ kind: 'artist', id: 'x' }], liked: [a, l, s], history: [a, s], upNext: [a],
    playlists: [{ id: 'p1', tracks: [a, l] }], pinned: ['liked', 'p1', 'x'],
    recents: [{ kind: 'aplaylist', id: 'x' }, { kind: 'playlist', id: 'p1' }],
    recentSearches: [{ kind: 'track', id: 'a:1', track: a }, { kind: 'track', id: 's:1', track: s }, { kind: 'artist', id: 'x' }],
    libFilter: 'artist', ctx: { kind: 'local', id: 'local' }, ctxTracks: [l], order: [0], pos: 0, current: l, volume: 0.5,
  })
  assert.equal('saved' in out, false)
  assert.deepEqual(out.liked, [l, s])
  assert.deepEqual(out.history, [s])
  assert.deepEqual(out.upNext, [])
  assert.deepEqual(out.playlists, [{ id: 'p1', tracks: [l] }])
  assert.deepEqual(out.pinned, ['liked', 'p1'])
  assert.deepEqual(out.recents, [{ kind: 'playlist', id: 'p1' }])
  assert.deepEqual(out.recentSearches, [{ kind: 'track', id: 's:1', track: s }])
  assert.equal(out.libFilter, null)
  assert.deepEqual([out.ctxTracks, out.pos, out.current, out.volume], [[l], 0, l, 0.5])
})

test('resets a queue context that holds Audius songs and clears an Audius current song', () => {
  const out = dropAudius({ ctx: { kind: 'trending', id: 'trending' }, ctxTracks: [a, l], order: [1, 0], pos: 1, current: a })
  assert.deepEqual([out.ctx, out.ctxTracks, out.order, out.pos, out.current], [null, [], [], -1, null])
})

test('dropSpotify removes Spotify songs, kinds and keys', () => {
  const out = dropSpotify({
    liked: [s, l], recents: [{ kind: 'sliked' }, { kind: 'splaylist' }, { kind: 'playlist', id: 'p1' }],
    spotifyClientId: 'x', spotifyUser: {}, spotifyPlaylists: [], libFilter: 'spotify', volume: 1,
  })
  assert.deepEqual(out.liked, [l]); assert.deepEqual(out.recents, [{ kind: 'playlist', id: 'p1' }])
  assert.equal(out.libFilter, null); assert.equal(out.volume, 1)
  for (const k of ['spotifyClientId', 'spotifyUser', 'spotifyPlaylists']) assert.equal(k in out, false)
  assert.equal(dropSpotify({ libFilter: 'calify' }).libFilter, null)
})
