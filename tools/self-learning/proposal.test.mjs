import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { makeProposal } from './proposal.mjs'
import { dispatch } from './dispatch.mjs'
import { checkReviewedProposal } from './review.mjs'
import { checkCanonicalSource } from './source-check.mjs'

function input() {
  return {
    kind: 'update', skill: 'browser-review',
    catalog: [{ name: 'browser-review', description: 'Review browser workflows' }, { name: 'desktop-review', description: 'Review desktop windows' }],
    previousContent: '---\nname: browser-review\ndescription: Review browser workflows.\nmetadata:\n  schema-version: "1"\n  category: "browser"\n  tags: "browser,verification"\n---\n# Browser\nOld guidance.\n',
    nextContent: '---\nname: browser-review\ndescription: Review browser workflows.\nmetadata:\n  schema-version: "1"\n  category: "browser"\n  tags: "browser,verification"\n---\n# Browser\nVerify the observable page state.\n',
    lesson: 'Verify browser page state before reporting success.',
    rationale: 'The existing workflow lacks this verification.',
    confidence: 'medium',
    uncertainty: 'Two root sessions may share context.',
    validation: 'Exercise a synthetic successful browser workflow.',
    evidence: [
      { sessionID: 'ses_1', messageID: 'msg_1', kind: 'failure', assessment: 'A missing state check preceded a failed report.' },
      { sessionID: 'ses_2', messageID: 'msg_2', kind: 'correction', assessment: 'A later correction requested observable verification.' },
    ],
  }
}

function dispatchFixture(value) {
  const calls = []
  const sessions = Object.fromEntries(['self', 'ses_1', 'ses_2'].map(id => [id, { id, projectID: 'project', location: { directory: '/repo' } }]))
  return { calls, deps: {
    location: { directory: '/repo', project: { id: 'project' } },
    session: { get: async ({ sessionID }) => sessions[sessionID] },
    permission: { assert: async ({ resources }) => { calls.push(resources[0]) } },
    skill: { list: async () => ({ location: { directory: '/repo' }, data: value.catalog.map(item => ({ ...item, path: `/repo/.opencode/skills/${item.name}/SKILL.md` })) }) },
    message: { get: async ({ messageID }) => ({ id: messageID, type: 'user', time: { created: 1 }, text: 'browser failed' }) },
  } }
}

test('update preview binds source and proposal without asserting approval', () => {
  const out = makeProposal(input())
  assert.equal(out.status, 'preview')
  assert.match(out.diff, /^--- a\/\.opencode\/skills\/browser-review\/SKILL\.md\n/)
  assert.match(out.diff, /-Old guidance\.\n\+---/)
  assert.match(out.diff, /\+Verify the observable page state\./)
  assert.match(out.baseHash, /^[0-9a-f]{64}$/)
  assert.match(out.proposalHash, /^[0-9a-f]{64}$/)
  assert.match(out.limitations.join(' '), /not verified facts/)
  assert.match(out.limitations.join(' '), /does not approve/)
  assert.equal(out.confidence, 'medium')
  assert.match(out.limitations.join(' '), /caller supplied/)
})

test('new skill requires a reason when the catalog has overlapping candidates', () => {
  const value = input()
  value.kind = 'create'
  value.skill = 'browser-observation'
  value.readmeContent = '# Browser observation\n\nReview observable page state.\n'
  delete value.previousContent
  assert.throws(() => makeProposal(value), /overlapping/)
  value.overlapReason = 'The existing skill handles navigation, not observation.'
  const out = makeProposal(value)
  assert.equal(out.baseHash, null)
  assert.equal(out.overlap[0].skill, 'browser-review')
  assert.match(out.diff, /^--- \/dev\/null\n/)
  assert.match(out.diff, /\+\+\+ b\/\.opencode\/skills\/browser-observation\/README\.md\n/)
  assert.match(out.readmeHash, /^[0-9a-f]{64}$/)
})

test('new project skill requires a bounded newline-terminated usage guide', () => {
  const value = input()
  value.kind = 'create'
  value.skill = 'browser-observation'
  value.overlapReason = 'This is a separate workflow.'
  delete value.previousContent
  assert.throws(() => makeProposal(value), /usage guide/)
  value.readmeContent = 'No trailing newline'
  assert.throws(() => makeProposal(value), /newline/)
  value.readmeContent = '# Usage\n'
  const before = makeProposal(value).proposalHash
  value.readmeContent += 'Another detail.\n'
  assert.notEqual(makeProposal(value).proposalHash, before)
  value.kind = 'update'
  value.skill = 'browser-review'
  value.previousContent = 'Old.\n'
  assert.throws(() => makeProposal(value), /separate reviewed proposal/)
})

test('refuses duplicates, missing semantic assessments, secret-like material and invalid targets', () => {
  const value = input()
  value.evidence[1].sessionID = value.evidence[0].sessionID
  assert.throws(() => makeProposal(value), /distinct sessions/)
  value.evidence[1].sessionID = 'ses_2'
  value.evidence[0].assessment = ''
  assert.throws(() => makeProposal(value), /assessment/)
  value.evidence[0].assessment = 'A corrected observation.'
  value.lesson = 'password=synthetic-secret'
  assert.throws(() => makeProposal(value), /sensitive/)
  value.lesson = 'Verify the page.'
  value.skill = '../escape'
  assert.throws(() => makeProposal(value), /target/)
})

test('refuses catalog conflicts and returns explicit no-change', () => {
  const value = input()
  value.nextContent = value.previousContent
  assert.equal(makeProposal(value).status, 'no-change')
  value.kind = 'create'
  assert.throws(() => makeProposal(value), /already exists/)
  value.kind = 'update'
  value.skill = 'missing'
  assert.throws(() => makeProposal(value), /absent/)
})

test('requires exact newline-preserving diff content', () => {
  const value = input()
  value.nextContent = 'content without trailing newline'
  assert.throws(() => makeProposal(value), /newline/)
})

test('tool dispatch rechecks catalog and references without treating checks as verification or approval', async () => {
  const value = input()
  const { deps, calls } = dispatchFixture(value)
  const context = { sessionID: 'self', messageID: 'call', id: 'tool' }
  const result = await dispatch({ proposal: value }, context, deps)
  assert.equal(result.proposalHash, makeProposal(value).proposalHash)
  assert.deepEqual(calls, ['project:project/skills', 'session:ses_1', 'session:ses_2'])
  assert.equal(result.checks.references.length, 2)
  assert.match(result.checks.limitations.join(' '), /not semantic evidence review or approval/)
  await assert.rejects(dispatch({ proposal: value, references: [] }, {}, {}), /cannot be mixed/)
  value.confidence = 'certain'
  await assert.rejects(dispatch({ proposal: value }, context, deps), /confidence/)
})

test('tool proposal refuses mismatched loader data and inaccessible or ineligible references', async () => {
  const context = { sessionID: 'self', messageID: 'call', id: 'tool' }
  for (const mode of ['catalog', 'denied', 'sensitive']) {
    const value = input()
    const { deps, calls } = dispatchFixture(value)
    if (mode === 'catalog') deps.skill.list = async () => ({ location: { directory: '/repo' }, data: [{ ...value.catalog[0], path: '/repo/skill' }] })
    if (mode === 'denied') deps.permission.assert = async ({ resources }) => { if (resources[0] === 'session:ses_1') throw new Error('denied') }
    if (mode === 'sensitive') deps.message.get = async ({ messageID }) => ({ id: messageID, type: 'user', time: { created: 1 }, text: 'browser failed password private' })
    await assert.rejects(dispatch({ proposal: value }, context, deps), mode === 'catalog' ? /catalog differs/ : mode === 'denied' ? /denied/ : /ineligible/)
    if (mode === 'catalog') assert.deepEqual(calls, ['project:project/skills'])
  }
})

test('refuses non-string evidence identifiers and terminal control characters', () => {
  const value = input()
  value.evidence[0].sessionID = 123
  assert.throws(() => makeProposal(value), /Invalid evidence/)
  value.evidence[0].sessionID = 'ses_1'
  value.nextContent += '\u001b[2J\n'
  assert.throws(() => makeProposal(value), /Invalid or sensitive proposed skill content/)
})

test('refuses carriage returns, line separators and bidi overrides in reviewed text', () => {
  for (const bad of ['\r', '\u2028', '\u2029', '\u202e', '\u2066', '\u200e']) {
    const value = input()
    value.nextContent = value.nextContent.replace('Verify the observable', `${bad}Verify the observable`)
    assert.throws(() => makeProposal(value), /Invalid or sensitive proposed skill content/, JSON.stringify(bad))
  }
  const lesson = input()
  lesson.lesson = `Verify\u202epage order.`
  assert.throws(() => makeProposal(lesson), /Invalid or sensitive generalized lesson/)
  const tabbed = input()
  tabbed.nextContent = tabbed.nextContent.replace('Verify the observable', '\tVerify the observable')
  assert.equal(makeProposal(tabbed).status, 'preview')
})

test('proposal bounds serialized output even when escaping expands content', () => {
  const value = input()
  value.previousContent = `${'"'.repeat(8100)}\n`
  value.nextContent = `${'\\'.repeat(8100)}\n`
  assert.throws(() => makeProposal(value), /output exceeds/)
})

test('review check detects changed proposal, existing source and create collision without writing', () => {
  const value = input()
  const reviewedHash = makeProposal(value).proposalHash
  const matched = checkReviewedProposal({ input: value, reviewedHash, currentContent: value.previousContent })
  assert.equal(matched.status, 'matched-snapshots')
  assert.match(matched.limitations.join(' '), /not proof of user approval/)
  assert.throws(() => checkReviewedProposal({ input: value, reviewedHash, currentContent: `${value.previousContent}changed\n` }), /source changed/)
  value.uncertainty = 'The evidence is weaker than initially thought.'
  assert.throws(() => checkReviewedProposal({ input: value, reviewedHash, currentContent: value.previousContent }), /does not match/)
  value.kind = 'create'
  value.skill = 'browser-observation'
  value.overlapReason = 'Observation is a distinct workflow.'
  value.readmeContent = '# Browser observation\n\nReview observable page state.\n'
  delete value.previousContent
  const createHash = makeProposal(value).proposalHash
  assert.throws(() => checkReviewedProposal({ input: value, reviewedHash: createHash, currentContent: '' }), /already exists/)
  assert.equal(checkReviewedProposal({ input: value, reviewedHash: createHash, currentContent: null }).status, 'matched-snapshots')
  value.readmeContent += 'Changed after review.\n'
  assert.throws(() => checkReviewedProposal({ input: value, reviewedHash: createHash, currentContent: null }), /does not match/)
})

test('preview diffs apply exactly to disposable update and creation targets', () => {
  const root = mkdtempSync('/tmp/opencode/self-learning-diff-')
  try {
    const value = input()
    const oldPath = join(root, '.opencode/skills/browser-review/SKILL.md')
    mkdirSync(join(root, '.opencode/skills/browser-review'), { recursive: true })
    writeFileSync(oldPath, value.previousContent)
    execFileSync('git', ['apply', '--check', '-'], { cwd: root, input: makeProposal(value).diff })
    execFileSync('git', ['apply', '-'], { cwd: root, input: makeProposal(value).diff })
    assert.equal(readFileSync(oldPath, 'utf8'), value.nextContent)
    value.kind = 'create'
    value.skill = 'browser-observation'
    value.overlapReason = 'Observation is a distinct workflow.'
    value.nextContent = '---\nname: browser-observation\ndescription: Observe browser state.\nmetadata:\n  schema-version: "1"\n  category: "browser"\n  tags: "browser,verification"\n---\n# Browser observation\nVerify page state.\n'
    value.readmeContent = '# Browser observation\n\nReview observable page state.\n'
    delete value.previousContent
    execFileSync('git', ['apply', '--check', '-'], { cwd: root, input: makeProposal(value).diff })
    execFileSync('git', ['apply', '-'], { cwd: root, input: makeProposal(value).diff })
    assert.equal(readFileSync(join(root, '.opencode/skills/browser-observation/SKILL.md'), 'utf8'), value.nextContent)
    assert.equal(readFileSync(join(root, '.opencode/skills/browser-observation/README.md'), 'utf8'), value.readmeContent)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('synthetic manual review gates apply, refuses stale reruns, and recovers both targets', async () => {
  const root = mkdtempSync('/tmp/opencode/self-learning-review-')
  try {
    const context = { sessionID: 'self', messageID: 'call', id: 'tool' }
    const session = { id: 'self', projectID: 'project', location: { directory: root } }
    const deps = { location: { directory: root, project: { id: 'project' } }, session: { get: async () => session }, permission: { assert: async () => {} } }
    const validateFixture = (name, content) => {
      const frontmatter = content.match(/^---\n([\s\S]+?)\n---\n# [^\n]+\n/)
      assert.ok(frontmatter)
      assert.match(frontmatter[1], new RegExp(`^name: ${name}$`, 'm'))
      assert.match(frontmatter[1], /^description: .+$/m)
      assert.match(frontmatter[1], /^  category: "[^"]+"$/m)
      assert.match(frontmatter[1], /^  tags: "[^"]+"$/m)
    }
    assert.throws(() => validateFixture('fixture', '---\nname: fixture\n---\n# Missing description\n'))
    mkdirSync(join(root, '.opencode/skills'), { recursive: true })
    for (const kind of ['update', 'create']) {
      const value = input()
      value.kind = kind
      if (kind === 'create') {
        value.skill = 'browser-observation'
        value.nextContent = '---\nname: browser-observation\ndescription: Observe browser state.\nmetadata:\n  schema-version: "1"\n  category: "browser"\n  tags: "browser,verification"\n---\n# Browser observation\nVerify page state.\n'
        value.readmeContent = '# Browser observation\n\nReview observable page state. See [skill](SKILL.md).\n'
        value.overlapReason = 'Observation is a distinct workflow.'
        delete value.previousContent
      }
      const file = join(root, '.opencode/skills', value.skill, 'SKILL.md')
      if (kind === 'update') {
        mkdirSync(join(root, '.opencode/skills', value.skill), { recursive: true })
        writeFileSync(file, value.previousContent)
      }
      const proposal = makeProposal(value)
      const before = kind === 'update' ? readFileSync(file, 'utf8') : null
      const applyFixture = async (approved, snapshot) => {
        if (!approved) throw new Error('Synthetic reviewer did not approve')
        checkReviewedProposal({ input: value, reviewedHash: proposal.proposalHash, currentContent: snapshot })
        await checkCanonicalSource({ input: value, reviewedHash: proposal.proposalHash }, context, deps)
        validateFixture(value.skill, value.nextContent)
        execFileSync('git', ['apply', '--check', '-'], { cwd: root, input: proposal.diff })
        execFileSync('git', ['apply', '-'], { cwd: root, input: proposal.diff })
      }
      await assert.rejects(applyFixture(false, before), /did not approve/)
      if (before !== null) assert.equal(readFileSync(file, 'utf8'), before)
      await applyFixture(true, before)
      assert.equal(readFileSync(file, 'utf8'), value.nextContent)
      if (kind === 'create') {
        assert.equal(readFileSync(join(root, '.opencode/skills', value.skill, 'README.md'), 'utf8'), value.readmeContent)
        assert.match(value.readmeContent, /\]\(SKILL\.md\)/)
        assert.equal(readFileSync(join(root, '.opencode/skills', value.skill, 'SKILL.md'), 'utf8'), value.nextContent)
      }
      validateFixture(value.skill, readFileSync(file, 'utf8'))
      await assert.rejects(applyFixture(true, readFileSync(file, 'utf8')), /source changed|already exists/)
      const conflict = value.nextContent.replace('name: ', 'name: changed-')
      writeFileSync(file, conflict)
      assert.throws(() => execFileSync('git', ['apply', '--reverse', '--check', '-'], { cwd: root, input: proposal.diff, stdio: 'pipe' }))
      assert.equal(readFileSync(file, 'utf8'), conflict)
      if (kind === 'create') assert.equal(readFileSync(join(root, '.opencode/skills', value.skill, 'README.md'), 'utf8'), value.readmeContent)
      writeFileSync(file, value.nextContent)
      execFileSync('git', ['apply', '--reverse', '--check', '-'], { cwd: root, input: proposal.diff })
      execFileSync('git', ['apply', '--reverse', '-'], { cwd: root, input: proposal.diff })
      if (before !== null) assert.equal(readFileSync(file, 'utf8'), before)
      else assert.throws(() => readFileSync(file, 'utf8'), { code: 'ENOENT' })
      if (kind === 'create') assert.throws(() => readFileSync(join(root, '.opencode/skills', value.skill, 'README.md'), 'utf8'), { code: 'ENOENT' })
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
