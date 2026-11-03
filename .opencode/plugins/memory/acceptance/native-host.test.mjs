import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import test from "node:test"
import { acceptedRun, expectedTeardownFailure, privateEnvironment, pumpBounded, SOURCE_FILES, startupEndpoint } from './native-host.mjs'
import { restrictiveRules, runProbe } from './native-probe.mjs'

test('private memory environment is explicit and inherits no operator authentication or proxy', () => {
  const root = '/tmp/opencode/memory-native-unit'
  const env = privateEnvironment(root)
  assert.equal(env.HOME, `${root}/home`)
  assert.equal(env.OPENCODE_DATA_DIR, `${root}/data/opencode`)
  assert.equal(env.OPENCODE_DISABLE_AUTOUPDATE, '1')
  assert.equal(env.PATH, '/usr/bin:/bin')
  assert.ok(Object.values(env).every(value => typeof value === 'string'))
  for (const key of ['OPENAI_API_KEY', 'OPENCODE_SERVER_PASSWORD', 'HTTP_PROXY', 'NODE_OPTIONS', 'OPENCODE_CONFIG_CONTENT']) assert.equal(Object.hasOwn(env, key), false)
  for (const value of ['/home/james', 'relative', '/tmp/opencode/memory-native-a/../b']) assert.throws(() => privateEnvironment(value))
})

test('fixture policy can only deny or ask and contains no permission grant', () => {
  for (const effect of ['deny', 'ask']) {
    const rules = restrictiveRules(effect)
    assert.deepEqual(rules, [{ action: '*', resource: '*', effect: 'deny' }, { action: 'read', resource: '*', effect }])
    assert.ok(rules.every(rule => rule.effect !== 'allow'))
  }
  for (const effect of ['allow', 'once', 'always', undefined]) assert.throws(() => restrictiveRules(effect))
  assert.deepEqual(SOURCE_FILES, ['index.ts', 'core.ts', 'filesystem.ts', 'format.ts', 'paths.ts', 'retrieval.ts', 'tool.ts'])
})

test('native startup endpoint waits for the complete owned credential line and accepts only loopback', () => {
  const first = 'server http://127.0.0.1:45678\nserver password disposable'
  assert.equal(startupEndpoint(first), undefined)
  assert.deepEqual(startupEndpoint(first + '-fixture\n'), { url: 'http://127.0.0.1:45678', password: 'disposable-fixture' })
  assert.equal(startupEndpoint('http://example.com:1234\nserver password fixture\n'), undefined)
  assert.equal(startupEndpoint('http://127.0.0.1:123456\nserver password fixture\n'), undefined)
})

test('bounded pump reads at most the remaining shared stdout/stderr allowance before refusal', () => {
  const budget = { remaining: 7 }
  const chunks = [], requests = []
  let refused = 0
  function stream(body) {
    const source = new EventEmitter()
    source.read = count => {
      assert.ok(Number.isSafeInteger(count) && count > 0 && count <= 4096)
      requests.push(count)
      if (!body.length) return null
      const block = body.subarray(0, count)
      body = body.subarray(block.length)
      return block
    }
    return source
  }
  const first = stream(Buffer.from('abc'))
  const second = stream(Buffer.from('defghijk'))
  const one = pumpBounded(first, new PassThrough().resume(), block => chunks.push(block), () => refused++, 65536, budget)
  const two = pumpBounded(second, new PassThrough().resume(), block => chunks.push(block), () => refused++, 65536, budget)
  first.emit('readable')
  second.emit('readable')
  assert.deepEqual(requests, [7, 4, 4])
  assert.equal(one(), 3)
  assert.equal(two(), 4)
  assert.equal(budget.remaining, 0)
  assert.equal(refused, 1)
  assert.equal(Buffer.concat(chunks).toString(), 'abcdefg')
})

test('bounded pump passes a complete small stream without a refusal', async () => {
  const source = new PassThrough()
  const destination = new PassThrough()
  const chunks = []
  destination.resume()
  const ended = new Promise(resolve => destination.once('end', resolve))
  let refused = false
  const count = pumpBounded(source, destination, block => chunks.push(block), () => { refused = true })
  source.end('public fixture')
  await ended
  assert.equal(count(), 14)
  assert.equal(Buffer.concat(chunks).toString(), 'public fixture')
  assert.equal(refused, false)
})

test('native acceptance requires actual probe success, no model/grant, teardown and verified guard cleanup', () => {
  const report = { passed: true, modelRequests: 0, permissionReplies: ['reject'] }
  const result = { spawned: true, reason: null, cleanup: { verified: true } }
  assert.equal(acceptedRun(report, result, true), true)
  for (const patch of [{ passed: false }, { modelRequests: 1 }, { permissionReplies: ['once'] }, { permissionReplies: ['reject', 'always'] }]) assert.equal(acceptedRun({ ...report, ...patch }, result, true), false)
  for (const patch of [{ spawned: false }, { reason: 'owned-rss-budget' }, { cleanup: { verified: false } }]) assert.equal(acceptedRun(report, { ...result, ...patch }, true), false)
  assert.equal(acceptedRun(report, result, false), false)
  assert.equal(acceptedRun(report, result, true, 'activation-response'), false)
  assert.equal(acceptedRun(undefined, result, true), false)
})

function probeFixture({ wrongSource = false, resolveCancelled = false, unexpectedModel = false } = {}) {
  const root = '/tmp/opencode/memory-native-probe-unit'
  const sessions = [], requests = [], replies = []
  let disposed = false, modelHook
  const ctx = {
    app: { version: '2.1.1' }, location: { directory: `${root}/project` },
    session: {
      async create(input) {
        assert.ok(input.permissions.every(rule => rule.effect !== 'allow'))
        if (unexpectedModel) modelHook()
        const session = { id: `ses_unit_${sessions.length}`, ...input }
        sessions.push(session)
        return session
      },
      async hook(name, callback) {
        assert.equal(name, 'model.request'); modelHook = callback
        return { async dispose() { disposed = true } }
      },
    },
    permission: {
      async list({ sessionID }) { return requests.filter(request => request.sessionID === sessionID) },
      async reply(input) {
        assert.equal(input.decision, 'reject')
        const index = requests.findIndex(request => request.id === input.requestID && request.sessionID === input.sessionID)
        assert.ok(index >= 0)
        replies.push(input)
        requests.splice(index, 1)
      },
    },
    tool: { async list() { return [{ id: 'memory', execute(_input, context) {
      if (context.signal.aborted) return Promise.reject(new Error('pre-aborted fake executor'))
      if (sessions.find(session => session.id === context.sessionID).permissions.at(-1).effect === 'deny') return Promise.reject(new Error('native permission denied fixture'))
      requests.push({ id: 'permission_unit', sessionID: context.sessionID, action: 'read', resources: [ctx.location.directory],
        source: { type: 'tool', messageID: context.messageID, id: wrongSource ? 'call_foreign' : context.id } })
      return new Promise((resolve, reject) => context.signal.addEventListener('abort', () => {
        if (resolveCancelled) resolve({ content: 'must not count as a cancelled operation' })
        else reject(new Error('cancelled fake executor'))
      }, { once: true }))
    } }] } },
  }
  return { root, ctx, sessions, requests, replies, disposed: () => disposed }
}

test('probe assertions and reject-only cleanup work with controlled native I/O boundaries', async () => {
  const fixture = probeFixture()
  const report = await runProbe(fixture.ctx, fixture.root)
  assert.equal(report.passed, true)
  assert.equal(report.checks.length, 16)
  assert.equal(report.modelRequests, 0)
  assert.equal(fixture.sessions.length, 2)
  assert.deepEqual(fixture.requests, [])
  assert.deepEqual(fixture.replies.map(reply => reply.decision), ['reject'])
  assert.equal(fixture.disposed(), true)
})

test('probe refuses a foreign prompt instead of replying to it', async () => {
  const fixture = probeFixture({ wrongSource: true })
  await assert.rejects(runProbe(fixture.ctx, fixture.root), /bound to the actual tool and fixture path/)
  assert.deepEqual(fixture.replies, [])
  assert.equal(fixture.disposed(), true)
})

test('probe fails a resolved cancellation and still rejects only its owned pending request', async () => {
  const fixture = probeFixture({ resolveCancelled: true })
  await assert.rejects(runProbe(fixture.ctx, fixture.root), /caller cancellation rejects without approving/)
  assert.deepEqual(fixture.replies.map(reply => reply.decision), ['reject'])
  assert.deepEqual(fixture.requests, [])
  assert.equal(fixture.disposed(), true)
})

test('probe model guard refuses an unexpected dispatch even during session creation', async () => {
  const fixture = probeFixture({ unexpectedModel: true })
  await assert.rejects(runProbe(fixture.ctx, fixture.root), /must not dispatch a model/)
  assert.deepEqual(fixture.replies, [])
  assert.equal(fixture.disposed(), true)
})

test('owned shutdown ignores only interrupted activation responses, never acquisition or guard failures', () => {
  for (const code of ['activation-request', 'activation-response']) {
    assert.equal(expectedTeardownFailure(code, false), false)
    assert.equal(expectedTeardownFailure(code, true), true)
  }
  for (const code of ['startup-pipe-bound', 'combined-startup-bound', 'activation-body-bound', 'activation-timeout', 'probe-report']) {
    assert.equal(expectedTeardownFailure(code, true), false, code)
  }
})
