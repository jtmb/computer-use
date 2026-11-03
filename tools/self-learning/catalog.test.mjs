import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dispatch } from './dispatch.mjs'

const context = { sessionID: 'self', messageID: 'call', id: 'tool' }

function fixture() {
  const calls = []
  const session = { id: 'self', projectID: 'project', location: { directory: '/repo' } }
  const data = [
    { name: 'browser-review', description: 'Review browser workflows', path: '/repo/.opencode/skills/browser-review/SKILL.md', content: 'private skill body not returned' },
    { name: 'desktop-review', description: 'Review desktop workflows', path: '/other/desktop-review/SKILL.md', content: 'other body not returned' },
  ]
  const deps = {
    location: { directory: '/repo', project: { id: 'project' } },
    session: { get: async () => { calls.push('session'); return session } },
    permission: { assert: async input => { calls.push(input.resources[0]) } },
    skill: { list: async input => { calls.push('list'); assert.equal(input.location.directory, '/repo'); return { location: { directory: '/repo' }, data } } },
  }
  return { deps, calls, data, session }
}

test('loaded catalog checks permissions and caller, returning metadata without skill bodies or paths', async () => {
  const f = fixture()
  const out = await dispatch({ catalog: true }, context, f.deps)
  assert.deepEqual(f.calls, ['session', 'project:project/skills', 'list', 'session'])
  assert.deepEqual(out.catalog.map(x => x.projectSource), [true, false])
  assert.doesNotMatch(JSON.stringify(out), /private skill body|other body|\/other/)
  assert.match(out.limitations.join(' '), /no pagination or acquisition-byte limit/)
  assert.match(out.limitations.join(' '), /not a complete or fresh filesystem inventory/)
})

test('denied, moved, global, or mixed requests do not read the skill list', async () => {
  for (const mode of ['denied', 'moved', 'global', 'mixed']) {
    const f = fixture()
    if (mode === 'denied') f.deps.permission.assert = async () => { throw new Error('denied') }
    if (mode === 'moved') f.session.location.directory = '/elsewhere'
    if (mode === 'global') f.deps.location.project.id = 'global'
    const input = mode === 'mixed' ? { catalog: true, maxSessions: 2 } : { catalog: true }
    await assert.rejects(dispatch(input, context, f.deps))
    assert.equal(f.calls.includes('list'), false, mode)
  }
})

test('refuses wrong location, duplicate names, oversized catalog and changed caller', async () => {
  const f = fixture()
  f.deps.skill.list = async () => ({ location: { directory: '/other' }, data: f.data })
  await assert.rejects(dispatch({ catalog: true }, context, f.deps), /catalog or location/)
  f.deps.skill.list = async () => ({ location: { directory: '/repo' }, data: [f.data[0], f.data[0]] })
  await assert.rejects(dispatch({ catalog: true }, context, f.deps), /duplicate/)
  f.deps.skill.list = async () => ({ location: { directory: '/repo' }, data: Array(201).fill(f.data[0]) })
  await assert.rejects(dispatch({ catalog: true }, context, f.deps), /200 entries/)
  f.deps.skill.list = async () => { f.session.projectID = 'other'; return { location: { directory: '/repo' }, data: f.data } }
  await assert.rejects(dispatch({ catalog: true }, context, f.deps), /Calling session/)
})

test('refuses output larger than 32 KiB and control characters in descriptions', async () => {
  const f = fixture()
  f.data[0].description = '\u001b[2J'
  await assert.rejects(dispatch({ catalog: true }, context, f.deps), /metadata/)
  f.deps.skill.list = async () => ({ location: { directory: '/repo' }, data: Array.from({ length: 30 }, (_, i) => ({ name: `skill-${i}`, description: 'a'.repeat(1900), path: `/repo/skills/${i}` })) })
  await assert.rejects(dispatch({ catalog: true }, context, f.deps), /output exceeds/)
})
