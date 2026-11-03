import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('server wiring registers only personality and a context reminder; no compaction replacement', async () => {
  const source = await readFile(new URL('./index.ts', import.meta.url), 'utf8')
  assert.match(source, /id: 'computer-use.personality'/)
  assert.match(source, /name: 'personality'/)
  assert.match(source, /session.hook\('context'/)
  assert.doesNotMatch(source, /hook\('compaction'|session\.prompt|session\.generate|switchAgent|switchModel/)
  assert.match(source, /manager.dispose\(\)/)
  assert.match(source, /Promise.allSettled/)
  assert.match(source, /storage: ctx.storage/)
  assert.doesNotMatch(source, /session\.instructions/)
})

test('personality skills retain requested semantics and actual sibling discovery paths', async () => {
  const read = file => readFile(new URL(`../../${file}`, import.meta.url), 'utf8')
  const plain = await read('.opencode/skills/personality-plain-english/SKILL.md')
  const parent = await read('.opencode/skills/personality/SKILL.md')
  const agents = await read('AGENTS.md')
  assert.match(plain, /reader knows nothing about technology/)
  assert.match(plain, /little notebook/)
  assert.match(plain, /simple answer to a simple question/)
  assert.match(plain, /enough detail to make the idea understandable/)
  assert.match(plain, /Do not invent an adviser,[\s\S]*pushback persona/)
  assert.match(plain, /not childish or patronizing/)
  assert.match(parent, /separate, discoverable sibling skill/)
  assert.match(parent, /Do not check again on every turn/)
  assert.match(agents, /\.opencode\/skills\/personality-plain-english\/SKILL.md/)
  assert.match(agents, /Historical preferences are not a response/)
})
