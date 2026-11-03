import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const skill = new URL('../../.opencode/skills/self-learning/SKILL.md', import.meta.url)
const guide = new URL('../../.opencode/skills/self-learning/README.md', import.meta.url)

test('skill keeps exact user approval and native permissions separate from preview checks', async () => {
  const content = await readFile(skill, 'utf8')
  assert.match(content, /only the exact diff the user specifically approved/i)
  assert.match(content, /permission grant or reviewer assertion is not approval/i)
  assert.match(content, /source and Git status/i)
  assert.match(content, /not a lock or permission substitute/i)
  assert.match(content, /do not bypass a denial/i)
  assert.match(content, /leave any proposal\s+requiring absent authority unapplied/i)
})

test('skill and guide require bundle validation and preserve conflicts', async () => {
  const content = await readFile(skill, 'utf8')
  const usage = await readFile(guide, 'utf8')
  assert.match(content, /usage guides and separately reviewed catalog or bundle diffs/i)
  assert.match(content, /never\s+blindly reverse over later changes/i)
  assert.match(content, /validate the changed bundle, links and catalog/i)
  assert.match(usage, /a hash is not\s+approval or a lock/i)
})
