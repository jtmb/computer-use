import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { stripTypeScriptTypes } from 'node:module'
import test from 'node:test'

async function plugin() {
  // Replace only the SDK's identity wrapper and module URL resolution. The real
  // entrypoint, tool executor, core and canonical style reads execute unchanged.
  const source = (await readFile(new URL('./index.ts', import.meta.url), 'utf8'))
    .replace("import { Plugin } from '@opencode/plugin'", 'const Plugin = { define: value => value }')
    .replace("'./core.mjs'", JSON.stringify(new URL('./core.mjs', import.meta.url).href))
    .replace("new URL('../../.opencode/skills', import.meta.url)", `new URL(${JSON.stringify(new URL('../../.opencode/skills', import.meta.url).href)})`)
    .replace("new URL('../..', import.meta.url)", `new URL(${JSON.stringify(new URL('../..', import.meta.url).href)})`)
  return (await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`)).default
}

async function host() {
  const definitions = new Map()
  const hooks = new Map()
  const selections = new Map()
  const sourceRoot = fileURLToPath(new URL('../../.opencode/skills', import.meta.url))
  let disposed = 0
  let permissionEffect = 'allow'
  let prompts = 0
  const context = {
    options: {},
    permission: {
      hook: async (name, callback) => { hooks.set(`permission:${name}`, callback); return { dispose: async () => { disposed++ } } },
      assert: async request => {
        const event = { ...request, effect: permissionEffect }
        await hooks.get('permission:evaluate')?.(event)
        if (event.effect === 'deny') throw new Error('permission denied')
        if (event.effect === 'ask') prompts++
      },
    },
    storage: { get: async key => selections.get(key), set: async (key, value) => { selections.set(key, value) }, remove: async key => { selections.delete(key) } },
    tool: { transform: async callback => {
      callback({ get: id => definitions.get(id), add: definition => { definitions.set(definition.name, definition) } })
      return { dispose: async () => { disposed++ } }
    } },
    session: {
      get: async ({ sessionID }) => ({ id: sessionID, location: { directory: '/tmp/opencode' } }),
      hook: async (name, callback) => { hooks.set(name, callback); return { dispose: async () => { disposed++ } } },
    },
    skill: { list: async () => {
      const filename = `${sourceRoot}/personality-plain-english/SKILL.md`
      return [{ id: 'personality-plain-english', path: filename, content: (await readFile(filename, 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, '') }]
    }, reload: async () => {} },
  }
  return { context, definitions, hooks, disposed: () => disposed, effect: value => { permissionEffect = value }, prompts: () => prompts }
}

test('real server entry registers and executes current/select/reset and cleans up both registrations', async () => {
  const p = await plugin()
  const h = await host()
  const cleanup = await p.setup(h.context)
  assert.deepEqual([...h.definitions.keys()], ['personality'])
  assert.deepEqual([...h.hooks.keys()], ['permission:evaluate', 'context'])
  const definition = h.definitions.get('personality')
  const ctx = { sessionID: 'entry-a', agent: 'build', messageID: 'message', id: 'call' }
  const current = JSON.parse((await definition.execute({ op: 'current' }, ctx)).content)
  assert.equal(current.id, 'personality-plain-english')
  const selected = JSON.parse((await definition.execute({ op: 'select', id: current.id }, ctx)).content)
  assert.equal(selected.origin, 'chat')
  const reset = JSON.parse((await definition.execute({ op: 'reset' }, ctx)).content)
  assert.equal(reset.origin, 'default')
  for (const sessionID of ['entry-a', 'entry-b']) {
    const event = { sessionID, agent: 'build', system: [] }
    await h.hooks.get('context')(event)
    assert.equal(event.system.length, 1)
    assert.match(event.system[0].text, /simple answer to a simple question/)
  }
  await cleanup()
  assert.equal(h.disposed(), 3)
  await assert.rejects(definition.execute({ op: 'current' }, ctx), /unloaded/)
})

test('canonical Plain English next-step rules reach current readback and fresh or resumed reminders', async () => {
  const p = await plugin()
  const h = await host()
  const cleanup = await p.setup(h.context)
  try {
    const ctx = { sessionID: 'next-steps', agent: 'build', messageID: 'message', id: 'call' }
    const current = JSON.parse((await h.definitions.get('personality').execute({ op: 'current' }, ctx)).content)
    const rules = current.instructions.split('\n').join(' ')
    for (const rule of ['Next steps', 'numbered list', 'short bold action label', 'who should do each step', 'No further action is needed', 'simple factual answers', 'not permission']) {
      assert.ok(rules.includes(rule), `canonical instructions must include ${rule}`)
    }
    for (const system of [[], [{ text: 'Summary of earlier work: the task is waiting for a user action.' }]]) {
      const event = { sessionID: ctx.sessionID, agent: 'build', system }
      await h.hooks.get('context')(event)
      const reminders = event.system.filter(part => part.text?.startsWith('[Response style:'))
      assert.equal(reminders.length, 1)
      assert.ok(reminders[0].text.includes(current.instructions))
    }
  } finally {
    await cleanup()
  }
})

test('passive reminder never prompts on ask rules and gives a model-visible notice; explicit tool retains ask', async () => {
  const p = await plugin()
  const h = await host()
  const cleanup = await p.setup(h.context)
  h.effect('ask')
  const event = { sessionID: 'ask', agent: 'build', system: [] }
  await h.hooks.get('context')(event)
  await h.hooks.get('context')(event)
  assert.equal(event.system.length, 1)
  assert.equal(h.prompts(), 0)
  assert.match(event.system[0].text, /reminder is unavailable or needs permission/)
  assert.doesNotMatch(event.system[0].text, /little notebook/)
  await h.definitions.get('personality').execute({ op: 'current' }, { sessionID: 'ask', agent: 'build', messageID: 'm', id: 'c' })
  assert.ok(h.prompts() > 0)
  await cleanup()
})

test('setup failure disposes registrations already made and disables captured executor', async () => {
  const p = await plugin()
  for (const failed of ['permission', 'session']) {
    const h = await host()
    h.context[failed].hook = async () => { throw new Error(`${failed} registration failed`) }
    await assert.rejects(p.setup(h.context), /registration failed/)
    assert.equal(h.disposed(), failed === 'permission' ? 1 : 2)
    await assert.rejects(h.definitions.get('personality').execute({ op: 'current' }, { sessionID: 's', messageID: 'm', id: 'c' }), /unloaded/)
  }
})

test('one failed disposal does not prevent the other registrations from being released', async () => {
  const p = await plugin()
  const h = await host()
  const originalHook = h.context.session.hook
  h.context.session.hook = async (...args) => {
    const registration = await originalHook(...args)
    return { dispose: async () => { await registration.dispose(); throw new Error('context cleanup failed') } }
  }
  const cleanup = await p.setup(h.context)
  await assert.rejects(cleanup(), /did not all dispose/)
  assert.equal(h.disposed(), 3)
  await cleanup()
  assert.equal(h.disposed(), 3)
})

test('a synchronously throwing disposer still releases the other registrations', async () => {
  const p = await plugin()
  const h = await host()
  const originalHook = h.context.session.hook
  h.context.session.hook = async (...args) => {
    await originalHook(...args)
    return { dispose() { throw new Error('synchronous context cleanup failure') } }
  }
  const cleanup = await p.setup(h.context)
  await assert.rejects(cleanup(), /did not all dispose/)
  assert.equal(h.disposed(), 2)
})
