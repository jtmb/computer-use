import assert from "node:assert/strict"
import test from "node:test"

import { createHandoffAutomation } from "./automation.ts"

const worker = "ses_worker_title_cas_fixture"
const sourceID = "ses_source_title_cas_fixture"
const directory = "/fixture/worktree"

type UpdateInput = { sessionID: string; title: string; expectedTitle?: string }
type CapabilityProbe = () => Promise<unknown>

function usage(input: number) {
  return { id: `msg_${input}`, type: "assistant", time: { created: 1, completed: 2 },
    tokens: { input, output: 0, reasoning: 0, cache: { read: 0, write: 0 } } }
}

function fixture() {
  const records = new Map<string, unknown>()
  const attempts: UpdateInput[] = []
  const updates: string[] = []
  const errors: unknown[] = []
  const controller = new AbortController()
  let messages: unknown[] = []
  let duringUpdate: (() => void) | undefined
  let updateError: unknown
  let source: Record<string, unknown> = { id: sourceID, projectID: "project", title: "Source Session", location: { directory } }
  let info: Record<string, unknown> = { id: worker, title: "Fix handoff resume", agent: "build", projectID: "project",
    location: { directory },
    metadata: { handoffOrigin: { role: "independent-worker", hash: "abcdef123456", sourceSessionID: sourceID, task: "Implement handoff" } } }
  const session: {
    get(input: { sessionID: string }, options?: { signal?: AbortSignal }): Promise<unknown>
    context(input: { sessionID: string }, options?: { signal?: AbortSignal }): Promise<unknown>
    update(input: UpdateInput, options?: { signal?: AbortSignal }): Promise<unknown>
    capabilities?(): Promise<unknown>
  } = {
    async get(input) { return structuredClone(input.sessionID === sourceID ? source : info) },
    async context() { return structuredClone(messages) },
    async update(input) {
      attempts.push(input)
      await duringUpdate?.()
      if (updateError !== undefined) throw updateError
      if (input.expectedTitle === undefined) {
        // Unpatched legacy adapter: an unconditional rename. The controller must
        // never reach this path, so a test failure here is the overwrite race.
        updates.push(input.title)
        info = { ...info, title: input.title }
        return
      }
      if (input.expectedTitle !== info.title) throw { _tag: "Session.TitleConflictError", sessionID: input.sessionID }
      updates.push(input.title)
      info = { ...info, title: input.title }
    },
    async capabilities() { return { conditionalTitleUpdate: 1 } },
  }
  const deps = {
    session,
    location: { directory, project: { id: "project" } },
    storage: {
      async get(key: string) { return structuredClone(records.get(key)) },
      async set(key: string, value: unknown) { records.set(key, structuredClone(value)) },
    },
    async readState() { return null },
    signal: controller.signal,
    report: (error: unknown) => errors.push(error),
  }
  const automation = createHandoffAutomation(deps)
  return { automation, records, attempts, updates, errors, controller, session,
    info: (patch: Record<string, unknown>) => { info = { ...info, ...patch } },
    messages: (value: unknown[]) => { messages = value },
    duringUpdate: (value: typeof duringUpdate) => { duringUpdate = value },
    updateError: (value: unknown) => { updateError = value },
    capability: (value: CapabilityProbe | "missing") => {
      if (value === "missing") Reflect.deleteProperty(session, "capabilities")
      else session.capabilities = value
    },
    sessionInfo: () => structuredClone(info),
  }
}

test("an exact numeric capability publishes with the last-read title precondition", async () => {
  const f = fixture()
  assert.equal(await f.automation.context(worker), undefined)
  assert.deepEqual(f.attempts, [{
    sessionID: worker, title: `Fix handoff resume · ${worker}`, expectedTitle: "Fix handoff resume",
  }])
  assert.equal(f.sessionInfo().title, `Fix handoff resume · ${worker}`)
  assert.deepEqual(f.errors, [])
})

test("missing, malformed or rejecting capabilities skip publication without legacy fallback or suspension", async () => {
  const variants: [string, CapabilityProbe | "missing"][] = [
    ["missing", "missing"],
    ["null", async () => null],
    ["array", async () => [{ conditionalTitleUpdate: 1 }]],
    ["zero", async () => ({ conditionalTitleUpdate: 0 })],
    ["two", async () => ({ conditionalTitleUpdate: 2 })],
    ["string", async () => ({ conditionalTitleUpdate: "1" })],
    ["boolean", async () => ({ conditionalTitleUpdate: true })],
    ["empty", async () => ({})],
    ["rejection", async () => { throw Error("conditional title unsupported") }],
  ]
  for (const [name, capability] of variants) {
    const f = fixture()
    f.capability(capability)
    assert.equal(await f.automation.context(worker), undefined, name)
    assert.equal(await f.automation.context(worker), undefined, name)
    assert.deepEqual(f.attempts, [], `${name}: no title update, including the legacy API`)
    assert.deepEqual(f.updates, [], name)
    assert.deepEqual(f.errors, [], name)
    assert.equal(f.sessionInfo().title, "Fix handoff resume", name)
    assert.equal(f.records.size, 0, `${name}: policy state is untouched`)
    const view = await f.automation.read(worker)
    assert.equal(view.enabled, true, `${name}: automatic handoff stays available`)
    assert.doesNotMatch(view.notice, /suspended/, name)
    assert.equal(await f.automation.title(worker), `Fix handoff resume · ${worker}`, `${name}: title hook still reports the label`)
    assert.deepEqual(f.attempts, [], name)
  }
})

test("an unsupported capability leaves settings and manual/automatic policy semantics available", async () => {
  const f = fixture()
  f.capability("missing")
  const before = await f.automation.read(worker)
  assert.equal(before.role, "worker")
  assert.equal(before.configuredEnabled, true)
  assert.equal(before.enabled, true)
  const updated = await f.automation.update(worker, before.revision, true)
  assert.equal(updated.revision, before.revision + 1)
  assert.equal(updated.enabled, true)
  await f.automation.context(worker)
  assert.deepEqual(f.attempts, [])
  assert.deepEqual(f.errors, [])
})

test("a human rename after the final read is preserved and the benign conflict never suspends or retries", async () => {
  const f = fixture()
  f.duringUpdate(() => f.info({ title: `User chosen label · ${worker}` }))
  assert.equal(await f.automation.context(worker), undefined)
  assert.equal(f.attempts.length, 1, "one conditional publication attempt")
  assert.deepEqual(f.updates, [], "the stale snapshot is never written over the human rename")
  assert.equal(f.sessionInfo().title, `User chosen label · ${worker}`)
  assert.deepEqual(f.errors, [])
  const view = await f.automation.read(worker)
  assert.equal(view.enabled, true)
  assert.doesNotMatch(view.notice, /suspended/)
  assert.equal(await f.automation.context(worker), undefined)
  assert.equal(f.attempts.length, 1, "no retry and no compensating rename")
})

test("a capability that appears later permits the next conditional publication", async () => {
  const f = fixture()
  f.capability("missing")
  await f.automation.context(worker)
  assert.deepEqual(f.attempts, [])
  f.capability(async () => ({ conditionalTitleUpdate: 1 }))
  await f.automation.context(worker)
  assert.deepEqual(f.attempts, [{
    sessionID: worker, title: `Fix handoff resume · ${worker}`, expectedTitle: "Fix handoff resume",
  }])
  assert.equal(f.sessionInfo().title, `Fix handoff resume · ${worker}`)
  await f.automation.context(worker)
  assert.equal(f.attempts.length, 1, "the published title is not re-published")
})

test("a foreign-session conflict or other publication error remains truthfully reported", async () => {
  for (const error of [{ _tag: "Session.TitleConflictError", sessionID: "ses_other" }, Error("native update failed")]) {
    const f = fixture()
    f.updateError(error)
    assert.equal(await f.automation.context(worker), undefined)
    assert.equal(f.attempts.length, 1)
    assert.equal(f.errors.length, 1)
    assert.equal(f.sessionInfo().title, "Fix handoff resume")
    const view = await f.automation.read(worker)
    assert.equal(view.enabled, false)
    assert.match(view.notice, /suspended/)
    await f.automation.context(worker)
    assert.equal(f.attempts.length, 1, "suspended policy does not retry")
  }
})

test("abortion during the capability handshake prevents the title write", async () => {
  const f = fixture()
  f.capability(async () => { f.controller.abort(); return { conditionalTitleUpdate: 1 } })
  assert.equal(await f.automation.context(worker), undefined)
  assert.deepEqual(f.attempts, [])
  assert.equal(f.sessionInfo().title, "Fix handoff resume")
  assert.deepEqual(f.updates, [])
  assert.ok(f.errors.length)
})

test("ownership and eligibility changes during the awaited handshake prevent stale worker publication", async () => {
  for (const change of ["move", "lineage", "plan", "revert", "child", "human-title"]) {
    const f = fixture()
    f.capability(async () => {
      if (change === "move") f.info({ location: { directory: "/other" } })
      if (change === "lineage") f.info({ metadata: { handoffOrigin: {
        role: "independent-worker", hash: "999999999999", sourceSessionID: sourceID,
      } } })
      if (change === "plan") f.info({ agent: "plan" })
      if (change === "revert") f.info({ revert: {} })
      if (change === "child") f.info({ parentID: sourceID })
      if (change === "human-title") f.info({ title: "Human chosen title" })
      return { conditionalTitleUpdate: 1 }
    })
    await f.automation.context(worker)
    assert.deepEqual(f.attempts, [], change)
    assert.deepEqual(f.updates, [], change)
  }
})

test("the one-shot source-model request and latch still work without the title capability", async () => {
  const f = fixture()
  f.capability("missing")
  f.messages([usage(500_000)])
  const request = await f.automation.context(worker)
  assert.ok(request?.includes("latest-step context estimate 500000 tokens"))
  assert.ok(request.includes("one-shot source-model request"))
  assert.ok(request.includes("not proof of transfer"))
  assert.deepEqual(f.attempts, [], "no title publication is attempted")
  assert.deepEqual(f.updates, [])
  const view = await f.automation.read(worker)
  assert.ok(view.requested?.includes("context estimate 500000"))
  assert.equal(view.revision, 1)
  assert.equal(view.enabled, true)
  assert.ok(f.records.size > 0, "the latch is persisted before the request is exposed")
  assert.equal(await f.automation.context(worker), undefined, "the request is not replayed")
  assert.deepEqual(f.attempts, [])
})
