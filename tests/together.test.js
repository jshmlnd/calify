import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newCode, normalizeCode } from '../src/together/codes.js'
import { can, admit, canQueue, cleanChat, hostGone, listenerBlocked, MAX_CHAT } from '../src/together/rules.js'

test('newCode pads to 4 digits', () => {
  assert.equal(newCode(() => 0), 'CALI-0000')
  assert.equal(newCode(() => 0.9999), 'CALI-9999')
})

test('normalizeCode accepts the 4 forms, rejects junk', () => {
  for (const s of ['CALI-0482', 'cali 0482', '0482', 'https://calify.zjkm.tech/calify/join?c=CALI-0482']) assert.equal(normalizeCode(s), 'CALI-0482')
  assert.equal(normalizeCode('CALI-48'), null)
  assert.equal(normalizeCode('hello'), null)
})

test('can: listener limits, host everything', () => {
  assert.equal(can('listener', 'control'), false)
  assert.equal(can('listener', 'queue'), true)
  assert.equal(can('listener', 'chat'), true)
  assert.equal(can('listener', 'approve'), false)
  assert.equal(can('listener', 'remove'), false)
  for (const a of ['control', 'queue', 'chat', 'approve', 'remove']) assert.equal(can('host', a), true)
})

test('admit, canQueue, hostGone', () => {
  assert.equal(admit(4), 'ok')
  assert.equal(admit(5), 'full')
  assert.equal(canQueue(new Set(['l:1']), 'l:1'), true)
  assert.equal(canQueue(new Set(['l:1']), 'l:2'), false)
  assert.equal(hostGone(0, 14999), false)
  assert.equal(hostGone(0, 15000), true)
})

test('cleanChat', () => {
  assert.equal(cleanChat('  hi  there '), 'hi there')
  assert.equal(cleanChat('   '), null)
  assert.equal(cleanChat('a'.repeat(600)).length, MAX_CHAT)
})

test('listenerBlocked', () => {
  assert.equal(listenerBlocked(null), false)
  assert.equal(listenerBlocked({ role: 'host' }), false)
  assert.equal(listenerBlocked({ role: 'listener' }), true)
})
