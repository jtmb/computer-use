import assert from 'node:assert/strict'
import test from 'node:test'
import { privateEnvironment, redactStartupLog, runNativeHost } from './native-host-acceptance.mjs'

test('native host fixture isolates config, storage and credentials from the operator profile', () => {
  const root = '/tmp/opencode/personality-native-fixture'
  const environment = privateEnvironment(root, { PATH: '/usr/bin:/bin', HOME: '/private/operator', OPENAI_API_KEY: 'must-not-copy', OPENCODE_CONFIG_DIR: '/active/profile' })
  assert.equal(environment.HOME, root + '/home')
  assert.equal(environment.OPENCODE_CONFIG_DIR, root + '/config')
  assert.equal(environment.OPENCODE_DATA_DIR, root + '/data/opencode')
  assert.equal(environment.OPENAI_API_KEY, undefined)
})

test('native host fixture refuses non-scratch roots and ambiguous binaries without launching', async () => {
  assert.throws(() => privateEnvironment('/home/operator'), /dedicated approved scratch/)
  assert.throws(() => privateEnvironment('/tmp/opencode/personality-native-fixture/../outside'), /dedicated approved scratch/)
  await assert.rejects(runNativeHost('opencode'), /exact installed/)
})

test('native host fixture never persists its generated startup password in evidence', () => {
  const redacted = redactStartupLog('server listening on http://127.0.0.1:1234\nserver password disposable-secret\nother log\n')
  assert.match(redacted, /server password \[redacted\]/)
  assert.doesNotMatch(redacted, /disposable-secret/)
  assert.match(redacted, /other log/)
})
