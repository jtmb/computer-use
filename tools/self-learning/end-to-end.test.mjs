import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dispatch } from './dispatch.mjs'
import { messageReader, sessionAccess } from './adapter.mjs'

const context = { sessionID: 'self', messageID: 'call', id: 'tool' }
const oldSkill = '---\nname: browser-review\ndescription: Review browser workflows.\nmetadata:\n  schema-version: "1"\n  category: "browser"\n  tags: "browser,verification"\n---\n# Browser\nReview page behavior.\n'
const nextSkill = oldSkill.replace('Review page behavior.', 'Verify page state before reporting success.')
const catalogRow = name => `| [\`${name}\`](./${name}/SKILL.md) | [\`README.md\`](./${name}/README.md) | \`browser\` | \`browser,verification\` |\n`

function validateBundle(root) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const output = execFileSync(process.execPath, ['--test', '--test-name-pattern', 'local Markdown links in in-scope bundles and the portability note resolve|local catalog category/tag rows agree with every canonical skill frontmatter', 'scripts/shared-skill-portability.test.mjs'], { cwd: root, encoding: 'utf8', stdio: 'pipe', env })
  assert.match(output, /# pass 2\b/)
  return output
}

function expectInvalidBundle(root, expected) {
  assert.throws(() => validateBundle(root), error => {
    assert.match(String(error.stdout), expected)
    return true
  })
}

function fixture(root) {
  const sessions = Object.fromEntries(['self', 'one', 'two'].map(id => [id, { id, projectID: 'project', location: { directory: root } }]))
  const messages = Object.fromEntries(['one', 'two'].map((id, i) => [id, [{ id: `m${i + 1}`, type: 'user', time: { created: 1 }, text: 'browser failed; correction: check the observable page state' }]]))
  const events = []
  const state = { denyEdit: false }
  const session = {
    get: async ({ sessionID }) => sessions[sessionID],
    list: async () => ({ data: Object.values(sessions), cursor: { next: null } }),
  }
  const service = { discover: async () => ({ url: 'http://127.0.0.1:1234' }), headers: () => ({}) }
  const clientFactory = () => ({
    server: { info: async () => ({ pid: 42, version: '2.1.1' }) },
    session: { get: async ({ sessionID }) => sessions[sessionID], list: async () => ({ data: Object.values(sessions), cursor: { next: null } }), message: { get: async ({ sessionID, messageID }) => messages[sessionID].find(m => m.id === messageID) } },
    message: { list: async ({ sessionID }) => ({ data: messages[sessionID], cursor: { next: null } }) },
  })
  const message = messageReader({ service, clientFactory, hostSession: session, hostPid: 42, hostVersion: '2.1.1' })
  const skillPath = join(root, '.opencode/skills/browser-review/SKILL.md')
  const deps = {
    location: { directory: root, project: { id: 'project' } }, session: sessionAccess(session, message, context.sessionID), message,
    skill: { list: async () => ({ location: { directory: root }, data: [{ name: 'browser-review', description: 'Review browser workflows.', path: skillPath, content: oldSkill }] }) },
    permission: { assert: async request => { events.push(`${request.action}:${request.resources[0]}`); if (request.action === 'edit' && state.denyEdit) throw new Error('edit denied') } },
  }
  mkdirSync(join(root, '.opencode/skills/browser-review'), { recursive: true })
  writeFileSync(skillPath, oldSkill)
  writeFileSync(join(root, '.opencode/skills/browser-review/README.md'), '# Browser review\n\nSee [skill](SKILL.md).\n')
  writeFileSync(join(root, '.opencode/skills/README.md'), '# Skill catalog\n' + catalogRow('browser-review'))
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'docs'))
  copyFileSync(new URL('../../scripts/shared-skill-portability.test.mjs', import.meta.url), join(root, 'scripts/shared-skill-portability.test.mjs'))
  writeFileSync(join(root, 'docs/shared-skill-portability.md'), '# Synthetic portability note\n')
  return { deps, state, events, skillPath }
}

for (const kind of ['update', 'create']) {
  test(`synthetic end-to-end ${kind}: analyze, review, permission, apply and recovery`, async () => {
    const root = mkdtempSync('/tmp/opencode/self-learning-e2e-')
    try {
      const { deps, state, events, skillPath } = fixture(root)
      const analysis = await dispatch({}, context, deps)
      const pattern = analysis.patterns.find(item => item.id === 'browser-workflow:failure')
      assert.equal(pattern.evidence.length, 2)
      assert.match(analysis.limitations[0], /hypothesis/)
      const value = {
        kind, skill: kind === 'update' ? 'browser-review' : 'browser-observation',
        catalog: [{ name: 'browser-review', description: 'Review browser workflows.' }],
        ...(kind === 'update' ? { previousContent: oldSkill, nextContent: nextSkill } : {
          nextContent: '---\nname: browser-observation\ndescription: Observe page state.\nmetadata:\n  schema-version: "1"\n  category: "browser"\n  tags: "browser,verification"\n---\n# Browser observation\nVerify observable state.\n',
          readmeContent: '# Browser observation\n\nSee [skill](SKILL.md).\n',
          overlapReason: 'The existing skill reviews behavior; this workflow focuses on observation.',
        }),
        lesson: 'Verify browser page state before reporting success.', rationale: 'The checked workflow lacks explicit observation.',
        confidence: 'low', uncertainty: 'Synthetic evidence and separate roots do not prove independent events.', validation: 'Check name, description, metadata and usage-guide link.',
        evidence: pattern.evidence.map((item, i) => ({ sessionID: item.sessionID, messageID: item.messageID, kind: i ? 'correction' : 'failure', assessment: 'A reviewer asserted a missing or corrected state check.' })),
      }
      const target = join(root, '.opencode/skills', value.skill, 'SKILL.md')
      const guide = join(root, '.opencode/skills', value.skill, 'README.md')
      const catalogPath = join(root, '.opencode/skills/README.md')
      const catalogBefore = readFileSync(catalogPath, 'utf8')
      validateBundle(root)
      const proposal = await dispatch({ proposal: value }, context, deps)
      assert.equal(proposal.status, 'preview')
      assert.equal(readFileSync(skillPath, 'utf8'), oldSkill)
      if (kind === 'create') assert.equal(existsSync(target), false)
      const apply = async approved => {
        if (!approved) throw new Error('synthetic approval absent')
        await dispatch({ proposal: value, reviewedHash: proposal.proposalHash }, context, deps)
        for (const path of kind === 'create' ? [target, guide] : [target]) await deps.permission.assert({ action: 'edit', resources: [path] })
        execFileSync('git', ['apply', '--check', '-'], { cwd: root, input: proposal.diff })
        execFileSync('git', ['apply', '-'], { cwd: root, input: proposal.diff })
      }
      await assert.rejects(apply(false), /approval absent/)
      state.denyEdit = true
      await assert.rejects(apply(true), /edit denied/)
      state.denyEdit = false
      assert.equal(readFileSync(skillPath, 'utf8'), oldSkill)
      await apply(true)
      assert.equal(readFileSync(target, 'utf8'), value.nextContent)
      assert.match(value.nextContent, new RegExp(`^name: ${value.skill}$`, 'm'))
      assert.match(value.nextContent, /^description: .+$/m)
      assert.match(value.nextContent, /^  category: "browser"$/m)
      assert.match(value.nextContent, /^  tags: "browser,verification"$/m)
      if (kind === 'create') {
        assert.equal(readFileSync(guide, 'utf8'), value.readmeContent)
        assert.match(readFileSync(guide, 'utf8'), /\]\(SKILL\.md\)/)
        assert.equal(readFileSync(skillPath, 'utf8'), oldSkill)
        expectInvalidBundle(root, /browser-observation: missing or duplicate catalog row/)
        const row = catalogRow('browser-observation')
        const catalogDiff = `--- a/.opencode/skills/README.md\n+++ b/.opencode/skills/README.md\n@@ -1,2 +1,3 @@\n # Skill catalog\n ${catalogRow('browser-review')}+${row}`
        const applyCatalog = async approved => {
          if (!approved) throw new Error('synthetic catalog approval absent')
          if (readFileSync(catalogPath, 'utf8') !== catalogBefore) throw new Error('catalog changed since review')
          await deps.permission.assert({ action: 'edit', resources: [catalogPath] })
          execFileSync('git', ['apply', '--check', '-'], { cwd: root, input: catalogDiff })
          execFileSync('git', ['apply', '-'], { cwd: root, input: catalogDiff })
        }
        await assert.rejects(applyCatalog(false), /approval absent/)
        assert.equal(readFileSync(catalogPath, 'utf8'), catalogBefore)
        await applyCatalog(true)
        assert.equal(readFileSync(catalogPath, 'utf8'), catalogBefore + row)
        assert.equal(existsSync(join(root, '.opencode/skills/browser-observation/README.md')), true)
        validateBundle(root)
        writeFileSync(guide, value.readmeContent.replace('SKILL.md', 'missing.md'))
        expectInvalidBundle(root, /missing\.md/)
        writeFileSync(guide, value.readmeContent)
        validateBundle(root)
        await assert.rejects(applyCatalog(true), /catalog changed/)
        execFileSync('git', ['apply', '--reverse', '--check', '-'], { cwd: root, input: catalogDiff })
        execFileSync('git', ['apply', '--reverse', '-'], { cwd: root, input: catalogDiff })
        assert.equal(readFileSync(catalogPath, 'utf8'), catalogBefore)
      } else validateBundle(root)
      assert.ok(events.includes(`edit:${target}`))
      await assert.rejects(apply(true), /source changed|already exists/)
      execFileSync('git', ['apply', '--reverse', '--check', '-'], { cwd: root, input: proposal.diff })
      execFileSync('git', ['apply', '--reverse', '-'], { cwd: root, input: proposal.diff })
      assert.equal(readFileSync(skillPath, 'utf8'), oldSkill)
      if (kind === 'create') { assert.equal(existsSync(target), false); assert.equal(existsSync(guide), false) }
      validateBundle(root)
    } finally { rmSync(root, { recursive: true, force: true }) }
  })
}
