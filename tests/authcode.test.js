import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codeFrom } from '../src/authcode.js'

test('codeFrom reads the code from a query or a full callback URL', () => {
  assert.equal(codeFrom('?code=abc-123'), 'abc-123')
  assert.equal(codeFrom('calify://auth?code=xyz'), 'xyz')
  assert.equal(codeFrom('http://127.0.0.1:43821/callback?code=q%2Fr'), 'q/r')
})

test('codeFrom throws the provider error, or a cancel message', () => {
  assert.throws(() => codeFrom('?error=access_denied&error_description=User+denied'), /User denied/)
  assert.throws(() => codeFrom(''), /cancelled/)
  assert.throws(() => codeFrom(undefined), /cancelled/)
})
