import { createServer } from 'node:http'

export const FIXTURE_MODEL = { providerID: 'personality-fixture', id: 'local' }
export const FIXTURE_SUMMARY = `## Objective
- Test the disposable response-style reminder.
## Requirements
- Do not use tools in the sample reply.
## Decisions
- Use only the local deterministic endpoint.
## Work State
### Completed
- Sent the sample messages.
### Active
- Verify the next request.
### Blocked
- (none)
## Next Move
1. Acknowledge the next sample message.
## Relevant Files
- (none)
## Important Context
- NATIVE_PERSONALITY_SUMMARY_v1 is the fixture summary marker.`

export async function startModelFixture() {
  const requests = []
  const errors = []
  const server = createServer(async (request, response) => {
    const fail = (status, message) => { response.writeHead(status, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: { message } })) }
    if (request.url !== '/v1/chat/completions') return fail(404, 'Fixture route not found')
    if (request.method !== 'POST') return fail(405, 'Fixture accepts POST only')
    if (requests.length >= 64) return fail(429, 'Fixture request limit reached')
    try {
      let bytes = 0
      const chunks = []
      for await (const chunk of request) {
        bytes += chunk.length
        if (bytes > 512 * 1024) return fail(413, 'Fixture request too large')
        chunks.push(chunk)
      }
      let body
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { return fail(400, 'Invalid JSON') }
      if (!body || typeof body !== 'object' || body.model !== FIXTURE_MODEL.id || !Array.isArray(body.messages)) return fail(400, 'Unexpected fixture model or messages')
      const kind = request.headers['x-personality-fixture-kind'] ?? 'unattributed'
      const scenario = request.headers['x-personality-fixture-scenario'] ?? 'unattributed'
      // Record only fixture correlation headers, never authentication headers.
      requests.push({ kind, scenario, body })
      const content = kind === 'compaction' ? FIXTURE_SUMMARY : kind === 'title' ? 'Disposable style check' : `Local deterministic reply. This is not real-model style acceptance. Fixture scenario: ${scenario}`
      const base = { id: `fixture-${requests.length}`, created: 1, model: FIXTURE_MODEL.id }
      if (body.stream) {
        response.writeHead(200, { 'content-type': 'text/event-stream' })
        for (const choice of [
          { delta: { role: 'assistant', content }, finish_reason: null },
          { delta: {}, finish_reason: 'stop' },
        ]) response.write(`data: ${JSON.stringify({ ...base, object: 'chat.completion.chunk', choices: [{ index: 0, ...choice }] })}\n\n`)
        response.end('data: [DONE]\n\n')
      } else {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ ...base, object: 'chat.completion', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] }))
      }
    } catch (error) {
      errors.push(String(error))
      if (!response.headersSent) fail(500, 'Fixture handler failed')
      else response.end()
    }
  })
  server.requestTimeout = 10_000
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return {
    baseURL: `http://127.0.0.1:${server.address().port}/v1`, requests, errors,
    close: () => new Promise((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeIdleConnections() }),
  }
}

export function verifyModelRequests(requests, plainEnglishInstructions) {
  if (typeof plainEnglishInstructions !== 'string' || !plainEnglishInstructions.trim() || Buffer.byteLength(plainEnglishInstructions) > 6000) throw new Error('Supply bounded expected Plain English instructions from the verified source copy.')
  const expected = {
    'create:fresh-default': 'personality-plain-english',
    'create:selected': 'personality-native-fixture',
    'create:style-change': 'personality-plain-english',
    'create:after-reset': 'personality-plain-english',
    'create:after-compaction': 'personality-native-fixture',
    'reopen:resumed': 'personality-native-fixture',
    'moved:project-two-selected': 'personality-native-fixture',
    'moved:project-two-reset': 'personality-plain-english',
  }
  const checks = []
  for (const [scenario, style] of Object.entries(expected)) {
    const matches = requests.filter(request => request.kind === 'primary' && request.scenario === scenario)
    if (matches.length !== 1) throw new Error(`${scenario}: expected one actual primary HTTP request, got ${matches.length}`)
    const systems = matches[0].body.messages.filter(message => ['system', 'developer'].includes(message.role)).map(message => typeof message.content === 'string' ? message.content : JSON.stringify(message.content)).join('\n')
    if (systems.split('[Response style:').length !== 2 || !systems.includes(`[Response style: ${style}]`)) throw new Error(`${scenario}: missing, duplicate or stale reminder`)
    const instruction = style === 'personality-native-fixture' ? 'Use everyday words.\n## Tone\nBe clear.' : plainEnglishInstructions
    const afterMarker = systems.split(`[Response style: ${style}]`)[1]
    const end = afterMarker?.indexOf('[End response style]') ?? -1
    const delivered = end < 0 ? '' : afterMarker.slice(0, end).trim()
    if (!(delivered === instruction || delivered.endsWith('\n' + instruction))) throw new Error(`${scenario}: incomplete style instructions`)
    if (scenario.endsWith('after-compaction') && !matches[0].body.messages.some(message => typeof message.content === 'string' && message.content.includes(FIXTURE_SUMMARY))) throw new Error('Post-compaction request did not replay the native summary')
    checks.push(`${scenario}: exact current reminder in outgoing HTTP request`)
  }
  const compact = requests.filter(request => request.kind === 'compaction')
  if (compact.length !== 1 || compact[0].scenario !== 'create:native-compaction') throw new Error('Expected one real native compaction model request')
  if (!compact[0].body.messages.some(message => message.role === 'user' && typeof message.content === 'string' && message.content.includes('You MUST summarize the conversation above into a structured summary'))) throw new Error('Native compaction did not use its own summary instructions')
  if (compact[0].body.messages.some(message => ['system', 'developer'].includes(message.role) && JSON.stringify(message.content).includes('[Response style:'))) throw new Error('Response style unexpectedly changed the native compaction system instructions')
  checks.push('native compaction dispatched to the local endpoint and its summary was replayed')
  return checks
}
