import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseCsv, readPlaylistCsv, matchScore, bestMatch, norm } from '../src/csv.js'

test('parses quotes, escaped quotes, embedded commas/newlines, CRLF and BOM', () => {
  const rows = parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\r\n"multi\nline",z\n\n')
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"'], ['multi\nline', 'z']])
})

test('reads an Exportify export', () => {
  const csv = '"Track URI","Track Name","Album Name","Artist Name(s)","Release Date","Duration (ms)"\n' +
    '"spotify:track:1","Folded","Folded","Kehlani","2025-06-27","238973"\n' +
    '"spotify:track:2","Waterfall (feat. RAYE)","Waterfall","Disclosure, RAYE","2023","232000"\n'
  assert.deepEqual(readPlaylistCsv(csv), [
    { title: 'Folded', artist: 'Kehlani', album: 'Folded', duration: 238.973 },
    { title: 'Waterfall (feat. RAYE)', artist: 'Disclosure, RAYE', album: 'Waterfall', duration: 232 },
  ])
  assert.equal(readPlaylistCsv('foo,bar\n1,2'), null)
})

test('normalizes feat/remaster tails and accents', () => {
  assert.equal(norm('Waterfall (feat. RAYE)'), 'waterfall')
  assert.equal(norm('Here Comes the Sun - Remastered 2009'), 'here comes the sun')
  assert.equal(norm('Café Del Mar'), 'cafe del mar')
})

test('matches same song, rejects different title or artist, prefers close duration', () => {
  const row = { title: 'Waterfall (feat. RAYE)', artist: 'Disclosure, RAYE', duration: 232 }
  const good = { title: 'Waterfall', artist: 'Disclosure', duration: 232 }
  const cover = { title: 'Waterfall', artist: 'Some Cover Band', duration: 200 }
  const other = { title: 'White Noise', artist: 'Disclosure', duration: 232 }
  assert.equal(matchScore(row, good), 6)
  assert.equal(matchScore(row, cover), 0)
  assert.equal(matchScore(row, other), 0)
  const remix = { title: 'Disclosure Waterfall (Luhv FLiP)', artist: 'Luhv', duration: 201 }
  assert.equal(bestMatch(row, [remix, cover, good]), good)
  assert.equal(bestMatch({ title: 'Nope', artist: 'Nobody' }, [good]), null)
})
