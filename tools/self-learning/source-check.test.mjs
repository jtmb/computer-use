import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { checkCanonicalSource } from './source-check.mjs'
import { makeProposal } from './proposal.mjs'
import { dispatch } from './dispatch.mjs'

const context = { sessionID: 'self', messageID: 'call', id: 'tool' }

function fixture(root, kind = 'update') {
  const input = {
    kind, skill: 'browser-review',
    catalog: kind === 'update' ? [{ name: 'browser-review', description: 'Browser review' }] : [],
    previousContent: kind === 'update' ? '---\nname: browser-review\n---\nOld.\n' : undefined,
    nextContent: '---\nname: browser-review\n---\nNew.\n', lesson: 'Verify browser state.',
    ...(kind === 'create' ? { readmeContent: '# Browser review\n\nReview browser state.\n' } : {}),
    rationale: 'Missing check.', confidence: 'medium', uncertainty: 'Evidence may share context.', validation: 'Check observable state.',
    evidence: [{ sessionID: 'one', messageID: 'm1', kind: 'failure', assessment: 'A check was absent.' }, { sessionID: 'two', messageID: 'm2', kind: 'correction', assessment: 'A check was requested.' }],
  }
  const calls = []
  const session = { id: 'self', projectID: 'project', location: { directory: root } }
  const deps = { location: { directory: root, project: { id: 'project' } }, session: { get: async () => session }, permission: { assert: async x => { calls.push(x.resources[0]) } } }
  mkdirSync(join(root, '.opencode/skills'), { recursive: true })
  const target = join(root, '.opencode/skills/browser-review/SKILL.md')
  if (kind === 'update') { mkdirSync(join(root, '.opencode/skills/browser-review')); writeFileSync(target, input.previousContent) }
  return { input, deps, calls, session, target, reviewedHash: makeProposal(input).proposalHash }
}

test('reads bounded canonical source with permissions but does not write or grant approval', async () => {
  const root = mkdtempSync('/tmp/opencode/source-check-')
  try {
    const f = fixture(root)
    const result = await checkCanonicalSource(f, context, f.deps)
    assert.equal(result.status, 'source-checked')
    assert.match(result.limitations.join(' '), /does not establish user approval/)
    assert.ok(f.calls.includes(f.target))
    assert.equal(readFileSync(f.target, 'utf8'), f.input.previousContent)
    writeFileSync(f.target, 'Changed after preview.\n')
    await assert.rejects(checkCanonicalSource(f, context, f.deps), /source changed since preview/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('creation requires an absent skill directory and refuses a later collision', async () => {
  const root = mkdtempSync('/tmp/opencode/source-check-')
  try {
    const f = fixture(root, 'create')
    assert.equal((await checkCanonicalSource(f, context, f.deps)).status, 'source-checked')
    mkdirSync(join(root, '.opencode/skills/browser-review'))
    await assert.rejects(checkCanonicalSource(f, context, f.deps), /already exists/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('creation accepts absent project skill directories but updates still require the source', async () => {
  for (const absent of ['.opencode', '.opencode/skills']) {
    const root = mkdtempSync('/tmp/opencode/source-check-')
    try {
      const create = fixture(root, 'create')
      if (absent === '.opencode') rmSync(join(root, '.opencode'), { recursive: true, force: true })
      else rmSync(join(root, '.opencode/skills'), { recursive: true, force: true })
      const result = await checkCanonicalSource(create, context, create.deps)
      assert.equal(result.status, 'source-checked', absent)
      assert.deepEqual(result.absentDirectories, [join(root, absent === '.opencode' ? '.opencode' : '.opencode/skills')])
      assert.match(result.limitations.join(' '), /not locked against later creation/)
      const update = fixture(root, 'update')
      if (absent === '.opencode') rmSync(join(root, '.opencode'), { recursive: true, force: true })
      else rmSync(join(root, '.opencode/skills'), { recursive: true, force: true })
      await assert.rejects(checkCanonicalSource(update, context, update.deps), error => error.code === 'ENOENT', absent)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
  const root = mkdtempSync('/tmp/opencode/source-check-')
  try {
    const f = fixture(root, 'create')
    rmSync(join(root, '.opencode'), { recursive: true, force: true })
    writeFileSync(join(root, '.opencode'), 'not a directory\n')
    await assert.rejects(checkCanonicalSource(f, context, f.deps), error => error.code === 'ENOTDIR')
    rmSync(join(root, '.opencode'))
    symlinkSync('/tmp', join(root, '.opencode'))
    await assert.rejects(checkCanonicalSource(f, context, f.deps), error => ['ELOOP', 'ENOTDIR'].includes(error.code))
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('refuses symlinks, hardlinks, oversized files, denied reads and caller moves', async () => {
  for (const mode of ['symlink', 'hardlink', 'oversized', 'denied', 'moved']) {
    const root = mkdtempSync('/tmp/opencode/source-check-')
    try {
      const f = fixture(root)
      if (mode === 'symlink') {
        const dir = join(root, '.opencode/skills/browser-review')
        rmSync(dir, { recursive: true })
        symlinkSync(root, dir)
      }
      if (mode === 'hardlink') linkSync(f.target, join(root, 'other-link'))
      if (mode === 'oversized') writeFileSync(f.target, 'a'.repeat(8193))
      if (mode === 'denied') f.deps.permission.assert = async ({ resources }) => { if (resources[0] === f.target) throw new Error('denied') }
      if (mode === 'moved') f.session.location.directory = '/elsewhere'
      await assert.rejects(checkCanonicalSource(f, context, f.deps), undefined, mode)
    } finally { rmSync(root, { recursive: true, force: true }) }
  }
})

test('bad review hash is rejected before any file or session access', async () => {
  const root = mkdtempSync('/tmp/opencode/source-check-')
  try {
    const f = fixture(root)
    f.deps.session.get = async () => { throw new Error('unexpected session read') }
    await assert.rejects(checkCanonicalSource({ ...f, reviewedHash: 'bad' }, context, f.deps), /does not match/)
    assert.deepEqual(f.calls, [])
  } finally { rmSync(root, { recursive: true, force: true }) }
})

test('tool review combines loader, reference, and canonical-source rechecks without writing', async () => {
  const root = mkdtempSync('/tmp/opencode/source-check-')
  try {
    const f = fixture(root)
    f.deps.session.get = async ({ sessionID }) => ({ id: sessionID, projectID: 'project', location: { directory: root } })
    f.deps.skill = { list: async () => ({ location: { directory: root }, data: f.input.catalog.map(item => ({ ...item, path: f.target })) }) }
    f.deps.message = { get: async ({ messageID }) => ({ id: messageID, type: 'user', time: { created: 1 }, text: 'browser failed' }) }
    const result = await dispatch({ proposal: f.input, reviewedHash: f.reviewedHash }, context, f.deps)
    assert.equal(result.status, 'source-checked')
    assert.ok(f.calls.includes('project:project/skills'))
    assert.ok(f.calls.includes('session:one'))
    assert.ok(f.calls.includes('session:two'))
    assert.ok(f.calls.includes(f.target))
    assert.equal(readFileSync(f.target, 'utf8'), f.input.previousContent)
    writeFileSync(f.target, 'source changed\n')
    await assert.rejects(dispatch({ proposal: f.input, reviewedHash: f.reviewedHash }, context, f.deps), /source changed since preview/)
  } finally { rmSync(root, { recursive: true, force: true }) }
})
