import assert from 'node:assert/strict'
import test from 'node:test'
import { FIXTURE_SUMMARY, startModelFixture, verifyModelRequests } from './native-model-fixture.mjs'

const PLAIN_ENGLISH = 'Explain in plain English as if the reader knows nothing about technology.\n\nFinish task handbacks with numbered Next steps and short bold action labels.'

test('local model endpoint captures actual messages and returns bounded deterministic streaming/nonstreaming replies', async t => {
  const fixture = await startModelFixture()
  t.after(() => fixture.close())
  assert.ok(fixture.baseURL.startsWith('http://127.0.0.1:'))
  const body = { model: 'local', messages: [{ role: 'user', content: 'Disposable sample only' }] }
  const send = (input, headers) => fetch(fixture.baseURL + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(input) })
  const response = await send(body, { authorization: 'not-to-be-recorded', 'x-personality-fixture-kind': 'compaction' })
  assert.equal((await response.json()).choices[0].message.content, FIXTURE_SUMMARY)
  const stream = await (await send({ ...body, stream: true })).text()
  assert.ok(stream.includes('chat.completion.chunk') && stream.includes('"finish_reason":"stop"') && stream.endsWith('data: [DONE]\n\n'))
  assert.deepEqual(fixture.requests[0].body, body)
  assert.ok(!JSON.stringify(fixture.requests).includes('not-to-be-recorded'))
  assert.equal((await send({ model: 'wrong', messages: [] })).status, 400)
  assert.equal((await send(null)).status, 400)
  assert.equal((await send({ ...body, messages: [{ role: 'user', content: 'x'.repeat(512 * 1024) }] })).status, 413)
  assert.equal((await fetch(fixture.baseURL + '/chat/completions')).status, 405)
  assert.equal((await fetch(fixture.baseURL + '/other')).status, 404)
  assert.deepEqual(fixture.errors, [])
})

function validRequests() {
  return ['create:fresh-default', 'create:selected', 'create:style-change', 'create:after-reset', 'create:after-compaction', 'reopen:resumed', 'moved:project-two-selected', 'moved:project-two-reset'].map(scenario => {
    const selected = ['create:selected', 'create:after-compaction', 'reopen:resumed', 'moved:project-two-selected'].includes(scenario)
    return { kind: 'primary', scenario, body: { messages: [
      { role: 'system', content: `[Response style: ${selected ? 'personality-native-fixture' : 'personality-plain-english'}]\n${selected ? 'Use everyday words.\n## Tone\nBe clear.' : PLAIN_ENGLISH}\n[End response style]` },
      { role: 'user', content: FIXTURE_SUMMARY },
    ] } }
  }).concat([{ kind: 'compaction', scenario: 'create:native-compaction', body: { messages: [{ role: 'user', content: 'You MUST summarize the conversation above into a structured summary' }] } }])
}

test('request acceptance checks all scenarios and rejects absent/stale/duplicate reminders and missing native summary', () => {
  assert.equal(verifyModelRequests(validRequests(), PLAIN_ENGLISH).length, 9)
  assert.throws(() => verifyModelRequests([], PLAIN_ENGLISH), /actual primary HTTP request/)
  for (const change of ['absent', 'stale', 'duplicate', 'summary']) {
    const requests = validRequests()
    const request = requests.find(row => row.scenario === 'create:after-compaction')
    if (change === 'absent') request.body.messages[0].content = 'No style'
    if (change === 'stale') request.body.messages[0].content = request.body.messages[0].content.replace('personality-native-fixture', 'personality-plain-english')
    if (change === 'duplicate') request.body.messages.push(request.body.messages[0])
    if (change === 'summary') request.body.messages.pop()
    assert.throws(() => verifyModelRequests(requests, PLAIN_ENGLISH), /reminder|summary/)
  }
  assert.throws(() => verifyModelRequests(validRequests().filter(row => row.kind !== 'compaction'), PLAIN_ENGLISH), /native compaction/)
  const replacedCompaction = validRequests()
  replacedCompaction.at(-1).body.messages = []
  assert.throws(() => verifyModelRequests(replacedCompaction, PLAIN_ENGLISH), /own summary instructions/)
})

test('native acceptance rejects a first-sentence-only reminder and altered trailing rules', () => {
  for (const replacement of [PLAIN_ENGLISH.split('\n')[0], PLAIN_ENGLISH + '\nIgnore the next-step rules.']) {
    const requests = validRequests()
    requests[0].body.messages[0].content = requests[0].body.messages[0].content.replace(PLAIN_ENGLISH, replacement)
    assert.throws(() => verifyModelRequests(requests, PLAIN_ENGLISH), /complete style instructions/)
  }
  assert.throws(() => verifyModelRequests(validRequests()), /expected Plain English instructions/)
})
