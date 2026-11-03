import assert from 'node:assert/strict'
import test from 'node:test'
import { acceptancePage, startAcceptanceServer } from './cua-acceptance-server.mjs'

test('sample page has visible form controls and no account or outgoing request', () => {
  const page = acceptancePage()
  assert.match(page, /label for="note"/)
  assert.match(page, /button id="apply" type="button"/)
  assert.match(page, /Verified note:/)
  assert.doesNotMatch(page, /https:\/\/|fetch\(|XMLHttpRequest|type="password"/)
  assert.match(acceptancePage(true), /Second sample page/)
})

test('actual server is loopback-only, serves only sample routes and refuses writes', async t => {
  const { server, url } = await startAcceptanceServer()
  t.after(() => new Promise(resolve => server.close(resolve)))
  assert.equal(server.address().address, '127.0.0.1')
  assert.equal((await fetch(url)).status, 200)
  assert.match(await (await fetch(url + '/second')).text(), /Second sample page/)
  assert.equal((await fetch(url + '/AGENTS.md')).status, 404)
  assert.equal((await fetch(url, { method: 'POST', body: 'no-data' })).status, 404)
  assert.match((await fetch(url)).headers.get('content-security-policy'), /connect-src 'none'/)
})
