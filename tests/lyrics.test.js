import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseLyrics } from '../src/lyrics.js'

test('parses synced LRC, drops tags, sorts, expands multi-stamps', () => {
  const r = parseLyrics('[ar:Kehlani]\n[00:12.50]So come pick up\n[00:05.00][00:30.00]Folded\n[00:20.00]')
  assert.equal(r.synced, true)
  assert.deepEqual(r.lines, [
    { t: 5, text: 'Folded' }, { t: 12.5, text: 'So come pick up' },
    { t: 20, text: '♪' }, { t: 30, text: 'Folded' },
  ])
})

test('parses plain lyrics and empty input', () => {
  assert.deepEqual(parseLyrics('one\n\ntwo'), { synced: false, lines: [{ t: null, text: 'one' }, { t: null, text: 'two' }] })
  assert.equal(parseLyrics(''), null)
  assert.equal(parseLyrics('\n\n'), null)
})
