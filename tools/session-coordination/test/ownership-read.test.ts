import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { createRequire } from "node:module"
import { makeService, type Call, type Dependencies } from "../service.ts"
import { LIMITS, OPERATIONS, type MessageView, type OwnershipChunk, type Scope } from "../model.ts"
import { definition } from "../tool.ts"
import { outputSchema, payloadSchemas, validatePayload } from "../result.ts"

interface ClaimData { id: string; owner: string; paths: string[]; createdAt: number; releasedAt?: number }
interface ReadData {
  messages: MessageView[]; claims: ClaimData[]; claimsTruncated: boolean; claimsTotal: number
  nextClaims?: string; next?: string; truncated: boolean
}

const SOURCES = ["model.ts", "service.ts", "tool.ts", "result.ts"]

async function sourceHashes(): Promise<string[]> {
  return Promise.all(SOURCES.map(async name =>
    createHash("sha256").update(await readFile(new URL(`../${name}`, import.meta.url))).digest("hex")))
}

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp("/tmp/opencode/coordination-ownership-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const scope: Scope = { projectID: "ownership-project", directory }
  const actions: { action: string; resources: string[] }[] = []
  const sent: unknown[] = []
  let clock = 1000
  const deps: Dependencies = { scope, stateDirectory: path.join(directory, "state"), now: () => clock,
    assert: async input => { actions.push({ action: input.action, resources: input.resources }) },
    session: { get: async ({ sessionID }) => ({ id: sessionID, projectID: scope.projectID, location: { directory } }),
      prompt: async input => { sent.push(input); return { id: input.id, sessionID: input.sessionID, type: "user", payload: { text: input.text }, delivery: input.delivery } } } }
  const service = makeService(deps), tool = definition(service.execute, scope)
  const caller = (sessionID = "ses_alice"): Call => ({ sessionID, messageID: "msg_native", id: "call_native" })
  const claim = (id: string, paths: string[], session = "ses_alice") => service.execute({ op: "claim", id, paths }, caller(session))
  const release = (id: string, session = "ses_alice") => service.execute({ op: "release", id, evidence: "Owner finished the bounded work; no transfer occurred" }, caller(session))
  const read = (input: Record<string, unknown> = {}, session = "ses_bob") => tool.execute({ op: "read", ...input }, caller(session))
  const ownership = (input: Record<string, unknown>, session = "ses_bob") => tool.execute({ op: "ownership", ...input }, caller(session))
  const room = path.join(deps.stateDirectory, "room.json")
  return { scope, deps, service, tool, caller, claim, release, read, ownership, actions, sent, room, tick: () => ++clock }
}

function readData(result: { output: { data: unknown } }): ReadData { return result.output.data as ReadData }
function chunkData(result: { output: { data: unknown } }): OwnershipChunk { return result.output.data as OwnershipChunk }

function visibleClaims(content: string): { id: string; owner: string; paths: number }[] {
  return content.split("\n").filter(line => line.startsWith("Claim: ")).map(line => JSON.parse(line.slice("Claim: ".length)))
}
function claimContinuation(content: string): string | undefined {
  const line = content.split("\n").find(candidate => candidate.startsWith("Claim continuation (last visible claim): "))
  return line ? JSON.parse(line.slice("Claim continuation (last visible claim): ".length)).claimsAfter : undefined
}

test("read content discloses active claim IDs, owners and path counts with zero messages", async t => {
  const f = await fixture(t)
  await f.claim("claim-alpha", ["src/a.ts", "src/b.ts"])
  f.actions.length = 0
  const before = await readFile(f.room)
  const result = await f.read()
  const data = readData(result)
  assert.equal(data.messages.length, 0, "the defect runs without any visible messages")
  assert.deepEqual(visibleClaims(result.content), [{ id: "claim-alpha", owner: "ses_alice", paths: 2 }],
    "native content must name the live owner even when the page has no messages")
  assert.match(result.content, /Active claims: 1 visible/)
  assert.equal(result.content.includes("CLAIMS TRUNCATED"), false)
  assert.equal(claimContinuation(result.content), undefined)
  assert.equal(data.claims.length, 1)
  assert.deepEqual(data.claims.map(claim => claim.id), ["claim-alpha"])
  assert.equal(data.claimsTotal, 1); assert.equal(data.claimsTruncated, false)
  assert.ok(f.actions.length > 0)
  assert.ok(f.actions.every(item => item.action === "read"), "claim discovery never requests edit permission")
  assert.deepEqual(await readFile(f.room), before, "read-only discovery leaves durable state bytes unchanged")
  assert.equal(f.sent.length, 0)
})

test("claims paginate with their own cursor even when message filters change", async t => {
  const f = await fixture(t)
  for (const id of ["c-one", "c-two", "c-three", "c-four"]) await f.claim(id, [`${id}/file.ts`])
  await f.service.execute({ op: "post", id: "thread-a", recipients: ["ses_bob"], purpose: "notice", body: "thread A" }, f.caller())
  await f.service.execute({ op: "post", id: "thread-b", recipients: ["ses_bob"], purpose: "notice", body: "thread B" }, f.caller())
  const first = await f.read({ threadID: "thread-a", limit: 1 })
  const firstData = readData(first)
  assert.deepEqual(firstData.messages.map(message => message.threadID), ["thread-a"])
  assert.deepEqual(firstData.claims.map(claim => claim.id), ["c-one", "c-two"])
  assert.equal(firstData.claimsTruncated, true)
  assert.equal(firstData.claimsTotal, 4)
  assert.equal(firstData.nextClaims, "c-two")
  assert.deepEqual(visibleClaims(first.content).map(claim => claim.id), ["c-one", "c-two"])
  assert.equal(claimContinuation(first.content), "c-two", "continuation uses the last visibly rendered claim")

  const second = await f.read({ threadID: "thread-a", limit: 1, after: firstData.messages.at(-1)?.id, claimsAfter: firstData.nextClaims })
  const secondData = readData(second)
  assert.equal(secondData.messages.length, 0, "message cursor is independent and already exhausted")
  assert.deepEqual(secondData.claims.map(claim => claim.id), ["c-three", "c-four"])
  assert.equal(secondData.claimsTruncated, false); assert.equal(secondData.nextClaims, undefined)
  assert.deepEqual(visibleClaims(second.content).map(claim => claim.id), ["c-three", "c-four"])
  const union = [...firstData.claims, ...secondData.claims].map(claim => claim.id)
  assert.deepEqual(union, ["c-one", "c-two", "c-three", "c-four"], "no duplicate or skipped active claim")
})

test("released claims remain valid cursors and never hide later active claims", async t => {
  const f = await fixture(t)
  for (const id of ["c-one", "c-two", "c-three"]) await f.claim(id, [`${id}/file.ts`])
  f.tick(); await f.release("c-one")
  const before = await readFile(f.room)
  const afterReleased = await f.read({ claimsAfter: "c-one" })
  assert.deepEqual(readData(afterReleased).claims.map(claim => claim.id), ["c-two", "c-three"])
  assert.equal(readData(afterReleased).claimsTotal, 2)
  assert.equal(readData(afterReleased).claimsTruncated, false)
  const current = await f.read()
  assert.deepEqual(readData(current).claims.map(claim => claim.id), ["c-two", "c-three"], "released history is not a live claim")
  assert.deepEqual(await readFile(f.room), before)

  await assert.rejects(f.read({ claimsAfter: "ghost" }), /claims cursor not found/)
  await assert.rejects(f.read({ claimsAfter: 5 }), /invalid cursor or thread/)
  await assert.rejects(f.tool.execute({ op: "read", claimsAfter: "c-one", sender: "ses_alice" }, f.caller("ses_bob")), /unexpected input/)
  assert.deepEqual(await readFile(f.room), before, "rejected cursors never mutate the store")
})

test("ownership reconstructs 16 maximum-length quoted multibyte paths from visible chunks", async t => {
  const f = await fixture(t)
  const longPath = (index: number) => {
    const prefix = `p${index}/`
    const remaining = 500 - prefix.length
    return prefix + "\"é".repeat(Math.floor(remaining / 2)) + (remaining % 2 ? "x" : "")
  }
  const paths = Array.from({ length: 16 }, (_, index) => longPath(index))
  assert.ok(paths.every(value => value.length === 500))
  await f.claim("wide-claim", paths)
  const stored = (await f.service.store.read()).claims[0]!.paths
  assert.equal(stored.length, 16)
  const fingerprints = new Set<string>()
  let partialFirstChunk = false
  let sawFinalTail = false
  for (let pathIndex = 0; pathIndex < stored.length; pathIndex++) {
    let offset = 0, rebuilt = "", completed = false
    for (let guard = 0; guard < 16; guard++) {
      const result = await f.ownership({ id: "wide-claim", pathIndex, offset })
      const chunk = chunkData(result)
      assert.equal(chunk.id, "wide-claim"); assert.equal(chunk.owner, "ses_alice"); assert.equal(chunk.active, true)
      assert.equal(chunk.totalPaths, 16); assert.equal(chunk.pathIndex, pathIndex); assert.equal(chunk.offset, offset)
      assert.ok(Buffer.byteLength(JSON.stringify(chunk.path)) <= 512, "escaped path chunk stays bounded")
      assert.ok(result.content.includes(JSON.stringify(chunk.path)), "visible content carries the exact escaped path chunk")
      assert.ok(Buffer.byteLength(result.content) <= 2048)
      assert.ok(Buffer.byteLength(JSON.stringify(result)) <= LIMITS.response)
      assert.equal(chunk.totalCodepoints, [...stored[pathIndex]!].length)
      fingerprints.add(chunk.fingerprint)
      if (chunk.nextOffset === undefined) {
        assert.equal(rebuilt + chunk.path, stored[pathIndex])
        if (pathIndex < stored.length - 1) assert.equal(chunk.nextPathIndex, pathIndex + 1)
        else {
          assert.equal(chunk.nextPathIndex, undefined)
          assert.equal(chunk.complete, true, "the sequence ends without proving earlier chunks were seen")
          assert.match(result.content, /earlier paths\/chunks are omitted/)
          assert.doesNotMatch(result.content, /Whole claim path set is covered/)
          sawFinalTail = true
        }
        completed = true
        break
      }
      assert.equal(chunk.nextOffset, offset + [...chunk.path].length)
      assert.equal(chunk.nextPathIndex, undefined)
      assert.equal(chunk.complete, false)
      if (pathIndex === 0 && offset === 0) {
        assert.match(result.content, /Path chunk is partial/)
        assert.equal(result.content.includes("Whole claim path set is covered"), false, "an initial chunk is not the whole claim")
        partialFirstChunk = true
      }
      rebuilt += chunk.path; offset = chunk.nextOffset
      if (offset === [...stored[pathIndex]!].length) assert.fail("path must not end on a nextOffset chunk")
    }
    assert.equal(completed, true, `path ${pathIndex} reconstruction terminated`)
  }
  assert.equal(fingerprints.size, 1, "one claim keeps one stable fingerprint across all chunks")
  assert.equal(partialFirstChunk, true)
  assert.equal(sawFinalTail, true)
})

test("release changes the fingerprint and a released claim is an explicit historical snapshot", async t => {
  const f = await fixture(t)
  await f.claim("owned-claim", ["src/owned.ts", "tests/owned.test.ts"])
  const active = await f.ownership({ id: "owned-claim" })
  const activeChunk = chunkData(active)
  assert.equal(activeChunk.active, true); assert.equal(activeChunk.releasedAt, undefined)
  assert.match(active.content, /ACTIVE \(no release recorded\)/)
  assert.match(active.content, /omits release evidence/)

  f.tick(); await f.release("owned-claim")
  const released = await f.ownership({ id: "owned-claim" })
  const releasedChunk = chunkData(released)
  assert.equal(releasedChunk.active, false)
  assert.equal(releasedChunk.releasedAt, 1001)
  assert.notEqual(releasedChunk.fingerprint, activeChunk.fingerprint, "release changes the claim fingerprint")
  assert.match(released.content, /RELEASED at 1001/)
  assert.match(released.content, /not the complete stored claim record/)

  const page = await f.read()
  assert.equal(readData(page).claims.length, 0)
  assert.equal(readData(page).claimsTotal, 0)
  assert.match(page.content, /No active claims are visible/)
  const afterCursor = await f.read({ claimsAfter: "owned-claim" })
  assert.equal(readData(afterCursor).claims.length, 0, "a released cursor remains valid without resurrecting the claim")
})

test("ownership inputs fail closed on unknown, malformed, moved and native-denied paths", async t => {
  const f = await fixture(t)
  await f.claim("claim-one", ["src/one.ts"])
  f.actions.length = 0
  const before = await readFile(f.room)
  const hashesBefore = await sourceHashes()
  for (const [input, pattern] of [
    [{}, /exact claim id/],
    [{ id: "ghost" }, /not found in this exact project\/worktree scope/],
    [{ id: "claim-one", pathIndex: 1 }, /outside this exact claim/],
    [{ id: "claim-one", pathIndex: 16 }, /pathIndex must be an integer 0\.\.15/],
    [{ id: "claim-one", pathIndex: -1 }, /pathIndex must be an integer 0\.\.15/],
    [{ id: "claim-one", pathIndex: "0" }, /pathIndex must be an integer 0\.\.15/],
    [{ id: "claim-one", offset: 500 }, /offset must be an integer 0\.\.499/],
    [{ id: "claim-one", offset: -1 }, /offset must be an integer 0\.\.499/],
    [{ id: "claim-one", offset: 11 }, /outside this exact claim path/],
    [{ id: "claim-one", offset: 1.5 }, /offset must be an integer 0\.\.499/],
    [{ id: "claim-one", owner: "ses_alice" }, /unexpected input/],
  ] as const) await assert.rejects(f.ownership(input as Record<string, unknown>), pattern as RegExp)

  const get = f.deps.session.get
  for (const metadata of [
    { projectID: "foreign", location: { directory: f.scope.directory } },
    { projectID: f.scope.projectID, location: { directory: path.dirname(f.scope.directory) } },
    { projectID: f.scope.projectID, location: { directory: f.scope.directory }, time: { archived: 1 } },
  ]) {
    f.deps.session.get = async input => input.sessionID === "ses_bob" ? { id: input.sessionID, ...metadata } : get(input)
    await assert.rejects(f.ownership({ id: "claim-one" }), /outside|archived/)
  }
  f.deps.session.get = get
  f.deps.assert = async input => { if (input.action !== "read") throw new Error("ownership requested a write permission") }
  const readOnly = await f.ownership({ id: "claim-one" })
  assert.equal(chunkData(readOnly).owner, "ses_alice")
  assert.deepEqual(await readFile(f.room), before, "rejections and path reads never mutate durable state")
  assert.deepEqual(await sourceHashes(), hashesBefore, "path reads never rewrite source files")
  assert.equal(f.sent.length, 0)
})

test("worst-case claim IDs and long messages keep visible content within the existing cap", async t => {
  const f = await fixture(t)
  const owner = `ses_${"s".repeat(96)}`
  const claimIDs = Array.from({ length: 4 }, (_, index) => `claim-${index}-`.padEnd(100, "c"))
  for (const [index, id] of claimIDs.entries()) await f.claim(id, [`c${index}/file.ts`], owner)
  for (let index = 0; index < 5; index++) {
    await f.service.execute({ op: "post", id: `msg-${index}-`.padEnd(100, "m"), recipients: ["ses_bob"], purpose: "notice", body: "M".repeat(1000) }, f.caller(owner))
  }
  const result = await f.read()
  const data = readData(result)
  assert.equal(data.claims.length, 2)
  assert.equal(data.claimsTruncated, true)
  assert.ok(data.messages.length > 0)
  assert.ok(Buffer.byteLength(result.content) <= 2048)
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= LIMITS.response)
  assert.ok(result.content.includes(JSON.stringify(claimIDs[0])))
  assert.ok(result.content.includes(JSON.stringify(owner)))
})

test("registered ownership and claims-read schemas are strict and validate real output", async t => {
  const f = await fixture(t)
  await f.claim("schema-claim", ["src/schema.ts"])
  const result = await f.ownership({ id: "schema-claim", pathIndex: 0, offset: 0 })
  const data = chunkData(result)
  assert.equal(data.complete, true, "the single short path in one chunk is the whole path set")
  assert.match(result.content, /Whole claim path set is covered from offset 0/)
  const load = createRequire(process.env.COORDINATION_TEST_DEPENDENCY_PACKAGE ?? new URL("../package.json", import.meta.url))
  const Ajv = load("ajv") as new (options: Record<string, unknown>) => { compile(schema: unknown): ((value: unknown) => boolean) & { errors?: unknown } }
  const input = new Ajv({ strict: true, allErrors: true }).compile(f.tool.input)
  for (const valid of [
    { op: "ownership", id: "schema-claim" }, { op: "ownership", id: "schema-claim", pathIndex: 0, offset: 0 },
    { op: "read", claimsAfter: "schema-claim" },
  ]) assert.equal(input(valid), true, JSON.stringify(valid))
  for (const invalid of [
    { op: "ownership" }, { op: "ownership", id: "schema-claim", pathIndex: 16 }, { op: "ownership", id: "schema-claim", offset: 500 },
    { op: "ownership", id: "schema-claim", pathIndex: "0" }, { op: "ownership", id: "schema-claim", owner: "ses_alice" },
    { op: "read", claimsAfter: 5 },
  ]) assert.equal(input(invalid), false, JSON.stringify(invalid))
  assert.equal((f.tool.input as { oneOf: unknown[] }).oneOf.length, OPERATIONS.length)
  assert.equal(OPERATIONS.length, 14)
  assert.equal(OPERATIONS.at(-1), "ownership")

  const output = new Ajv({ strict: true, allErrors: true }).compile(f.tool.output)
  assert.equal(output(result.output), true, JSON.stringify(output.errors))
  assert.equal(outputSchema.oneOf.length, OPERATIONS.length)
  assert.ok(payloadSchemas.ownership)
  const invalidOutputs = [
    { ...result.output, operation: "ownership", data: { ...data, evidenceOmitted: false } },
    { ...result.output, operation: "ownership", data: { ...data, pathIndex: 16 } },
  ]
  for (const value of invalidOutputs) assert.equal(output(value), false, JSON.stringify(value))
  assert.throws(() => validatePayload("ownership", { ...data, complete: true, offset: 1 }, f.scope, "ses_bob"), /claim path chunk/)
  assert.throws(() => validatePayload("ownership", { ...data, active: false }, f.scope, "ses_bob"), /identity snapshot/)
  const claim = { id: "schema-claim", owner: "ses_alice", paths: ["src/schema.ts"], createdAt: 1000 }
  assert.throws(() => validatePayload("read", { authority: "untrusted-peer-context-only", messages: [], claims: [claim],
    claimsTruncated: true, claimsTotal: 1, truncated: false, ownershipRule: "x" }, f.scope, "ses_bob"), /last-visible-claim cursor/)
})

test("reading a final short path alone discloses omitted earlier paths rather than whole-claim coverage", async t => {
  const f = await fixture(t)
  await f.claim("two-paths", ["src/first.ts", "src/last.ts"])
  const result = await f.ownership({ id: "two-paths", pathIndex: 1 })
  assert.equal(chunkData(result).complete, true, "the final path ends the sequence, not proof earlier paths were read")
  assert.doesNotMatch(result.content, /Whole claim path set is covered/)
  assert.match(result.content, /earlier paths.*omitted|preceding paths.*not included/)
})

test("claim-heavy read never exposes a full-page message cursor that skips invisible message summaries", async t => {
  const f = await fixture(t)
  const owner = `ses_${"s".repeat(96)}`
  for (let i = 0; i < 4; i++) await f.claim(`c${i}-`.padEnd(100, "c"), [`c${i}/file.ts`], owner)
  const ids = Array.from({ length: 6 }, (_, i) => `m${i}-`.padEnd(100, "m"))
  for (const id of ids) await f.service.execute({ op: "post", id, recipients: ["ses_bob"], purpose: "notice", body: "x".repeat(1000) }, f.caller(owner))
  const result = await f.read({ limit: 4 })
  assert.equal(readData(result).next, ids[3])
  assert.ok(result.content.includes(JSON.stringify(ids[0]!)), "at least the first returned message must be actionable")
  assert.ok(!result.content.includes(`Next cursor: ${JSON.stringify(ids[3])}`), "the raw page cursor would skip unshown records")
  assert.match(result.content, /Summary continuation|first message|op.*message/)
  assert.ok(Buffer.byteLength(result.content) <= 2048)
})

test("a maximum multibyte claim cannot strand a message page without a visible recovery call", async t => {
  const f = await fixture(t)
  await f.claim("large", Array.from({ length: 16 }, (_, i) => `${i}/` + "界".repeat(500 - `${i}/`.length)))
  await f.service.execute({ op: "post", id: "large-message", recipients: ["ses_bob"], purpose: "notice", body: "x".repeat(4000) }, f.caller())
  const result = await f.read()
  const data = readData(result)
  if (!data.messages.length && data.truncated) {
    assert.match(result.content, /claimsAfter.*large/, "repeat the original message filters with the shown claim cursor to free the next page budget")
    const recovered = await f.read({ claimsAfter: "large" })
    assert.equal(readData(recovered).messages[0]?.id, "large-message")
  } else assert.equal(data.messages[0]?.id, "large-message")
  assert.ok(Buffer.byteLength(JSON.stringify(result)) <= LIMITS.response)
})

test("exact ownership chunks retain byte bounds with maximum actor, project, owner and claim identities", async t => {
  const f = await fixture(t)
  f.scope.projectID = "p".repeat(100)
  const owner = `ses_${"o".repeat(96)}`, actor = `ses_${"a".repeat(96)}`, id = "c".repeat(100)
  const literal = "src/" + "界".repeat(496)
  await f.claim(id, [literal], owner)
  let offset = 0, rebuilt = ""
  for (let i = 0; i < 10; i++) {
    const result = await f.ownership({ id, offset }, actor)
    const chunk = chunkData(result)
    assert.equal(chunk.owner, owner)
    assert.ok(result.content.includes(JSON.stringify(chunk.path)))
    assert.ok(Buffer.byteLength(result.content) <= 2048)
    assert.ok(Buffer.byteLength(JSON.stringify(result)) <= LIMITS.response)
    rebuilt += chunk.path
    if (chunk.nextOffset === undefined) { assert.equal(chunk.complete, true); break }
    assert.ok(chunk.nextOffset > offset)
    offset = chunk.nextOffset
  }
  assert.equal(rebuilt, literal)
})
