import { test } from 'node:test'
import assert from 'node:assert/strict'

globalThis.__APP_VERSION__ = '1.1.0'
const { isNewer } = await import('../src/updates.js')

test('isNewer compares semver numerically and ignores a leading v', () => {
  assert.ok(isNewer('1.1.0', '1.0.0'))
  assert.ok(isNewer('v1.10.0', '1.9.9'))
  assert.ok(!isNewer('1.1.0', '1.1.0'))
  assert.ok(!isNewer('1.0.9', '1.1.0'))
})
