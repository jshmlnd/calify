import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contrast, readableAccent, SURFACE, ELEV, onAccent, ACCENTS, THEMES, hue } from '../src/theme.js'

test('contrast follows WCAG', () => {
  assert.ok(Math.abs(contrast('#000', '#fff') - 21) < 0.01)
})

test('readableAccent keeps readable colours and fixes weak ones', () => {
  assert.equal(readableAccent('#f08a3c', 'calico'), '#f08a3c')
  for (const t of THEMES) for (const a of ['#fff3a0', '#202020', '#f08a3c', ...ACCENTS])
    assert.ok(contrast(readableAccent(a, t), SURFACE[t]) >= 3, `${a} on ${t}`)
  for (const t of THEMES) for (const a of ACCENTS)
    assert.ok(contrast(readableAccent(a, t), ELEV[t]) >= 3, `${a} on elev ${t}`)
})

test('onAccent picks the more readable of black and white', () => {
  assert.equal(onAccent('#f2b33d'), '#000000')
  assert.equal(onAccent('#1d3a8a'), '#ffffff')
})

test('readableAccent keeps the hue', () => {
  for (const [a, t] of [['#fff3a0', 'daylight'], ['#1d3a8a', 'midnight'], ['#f2b33d', 'daylight']]) {
    const d = Math.abs(hue(readableAccent(a, t)) - hue(a))
    assert.ok(Math.min(d, 360 - d) <= 5, `${a} on ${t}`)
  }
})
