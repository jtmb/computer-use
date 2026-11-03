import assert from 'node:assert/strict'
import * as fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { createPersonality, DEFAULT_ID, SELECTION_KEY } from './core.mjs'

const body = 'Explain in plain English as if the reader knows nothing about technology.'
const skill = (id, rules = body) => `---\nname: ${id}\ndescription: Simple answers\nmetadata:\n  category: "communication"\n  tags: "personality,response-style"\n---\n\n# Style\n\n## Response style\n\n${rules}\n`
const catalog = '# Skills\n\n2 OpenCode skills.\n\n| Skill | Usage guide | Category | Tags |\n|---|---|---|---|\n'
const ctx = (sessionID = 'a', signal) => ({ sessionID, agent: 'build', messageID: 'message', id: 'call', signal })

async function fixture(t) {
  const directory = await fs.mkdtemp('/tmp/opencode/personality-test-')
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const root = path.join(directory, 'skills')
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, 'README.md'), catalog)
  for (const name of [DEFAULT_ID, 'personality-short']) {
    await fs.mkdir(path.join(root, name))
    await fs.writeFile(path.join(root, name, 'SKILL.md'), skill(name))
    await fs.writeFile(path.join(root, name, 'README.md'), 'Usage\n')
  }
  const entries = new Map()
  const permissions = []
  let deny
  let clock = 1000
  let loadedOverride
  const dependencies = {
    sourceRoot: root,
    sourceProjectRoot: directory,
    now: () => clock,
    fileIO: { ...fs },
    session: {
      get: async ({ sessionID }) => ({ id: sessionID, location: { directory } }),
    },
    storage: {
      get: async key => entries.get(key.slice(SELECTION_KEY.length + 1)),
      set: async (key, value) => { entries.set(key.slice(SELECTION_KEY.length + 1), value) },
      remove: async key => { entries.delete(key.slice(SELECTION_KEY.length + 1)) },
    },
    permission: { assert: async request => { permissions.push(request); if (request.action === deny) throw new Error('permission denied') } },
    skills: {
      list: async () => {
        if (loadedOverride) return loadedOverride
        const result = []
        for (const entry of await fs.readdir(root, { withFileTypes: true })) {
          if (!entry.isDirectory() || !entry.name.startsWith('personality-')) continue
          const filename = path.join(root, entry.name, 'SKILL.md')
          try { result.push({ id: entry.name, path: filename, content: (await fs.readFile(filename, 'utf8')).replace(/^---\n[\s\S]*?\n---\n/, '') }) } catch { /* Incomplete test bundle is not loaded. */ }
        }
        return result
      },
      reload: async () => {},
    },
  }
  const manager = createPersonality(dependencies)
  return { root, directory, manager, dependencies, entries, permissions, deny: value => { deny = value }, advance: () => { clock += 300_001 }, loaded: value => { loadedOverride = value } }
}

test('current default, list and exact read use source-backed loaded skills', async t => {
  const f = await fixture(t)
  assert.equal((await f.manager.execute({ op: 'current' }, ctx())).id, DEFAULT_ID)
  assert.equal((await f.manager.execute({ op: 'current' }, ctx())).origin, 'default')
  assert.equal((await f.manager.execute({ op: 'list' }, ctx())).styles.length, 2)
  assert.equal((await f.manager.execute({ op: 'read', id: DEFAULT_ID }, ctx())).instructions, body)
  assert.ok(f.permissions.some(p => p.action === 'skill' && p.resources[0] === DEFAULT_ID))
})

test('chat selection survives manager recreation without changing other chats; reset restores default', async t => {
  const f = await fixture(t)
  await f.manager.execute({ op: 'select', id: 'personality-short' }, ctx())
  const reopened = createPersonality(f.dependencies)
  assert.equal((await reopened.execute({ op: 'current' }, ctx())).id, 'personality-short')
  assert.equal((await reopened.execute({ op: 'current' }, ctx('b'))).id, DEFAULT_ID)
  assert.equal((await reopened.execute({ op: 'reset' }, ctx())).id, DEFAULT_ID)
  assert.equal(f.entries.size, 0)
})

test('fresh context and simulated post-compaction context each receive one correct reminder', async t => {
  const f = await fixture(t)
  for (const system of [[], []]) {
    const event = { sessionID: 'a', agent: 'build', system }
    await f.manager.context(event)
    await f.manager.context(event)
    assert.equal(system.length, 1)
    assert.match(system[0].text, /reader knows nothing about technology/)
    assert.match(system[0].text, /do not change permissions/)
  }
  await f.manager.execute({ op: 'select', id: 'personality-short' }, ctx())
  const changed = { sessionID: 'a', system: [] }
  await f.manager.context(changed)
  assert.match(changed.system[0].text, /personality-short/)
})

test('save preview writes nothing; apply saves a complete discoverable skill and catalog without selecting it', async t => {
  const f = await fixture(t)
  const input = { op: 'save', id: 'personality-new', description: 'Short everyday replies', instructions: 'Use a few simple sentences.' }
  const preview = await f.manager.execute(input, ctx())
  assert.equal(preview.status, 'preview')
  await assert.rejects(fs.stat(path.join(f.root, input.id)), { code: 'ENOENT' })
  assert.equal(await fs.readFile(path.join(f.root, 'README.md'), 'utf8'), catalog)
  const result = await f.manager.execute({ ...input, apply: true, expectRevision: preview.expectRevision }, ctx())
  assert.equal(result.status, 'saved')
  assert.equal(result.discovery, 'observed')
  assert.equal(result.selected, false)
  assert.equal(await fs.readFile(path.join(result.path, 'SKILL.md'), 'utf8'), preview.files['SKILL.md'])
  assert.match(await fs.readFile(path.join(f.root, 'README.md'), 'utf8'), /personality-new/)
  assert.equal((await f.manager.execute({ op: 'current' }, ctx())).id, DEFAULT_ID)
  await assert.rejects(f.manager.execute(input, ctx()), /already exists/)
})

test('previews bind exact content, chat, expiry and current catalog', async t => {
  const f = await fixture(t)
  const input = { op: 'save', id: 'personality-new', description: 'Simple replies', instructions: 'Be brief.' }
  const preview = await f.manager.execute(input, ctx())
  const applied = { ...input, apply: true, expectRevision: preview.expectRevision }
  await assert.rejects(f.manager.execute(applied, ctx('b')), /another chat/)
  await assert.rejects(f.manager.execute({ ...applied, instructions: 'Different rules.' }, ctx()), /stale/)
  await fs.appendFile(path.join(f.root, 'README.md'), '\nUser work\n')
  await assert.rejects(f.manager.execute(applied, ctx()), /stale/)
  const next = await f.manager.execute(input, ctx())
  f.advance()
  await assert.rejects(f.manager.execute({ ...applied, expectRevision: next.expectRevision }, ctx()), /stale/)
})

test('native denials prevent selection, saving and hook skill injection', async t => {
  const f = await fixture(t)
  f.deny('edit')
  await assert.rejects(f.manager.execute({ op: 'select', id: DEFAULT_ID }, ctx()), /denied/)
  assert.equal(f.entries.size, 0)
  const input = { op: 'save', id: 'personality-new', description: 'Simple', instructions: 'Be clear.' }
  const p = await f.manager.execute(input, ctx())
  await assert.rejects(f.manager.execute({ ...input, apply: true, expectRevision: p.expectRevision }, ctx()), /denied/)
  await assert.rejects(fs.stat(path.join(f.root, input.id)), { code: 'ENOENT' })
  f.deny('skill')
  const event = { sessionID: 'a', system: [] }
  await assert.rejects(f.manager.context(event), /denied/)
  assert.deepEqual(event.system, [])
})

test('aborted calls and unload refuse writes and reminders', async t => {
  const f = await fixture(t)
  const controller = new AbortController()
  controller.abort(new Error('stopped'))
  await assert.rejects(f.manager.execute({ op: 'select', id: DEFAULT_ID }, ctx('a', controller.signal)), /stopped/)
  assert.equal(f.permissions.length, 0)
  f.manager.dispose()
  await assert.rejects(f.manager.execute({ op: 'current' }, ctx()), /unloaded/)
  const event = { sessionID: 'a', system: [] }
  await f.manager.context(event)
  assert.deepEqual(event.system, [])
})

test('cancellation while permission settles prevents selection', async t => {
  const f = await fixture(t)
  const controller = new AbortController()
  f.dependencies.permission.assert = async request => { if (request.action === 'edit') controller.abort(new Error('cancelled during approval')) }
  await assert.rejects(f.manager.execute({ op: 'select', id: DEFAULT_ID }, ctx('a', controller.signal)), /cancelled/)
  assert.equal(f.entries.size, 0)
})

test('external source access has a separate native boundary', async t => {
  const f = await fixture(t)
  f.dependencies.session.get = async ({ sessionID }) => ({ id: sessionID, location: { directory: '/different-project' } })
  f.deny('external_directory')
  await assert.rejects(f.manager.execute({ op: 'current' }, ctx()), /denied/)
  assert.ok(f.permissions.some(request => request.action === 'external_directory'))
})

test('source aliases, hardlinks, oversized files and loaded-ID conflicts refuse', async t => {
  const f = await fixture(t)
  const filename = path.join(f.root, DEFAULT_ID, 'SKILL.md')
  await fs.link(filename, path.join(f.directory, 'alias'))
  await assert.rejects(f.manager.execute({ op: 'current' }, ctx()), /Unsafe/)
  await fs.unlink(path.join(f.directory, 'alias'))
  await fs.writeFile(filename, 'x'.repeat(20_000))
  await assert.rejects(f.manager.execute({ op: 'current' }, ctx()), /oversized/)
  await fs.writeFile(filename, skill(DEFAULT_ID))
  f.loaded([{ id: DEFAULT_ID, path: '/different/SKILL.md', content: body }])
  await assert.rejects(f.manager.execute({ op: 'current' }, ctx()), /current loaded skill/)
  const aliasRoot = path.join(f.directory, 'alias-root')
  await fs.symlink(f.root, aliasRoot)
  await assert.rejects(createPersonality({ ...f.dependencies, sourceRoot: aliasRoot }).execute({ op: 'current' }, ctx()), /aliased/)
})

test('invalid arguments are rejected before any permission or source access', async t => {
  const f = await fixture(t)
  for (const input of [{ op: 'unknown' }, { op: 'read', id: '../other' }, { op: 'current', sourceRoot: '/' }, { op: 'save', id: 'personality-new', description: 'x', instructions: 'x', apply: true }]) {
    await assert.rejects(f.manager.execute(input, ctx()))
  }
  assert.equal(f.permissions.length, 0)
})

test('malformed saved selection does not silently fall back or change it', async t => {
  const f = await fixture(t)
  f.entries.set('a', { version: 1, id: '../malicious' })
  await assert.rejects(f.manager.execute({ op: 'current' }, ctx()), /Invalid saved/)
  assert.equal(f.entries.get('a').id, '../malicious')
  assert.equal((await f.manager.execute({ op: 'reset' }, ctx())).id, DEFAULT_ID)
})

test('unrecognized catalog and occupied save lock preserve all existing bytes', async t => {
  const f = await fixture(t)
  const input = { op: 'save', id: 'personality-new', description: 'Clear', instructions: 'Use ordinary words.' }
  await fs.writeFile(path.join(f.root, 'README.md'), 'Custom catalog\n')
  await assert.rejects(f.manager.execute(input, ctx()), /manual reconciliation/)
  await fs.writeFile(path.join(f.root, 'README.md'), catalog)
  const p = await f.manager.execute(input, ctx())
  await fs.writeFile(path.join(f.root, '.personality-save.lock'), 'other writer')
  await assert.rejects(f.manager.execute({ ...input, apply: true, expectRevision: p.expectRevision }, ctx()), { code: 'EEXIST' })
  assert.equal(await fs.readFile(path.join(f.root, '.personality-save.lock'), 'utf8'), 'other writer')
  assert.equal(await fs.readFile(path.join(f.root, 'README.md'), 'utf8'), catalog)
})

test('saved style and quoted description round-trip exactly, including markdown headings', async t => {
  const f = await fixture(t)
  const input = { op: 'save', id: 'personality-heading', description: 'Simple "quoted" replies', instructions: 'Use short paragraphs.\n## Tone\nBe friendly.' }
  const p = await f.manager.execute(input, ctx())
  await f.manager.execute({ ...input, apply: true, expectRevision: p.expectRevision }, ctx())
  const saved = await f.manager.execute({ op: 'read', id: input.id }, ctx())
  assert.equal(saved.instructions, input.instructions)
  assert.equal(saved.description, input.description)
  assert.ok(!JSON.stringify(p).includes(catalog))
})

test('catalog mode and exact lock/file permission targets are preserved without temporary replacements', async t => {
  const f = await fixture(t)
  await fs.chmod(path.join(f.root, 'README.md'), 0o644)
  const input = { op: 'save', id: 'personality-mode', description: 'Clear', instructions: 'Use ordinary words.' }
  const p = await f.manager.execute(input, ctx())
  await f.manager.execute({ ...input, apply: true, expectRevision: p.expectRevision }, ctx())
  assert.equal((await fs.stat(path.join(f.root, 'README.md'))).mode & 0o777, 0o644)
  const edit = f.permissions.find(p => p.action === 'edit')
  assert.ok(edit.resources.includes(path.join(f.root, '.personality-save.lock')))
  assert.ok(edit.resources.includes(path.join(f.root, 'README.md')))
  assert.equal(edit.resources.some(p => /\.personality-catalog-/.test(p)), false)
  assert.ok(edit.resources.includes(path.join(f.root, input.id, 'SKILL.md')))
})

test('an already loaded foreign ID cannot be shadowed by saving', async t => {
  const f = await fixture(t)
  f.loaded([{ id: 'personality-new', path: '/other/SKILL.md', content: 'other' }])
  await assert.rejects(f.manager.execute({ op: 'save', id: 'personality-new', description: 'Simple', instructions: 'Clear.' }, ctx()), /another source/)
  await assert.rejects(fs.stat(path.join(f.root, 'personality-new')), { code: 'ENOENT' })
})

test('same-repository subdirectory is local, and exact skill-file read denial propagates', async t => {
  const f = await fixture(t)
  f.dependencies.session.get = async ({ sessionID }) => ({ id: sessionID, location: { directory: path.join(f.directory, 'tools') } })
  await f.manager.execute({ op: 'current' }, ctx())
  assert.equal(f.permissions.some(p => p.action === 'external_directory'), false)
  f.dependencies.permission.assert = async request => {
    if (request.action === 'read' && request.resources.includes(path.join(f.root, DEFAULT_ID, 'SKILL.md'))) throw new Error('exact file denied')
  }
  await assert.rejects(f.manager.execute({ op: 'current' }, ctx()), /exact file denied/)
})

test('post-commit cancellation reports the committed selection/reset and verifies readback', async t => {
  const f = await fixture(t)
  const controller = new AbortController()
  const originalSet = f.dependencies.storage.set
  f.dependencies.storage.set = async (key, value) => { await originalSet(key, value); controller.abort(new Error('late stop')) }
  const selected = await f.manager.execute({ op: 'select', id: 'personality-short' }, ctx('a', controller.signal))
  assert.equal(selected.changed, true)
  assert.equal(selected.cancelledAfterCommit, true)
  assert.equal(f.entries.get('a').id, 'personality-short')
  const removeController = new AbortController()
  const originalRemove = f.dependencies.storage.remove
  f.dependencies.storage.remove = async key => { await originalRemove(key); removeController.abort(new Error('late reset stop')) }
  const reset = await f.manager.execute({ op: 'reset' }, ctx('a', removeController.signal))
  assert.equal(reset.cancelledAfterCommit, true)
  assert.equal(reset.origin, 'default')
  f.dependencies.storage.set = async () => {}
  await assert.rejects(f.manager.execute({ op: 'select', id: 'personality-short' }, ctx()), /readback differs/)
})

test('reset recovers malformed selection even if the default or source is missing', async t => {
  const f = await fixture(t)
  f.entries.set('a', { version: 99, id: '../bad' })
  await fs.rename(f.root, f.root + '-moved')
  const result = await f.manager.execute({ op: 'reset' }, ctx())
  assert.equal(result.changed, true)
  assert.equal(result.styleAvailable, false)
  assert.equal(result.origin, 'default')
  assert.equal(f.entries.has('a'), false)
  const noChange = await f.manager.execute({ op: 'reset' }, ctx())
  assert.equal(noChange.changed, false)
})

test('reselecting the active personality reports no change and uses exact plugin storage keys', async t => {
  const f = await fixture(t)
  assert.equal((await f.manager.execute({ op: 'select', id: DEFAULT_ID }, ctx())).changed, true)
  assert.equal((await f.manager.execute({ op: 'select', id: DEFAULT_ID }, ctx())).changed, false)
  assert.ok(f.permissions.some(request => request.action === 'edit' && request.resources[0] === `${SELECTION_KEY}/a`))
})

test('late external catalog writes survive append without replacement and are reported', async t => {
  const f = await fixture(t)
  const input = { op: 'save', id: 'personality-race', description: 'Clear', instructions: 'Use ordinary words.' }
  const p = await f.manager.execute(input, ctx())
  assert.equal(p.catalogChange.operation, 'append')
  const originalOpen = fs.open
  f.dependencies.fileIO.open = async (filename, flags, ...args) => {
    const handle = await originalOpen(filename, flags, ...args)
    if (filename === path.join(f.root, 'README.md')) {
      const write = handle.write.bind(handle)
      handle.write = async (...values) => {
        await fs.appendFile(filename, '\nExternal editor work survives.\n')
        return write(...values)
      }
    }
    return handle
  }
  await assert.rejects(f.manager.execute({ ...input, apply: true, expectRevision: p.expectRevision }, ctx()), /Catalog state: append-issued/)
  const after = await fs.readFile(path.join(f.root, 'README.md'), 'utf8')
  assert.ok(after.startsWith(catalog))
  assert.match(after, /External editor work survives/)
  assert.match(after, /personality-race/)
})

test('failure after bundle creation reports exact catalog and cleanup state', async t => {
  const f = await fixture(t)
  const input = { op: 'save', id: 'personality-partial', description: 'Clear', instructions: 'Use ordinary words.' }
  const p = await f.manager.execute(input, ctx())
  f.dependencies.fileIO.writeFile = async () => { throw new Error('simulated file failure') }
  f.dependencies.fileIO.unlink = async () => { throw new Error('simulated cleanup failure') }
  await assert.rejects(f.manager.execute({ ...input, apply: true, expectRevision: p.expectRevision }, ctx()), error => {
    assert.match(error.message, /Catalog state: unchanged/)
    assert.match(error.message, /Save lock cleanup failed:/)
    assert.ok(error.message.includes(path.join(f.root, input.id)))
    return true
  })
  assert.equal(await fs.readFile(path.join(f.root, 'README.md'), 'utf8'), catalog)
})

test('saving without a catalog creates only the complete bundle and reports no catalog change', async t => {
  const f = await fixture(t)
  await fs.unlink(path.join(f.root, 'README.md'))
  const input = { op: 'save', id: 'personality-no-catalog', description: 'Clear', instructions: 'Use ordinary words.' }
  const p = await f.manager.execute(input, ctx())
  assert.equal(p.catalogChange, null)
  const result = await f.manager.execute({ ...input, apply: true, expectRevision: p.expectRevision }, ctx())
  assert.equal(result.catalogUpdated, false)
  assert.equal(result.discovery, 'observed')
  assert.equal((await f.manager.execute({ op: 'read', id: input.id }, ctx())).instructions, input.instructions)
  await assert.rejects(fs.stat(path.join(f.root, 'README.md')), { code: 'ENOENT' })
})

test('catalog size includes the proposed addition before any bundle is created', async t => {
  const f = await fixture(t)
  await fs.appendFile(path.join(f.root, 'README.md'), 'x'.repeat(128 * 1024 - Buffer.byteLength(catalog)))
  await assert.rejects(f.manager.execute({ op: 'save', id: 'personality-full', description: 'Clear', instructions: 'Be clear.' }, ctx()), /append would exceed/)
  await assert.rejects(fs.stat(path.join(f.root, 'personality-full')), { code: 'ENOENT' })
})
