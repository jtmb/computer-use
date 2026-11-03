import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { createRequire } from "node:module"
import { makeService, type Call, type Dependencies } from "../service.ts"
import { LIMITS, OPERATIONS, type MessageView, type Scope } from "../model.ts"
import { definition } from "../tool.ts"
import { outputSchema, payloadSchemas, validatePayload } from "../result.ts"

interface Chunk {
  id: string; threadID: string; sender: { sessionID: string; kind: string }; recipients: string[]; fingerprint: string
  body: string; offset: number; nextOffset?: number; totalCodepoints: number; totalBytes: number; complete: boolean
}

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp("/tmp/opencode/coordination-message-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const scope: Scope = { projectID: "message-project", directory }
  const sent: unknown[] = []
  const deps: Dependencies = { scope, stateDirectory: path.join(directory, "state"), assert: async () => {}, now: () => 1000,
    session: { get: async ({ sessionID }) => ({ id: sessionID, projectID: scope.projectID, location: { directory } }),
      prompt: async input => { sent.push(input); return { id: input.id, sessionID: input.sessionID, type: "user", payload: { text: input.text }, delivery: input.delivery } } } }
  const service = makeService(deps), tool = definition(service.execute, scope)
  const caller = (sessionID = "ses_alice"): Call => ({ sessionID, messageID: "msg_native", id: "call_native" })
  const post = (id: string, body: string, recipients = ["ses_bob"]) => service.execute({ op: "post", id, body, recipients, purpose: "notice" }, caller())
  const chunk = (id: string, offset?: number, sessionID = "ses_bob") => tool.execute({ op: "message", id, ...(offset === undefined ? {} : { offset }) }, caller(sessionID))
  return { scope, deps, service, tool, caller, post, chunk, sent }
}

function data(result: { output: { data: unknown } }): Chunk {
  return result.output.data as Chunk
}

async function reconstruct(f: Awaited<ReturnType<typeof fixture>>, id: string): Promise<Chunk[]> {
  const chunks: Chunk[] = []
  let offset: number | undefined
  for (let call = 0; call < 128; call++) {
    const result = await f.chunk(id, offset)
    const chunk = data(result)
    assert.equal(chunk.offset, offset ?? 0)
    assert.ok(Buffer.byteLength(JSON.stringify(chunk.body)) <= 512, "escaped chunk fits the conservative budget")
    assert.ok(Buffer.byteLength(result.content) <= 2048, "visible content fits its existing cap")
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= LIMITS.response, "whole result fits its existing cap")
    assert.ok(result.content.includes(JSON.stringify(chunk.body)), "visible content contains the actual escaped chunk")
    chunks.push(chunk)
    if (chunk.complete) return chunks
    assert.equal(chunk.complete, false)
    assert.ok(chunk.nextOffset !== undefined && chunk.nextOffset > chunk.offset, "partial chunk must advance")
    offset = chunk.nextOffset
  }
  assert.fail("chunk reconstruction did not terminate")
}

test("real >120-character tail is visible through exact chunks, not only a page preview", async t => {
  const f = await fixture(t)
  const body = "HEAD" + "x".repeat(900) + "REAL_TAIL_MARKER"
  await f.post("long-tail", body)
  const inbox = await f.tool.execute({ op: "inbox" }, f.caller("ses_bob"))
  const message = (inbox.output.data.messages as MessageView[])[0]
  assert.equal(message.body, body, "the page may carry structured body, but the model only sees content")
  assert.equal(inbox.output.data.truncated, false)
  assert.equal(inbox.content.includes("REAL_TAIL_MARKER"), false, "a 120-character summary cannot expose the tail")
  assert.match(inbox.content, /BODY PREVIEWS ONLY/)
  assert.ok(inbox.content.includes('{"op":"message"'), "the summary points to the exact read path")
  const chunks = await reconstruct(f, "long-tail")
  const rebuilt = chunks.map(chunk => chunk.body).join("")
  assert.equal(rebuilt, body)
  assert.ok(chunks.at(-1)!.body.includes("REAL_TAIL_MARKER"), "the final visible chunk carries the tail")
  assert.ok(chunks.length > 1)
})

test("near-maximum ASCII, astral, combining, and control-heavy bodies reconstruct exactly", async t => {
  const f = await fixture(t)
  const bodies = {
    ascii: "A".repeat(8192),
    astral: "😀".repeat(2000) + "😀END",
    combining: "e\u0301".repeat(2600) + "COMBINING_END",
    hostile: '\u0001"\\\n\t'.repeat(1200) + "CONTROL_END",
    allControls: "\u0001".repeat(LIMITS.body),
  }
  for (const [id, body] of Object.entries(bodies)) {
    assert.ok(Buffer.byteLength(body) <= LIMITS.body, `${id} stays within the existing body cap`)
    await f.post(id, body)
    const chunks = await reconstruct(f, id)
    assert.equal(chunks.map(chunk => chunk.body).join(""), body, `${id} reconstructs exactly`)
    assert.equal(chunks[0].totalCodepoints, [...body].length, `${id} totals codepoints`)
    assert.equal(chunks[0].totalBytes, Buffer.byteLength(body), `${id} totals UTF-8 bytes`)
    assert.equal(new Set(chunks.map(chunk => chunk.fingerprint)).size, 1, `${id} keeps one immutable fingerprint`)
    assert.equal(chunks.at(-1)!.complete, true)
    assert.equal(chunks.at(-1)!.nextOffset, undefined)
    const restart = await makeService(f.deps).execute({ op: "message", id, offset: 0 }, f.caller("ses_bob"))
    assert.equal((restart as Chunk).fingerprint, chunks[0].fingerprint, `${id} fingerprint survives restart`)
    assert.equal((restart as Chunk).body, chunks[0].body)
  }
})

test("exact codepoint boundaries and invalid offsets are rejected without partial disclosure", async t => {
  const f = await fixture(t)
  const body = "😀A".repeat(300), total = [...body].length
  await f.post("boundary", body)
  const first = data(await f.chunk("boundary"))
  assert.equal(first.offset, 0)
  assert.ok(first.nextOffset !== undefined && first.nextOffset < total && first.nextOffset > 0)
  const next = data(await f.chunk("boundary", first.nextOffset))
  assert.equal(next.offset, first.nextOffset)
  assert.equal([...next.body][0], [...body][first.nextOffset])
  const last = data(await f.chunk("boundary", total - 1))
  assert.equal(last.body, [...body].at(-1))
  assert.equal(last.complete, true)
  const suffix = await f.chunk("boundary", total - 1)
  assert.match(suffix.content, /final chunk; earlier codepoints omitted/)
  assert.equal(suffix.content.includes("complete message body"), false, "a tail-only read is not the whole body")
  for (const offset of [total, total + 1, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(f.chunk("boundary", offset), /offset/i, String(offset))
  }
  await assert.rejects(f.tool.execute({ op: "message", id: "boundary", offset: "0" }, f.caller("ses_bob")), /offset/i)
  await assert.rejects(f.service.execute({ op: "message", id: "boundary", offset: null }, f.caller("ses_bob")), /offset/i)
  await assert.rejects(f.tool.execute({ op: "message", id: "boundary", offset: 0, sender: "ses_alice" }, f.caller("ses_bob")), /unexpected input/)
  await assert.rejects(f.service.execute({ op: "message", id: "boundary", offset: 0 }, f.caller("ses_eve")), /participant view/)
  await assert.rejects(f.service.execute({ op: "message", id: "missing", offset: 0 }, f.caller("ses_bob")), /participant view/)
})

test("foreign, moved, archived, and native-denied callers read nothing and mutate nothing", async t => {
  const f = await fixture(t); await f.post("readable", "Only addressed peers may read this body")
  const room = path.join(f.deps.stateDirectory, "room.json")
  const before = await readFile(room)
  await assert.rejects(f.service.execute({ op: "message", id: "readable", offset: 0 }, f.caller("ses_eve")), /participant view/)
  assert.deepEqual(await readFile(room), before)
  const get = f.deps.session.get
  for (const metadata of [
    { projectID: "foreign", location: { directory: f.scope.directory } },
    { projectID: f.scope.projectID, location: { directory: path.dirname(f.scope.directory) } },
    { projectID: f.scope.projectID, location: { directory: f.scope.directory }, time: { archived: 1 } },
  ]) {
    f.deps.session.get = async input => input.sessionID === "ses_bob" ? { id: input.sessionID, ...metadata } : get(input)
    await assert.rejects(f.service.execute({ op: "message", id: "readable", offset: 0 }, f.caller("ses_bob")), /outside|archived/)
    assert.deepEqual(await readFile(room), before)
  }
  f.deps.session.get = get
  f.deps.assert = async input => { if (input.action === "read") throw new Error("native read deny") }
  await assert.rejects(f.service.execute({ op: "message", id: "readable", offset: 0 }, f.caller("ses_bob")), /native read deny/)
  assert.deepEqual(await readFile(room), before)
  assert.equal(f.sent.length, 0, "exact reads never transport, ACK, or wake a peer")
})

test("exact reads and preview summaries never ACK, mutate, or imply completeness", async t => {
  const f = await fixture(t)
  const body = "B".repeat(900) + "SUMMARY_TAIL"
  await f.post("stable", body)
  const room = path.join(f.deps.stateDirectory, "room.json")
  const before = await readFile(room)
  const inbox = await f.tool.execute({ op: "inbox" }, f.caller("ses_bob"))
  assert.match(inbox.content, /BODY PREVIEWS ONLY/)
  assert.equal(inbox.content.includes("SUMMARY_TAIL"), false)
  const page = await f.tool.execute({ op: "read" }, f.caller("ses_bob"))
  assert.match(page.content, /BODY PREVIEWS ONLY/)
  assert.equal(page.content.includes("SUMMARY_TAIL"), false)
  const first = await f.chunk("stable")
  assert.match(first.content, /Complete: false/)
  assert.match(first.content, /Next exact call: coordination \{"op":"message"/)
  assert.deepEqual(await readFile(room), before, "no read path rewrites durable state")
  const state = await f.service.store.read()
  assert.deepEqual(state.messages[0].acknowledgements, {}, "reading never marks seen")
  assert.equal(f.sent.length, 0)
})

test("worst-case message and participant IDs still fit the visible content budget", async t => {
  const f = await fixture(t)
  const id = "m".repeat(100)
  const recipients = Array.from({ length: LIMITS.recipients }, (_, index) => `ses_${String(index).repeat(96)}`)
  const sender = `ses_${"s".repeat(96)}`
  await f.service.execute({ op: "post", id, recipients, purpose: "notice", body: "C".repeat(700) }, f.caller(sender))
  const result = await f.chunk(id, 0, recipients[0])
  assert.equal(data(result).id, id)
  assert.equal(data(result).offset, 0)
  assert.ok(Buffer.byteLength(result.content) <= 2048)
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= LIMITS.response)
  assert.ok(result.content.includes('"offset":510'), "next exact offset remains visible with worst-case headers")
})

test("registered input and output schemas accept exact reads and reject malformed variants", async t => {
  const f = await fixture(t)
  await f.post("schema", "Schema fixture body")
  const load = createRequire(process.env.COORDINATION_TEST_DEPENDENCY_PACKAGE ?? new URL("../package.json", import.meta.url))
  const Ajv = load("ajv") as new (options: Record<string, unknown>) => { compile(schema: unknown): ((value: unknown) => boolean) & { errors?: unknown } }
  const input = new Ajv({ strict: true, allErrors: true }).compile(f.tool.input)
  for (const valid of [
    { op: "message", id: "schema" }, { op: "message", id: "schema", offset: 0 }, { op: "read" }, { op: "inbox" },
    { op: "post", id: "wire", recipients: ["ses_bob"], purpose: "notice", body: "wire" },
  ]) assert.equal(input(valid), true, JSON.stringify(valid))
  for (const invalid of [
    { op: "message" }, { op: "message", id: "schema", offset: -1 }, { op: "message", id: "schema", offset: 1.5 },
    { op: "message", id: "schema", offset: "0" }, { op: "message", id: "schema", sender: "ses_alice" }, { op: "unknown" },
  ]) assert.equal(input(invalid), false, JSON.stringify(invalid))
  assert.equal((f.tool.input as { oneOf: unknown[] }).oneOf.length, OPERATIONS.length)

  const output = new Ajv({ strict: true, allErrors: true }).compile(f.tool.output)
  const result = await f.chunk("schema")
  assert.equal(output(result.output), true, JSON.stringify(output.errors))
  assert.equal(result.output.operation, "message")
  const malformed = [
    { ...result.output, operation: "message", data: { ...data(result), complete: "yes" } },
    { ...result.output, operation: "message", data: { ...data(result), nextOffset: "1" } },
    { ...result.output, operation: "message", data: { ...data(result), sender: { ...data(result).sender, kind: "human" } } },
    { ...result.output, operation: "message", data: { ...data(result), offset: -1 } },
  ]
  for (const value of malformed) assert.equal(output(value), false, JSON.stringify(value))
  assert.equal(outputSchema.oneOf.length, OPERATIONS.length)
  assert.ok(payloadSchemas.message)
  assert.throws(() => validatePayload("message", { ...data(result), complete: false, nextOffset: 2 }, f.scope, "ses_bob"), /chunk/)
  assert.throws(() => validatePayload("message", data(result), f.scope, "ses_eve"), /expose/)
  const end = [...data(result).body].length
  assert.throws(() => validatePayload("message", { ...data(result), totalCodepoints: LIMITS.body + 1,
    totalBytes: LIMITS.body + 1, complete: false, nextOffset: end }, f.scope, "ses_bob"), /bounds/)
  assert.deepEqual(OPERATIONS.slice(0, 12), ["read", "inbox", "policy", "post", "deliver", "ack", "claim", "release", "watch", "progress", "unwatch", "status"])
})

test("abbreviated summary continuation does not skip unshown records when the structured page is final", async t => {
  const f = await fixture(t)
  for (const id of ["one", "two", "three", "four", "five"]) await f.post(id, "Q".repeat(900))
  for (const op of ["read", "inbox"]) {
    let after: string | undefined
    const seen: string[] = []
    for (let i = 0; i < 6; i++) {
      const result = await f.tool.execute({ op, ...(after ? { after } : {}) }, f.caller("ses_bob"))
      assert.equal(result.output.data.truncated, false)
      assert.equal(result.output.data.next, undefined)
      const lines = result.content.split("\n")
      const shown = lines.filter(line => line.startsWith('{"id":')).map(line => JSON.parse(line).id as string)
      assert.ok(shown.length > 0)
      seen.push(...shown)
      const next = lines.find(line => line.startsWith("Summary continuation: "))
      if (!next) break
      after = JSON.parse(next.slice("Summary continuation: ".length)).after
      assert.equal(after, shown.at(-1))
    }
    assert.deepEqual(seen, ["one", "two", "three", "four", "five"], op)
  }
})

test("maximal IDs and escaped controls retain an exact-message path in the visible summary", async t => {
  const f = await fixture(t), id = "m".repeat(100)
  const sender = `ses_${"s".repeat(96)}`, recipient = `ses_${"r".repeat(96)}`
  await f.service.execute({ op: "post", id, recipients: [recipient], purpose: "notice", body: "\u0001".repeat(8192) }, f.caller(sender))
  for (const op of ["read", "inbox"]) {
    const result = await f.tool.execute({ op }, f.caller(recipient))
    assert.ok(result.content.includes(`"id":"${id}"`), "at least one exact ID must remain visible")
    assert.ok(result.content.includes('"op":"message"'), "model must have a usable full-body read route")
    assert.ok(Buffer.byteLength(result.content) <= 2048)
    assert.equal(result.content.includes("\u0001"), false)
  }
})
