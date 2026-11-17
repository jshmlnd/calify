import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
globalThis.__APP_VERSION__ = pkg.version
const { CHANGELOG, APP_VERSION } = await import('../src/changelog.js')

const num = v => v.split('.').map(Number)
const cmp = (a, b) => { const x = num(a), y = num(b); return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] }

test('newest entry matches the app and package version', () => {
  assert.equal(APP_VERSION, pkg.version)
  assert.equal(CHANGELOG[0].version, APP_VERSION)
})
test('versions are strictly descending', () => {
  for (let i = 1; i < CHANGELOG.length; i++) assert.ok(cmp(CHANGELOG[i - 1].version, CHANGELOG[i].version) > 0)
})
test('every entry lists something', () => {
  for (const e of CHANGELOG) assert.ok(e.new.length + e.fixed.length > 0, e.version)
})
