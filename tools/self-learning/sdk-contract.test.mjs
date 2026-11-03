import { test } from 'node:test'
import assert from 'node:assert/strict'
import { messageReader } from './adapter.mjs'

let available = true
try { import.meta.resolve('@opencode/client') } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
  available = false
}

test('installed SDK transport decodes every bounded adapter operation', { skip: available ? false : 'Install the pinned peer dependency to run the SDK transport fixture' }, async () => {
  const { OpenCode } = await import('@opencode/client')
  const session = { id: 'ses_one', projectID: 'project', location: { directory: '/repo' } }
  const requests = []
  let oversized = null
  const json = value => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } })
  const reader = messageReader({
    service: { discover: async () => ({ url: 'http://127.0.0.1:1234' }), headers: () => ({}) },
    clientFactory: OpenCode.make,
    hostSession: { get: async () => session }, hostPid: 42, hostVersion: '2.1.1',
    fetchImpl: async input => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      requests.push(url.pathname + url.search)
      if (url.pathname === oversized) return new Response(new Uint8Array(2 * 1024 * 1024 + 1), { headers: { 'content-type': 'application/json' } })
      if (url.pathname === '/api/info') return json({ pid: 42, version: '2.1.1' })
      if (url.pathname === '/api/session/ses_one') return json({ data: session })
      if (url.pathname === '/api/session/ses_one/message/msg_1') return json({ data: { id: 'msg_1', type: 'user', time: { created: 1 }, text: 'synthetic' } })
      return json({ data: [], cursor: { next: null } })
    },
  })
  assert.deepEqual(await reader.listSessions({ project: 'project', limit: 3, order: 'desc' }, 'ses_one'), { data: [], cursor: { next: null } })
  assert.deepEqual(await reader.list({ sessionID: 'ses_one', limit: 2, order: 'desc' }), { data: [], cursor: { next: null } })
  assert.equal((await reader.get({ sessionID: 'ses_one', messageID: 'msg_1' })).id, 'msg_1')
  assert.deepEqual(requests, [
    '/api/info', '/api/session/ses_one', '/api/session?limit=3&order=desc&project=project',
    '/api/info', '/api/session/ses_one', '/api/session/ses_one/message?limit=2&order=desc',
    '/api/info', '/api/session/ses_one', '/api/session/ses_one/message/msg_1',
  ])
  oversized = '/api/session/ses_one/message'
  await assert.rejects(reader.list({ sessionID: 'ses_one', limit: 2, order: 'desc' }), error => {
    assert.match(String(error.cause ?? error), /byte limit/)
    return true
  })
})
