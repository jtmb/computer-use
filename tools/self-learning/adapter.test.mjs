import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boundedFetch, messageReader } from './adapter.mjs'

const session = { id: 'ses_one', projectID: 'project', location: { directory: '/repo' } }
function fixture() {
  const state = { pid: 42, remote: session, endpoint: { url: 'http://127.0.0.1:1234' }, lists: 0, discovers: 0 }
  const service = { discover: async () => { state.discovers++; return state.endpoint }, headers: () => ({}) }
  const clientFactory = () => ({ server: { info: async () => ({ pid: state.pid, version: '2.1.1' }) }, session: { get: async () => state.remote }, message: { list: async () => { state.lists++; return { data: [], cursor: {} } } } })
  const reader = messageReader({ service, clientFactory, hostSession: { get: async () => session }, hostPid: 42, hostVersion: '2.1.1' })
  return { state, reader }
}

test('uses only discovered same-process service and verified session', async () => {
  const { reader, state } = fixture()
  assert.deepEqual(await reader.list({ sessionID: 'ses_one', limit: 3 }), { data: [], cursor: {} })
  assert.equal(state.discovers, 1)
  assert.equal(state.lists, 1)
})

test('exact message retrieval uses the same bound host and identity checks', async () => {
  let reads = 0
  const reader = messageReader({
    service: { discover: async () => ({ url: 'http://127.0.0.1:1234' }), headers: () => ({}) },
    clientFactory: () => ({ server: { info: async () => ({ pid: 42, version: '2.1.1' }) }, session: { get: async () => session, message: { get: async input => { reads++; return { id: input.messageID } } } } }),
    hostSession: { get: async () => session }, hostPid: 42, hostVersion: '2.1.1',
  })
  assert.deepEqual(await reader.get({ sessionID: 'ses_one', messageID: 'msg_1' }), { id: 'msg_1' })
  assert.equal(reads, 1)
})

test('session listing uses the bound service and forwards the requested page', async () => {
  let request
  const reader = messageReader({
    service: { discover: async () => ({ url: 'http://127.0.0.1:1234' }), headers: () => ({}) },
    clientFactory: () => ({ server: { info: async () => ({ pid: 42, version: '2.1.1' }) }, session: { get: async () => session, list: async value => { request = value; return { data: [], cursor: { next: null } } } } }),
    hostSession: { get: async () => session }, hostPid: 42, hostVersion: '2.1.1',
  })
  const input = { project: 'project', limit: 3, order: 'desc' }
  assert.deepEqual(await reader.listSessions(input, 'ses_one'), { data: [], cursor: { next: null } })
  assert.deepEqual(request, input)
})

test('session listing rejects oversized HTTP data before parsing it', async () => {
  let parsed = false
  const reader = messageReader({
    service: { discover: async () => ({ url: 'http://127.0.0.1:1234' }), headers: () => ({}) },
    clientFactory: ({ fetch }) => ({
      server: { info: async () => ({ pid: 42, version: '2.1.1' }) },
      session: { get: async () => session, list: async () => { const response = await fetch('http://127.0.0.1:1234/api/session'); parsed = true; return response.json() } },
    }),
    fetchImpl: async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1)),
    hostSession: { get: async () => session }, hostPid: 42, hostVersion: '2.1.1',
  })
  await assert.rejects(reader.listSessions({ project: 'project', limit: 3 }, 'ses_one'), /byte limit/)
  assert.equal(parsed, false)
})

test('session listing refuses wrong host or caller before listing', async () => {
  let listed = false
  const state = { pid: 43, remote: session }
  const reader = messageReader({
    service: { discover: async () => ({ url: 'http://127.0.0.1:1234' }), headers: () => ({}) },
    clientFactory: () => ({ server: { info: async () => ({ pid: state.pid, version: '2.1.1' }) }, session: { get: async () => state.remote, list: async () => { listed = true } } }),
    hostSession: { get: async () => session }, hostPid: 42, hostVersion: '2.1.1',
  })
  await assert.rejects(reader.listSessions({ project: 'project', limit: 3 }, 'ses_one'), /host process/)
  state.pid = 42
  state.remote = { ...session, projectID: 'another' }
  await assert.rejects(reader.listSessions({ project: 'project', limit: 3 }, 'ses_one'), /identity differs/)
  assert.equal(listed, false)
})

test('refuses matching host and remote identities when they are not the requested session', async () => {
  let accessed = false
  const reader = messageReader({
    service: { discover: async () => ({ url: 'http://127.0.0.1:1234' }), headers: () => ({}) },
    clientFactory: () => ({ server: { info: async () => ({ pid: 42, version: '2.1.1' }) }, session: { get: async () => session, message: { get: async () => { accessed = true } } } }),
    hostSession: { get: async () => session }, hostPid: 42, hostVersion: '2.1.1',
  })
  await assert.rejects(reader.get({ sessionID: 'ses_other', messageID: 'msg_1' }), /identity differs/)
  assert.equal(accessed, false)
})

test('refuses missing service, wrong process, session and remote endpoints', async () => {
  const { reader, state } = fixture()
  state.endpoint = undefined
  await assert.rejects(reader.list({ sessionID: 'ses_one' }), /No healthy/)
  state.endpoint = { url: 'http://127.0.0.1:1234' }; state.pid = 43
  await assert.rejects(reader.list({ sessionID: 'ses_one' }), /host process/)
  state.pid = 42; state.remote = { ...session, projectID: 'another' }
  await assert.rejects(reader.list({ sessionID: 'ses_one' }), /identity differs/)
  state.endpoint = { url: 'http://example.com' }
  await assert.rejects(reader.list({ sessionID: 'ses_one' }), /loopback/)
  assert.equal(state.lists, 0)
})

test('bounded fetch rejects foreign origins and oversized streaming responses', async () => {
  const f = boundedFetch('http://127.0.0.1:1234', async () => new Response(new Uint8Array(2 * 1024 * 1024 + 1)))
  await assert.rejects(f('http://127.0.0.1:9999/'), /outside/)
  await assert.rejects(f('http://127.0.0.1:1234/api'), /byte limit/)
})

test('bounded fetch preserves response and disables redirects', async () => {
  let redirect
  const f = boundedFetch('http://127.0.0.1:1234', async (_input, options) => { redirect = options.redirect; return new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }) })
  assert.deepEqual(await (await f('http://127.0.0.1:1234/api')).json(), { ok: true })
  assert.equal(redirect, 'error')
})

test('cancellation after discovery prevents service and message reads', async () => {
  const controller = new AbortController()
  let madeClient = false
  const reader = messageReader({
    service: { discover: async () => { controller.abort(); return { url: 'http://127.0.0.1:1234' } }, headers: () => ({}) },
    clientFactory: () => { madeClient = true }, hostSession: {}, hostPid: 42, hostVersion: '2.1.1',
  })
  await assert.rejects(reader.list({ sessionID: 'ses_one' }, { signal: controller.signal }))
  assert.equal(madeClient, false)
})

test('abort bounds an uncooperative discovery without starting later reads', async () => {
  const controller = new AbortController()
  let release
  let madeClient = false
  const reader = messageReader({
    service: { discover: () => new Promise(resolve => { release = resolve }), headers: () => ({}) },
    clientFactory: () => { madeClient = true }, hostSession: {}, hostPid: 42, hostVersion: '2.1.1',
  })
  const pending = reader.list({ sessionID: 'ses_one' }, { signal: controller.signal })
  controller.abort(new Error('cancelled'))
  await assert.rejects(pending, /cancelled/)
  release({ url: 'http://127.0.0.1:1234' })
  await Promise.resolve()
  assert.equal(madeClient, false)
})

test('stalled discovery is shared rather than accumulated across cancelled calls', async () => {
  let count = 0
  let release
  const reader = messageReader({
    service: { discover: () => { count++; return new Promise(resolve => { release = resolve }) }, headers: () => ({}) },
    clientFactory: () => { throw new Error('unexpected client') }, hostSession: {}, hostPid: 42, hostVersion: '2.1.1',
  })
  for (let i = 0; i < 3; i++) {
    const controller = new AbortController()
    const pending = reader.list({ sessionID: 'ses_one' }, { signal: controller.signal })
    controller.abort()
    await assert.rejects(pending)
  }
  assert.equal(count, 1)
  release(undefined)
})

test('pre-aborted fetch never invokes its transport', async () => {
  const controller = new AbortController()
  controller.abort(new Error('already cancelled'))
  let called = false
  const f = boundedFetch('http://127.0.0.1:1234', async () => { called = true })
  await assert.rejects(f('http://127.0.0.1:1234/api', { signal: controller.signal }), /already cancelled/)
  assert.equal(called, false)
})

test('abort bounds a stalled response stream', async () => {
  const controller = new AbortController()
  let started
  let cancelled = false
  const pulling = new Promise(resolve => { started = resolve })
  const stream = new ReadableStream({ pull() { started(); return new Promise(() => {}) }, cancel() { cancelled = true } })
  const f = boundedFetch('http://127.0.0.1:1234', async () => new Response(stream))
  const pending = f('http://127.0.0.1:1234/api', { signal: controller.signal })
  await pulling
  controller.abort(new Error('stream cancelled'))
  await assert.rejects(pending, /stream cancelled/)
  assert.equal(cancelled, true)
})
