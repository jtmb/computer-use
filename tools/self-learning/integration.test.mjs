import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyze, inspectEvidence } from './core.mjs'
import { messageReader, sessionAccess } from './adapter.mjs'

function setup() {
  const events = []
  const state = { pid: 42, deny: null, responseProject: 'project' }
  const sessions = Object.fromEntries(['self', 'one', 'two'].map(id => [id, { id, projectID: 'project', location: { directory: '/repo' } }]))
  const messages = Object.fromEntries(['one', 'two'].map((id, i) => [id, [{ id: `message-${i}`, type: 'user', time: { created: 10 }, text: 'browser failed with a confidential detail' }]]))
  const session = {
    async get({ sessionID }) { events.push(`host:get:${sessionID}`); return sessions[sessionID] },
    async list() { events.push('host:list'); return { data: Object.values(sessions), cursor: { next: null } } },
  }
  const service = { async discover() { events.push('discover'); return { url: 'http://127.0.0.1:1234' } }, headers() { return {} } }
  const clientFactory = () => ({
    server: { async info() { events.push('server:info'); return { pid: state.pid, version: '2.1.1' } } },
    session: { async get({ sessionID }) { events.push(`client:get:${sessionID}`); return { ...sessions[sessionID], projectID: state.responseProject } }, async list() { events.push('client:list'); return { data: Object.values(sessions), cursor: { next: null } } }, message: { async get({ sessionID, messageID }) { events.push(`client:message:${sessionID}`); return messages[sessionID].find(item => item.id === messageID) } } },
    message: { async list({ sessionID }) { events.push(`client:messages:${sessionID}`); return { data: messages[sessionID], cursor: { next: null } } } },
  })
  const permission = { async assert({ resources }) { const key = resources[0]; events.push(`permission:${key}`); if (state.deny === key) throw new Error('permission denied') } }
  const message = messageReader({ service, clientFactory, hostSession: session, hostPid: 42, hostVersion: '2.1.1' })
  const boundSession = sessionAccess(session, message, 'self')
  return { deps: { session: boundSession, message, permission, location: { directory: '/repo', project: { id: 'project' } } }, state, events }
}

const context = { sessionID: 'self', messageID: 'call', id: 'tool' }

test('analysis, native permission and bound adapter combine without revealing text', async () => {
  const { deps, events } = setup()
  const result = await analyze({}, context, deps)
  assert.equal(result.patterns[0].id, 'browser-workflow:failure')
  assert.doesNotMatch(JSON.stringify(result), /confidential detail/)
  assert.ok(events.indexOf('permission:project:project/sessions') < events.indexOf('client:list'))
  assert.equal(events.includes('host:list'), false)
  for (const id of ['one', 'two']) {
    assert.ok(events.indexOf(`permission:session:${id}`) < events.indexOf(`client:messages:${id}`))
    assert.ok(events.indexOf('server:info') < events.indexOf(`client:messages:${id}`))
  }
})

test('native denial prevents message access for denied session', async () => {
  const { deps, state, events } = setup()
  state.deny = 'session:one'
  await assert.rejects(analyze({}, context, deps), /permission denied/)
  assert.equal(events.some(e => e.startsWith('client:messages:')), false)
})

test('project-list denial prevents discovery and session listing', async () => {
  const { deps, state, events } = setup()
  state.deny = 'project:project/sessions'
  await assert.rejects(analyze({}, context, deps), /permission denied/)
  assert.equal(events.includes('discover'), false)
  assert.equal(events.includes('client:list'), false)
})

test('wrong service process or mismatched session cannot feed analysis', async () => {
  const first = setup()
  first.state.pid = 43
  await assert.rejects(analyze({}, context, first.deps), /host process/)
  assert.equal(first.events.some(e => e.startsWith('client:messages:')), false)
  const second = setup()
  second.state.responseProject = 'other'
  await assert.rejects(analyze({}, context, second.deps), /identity differs/)
  assert.equal(second.events.some(e => e.startsWith('client:messages:')), false)
})

test('exact inspection composes permissions, host binding and non-quoting results', async () => {
  const { deps, events } = setup()
  const result = await inspectEvidence({ references: [{ sessionID: 'one', messageID: 'message-0' }] }, context, deps)
  assert.equal(result.results[0].status, 'checked')
  assert.doesNotMatch(JSON.stringify(result), /confidential detail/)
  assert.ok(events.indexOf('permission:session:one') < events.indexOf('client:message:one'))
  assert.ok(events.indexOf('server:info') < events.indexOf('client:message:one'))
  const denied = setup()
  denied.state.deny = 'session:one'
  await assert.rejects(inspectEvidence({ references: [{ sessionID: 'one', messageID: 'message-0' }] }, context, denied.deps), /permission denied/)
  assert.equal(denied.events.includes('discover'), false)
})
