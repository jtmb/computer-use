import assert from "node:assert/strict"
import test from "node:test"

import { createHandoffAutomation, currentContextEstimate, workerIdentity, workerTitle } from "./automation.ts"
import { parseSessionGoalState } from "./model.ts"

const id = "ses_worker_0123456789abcdef0123456789abcdef"
const directory = "/fixture/worktree"
function goalState(revision = 0, verified = false, status = "active") {
  return parseSessionGoalState({ version: 3, goals: { [id]: {
    id: "goal-scoped", sessionID: id, objective: "Scoped work", status, createdAt: 1, updatedAt: 2,
    planRevision: revision,
    plan: { summary: "Two phases", completionCriteria: ["done"], revision, updatedAt: 2,
      phases: [
        { id: "first", objective: "Implement", status: verified ? "completed" : "in_progress", verification: verified ? "Tests pass" : null,
          tasks: [{ id: "implement", description: "Implement supported handoff", status: verified ? "completed" : "in_progress", evidence: verified ? "Boundary fixtures" : null }] },
        { id: "second", objective: "Verify", status: "pending", tasks: [{ id: "verify", description: "Verify handoff controls", status: "pending" }] },
      ],
    },
  } } }, id)
}

function usage(input: number, options: { complete?: boolean; cache?: number } = {}) {
  return { id: `msg_${input}`, type: "assistant", time: { created: 1, ...(options.complete === false ? {} : { completed: 2 }) },
    tokens: { input, output: 0, reasoning: 0, cache: { read: options.cache ?? 0, write: 0 } } }
}

function fixture() {
  const records = new Map<string, unknown>()
  const updates: Array<{ sessionID: string; title: string }> = []
  const errors: unknown[] = []
  const controller = new AbortController()
  let source: Record<string, unknown> = { id: "ses_source", projectID: "project", title: "Reviewer Session", location: { directory } }
  let info: Record<string, unknown> = { id, title: "Fix handoff — Goal handoff abcdef123456", agent: "build",
    projectID: "project", location: { directory }, tokens: { input: 50_000_000 },
    metadata: { handoffOrigin: { role: "independent-worker", hash: "abcdef123456", sourceSessionID: "ses_source", task: "Implement handoff" } } }
  let state: ReturnType<typeof goalState> | null = goalState()
  let messages: unknown[] = [usage(100)]
  let beforeContext: (() => void | Promise<void>) | undefined
  let beforeSessionGet: ((sessionID: string) => void | Promise<void>) | undefined
  let stateReads = 0
  let beforeReadState: ((read: number) => void | Promise<void>) | undefined
  let failWrite = false
  let failRead = false
  let beforeWrite: (() => void) | undefined
  let writes = 0
  const deps = {
    session: {
      async get(input: { sessionID: string }) { await beforeSessionGet?.(input.sessionID); return structuredClone(input.sessionID === "ses_source" ? source : info) },
      async context() { await beforeContext?.(); return structuredClone(messages) },
      async capabilities() { return { conditionalTitleUpdate: 1 } },
      async update(input: { sessionID: string; title: string; expectedTitle?: string }) {
        assert.equal(input.expectedTitle, info.title, "the fixture requires conditional publication against its last title")
        updates.push({ sessionID: input.sessionID, title: input.title }); info = { ...info, title: input.title }
      },
    },
    location: { directory, project: { id: "project" } },
    storage: {
      async get(key: string) { return structuredClone(records.get(key)) },
      async set(key: string, value: unknown) { writes++; records.set(key, structuredClone(value)); beforeWrite?.(); if (failWrite) throw new Error("write admission unknown") },
    },
    async readState() { if (failRead) throw new Error("state unavailable"); await beforeReadState?.(++stateReads); return structuredClone(state) },
    signal: controller.signal,
    report: (error: unknown) => errors.push(error),
  }
  const automation = createHandoffAutomation(deps)
  return { automation, deps, records, errors, updates, controller,
    sessionInfo: () => structuredClone(info),
    info: (patch: Record<string, unknown>) => { info = { ...info, ...patch } },
    source: (patch: Record<string, unknown>) => { source = { ...source, ...patch } },
    state: (value: typeof state) => { state = value }, messages: (value: unknown[]) => { messages = value },
    beforeContext: (value: typeof beforeContext) => { beforeContext = value },
    beforeSessionGet: (value: typeof beforeSessionGet) => { beforeSessionGet = value },
    beforeReadState: (value: typeof beforeReadState) => { beforeReadState = value },
    beforeWrite: (value: typeof beforeWrite) => { beforeWrite = value },
    failWrite: () => { failWrite = true }, failRead: () => { failRead = true }, writes: () => writes,
  }
}

test("current context uses one latest complete step including cache, never a session/lifetime sum", () => {
  assert.equal(currentContextEstimate([usage(900_000), usage(12, { cache: 34 })]), 46)
  assert.equal(currentContextEstimate({ tokens: { input: 900_000 } }), undefined)
  assert.equal(currentContextEstimate([usage(499_999)]), 499_999)
  assert.equal(currentContextEstimate([usage(500_000)]), 500_000)
})

test("completed compaction invalidates old usage; failed compaction does not; incomplete/malformed latest usage is unknown", () => {
  assert.equal(currentContextEstimate([usage(700_000), { type: "compaction", status: "completed" }]), undefined)
  assert.equal(currentContextEstimate([usage(700_000), { type: "compaction", status: "completed" }, usage(100)]), 100)
  assert.equal(currentContextEstimate([usage(700_000), { type: "compaction", status: "failed" }]), 700_000)
  for (const last of [usage(10, { complete: false }), usage(NaN), usage(-1), { type: "assistant" }, usage(Number.MAX_SAFE_INTEGER, { cache: 10 })]) {
    assert.equal(currentContextEstimate([usage(700_000), last]), undefined)
  }
})

test("worker identity preserves hash through task changes, excludes reviewers, children and unclassified chats", () => {
  const base = { id, location: { directory } }
  assert.deepEqual(workerIdentity({ ...base, title: `Task · ${id}`, metadata: { handoffOrigin: { role: "independent-worker", sourceSessionID: "ses_source", hash: "abcdef12" } } }), { role: "worker", hash: "abcdef12" })
  for (const patch of [{ title: "Ordinary work" }, { title: "Goal handoff abcdef12" }, { title: "Task — Goal handoff abcdef12" }, { parentID: "parent", title: "Task — Goal handoff abcdef12" }]) {
    assert.equal(workerIdentity({ ...base, ...patch }).role, "unclassified")
  }
  assert.equal(workerIdentity({ ...base, title: "Reviewer Session: Task — Goal handoff abcdef12" }).role, "reviewer")
  assert.equal(workerIdentity({ ...base, metadata: { handoffOrigin: { role: "reviewer", hash: "abcdef12" } } }).role, "reviewer")
  assert.equal(workerIdentity({ ...base, metadata: { handoffOrigin: { role: "independent-worker", sourceSessionID: "ses_source" } } }).hash?.length, 12)
})

test("session titles preserve a chosen short label and append one exact full-ID suffix", () => {
  const longDescription = "Narrowly update agent-orchestration SKILL.md/README.md, skill catalog and orchestration-methods.test.mjs for authorized — Goal handoff b77d89bd8ef1"
  const expected = `Fix session names · ${id}`
  assert.equal(workerTitle(expected, id), expected)
  assert.equal(workerTitle(`${expected} · ses_old`, id), expected, "reformatting is idempotent and deduplicates session suffixes")
  assert.equal(workerTitle(`Fix the session names · ${id}`, id), `Fix the session names · ${id}`, "meaningful article-containing labels are preserved")
  assert.equal(workerTitle("Worker: Fix desktop input", id), `Fix desktop input · ${id}`, "role ceremony is not displayed")
  assert.equal(workerTitle(longDescription, id), `Continue scoped handoff · ${id}`, "raw instructions are rejected rather than first-word truncated")
  assert.equal(workerTitle("Implement a bounded title formatter", id), `Continue scoped handoff · ${id}`, "instruction prefixes are not mistaken for chosen labels")
  assert.equal(workerTitle("", id), `Continue scoped handoff · ${id}`, "empty input gets a bounded fallback")
  assert.ok(expected.split(" · ")[0].length <= 28)
  assert.equal(expected.split(" · ")[0].split(/\s+/).length, 3)
  assert.doesNotMatch(workerTitle(longDescription, id), /Goal handoff|b77d89bd8ef1|SKILL\.md|README\.md|orchestration-methods|Narrowly update/)
})

test("explicit session renames survive goal-task changes without replacing handoff identity", async () => {
  const f = fixture()
  f.info({ title: "Fix handoff resume" })
  assert.equal(await f.automation.context(id), undefined)
  assert.deepEqual(f.updates, [{ sessionID: id, title: `Fix handoff resume · ${id}` }])
  assert.equal((f.sessionInfo().metadata as { handoffOrigin: { hash: string } }).handoffOrigin.hash, "abcdef123456", "visible renames preserve machine lineage")
  const state = goalState(1, true)
  state.current!.plan!.phases[0].tasks[0].description = "Analyze the current interaction and source command/skill flow to identify why the context-only seed stayed passive and why the explicit /handoff_resume did not proceed without another reprompt"
  state.current!.plan!.phases[1].status = "in_progress"
  state.current!.plan!.phases[1].tasks[0].status = "in_progress"
  f.state(state)
  await f.automation.context(id)
  assert.equal(f.updates.length, 1, "the goal cursor is not a title source")
  assert.equal(await f.automation.title(id), `Fix handoff resume · ${id}`)
  assert.ok(f.updates.every(update => update.title.endsWith(` · ${id}`)), "the actual full ID remains attached")
  f.info({ title: "Fix session names" })
  await f.automation.context(id)
  assert.equal(f.updates.at(-1)?.title, `Fix session names · ${id}`, "a deliberate supported rename becomes the new display label")
  await f.automation.context(id)
  assert.equal(f.updates.length, 2, "unchanged labels are not rewritten on later tool events")
  assert.equal(await f.automation.title(id), `Fix session names · ${id}`)
  assert.equal((f.sessionInfo().metadata as { handoffOrigin: { hash: string } }).handoffOrigin.hash, "abcdef123456")
})

test("exact long goal descriptions cannot override a concise session label", async () => {
  const cases = [
    {
      description: "Narrowly update agent-orchestration SKILL.md/README.md, skill catalog and orchestration-methods.test.mjs for authorized — Goal handoff b77d89bd8ef1",
      label: "Agent instructions",
    },
    {
      description: "Analyze the current interaction and source command/skill flow to identify why the context-only seed stayed passive and why the explicit /handoff_resume did not proceed without another reprompt",
      label: "Fix handoff resume",
    },
  ]
  for (const { description, label } of cases) {
    const f = fixture()
    const state = goalState()
    state.current!.plan!.phases[0].tasks[0].description = description
    f.state(state)
    f.info({ title: label })
    await f.automation.context(id)
    const expected = `${label} · ${id}`
    assert.deepEqual(f.updates, [{ sessionID: id, title: expected }], description)
    assert.equal(await f.automation.title(id), expected, description)
    assert.doesNotMatch(f.updates[0].title, /Narrowly update|Analyze the current|Goal handoff|handoff_resume/)
  }
})

test("a supported session rename during a context read wins over the stale title snapshot", async () => {
  const f = fixture()
  f.beforeContext(() => f.info({ title: "Fix session names" }))
  await f.automation.context(id)
  assert.deepEqual(f.updates, [{ sessionID: id, title: `Fix session names · ${id}` }])
  assert.equal(await f.automation.title(id), `Fix session names · ${id}`)
})

test("a native rename during the final context goal read is not overwritten", async () => {
  const f = fixture()
  const expected = `Fix session names · ${id}`
  f.beforeReadState(read => { if (read === 2) f.info({ title: expected }) })
  await f.automation.context(id)
  assert.equal(f.sessionInfo().title, expected)
  assert.deepEqual(f.updates, [], "the stale title snapshot is never written over the native rename")
})

test("the title hook returns the label present after its awaited goal read", async () => {
  const f = fixture()
  const expected = `Fix session names · ${id}`
  f.beforeReadState(read => { if (read === 1) f.info({ title: expected }) })
  assert.equal(await f.automation.title(id), expected)
  assert.equal(f.sessionInfo().title, expected)
})

test("the title hook re-reads the session after its awaited lineage validation", async () => {
  const f = fixture()
  const expected = `Fix session names · ${id}`
  f.beforeSessionGet(sessionID => { if (sessionID === "ses_source") f.info({ title: expected }) })
  assert.equal(await f.automation.title(id), expected)
  assert.equal(f.sessionInfo().title, expected)
})

test("approximately 500k triggers one source-model request, persists across restart and concurrent calls", async () => {
  const f = fixture()
  f.messages([usage(499_999)])
  assert.equal(await f.automation.context(id), undefined)
  f.messages([usage(500_000)])
  const requests = await Promise.all([f.automation.context(id), f.automation.context(id)])
  assert.equal(requests.filter(Boolean).length, 1)
  assert.ok(requests[0]?.includes("latest-step context estimate 500000"))
  assert.ok(requests[0]?.includes("Markdown link and exact local path"))
  assert.ok(requests[0]?.includes("delivery:steer and resume:true"))
  assert.ok(requests[0]?.includes("Do not create, migrate, rebind, resume or replace goals"))
  assert.ok(requests[0]?.includes("2–5 word subject/outcome label"))
  assert.ok(requests[0]?.includes("at most 28 characters and readable in its first 25"))
  assert.ok(requests[0]?.includes("current substantive user request and actual work"))
  assert.ok(requests[0]?.includes("not a stale goal cursor"))
  assert.ok(requests[0]?.includes("Preserve an existing meaningful user/model-chosen short label"))
  assert.ok(requests[0]?.includes("change it only when the substantive work meaningfully changes"))
  assert.ok(requests[0]?.includes("actual full destination session.id"))
  assert.equal(await createHandoffAutomation(f.deps).context(id), undefined)
  assert.ok((await f.automation.read(id)).requested)
})

test("request latch invalidates stale settings revisions", async () => {
  const f = fixture()
  const before = await f.automation.read(id)
  f.messages([usage(500_000)])
  assert.ok(await f.automation.context(id))
  const latched = await f.automation.read(id)
  assert.equal(latched.revision, before.revision + 1)
  assert.ok(latched.requested)
  const writes = f.writes()
  await assert.rejects(f.automation.update(id, before.revision, true), /settings changed/)
  assert.equal(f.writes(), writes)
})

test("a latched request cannot be re-enabled even at the current revision while OFF remains available", async () => {
  const f = fixture()
  f.messages([usage(500_000)])
  assert.ok(await f.automation.context(id))
  const latched = await f.automation.read(id)
  const writes = f.writes()
  await assert.rejects(f.automation.update(id, latched.revision, true), /already requested/)
  assert.equal(f.writes(), writes, "current-revision enable attempts must have no write")
  const disabled = await f.automation.update(id, latched.revision, false)
  assert.equal(disabled.enabled, false, "explicit OFF remains available after a request")
  assert.equal(disabled.requested, latched.requested, "OFF must not reset or replay the consumed request")
  assert.equal(await f.automation.context(id), undefined)
  assert.equal(await createHandoffAutomation(f.deps).context(id), undefined, "restart must not replay the request")
})

test("only newly verified phase transitions trigger; startup and replacement history never replay", async () => {
  const f = fixture()
  f.state(goalState(5, true))
  assert.equal(await f.automation.context(id), undefined)
  f.state(goalState(6, false))
  assert.equal(await f.automation.context(id), undefined)
  f.state(goalState(7, true))
  assert.ok((await f.automation.context(id))?.includes("verified goal phase milestone"))
  const g = fixture()
  await g.automation.context(id)
  const replacement = goalState(3, true)
  replacement.current!.id = "new-goal"
  g.state(replacement)
  assert.equal(await g.automation.context(id), undefined)
})

test("unverified completions, stale revisions and fully completed work do not cause milestone handoffs", async () => {
  for (const change of ["no-verification", "no-evidence", "stale", "all-done"]) {
    const f = fixture()
    await f.automation.context(id)
    const state = goalState(change === "stale" ? 0 : 1, true)
    if (change === "no-verification") state.current!.plan!.phases[0].verification = null
    if (change === "no-evidence") state.current!.plan!.phases[0].tasks[0].evidence = null
    if (change === "all-done") state.current!.plan!.phases[1].tasks[0].status = "completed"
    f.state(state)
    assert.equal(await f.automation.context(id), undefined, change)
  }
})

test("OFF policy fixture advances its phase baseline and emits no request across native-shaped compaction input", async () => {
  const f = fixture()
  const settings = await f.automation.read(id)
  await f.automation.update(id, settings.revision, false)
  await f.automation.context(id)
  f.state(goalState(1, true))
  f.messages([usage(800_000)])
  assert.equal(await f.automation.context(id), undefined)
  // This is usage/baseline policy evidence, not execution of native compaction.
  f.messages([usage(800_000), { type: "compaction", status: "completed", summary: "Native summary", id: "msg_compact" }])
  assert.equal(await f.automation.context(id), undefined)
  const updated = await f.automation.read(id)
  await f.automation.update(id, updated.revision, true)
  assert.equal(await f.automation.context(id), undefined)
  assert.equal((await f.automation.read(id)).requested, null)
})

test("reviewers, unclassified/child/Plan sessions and every nonactive goal never rotate at high usage", async () => {
  for (const patch of [{ title: "Reviewer Session: Work" }, { title: "Unclassified", metadata: {} }, { parentID: "parent" }, { fork: { messageID: "msg_origin" } }, { agent: "plan" }, { readOnly: true }, { revert: { messageID: "msg_revert" } }]) {
    const f = fixture(); f.info(patch); f.messages([usage(800_000)])
    assert.equal(await f.automation.context(id), undefined)
    assert.deepEqual(f.updates, [])
  }
  for (const status of ["paused", "budgetLimited", "usageLimited", "complete", "unmet", "cancelled"]) {
    const f = fixture(); f.state(goalState(0, false, status)); f.messages([usage(800_000)])
    assert.equal(await f.automation.context(id), undefined, status)
    assert.deepEqual(f.updates, [])
  }
})

test("unknown goal state is not treated as no goal; absent goal may use context threshold", async () => {
  const f = fixture(); f.failRead(); f.messages([usage(800_000)])
  assert.equal(await f.automation.context(id), undefined)
  assert.equal(f.errors.length, 1)
  const g = fixture(); g.state(null); g.messages([usage(800_000)])
  assert.ok(await g.automation.context(id))
})

test("foreign or moving worktrees and workspace identity fail closed before title/request", async () => {
  for (const location of [{ directory: "/other" }, { directory, workspaceID: "other" }]) {
    const f = fixture(); f.info({ location }); f.messages([usage(800_000)])
    assert.equal(await f.automation.context(id), undefined)
    assert.deepEqual(f.updates, [])
    assert.equal(f.writes(), 0)
  }
  const f = fixture(); f.messages([usage(800_000)])
  f.beforeContext(() => f.info({ location: { directory: "/other" } }))
  assert.equal(await f.automation.context(id), undefined)
  assert.deepEqual(f.updates, [])
  assert.equal(f.writes(), 0)
})

test("uncertain storage write latches fail closed, including restart, rather than repeating requests", async () => {
  const f = fixture(); f.messages([usage(800_000)]); f.failWrite()
  assert.equal(await f.automation.context(id), undefined)
  assert.equal(await f.automation.context(id), undefined)
  assert.equal(f.writes(), 1)
  assert.equal(await createHandoffAutomation(f.deps).context(id), undefined)
})

test("settings stale revisions, reviewer enablement and cancellation are refused without goal activation", async () => {
  const f = fixture()
  const result = await Promise.allSettled([f.automation.update(id, 0, false), f.automation.update(id, 0, true)])
  assert.equal(result[0].status, "fulfilled")
  assert.equal(result[1].status, "rejected")
  f.info({ title: "Reviewer Session" })
  await assert.rejects(f.automation.update(id, 1, true), /reviewers are never rotated/)
  f.controller.abort()
  await assert.rejects(f.automation.read(id), /unloaded/)
})

test("settings report configured policy separately from a role-masked effective state without writing on read", async () => {
  const f = fixture()
  const initial = await f.automation.read(id)
  assert.equal(initial.configuredEnabled, true)
  assert.equal(initial.enabled, true)
  assert.equal(f.writes(), 0, "reading a default policy must not persist it")
  f.info({ title: "Reviewer Session" })
  const masked = await f.automation.read(id)
  assert.equal(masked.role, "reviewer")
  assert.equal(masked.configuredEnabled, true, "configured ON is not relabeled as stored OFF")
  assert.equal(masked.enabled, false)
  assert.equal(f.writes(), 0)
})

test("explicit OFF clears a role-masked configured ON and confirms configured plus effective OFF", async () => {
  const f = fixture()
  f.info({ title: "Reviewer Session" })
  const masked = await f.automation.read(id)
  const saved = await f.automation.update(id, masked.revision, false)
  assert.equal(saved.revision, masked.revision + 1)
  assert.equal(saved.configuredEnabled, false)
  assert.equal(saved.enabled, false)
  const readback = await f.automation.read(id)
  assert.deepEqual([readback.revision, readback.configuredEnabled, readback.enabled], [masked.revision + 1, false, false])
  const record = f.records.get(`source-handoff/v1/${id}`) as { enabled?: boolean; revision?: number }
  assert.equal(record.enabled, false)
  assert.equal(record.revision, masked.revision + 1)
})

test("suspended automation reports configured ON separately and still accepts explicit OFF", async () => {
  const f = fixture(); f.failRead()
  assert.equal(await f.automation.context(id), undefined)
  assert.equal(f.errors.length, 1)
  const suspended = await f.automation.read(id)
  assert.equal(suspended.configuredEnabled, true)
  assert.equal(suspended.enabled, false)
  assert.match(suspended.notice, /suspended after an error/)
  await assert.rejects(f.automation.update(id, suspended.revision, true), /suspended/)
  const saved = await f.automation.update(id, suspended.revision, false)
  assert.equal(saved.configuredEnabled, false)
  assert.equal(saved.enabled, false)
  assert.equal((await f.automation.read(id)).configuredEnabled, false)
})

test("pausing or replacing the goal while context usage is read prevents a stale automatic request", async () => {
  for (const change of ["pause", "replace"]) {
    const f = fixture(); f.messages([usage(800_000)])
    f.beforeContext(() => {
      const next = goalState(1, false, change === "pause" ? "paused" : "active")
      if (change === "replace") next.current!.id = "replacement"
      f.state(next)
    })
    assert.equal(await f.automation.context(id), undefined, change)
    assert.equal((await f.automation.read(id)).requested, null)
    assert.deepEqual(f.updates, [])
  }
})

test("unload during a context read suppresses request/title and does not throw into native execution", async () => {
  const f = fixture(); f.messages([usage(800_000)])
  f.beforeContext(() => f.controller.abort())
  assert.equal(await f.automation.context(id), undefined)
  assert.equal(await f.automation.context(id), undefined)
  assert.equal(f.writes(), 0)
  assert.deepEqual(f.updates, [])
})

test("a cancelled settings request never commits and invalid stored policy never becomes a default-on record", async () => {
  const f = fixture()
  const cancel = new AbortController(); cancel.abort()
  await assert.rejects(f.automation.update(id, 0, false, cancel.signal))
  assert.equal(f.writes(), 0)
  f.records.set(`source-handoff/v1/${id}`, { directory: "/other" })
  f.messages([usage(800_000)])
  assert.equal(await f.automation.context(id), undefined)
  assert.equal(f.writes(), 0)
  await assert.rejects(f.automation.read(id), /foreign-worktree/)
})

test("historical or ambiguous goal tasks never replace the worker's current session title", async () => {
  for (const kind of ["historical", "ambiguous"]) {
    const f = fixture()
    const state = goalState()
    const phases = state.current!.plan!.phases
    if (kind === "historical") phases[0].status = "completed"
    else {
      phases[1].status = "in_progress"
      phases[1].tasks[0].status = "in_progress"
    }
    f.state(state)
    await f.automation.context(id)
    assert.deepEqual(f.updates, [{ sessionID: id, title: `Fix handoff · ${id}` }], kind)
  }
})

test("reenabling takes a fresh baseline even if no model boundary ran while OFF", async () => {
  const f = fixture()
  await f.automation.context(id)
  await f.automation.update(id, 0, false)
  f.state(goalState(1, true))
  await f.automation.update(id, 1, true)
  assert.equal(await f.automation.context(id), undefined)
  assert.equal((await f.automation.read(id)).requested, null)
})

test("future goal-less successors keep source-authored task naming without creating or migrating a goal", async () => {
  const f = fixture(); f.state(null)
  f.info({ title: "Generic native title", metadata: { handoffOrigin: { role: "independent-worker", hash: "abcdef123456", sourceSessionID: "ses_source", task: "Handoff race" } } })
  assert.equal(await f.automation.context(id), undefined)
  assert.deepEqual(f.updates, [{ sessionID: id, title: `Handoff race · ${id}` }])
  assert.equal((await f.automation.read(id)).role, "worker")
})

test("missing/foreign source lineage never enrolls future workers from a title or role claim alone", async () => {
  for (const source of [{ id: "ses_wrong" }, { projectID: "different" }, { projectID: undefined }, { location: { directory: "/other" } }, { location: { directory, workspaceID: "other" } }]) {
    const f = fixture(); f.source(source); f.messages([usage(800_000)])
    assert.equal(await f.automation.context(id), undefined)
    assert.deepEqual(f.updates, [])
    assert.equal(f.writes(), 0)
  }
  for (const origin of [{ role: "independent-worker" }, { role: "independent-worker", sourceSessionID: id }, { role: "other", sourceSessionID: "ses_source" }]) {
    const f = fixture(); f.info({ metadata: { handoffOrigin: origin } }); f.messages([usage(800_000)])
    assert.equal((await f.automation.read(id)).role, "unclassified")
    assert.equal(await f.automation.context(id), undefined)
    assert.deepEqual(f.updates, [])
  }
})

const legacyID = "ses_goal_docs_e51bdf9cf361797e5ad2593e5b530dc9"
const legacySource = "ses_e81c877d7ffe5NB5Y7DyeSEPGd"
const legacyGoalID = "ec2a347f-8071-4358-bc93-a223a846247d"
const legacyInfo = { id: legacyID, projectID: "project", agent: "build", location: { directory }, title: "Goal handoff b77d89bd8ef1",
  metadata: { goalDocsHandoff: { transferID: "goalhandoff_3327886c329b4b9d91a329fe67e2b77d89bd8ef1", sourceSessionID: legacySource, goalID: legacyGoalID } } }

function legacyFixture() {
  let target: Record<string, unknown> = structuredClone(legacyInfo)
  let source: Record<string, unknown> = { id: legacySource, title: "Reviewer Session", projectID: "project", location: { directory } }
  const sourceGoal = parseSessionGoalState({ version: 3, goals: { [legacySource]: { ...goalState(0, false, "usageLimited").current, sessionID: legacySource, id: legacyGoalID } } }, legacySource)
  const targetGoal = parseSessionGoalState({ version: 3, goals: { [legacyID]: { ...goalState().current, sessionID: legacyID, id: "483f6755-70a7-4912-aee3-816fbe0b7546" } } }, legacyID)
  targetGoal.current!.plan!.phases[0].tasks[0].description = "Reconcile live handoff state"
  const records = new Map<string, unknown>()
  const updates: Array<{ sessionID: string; title: string }> = []
  const goalReads: string[] = []
  const automation = createHandoffAutomation({
    location: { directory, project: { id: "project" } },
    session: {
      async get({ sessionID }) { return structuredClone(sessionID === legacySource ? source : target) },
      async context() { return [usage(800_000)] },
      async capabilities() { return { conditionalTitleUpdate: 1 } },
      async update(input) {
        assert.equal(input.sessionID, legacyID)
        assert.equal(input.expectedTitle, target.title, "legacy lineage uses the same conditional publication gate")
        updates.push({ sessionID: input.sessionID, title: input.title }); target = { ...target, title: input.title }
      },
    },
    storage: { async get(key) { return structuredClone(records.get(key)) }, async set(key, value) { records.set(key, structuredClone(value)) } },
    async readState(sessionID) { goalReads.push(sessionID); return structuredClone(sessionID === legacySource ? sourceGoal : targetGoal) },
  })
  return { automation, updates, records, goalReads, sourceGoal,
    target: (patch: Record<string, unknown>) => { target = { ...target, ...patch } },
    source: (patch: Record<string, unknown>) => { source = { ...source, ...patch } },
  }
}

test("exact current legacy root identity is verified and receives a hash-free bounded title without touching its source goal", async () => {
  const f = legacyFixture()
  assert.deepEqual(workerIdentity(legacyInfo), { role: "worker", hash: "b77d89bd8ef1" })
  assert.equal((await f.automation.read(legacyID)).role, "worker")
  assert.equal(await f.automation.title(legacyID), `Continue scoped handoff · ${legacyID}`)
  const request = await f.automation.context(legacyID)
  assert.ok(request?.includes("latest-step context estimate 800000"))
  assert.deepEqual(f.updates, [{ sessionID: legacyID, title: `Continue scoped handoff · ${legacyID}` }])
  assert.ok(f.goalReads.includes(legacySource), "source goal lookup validates retained lineage, never resumes it")
  assert.equal(f.sourceGoal.current!.status, "usageLimited")
  assert.equal(await f.automation.title(legacyID), `Continue scoped handoff · ${legacyID}`)
  assert.equal(await f.automation.context(legacyID), undefined)
})

test("pause during durable latch persistence suppresses exposure and never automatically retries the uncertain request", async () => {
  const f = fixture(); f.messages([usage(800_000)])
  f.beforeWrite(() => f.state(goalState(1, false, "paused")))
  assert.equal(await f.automation.context(id), undefined)
  const saved = await f.automation.read(id)
  assert.ok(saved.requested, "latch remains consumed rather than risk retrying an uncertain request")
  f.state(goalState(2, false, "active"))
  assert.equal(await f.automation.context(id), undefined)
})

test("legacy reviewer/child/forged-ID/title-only/foreign-source and missing-goal lineage are refused", async () => {
  for (const kind of ["reviewer", "child", "forged-target", "title-only", "foreign-project", "foreign-worktree", "missing-goal"]) {
    const f = legacyFixture()
    if (kind === "reviewer") f.target({ title: "Reviewer Session: Goal handoff b77d89bd8ef1" })
    if (kind === "child") f.target({ parentID: legacySource })
    if (kind === "forged-target") f.target({ id: "ses_forged" })
    if (kind === "title-only") f.target({ metadata: {} })
    if (kind === "foreign-project") f.source({ projectID: "other" })
    if (kind === "foreign-worktree") f.source({ location: { directory: "/other" } })
    if (kind === "missing-goal") f.sourceGoal.current!.id = "other-goal"
    assert.equal(await f.automation.context(legacyID), undefined, kind)
    assert.deepEqual(f.updates, [], kind)
    assert.ok([...f.records.values()].every(value => (value as { requested?: string | null }).requested == null), kind)
  }
})
