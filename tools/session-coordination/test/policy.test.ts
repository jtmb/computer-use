import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { makeService, type Dependencies } from "../service.ts"
import { defaultPolicy, validatePolicy, type ReceivePolicy } from "../policy.ts"
import { present } from "../result.ts"
import { hash, envelope } from "../model.ts"

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp("/tmp/opencode/coordination-policy-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const effects: string[] = [], prompts: Parameters<Dependencies["session"]["prompt"]>[0][] = []
  let clock = 1000
  const deps: Dependencies = { scope: { directory, projectID: "policy-fixture" }, stateDirectory: path.join(directory, "state"),
    session: { get: async ({ sessionID }) => { effects.push(`get:${sessionID}`); return { id: sessionID, projectID: "policy-fixture", location: { directory } } },
      prompt: async input => { prompts.push(input); return { id: input.id, sessionID: input.sessionID, type: "user", payload: { text: input.text }, delivery: input.delivery } } },
    assert: async input => { effects.push(`permit:${input.action}`); assert.equal(input.source, undefined, "settings path must not forge tool provenance") }, now: () => clock }
  const service = makeService(deps)
  const update = (policy: ReceivePolicy | null, expectedRevision: number, target = "chat", sessionID = "ses_bob") =>
    service.settingsUpdate({ sessionID, target, policy, expectedRevision })
  const call = { sessionID: "ses_alice", messageID: "msg_fixture", id: "call_fixture" }
  const enableTools = () => { deps.assert = async input => { effects.push(`permit:${input.action}`) } }
  return { service, deps, update, effects, prompts, call, enableTools, clock: (at: number) => { clock = at } }
}
test("default effective policy is read-only, bounded and native tool cannot mutate receive settings", async t => {
  const f = await fixture(t)
  const view = await f.service.settingsRead({ sessionID: "ses_bob" })
  assert.deepEqual(view.effective, defaultPolicy()); assert.equal(view.revision, 0); assert.equal(view.inherited, true)
  await assert.rejects(readFile(path.join(f.deps.stateDirectory, "room.json")), { code: "ENOENT" })
  f.enableTools()
  const result = await f.service.execute({ op: "policy" }, f.call)
  assert.equal(present("policy", result, f.deps.scope, f.call.sessionID).output.data.sessionID, "ses_alice")
  await assert.rejects(f.service.execute({ op: "policy", policy: { mode: "steer-running" } }, f.call), /unexpected input/)
  await assert.rejects(f.service.execute({ op: "settingsUpdate" }, f.call), /unsupported/)
})
test("project inheritance, exact overrides, clearing and restart retain versioned policy without losing messages", async t => {
  const f = await fixture(t), project = { ...defaultPolicy(), mode: "off" as const }
  await f.update(project, 0, "project")
  await f.update({ ...defaultPolicy(), allowedSenders: ["ses_alice"] }, 1)
  const restored = makeService(f.deps)
  assert.equal((await restored.settingsRead({ sessionID: "ses_alice" })).effective.mode, "off")
  assert.deepEqual((await restored.settingsRead({ sessionID: "ses_bob" })).effective.allowedSenders, ["ses_alice"])
  f.enableTools()
  await restored.execute({ op: "post", id: "retained", recipients: ["ses_bob"], purpose: "question", body: "Bounded request" }, f.call)
  await f.update(null, 2)
  assert.equal((await restored.settingsRead({ sessionID: "ses_bob" })).inherited, true)
  assert.equal((await restored.store.read()).messages[0].id, "retained")
  await assert.rejects(f.update(defaultPolicy(), 2), /revision conflict/)
})
test("native settings denial and fresh scope validation precede store mutation", async t => {
  const f = await fixture(t)
  f.deps.assert = async () => { throw new Error("native deny") }
  await assert.rejects(f.update(defaultPolicy(), 0), /native deny/); assert.deepEqual(f.effects, [])
  f.enableTools()
  const get = f.deps.session.get
  let calls = 0
  f.deps.session.get = async input => { if (++calls === 2) return { id: input.sessionID, projectID: "moved", location: { directory: f.deps.scope.directory } }; return get(input) }
  await assert.rejects(f.update(defaultPolicy(), 0), /outside/)
  assert.equal((await f.service.store.read()).policies, undefined)
})
test("concurrent operator updates have one revision winner and never overwrite the accepted policy", async t => {
  const f = await fixture(t)
  const outcomes = await Promise.allSettled([f.update(defaultPolicy(), 0), f.update({ ...defaultPolicy(), mode: "off" }, 0)])
  assert.equal(outcomes.filter(x => x.status === "fulfilled").length, 1)
  assert.equal((await f.service.settingsRead({ sessionID: "ses_bob" })).revision, 1)
  await assert.rejects(f.update(defaultPolicy(), 0), /revision conflict/)
})
test("invalid policies, foreign allowed senders, unknown fields and idle-wake escalation fail closed", async t => {
  const f = await fixture(t)
  for (const policy of [{ ...defaultPolicy(), idleWake: true }, { ...defaultPolicy(), steerLimit: 0 }, { ...defaultPolicy(), steerLimit: 17 },
    { ...defaultPolicy(), allowedSenders: Array(9).fill("ses_alice") }, { ...defaultPolicy(), allowedSenders: ["ses_alice", "ses_alice"] },
    { ...defaultPolicy(), authority: "human" }]) assert.throws(() => validatePolicy(policy), /invalid|unexpected/)
  f.deps.session.get = async ({ sessionID }) => ({ id: sessionID, projectID: sessionID === "ses_eve" ? "foreign" : "policy-fixture", location: { directory: f.deps.scope.directory } })
  await assert.rejects(f.update({ ...defaultPolicy(), allowedSenders: ["ses_eve"] }, 0), /outside/)
  assert.equal((await f.service.store.read()).policies, undefined)
})
test("recipient Off/inbox/steer/wake matrix is enforced at post and delivery, never by sender metadata", async t => {
  const f = await fixture(t); f.enableTools()
  const post = (id: string, purpose = "question") => f.service.execute({ op: "post", id, purpose, recipients: ["ses_bob"], body: "Harmless bounded fixture" }, f.call)
  const deliver = (id: string) => f.service.execute({ op: "deliver", id }, f.call)
  await f.update({ ...defaultPolicy(), mode: "off" }, 0)
  await assert.rejects(post("off"), /recipient policy/)
  await f.update(defaultPolicy(), 1)
  await post("inbox"); const inbox = await deliver("inbox")
  assert.equal(f.prompts.length, 0)
  assert.equal(present("deliver", inbox, f.deps.scope, f.call.sessionID).output.status, "mailbox")
  assert.match(present("deliver", inbox, f.deps.scope, f.call.sessionID).content, /Mailbox-only recipients: 1/)
  await f.update({ ...defaultPolicy(), mode: "steer-running" }, 2)
  await post("steer"); await deliver("steer")
  assert.equal(f.prompts[0].delivery, "steer"); assert.equal(f.prompts[0].resume, false)
  await f.update({ ...defaultPolicy(), mode: "steer-running", idleWake: true }, 3)
  await post("wake"); const wake = await deliver("wake")
  assert.equal(f.prompts[1].delivery, "steer"); assert.equal(f.prompts[1].resume, true)
  assert.match(present("deliver", wake, f.deps.scope, f.call.sessionID).content, /0 passive queue · 1 steer · 1 allow idle wake/)
  await post("notice", "notice"); await deliver("notice")
  assert.equal(f.prompts.length, 2, "no-action notices never queue or wake even under enabled receive policy")
  assert.equal((await f.service.store.read()).messages.find(m => m.id === "notice")!.receipts.ses_bob, "mailbox")
  await post("revoked")
  await f.update({ ...defaultPolicy(), allowedSenders: [] }, 4)
  await assert.rejects(deliver("revoked"), /recipient policy/)
  assert.equal(f.prompts.length, 2)
  assert.equal((await f.service.store.read()).messages.find(m => m.id === "revoked")!.receipts.ses_bob, "pending")
})
test("unknown admission replay pins native ID, envelope, policy revision and transport across restart and policy upgrade", async t => {
  const f = await fixture(t); f.enableTools()
  await f.service.execute({ op: "post", id: "lost", purpose: "question", recipients: ["ses_bob"], body: "Keep own task" }, f.call)
  // Simulate the old passive transport's uncertain state, not a new mailbox delivery.
  await f.service.store.mutate(state => { state.messages[0].receipts.ses_bob = "unknown" })
  const prompt = f.deps.session.prompt
  f.deps.session.prompt = async input => { await prompt(input); throw new Error("lost response") }
  await assert.rejects(f.service.execute({ op: "deliver", id: "lost" }, f.call), /lost response/)
  const before = (await f.service.store.read()).messages[0]
  assert.equal(before.dispatches!.ses_bob.envelopeHash, hash(envelope(before)))
  await f.update({ ...defaultPolicy(), mode: "steer-running", idleWake: true }, 0)
  f.deps.session.prompt = prompt
  const restarted = makeService(f.deps)
  await restarted.execute({ op: "deliver", id: "lost" }, f.call)
  assert.equal(f.prompts.length, 2)
  assert.deepEqual(f.prompts[0], f.prompts[1], "retry is byte-equivalent input, not a transport upgrade")
  assert.deepEqual((await restarted.store.read()).messages[0].dispatches, before.dispatches)
  await restarted.execute({ op: "deliver", id: "lost" }, f.call)
  assert.equal(f.prompts.length, 2, "admitted input never replayed or activated")
})
test("policy revocation blocks uncertain wake retry; native denial precedes pinning and remains binding", async t => {
  const f = await fixture(t); f.enableTools()
  await f.update({ ...defaultPolicy(), mode: "steer-running", idleWake: true }, 0)
  await f.service.execute({ op: "post", id: "revoke", purpose: "question", recipients: ["ses_bob"], body: "Keep own task" }, f.call)
  f.deps.assert = async input => { if (input.action === "session.prompt") throw new Error("native send denied") }
  await assert.rejects(f.service.execute({ op: "deliver", id: "revoke" }, f.call), /native send denied/)
  assert.equal((await f.service.store.read()).messages[0].dispatches, undefined)
  f.enableTools()
  const prompt = f.deps.session.prompt
  f.deps.session.prompt = async input => { await prompt(input); throw new Error("uncertain wake") }
  await assert.rejects(f.service.execute({ op: "deliver", id: "revoke" }, f.call), /uncertain wake/)
  await f.update({ ...defaultPolicy(), mode: "steer-running", idleWake: false }, 1)
  f.deps.session.prompt = prompt
  await assert.rejects(makeService(f.deps).execute({ op: "deliver", id: "revoke" }, f.call), /revoked pinned/)
  assert.equal(f.prompts.length, 1)
  assert.equal((await f.service.store.read()).messages[0].receipts.ses_bob, "unknown")
})
test("persistent per-recipient steering budget spans senders/restarts and rejects without silently parking", async t => {
  const f = await fixture(t); f.enableTools()
  await f.update({ ...defaultPolicy(), mode: "steer-running", steerLimit: 1 }, 0)
  const post = (id: string, actor = f.call) => f.service.execute({ op: "post", id, purpose: "question", recipients: ["ses_bob"], body: "Bounded" }, actor)
  await post("one"); await f.service.execute({ op: "deliver", id: "one" }, f.call)
  const other = { ...f.call, sessionID: "ses_carol" }
  await post("two", other)
  await assert.rejects(makeService(f.deps).execute({ op: "deliver", id: "two" }, other), /rate budget/)
  assert.equal(f.prompts.length, 1)
  assert.equal((await f.service.store.read()).messages[1].receipts.ses_bob, "pending")
  f.clock(0)
  await assert.rejects(f.service.execute({ op: "deliver", id: "two" }, other), /rate budget/, "clock rollback cannot replenish budget")
  f.clock(61000)
  await f.service.execute({ op: "deliver", id: "two" }, other)
  assert.equal(f.prompts.length, 2)
})
test("legacy unknown passive inputs cannot gain steering when policy is enabled", async t => {
  const f = await fixture(t); f.enableTools()
  await f.service.execute({ op: "post", id: "legacy", purpose: "question", recipients: ["ses_bob"], body: "Previously attempted passive input" }, f.call)
  await f.service.store.mutate(state => { state.messages[0].receipts.ses_bob = "unknown" })
  await f.update({ ...defaultPolicy(), mode: "steer-running", idleWake: true }, 0)
  await f.service.execute({ op: "deliver", id: "legacy" }, f.call)
  assert.equal(f.prompts[0].delivery, "queue"); assert.equal(f.prompts[0].resume, false)
})
