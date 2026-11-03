import assert from 'node:assert/strict'
import { lstat, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Plugin } from '@opencode/plugin'
import { DEFAULT_ID, PASSIVE_PERMISSION } from './core.mjs'
import { FIXTURE_MODEL, FIXTURE_SUMMARY } from './native-model-fixture.mjs'

const unwrap = value => value?.data ?? value
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))

async function probe(ctx, root, stage, trace) {
  const checks = []
  const check = (name, condition) => { assert.ok(condition, name); checks.push(name) }
  const tool = (await ctx.tool.list()).find(entry => entry.id === 'personality')
  check('real personality registration is executable', typeof tool?.execute === 'function')
  check('installed host is the reviewed version', (ctx.app.version.startsWith('v') ? ctx.app.version.slice(1) : ctx.app.version) === '2.1.1')
  await ctx.skill.reload()
  let catalog
  const skillDeadline = Date.now() + 3000
  do {
    catalog = unwrap(await ctx.skill.list())
    if (catalog.some(entry => entry.id === DEFAULT_ID)) break
    await delay(30)
  } while (Date.now() < skillDeadline)
  await writeFile(path.join(root, `${stage}-skills.json`), JSON.stringify({ location: ctx.location, entries: catalog.filter(entry => entry.id?.startsWith('personality')).map(entry => ({ id: entry.id, path: entry.path, firstLine: entry.content?.split('\n')[0], contentLength: entry.content?.length })), total: catalog.length }, null, 2), { mode: 0o600 })
  const context = sessionID => ({ sessionID, agent: 'build', messageID: 'msg_native_personality_fixture', id: 'call_native_personality_fixture', signal: new AbortController().signal, progress: async () => {} })
  const call = async (sessionID, input) => JSON.parse((await tool.execute(input, context(sessionID))).content)
  const prompt = async (sessionID, scenario) => {
    trace.scenario = `${stage}:${scenario}`
    await ctx.session.switchModel({ sessionID, model: FIXTURE_MODEL })
    await ctx.session.prompt({ sessionID, text: 'A disposable sample: acknowledge this request without using tools.' })
    await ctx.session.wait({ sessionID })
    const messages = unwrap(await ctx.session.context({ sessionID }))
    check(`${trace.scenario}: native session received the local reply`, JSON.stringify(messages).includes(`Fixture scenario: ${trace.scenario}`))
  }
  const allow = [
    { action: '*', resource: '*', effect: 'deny' },
    { action: 'read', resource: '*', effect: 'allow' },
    { action: 'edit', resource: 'personality/selection-v1/*', effect: 'allow' },
    { action: 'external_directory', resource: '*', effect: 'allow' },
    { action: 'edit', resource: path.join(root, 'source', '.opencode', 'skills', '**'), effect: 'allow' },
    { action: 'skill', resource: 'personality-*', effect: 'allow' },
  ]
  const idsPath = path.join(root, 'session-ids.json')
  if (stage === 'create') {
    const first = unwrap(await ctx.session.create({ title: 'Disposable personality A', agent: 'build', permissions: allow }))
    const second = unwrap(await ctx.session.create({ title: 'Disposable personality B', agent: 'build', permissions: allow }))
    check('native sessions have different IDs', first.id !== second.id)
    check('native current resolves the default', (await call(first.id, { op: 'current' })).origin === 'default')
    check('native list discovers the canonical style', (await call(first.id, { op: 'list' })).styles.some(style => style.id === DEFAULT_ID))
    check('native read returns the requested style', (await call(first.id, { op: 'read', id: DEFAULT_ID })).id === DEFAULT_ID)
    check('native select commits a chat override', (await call(first.id, { op: 'select', id: DEFAULT_ID })).origin === 'chat')
    check('native second chat remains unchanged', (await call(second.id, { op: 'current' })).origin === 'default')
    const save = { op: 'save', id: 'personality-native-fixture', description: 'Disposable native style', instructions: 'Use everyday words.\n## Tone\nBe clear.' }
    const preview = await call(first.id, save)
    check('native save preview writes no canonical bundle', preview.status === 'preview' && await lstat(path.join(preview.sourceRoot, preview.id)).then(() => false, error => error.code === 'ENOENT'))
    check('native save target is inside the verified scratch source copy', preview.sourceRoot === path.join(root, 'source', '.opencode', 'skills'))
    const saved = await call(first.id, { ...save, apply: true, expectRevision: preview.expectRevision })
    check('native save applies a complete fixture bundle', saved.status === 'saved' && saved.catalogUpdated === true)
    const discoveryDeadline = Date.now() + 3000
    while (!unwrap(await ctx.skill.list()).some(entry => entry.id === save.id) && Date.now() < discoveryDeadline) await delay(30)
    check('native saved style reads back headings exactly', (await call(first.id, { op: 'read', id: save.id })).instructions === save.instructions)
    check('native select can choose the newly saved style', (await call(first.id, { op: 'select', id: save.id })).id === save.id)
    await writeFile(idsPath, JSON.stringify({ first: first.id, second: second.id }), { flag: 'wx', mode: 0o600 })

    await ctx.session.update({ sessionID: second.id, permissions: [...allow, { action: 'skill', resource: DEFAULT_ID, effect: 'ask' }] })
    const effects = []
    const observation = await ctx.permission.hook('evaluate', event => {
      if (event.sessionID === second.id && event.action === 'skill') effects.push({ effect: event.effect, passive: event.metadata?.[PASSIVE_PERMISSION] === true })
    })
    try {
      const passive = ctx.permission.assert({ sessionID: second.id, agent: 'build', action: 'skill', resources: [DEFAULT_ID], metadata: { [PASSIVE_PERMISSION]: true } }).then(() => 'allowed', () => 'denied')
      const result = await Promise.race([passive, delay(2000).then(() => 'timeout')])
      const pending = unwrap(await ctx.permission.list({ sessionID: second.id }))
      // Reject only this disposable test's requests if a regression prompted.
      if (result === 'timeout') for (const request of pending) await ctx.permission.reply({ sessionID: second.id, requestID: request.id, decision: 'reject' })
      check('real assert invokes passive evaluate hook and refuses ask', result === 'denied' && effects.some(event => event.passive && event.effect === 'deny'))
      check('passive request creates no native prompt', pending.length === 0)
      const explicit = call(second.id, { op: 'current' }).then(() => 'allowed', () => 'rejected')
      let prompt
      const deadline = Date.now() + 2000
      while (!prompt && Date.now() < deadline) {
        prompt = unwrap(await ctx.permission.list({ sessionID: second.id }))[0]
        if (!prompt) await delay(20)
      }
      check('explicit tool call retains a real native ask', !!prompt && effects.some(event => !event.passive && event.effect === 'ask'))
      await ctx.permission.reply({ sessionID: second.id, requestID: prompt.id, decision: 'reject' })
      check('rejecting the disposable prompt refuses the operation', await explicit === 'rejected')
    } finally { await observation.dispose() }
    await ctx.session.update({ sessionID: second.id, permissions: [...allow, { action: 'read', resource: '*', effect: 'deny' }] })
    check('native read deny propagates', await call(second.id, { op: 'current' }).then(() => false, () => true))
    await ctx.session.update({ sessionID: second.id, permissions: allow })
    check('no model dispatch occurred during native contract verification', trace.count === 0)
    await prompt(second.id, 'fresh-default')
    await prompt(first.id, 'selected')
    await call(first.id, { op: 'select', id: DEFAULT_ID })
    await prompt(first.id, 'style-change')
    await call(first.id, { op: 'reset' })
    await prompt(first.id, 'after-reset')
    await call(first.id, { op: 'select', id: save.id })
    trace.scenario = `${stage}:native-compaction`
    await ctx.session.compact({ sessionID: first.id })
    await ctx.session.wait({ sessionID: first.id })
    const compacted = unwrap(await ctx.session.context({ sessionID: first.id }))
    await writeFile(path.join(root, 'native-compaction-context.json'), JSON.stringify(compacted, null, 2), { mode: 0o600 })
    const summary = compacted.find(message => message.type === 'compaction' && message.status === 'completed')
    check('native manual compaction completes with the actual local-model summary', summary?.summary === FIXTURE_SUMMARY && summary.reason === 'manual')
    await writeFile(path.join(root, 'native-compaction.json'), JSON.stringify(summary, null, 2), { mode: 0o600 })
    await prompt(first.id, 'after-compaction')
  } else {
    const ids = JSON.parse(await readFile(idsPath, 'utf8'))
    const reopened = await call(ids.first, { op: 'current' })
    check('chat selection survives a private host restart', reopened.origin === 'chat' && reopened.id === 'personality-native-fixture')
    check('second chat remains at default after restart', (await call(ids.second, { op: 'current' })).origin === 'default')
    if (stage === 'reopen') {
      await prompt(ids.first, 'resumed')
      const directory = path.join(root, 'project-b')
      await ctx.session.move({ sessionID: ids.first, directory })
      let moved
      const deadline = Date.now() + 3000
      do {
        moved = unwrap(await ctx.session.get({ sessionID: ids.first }))
        if (moved.location.directory === directory) break
        await delay(20)
      } while (Date.now() < deadline)
      check('disposable native chat moves to the second project', moved.location.directory === directory)
    } else {
      check('probe is loaded in the second project', ctx.location.directory === path.join(root, 'project-b'))
      check('moved chat retains its personality across projects', (await call(ids.first, { op: 'current' })).origin === 'chat')
      await prompt(ids.first, 'project-two-selected')
      check('native reset removes only the moved chat choice', (await call(ids.first, { op: 'reset' })).origin === 'default')
      check('other chat is still unchanged after reset', (await call(ids.second, { op: 'current' })).origin === 'default')
      await prompt(ids.first, 'project-two-reset')
    }
  }
  check('actual local-model dispatches were observed', trace.count > 0)
  return { stage, hostVersion: ctx.app.version, location: ctx.location.directory, checks, passed: true, observedModelDispatches: trace.count, dispatches: trace.events }
}

export default Plugin.define({
  id: 'computer-use.personality-native-probe',
  async setup(ctx) {
    const root = ctx.options.scratchRoot
    const stage = ctx.options.stage
    if (typeof root !== 'string' || !root.startsWith('/tmp/opencode/personality-native-') || path.normalize(root) !== root || !['create', 'reopen', 'moved'].includes(stage)) throw new Error('Native probe is restricted to its explicit disposable fixture.')
    const modelURL = new URL(ctx.options.modelBaseURL)
    if (modelURL.hostname !== '127.0.0.1' || modelURL.protocol !== 'http:' || modelURL.pathname !== '/v1') throw new Error('Only the private loopback fixture endpoint is allowed.')
    const trace = { count: 0, scenario: `${stage}:contracts`, events: [] }
    const modelObservation = await ctx.session.hook('model.request', event => {
      if (event.model.providerID !== FIXTURE_MODEL.providerID || event.model.id !== FIXTURE_MODEL.id) throw new Error('Native fixture refuses dispatch to any external model.')
      trace.count++
      trace.events.push({ kind: event.kind, scenario: trace.scenario })
      if (event.baseURL && event.baseURL !== modelURL.href) throw new Error('Native fixture refuses an unexpected endpoint override.')
      event.headers['x-personality-fixture-kind'] = event.kind
      event.headers['x-personality-fixture-scenario'] = trace.scenario
    })
    // Let location activation finish before making native calls into that host.
    const timer = setTimeout(() => {
      void probe(ctx, root, stage, trace).catch(error => ({ stage, passed: false, error: String(error), stack: error?.stack?.slice(0, 3000), dispatches: trace.events })).then(report => writeFile(path.join(root, `${stage}.json`), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 })).catch(console.error)
    }, 0)
    return async () => { clearTimeout(timer); await modelObservation.dispose() }
  },
})
