import assert from 'node:assert/strict'
import { rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

const unwrap = value => value?.data ?? value
const pause = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

export function restrictiveRules(readEffect) {
  assert.ok(readEffect === 'deny' || readEffect === 'ask')
  return [
    { action: '*', resource: '*', effect: 'deny' },
    { action: 'read', resource: '*', effect: readEffect },
  ]
}

export async function runProbe(ctx, root) {
  const checks = []
  const check = (name, condition) => { assert.ok(condition, name); checks.push(name) }
  check('private fixture location is exact', ctx.location.directory === path.join(root, 'project'))
  check('native host is the inspected 2.1.1 version', (ctx.app.version.startsWith('v') ? ctx.app.version.slice(1) : ctx.app.version) === '2.1.1')
  const tool = (await ctx.tool.list()).find(entry => entry.id === 'memory')
  check('actual registered memory tool is executable', typeof tool?.execute === 'function')
  let modelRequests = 0
  const modelGuard = await ctx.session.hook('model.request', () => {
    modelRequests++
    throw new Error('The memory permission fixture must not dispatch a model')
  })
  let pendingRequest
  let askSession
  try {
    const denied = unwrap(await ctx.session.create({ title: 'Disposable memory deny', agent: 'build', permissions: restrictiveRules('deny') }))
    askSession = unwrap(await ctx.session.create({ title: 'Disposable memory ask', agent: 'build', permissions: restrictiveRules('ask') }))
    check('native sessions are distinct', denied.id !== askSession.id)
    let serial = 0
    const call = (sessionID, signal) => tool.execute({ op: 'list', scope: 'repo', limit: 1 }, {
      sessionID, agent: 'build', messageID: 'msg_memory_native_fixture', id: `call_memory_native_${++serial}`,
      signal, progress: async () => {},
    }).then(value => ({ status: 'resolved', value }), error => ({ status: 'rejected', error }))
    const firstDenied = await call(denied.id, new AbortController().signal)
    const deniedMessage = String(firstDenied.error ?? '').toLowerCase()
    check('native deny propagates rather than becoming a memory result', firstDenied.status === 'rejected' &&
      (deniedMessage.includes('permission') || deniedMessage.includes('blocked') || deniedMessage.includes('denied')))
    check('native deny produces no pending approval', unwrap(await ctx.permission.list({ sessionID: denied.id })).length === 0)
    const preAborted = new AbortController()
    preAborted.abort(new Error('Disposable memory pre-abort'))
    check('pre-aborted native executor rejects', (await call(askSession.id, preAborted.signal)).status === 'rejected')
    check('pre-aborted native executor creates no prompt', unwrap(await ctx.permission.list({ sessionID: askSession.id })).length === 0)

    const caller = new AbortController()
    const pending = call(askSession.id, caller.signal)
    const expectedCallID = `call_memory_native_${serial}`
    const deadline = Date.now() + 2000
    for (let reads = 0; reads < 100 && Date.now() < deadline; reads++) {
      const requests = unwrap(await ctx.permission.list({ sessionID: askSession.id }))
      if (requests.length) {
        check('only one owned native read prompt exists', requests.length === 1)
        const candidate = requests[0]
        check('native prompt is bound to the actual tool and fixture path', candidate.sessionID === askSession.id && candidate.action === 'read' &&
          candidate.resources.length === 1 && candidate.resources[0] === ctx.location.directory &&
          candidate.source?.type === 'tool' && candidate.source.messageID === 'msg_memory_native_fixture' && candidate.source.id === expectedCallID)
        pendingRequest = candidate
        break
      }
      await pause(20)
    }
    check('the real native assertion reaches ask', !!pendingRequest)
    caller.abort(new Error('Disposable memory caller cancellation'))
    let timer
    const cancelled = await Promise.race([pending, new Promise(resolve => {
      timer = setTimeout(() => resolve({ status: 'timeout' }), 2000)
    })]).finally(() => clearTimeout(timer))
    check('native executor caller cancellation rejects without approving', cancelled.status === 'rejected')
    const stillPending = unwrap(await ctx.permission.list({ sessionID: askSession.id }))
    check('single-input assertion does not claim to dismiss its pending prompt', stillPending.length === 1 && stillPending[0].id === pendingRequest.id)

    // Reject only this fresh host's exact request; never exercise once/always approval.
    await ctx.permission.reply({ sessionID: askSession.id, requestID: pendingRequest.id, decision: 'reject' })
    pendingRequest = undefined
    check('explicit rejection removes the fixture prompt', unwrap(await ctx.permission.list({ sessionID: askSession.id })).length === 0)
    check('another native call remains usable and denied after cancellation', (await call(denied.id, new AbortController().signal)).status === 'rejected')
    check('no model request was dispatched', modelRequests === 0)
    return { passed: true, hostVersion: ctx.app.version, checks, modelRequests, permissionReplies: ['reject'], sessionsCreated: 2 }
  } finally {
    if (pendingRequest && askSession) {
      await ctx.permission.reply({ sessionID: askSession.id, requestID: pendingRequest.id, decision: 'reject' })
    }
    await modelGuard.dispose()
  }
}

export default {
  id: 'computer-use.memory-native-probe',
  async setup(ctx) {
    const root = ctx.options.scratchRoot
    if (typeof root !== 'string' || path.normalize(root) !== root || !root.startsWith('/tmp/opencode/memory-native-')) {
      throw new Error('Memory native probe requires its explicit disposable root')
    }
    const timer = setTimeout(() => {
      void runProbe(ctx, root)
        .catch(error => ({ passed: false, error: String(error).slice(0, 2000) }))
        .then(async report => {
          const body = JSON.stringify(report, null, 2) + '\n'
          assert.ok(Buffer.byteLength(body) <= 32768)
          const temporary = path.join(root, 'probe.partial')
          await writeFile(temporary, body, { flag: 'wx', mode: 0o600 })
          await rename(temporary, path.join(root, 'probe.json'))
        })
        .catch(() => {})
    }, 0)
    return () => clearTimeout(timer)
  },
}
