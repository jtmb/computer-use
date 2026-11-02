import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import test from "node:test"

import { createTaskTitles } from "./task-titles.ts"
import { parseSessionGoalState } from "./model.ts"

const rpcHooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier !== "@opencode/plugin/rpc") return next(specifier, context)
    const source = "export const Rpc = { define: value => value }"
    return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
  },
})
let TaskTitlesRpc: typeof import("./task-titles-rpc.ts").TaskTitlesRpc
try { ({ TaskTitlesRpc } = await import("./task-titles-rpc.ts")) } finally { rpcHooks.deregister() }

const id = "ses_root_task_titles"
const directory = "/fixture/worktree"
function state(task = "input", status = "active") {
  return parseSessionGoalState({ version: 3, goals: { [id]: {
    id: "goal-one", sessionID: id, objective: "Deliver features", status, createdAt: 1, updatedAt: 2,
    planRevision: 1, plan: { summary: "Deliver features", revision: 1, updatedAt: 2, completionCriteria: ["done"],
      phases: [{ id: "source", objective: "Source delivery", status: "in_progress", tasks: [
        { id: task, description: `Implement supported ${task} behavior without losing current functionality`, status: "in_progress" },
      ] }] },
  } } }, id)
}

type UpdateInput = { sessionID: string; title: string; expectedTitle?: string }
type CapabilityProbe = () => Promise<unknown>

function fixture() {
  let info: Record<string, unknown> = { id, title: "Fix desktop input", agent: "build", projectID: "project", location: { directory } }
  let current: ReturnType<typeof state> | null = state()
  const records = new Map<string, unknown>()
  const updates: string[] = []
  const attempts: UpdateInput[] = []
  const prompts: string[] = []
  const errors: unknown[] = []
  const controller = new AbortController()
  let answer = "Safe window layouts"
  let duringGenerate: (() => void | Promise<void>) | undefined
  let duringSave: (() => void) | undefined
  let duringUpdate: (() => void) | undefined
  let updateError: unknown
  let failSave = false
  const session: {
    get(input: { sessionID: string }, options?: { signal?: AbortSignal }): Promise<unknown>
    update(input: UpdateInput, options?: { signal?: AbortSignal }): Promise<unknown>
    generate(input: { sessionID: string; prompt: string }, options?: { signal?: AbortSignal }): Promise<unknown>
    capabilities?(): Promise<unknown>
  } = {
    async get() { return structuredClone(info) },
    async update(input) {
      assert.equal(input.sessionID, id)
      attempts.push(input)
      await duringUpdate?.()
      if (updateError !== undefined) throw updateError
      assert.equal(typeof input.expectedTitle, "string", "conditional publication forwards the last read title")
      if (input.expectedTitle !== info.title) throw { _tag: "Session.TitleConflictError", sessionID: id }
      updates.push(input.title); info.title = input.title
    },
    async generate(input) {
      assert.equal(input.sessionID, id); prompts.push(input.prompt); await duringGenerate?.(); return { text: answer }
    },
    async capabilities() { return { conditionalTitleUpdate: 1 } },
  }
  const deps = {
    session,
    location: { directory, project: { id: "project" } },
    storage: { async get(key: string) { return structuredClone(records.get(key)) },
      async set(key: string, value: unknown) { if (failSave) throw Error("storage failure"); records.set(key, structuredClone(value)); duringSave?.() } },
    async readState() { return structuredClone(current) }, signal: controller.signal,
    report: (error: unknown) => errors.push(error),
  }
  const titles = createTaskTitles(deps)
  return { titles, deps, records, updates, attempts, prompts, errors, controller, session,
    info: (patch: Record<string, unknown>) => { info = { ...info, ...patch } },
    deleteTitle: () => { delete info.title },
    state: (value: typeof current) => { current = value },
    answer: (value: string) => { answer = value },
    duringGenerate: (value: typeof duringGenerate) => { duringGenerate = value },
    duringSave: (value: typeof duringSave) => { duringSave = value },
    duringUpdate: (value: typeof duringUpdate) => { duringUpdate = value },
    updateError: (value: unknown) => { updateError = value },
    capability: (value: CapabilityProbe | "missing") => {
      if (value === "missing") Reflect.deleteProperty(session, "capabilities")
      else session.capabilities = value
    },
    failSave: () => { failSave = true },
  }
}

const recordKey = `goal-task-title/v1/${id}`
function storedRecord(taskKey: string, title = "Earlier task title") {
  return { version: 1, directory, workspaceID: null, projectID: "project", taskKey, title, action: "generated" }
}

test("ordinary root preserves its initial label, then generates one semantic label per task transition", async () => {
  const f = fixture()
  await f.titles.context(id, "build")
  assert.deepEqual(f.updates, [`Fix desktop input · ${id}`])
  assert.equal(f.prompts.length, 0)
  f.state(state("layouts"))
  await f.titles.context(id, "build")
  assert.deepEqual(f.updates, [`Fix desktop input · ${id}`, `Safe window layouts · ${id}`])
  assert.equal(f.prompts.length, 1)
  assert.ok(f.prompts[0].includes("untrusted task data"))
  assert.ok(f.prompts[0].includes("Implement supported layouts behavior"))
  await f.titles.context(id, "build")
  await createTaskTitles(f.deps).context(id, "build")
  assert.equal(f.prompts.length, 1, "task identity persists across plugin reload")
  assert.equal(await f.titles.title(id), `Safe window layouts · ${id}`)
})

test("conditional publication forwards the exact last read title before each rename", async () => {
  const f = fixture()
  assert.equal((await f.titles.status(id)).publicationCapability, "conditional-title-v1")
  await f.titles.context(id, "build")
  assert.deepEqual(f.attempts, [{ sessionID: id, title: `Fix desktop input · ${id}`, expectedTitle: "Fix desktop input" }])
  f.state(state("layouts"))
  await f.titles.context(id, "build")
  assert.equal(f.attempts.length, 2)
  assert.deepEqual(f.attempts[1], {
    sessionID: id, title: `Safe window layouts · ${id}`, expectedTitle: `Fix desktop input · ${id}`,
  })
  assert.notEqual(f.attempts[1].expectedTitle, f.attempts[1].title, "expectedTitle is the last read title, not the generated one")
})

test("read-only status distinguishes an unattempted task, successful refresh and suspended generation", async () => {
  const f = fixture()
  const initial = await f.titles.status(id)
  assert.equal(initial.eligible, true)
  assert.equal(initial.attemptedTaskKey, null)
  assert.equal(initial.action, null)
  assert.equal(initial.publicationCapability, "conditional-title-v1")
  assert.ok(initial.taskKey)
  assert.deepEqual(f.updates, [])
  assert.deepEqual(f.prompts, [])
  assert.equal(f.records.size, 0, "diagnostics do not create a title record")
  await f.titles.context(id)
  const refreshed = await f.titles.status(id)
  assert.equal(refreshed.taskKey, refreshed.attemptedTaskKey)
  assert.equal(refreshed.currentTitle, refreshed.recordedTitle)
  assert.equal(refreshed.action, "preserved")
  f.state(state("layouts"))
  assert.notEqual((await f.titles.status(id)).taskKey, refreshed.attemptedTaskKey)
  f.answer("I should now think")
  await f.titles.context(id)
  const suspended = await f.titles.status(id)
  assert.equal(suspended.suspended, true)
  assert.equal(suspended.taskKey, suspended.attemptedTaskKey)
  assert.equal(suspended.currentTitle, refreshed.currentTitle)
  assert.equal(suspended.pending, false)
  assert.equal(suspended.action, "attempted")
})

test("title status refuses foreign sessions and does not expose excluded-session state", async () => {
  const f = fixture()
  let probes = 0
  f.capability(async () => { probes++; return { conditionalTitleUpdate: 1 } })
  await assert.rejects(f.titles.status("ses_foreign"), /different session ID/)
  assert.equal(probes, 0, "only an owned root session may probe the host")
  f.info({ parentID: "ses_parent" })
  const excluded = await f.titles.status(id)
  assert.equal(excluded.eligible, false)
  assert.equal(excluded.taskKey, null)
  assert.equal(excluded.currentTitle, null)
  assert.equal(excluded.publicationCapability, "unavailable")
  assert.equal(probes, 0, "excluded sessions are not probed")
  assert.deepEqual(f.prompts, [])
  assert.equal(f.records.size, 0)
})

test("a missing, malformed or rejecting capability fails closed without generation, storage or suspension", async () => {
  const variants: [string, CapabilityProbe | "missing"][] = [
    ["missing", "missing"],
    ["null", async () => null],
    ["string", async () => "conditional-title-v1"],
    ["number", async () => 1],
    ["array", async () => [1]],
    ["empty", async () => ({})],
    ["string version", async () => ({ conditionalTitleUpdate: "1" })],
    ["other version", async () => ({ conditionalTitleUpdate: 2 })],
    ["boolean", async () => ({ conditionalTitleUpdate: true })],
    ["rejection", async () => { throw Error("capability unavailable") }],
  ]
  for (const [name, capability] of variants) {
    const f = fixture()
    const seeded = storedRecord("b".repeat(64))
    f.records.set(recordKey, seeded)
    f.capability(capability)
    await f.titles.context(id)
    await f.titles.context(id)
    assert.deepEqual(f.records.get(recordKey), seeded, name)
    assert.deepEqual(f.updates, [], name)
    assert.deepEqual(f.prompts, [], name)
    assert.deepEqual(f.errors, [], name)
    const status = await f.titles.status(id)
    assert.equal(status.suspended, false, name)
    assert.equal(status.publicationCapability, "unavailable", name)
    assert.equal(status.action, "generated", name)
    assert.equal(status.recordedTitle, seeded.title, name)
  }
})

test("an unavailable capability recovers once the host advertises the conditional API", async () => {
  const f = fixture()
  f.capability("missing")
  await f.titles.context(id)
  assert.equal((await f.titles.status(id)).publicationCapability, "unavailable")
  assert.deepEqual(f.updates, [])
  f.capability(async () => ({ conditionalTitleUpdate: 1 }))
  await f.titles.context(id)
  assert.deepEqual(f.updates, [`Fix desktop input · ${id}`])
  assert.equal((await f.titles.status(id)).suspended, false)
})

test("diagnostics preserve legacy title records and distinguish generated labels without replay", async () => {
  const f = fixture()
  await f.titles.context(id)
  const key = [...f.records.keys()][0]
  const previous = f.records.get(key) as Record<string, unknown>
  const { action: _action, ...legacy } = previous
  f.records.set(key, legacy)
  assert.equal((await f.titles.status(id)).action, null)
  assert.deepEqual(f.records.get(key), legacy, "read status does not migrate an existing record")
  await f.titles.context(id)
  assert.deepEqual(f.prompts, [], "diagnostics do not replay an attempted task")
  f.state(state("layouts"))
  await f.titles.context(id)
  assert.equal((await f.titles.status(id)).action, "generated")
  assert.equal(f.prompts.length, 1)
})

test("description changes trigger naming, but plan revision churn does not", async () => {
  const f = fixture(); await f.titles.context(id)
  const next = state(); next.current!.planRevision = 99
  f.state(next); await f.titles.context(id)
  assert.equal(f.prompts.length, 0)
  next.current!.plan!.phases[0].tasks[0].description = "Repair task transition naming"
  f.state(next); await f.titles.context(id)
  assert.equal(f.prompts.length, 1)
})

test("a malformed initial title is repaired semantically, never by truncating goal prose", async () => {
  for (const title of ["Considering what I should do next and how to reason about the goal", "I should now think"]) {
    const f = fixture(); f.info({ title }); await f.titles.context(id)
    assert.deepEqual(f.updates, [`Safe window layouts · ${id}`]); assert.equal(f.prompts.length, 1)
  }
})

test("an absent stored title is left unattempted instead of consuming the task", async () => {
  const f = fixture(); f.deleteTitle()
  await f.titles.context(id, "build")
  assert.deepEqual(f.updates, [], "no token can match an absent native title")
  assert.deepEqual(f.prompts, [], "nothing is generated for an unreachable token")
  let status = await f.titles.status(id)
  assert.equal(status.attemptedTaskKey, null, "the task remains unattempted")
  assert.equal(status.suspended, false)
  f.info({ title: "Fix desktop input" }); await f.titles.context(id, "build")
  assert.deepEqual(f.updates, [`Fix desktop input · ${id}`], "a later titled session is processed normally")
  status = await f.titles.status(id)
  assert.equal(status.action, "preserved")
})

test("deliberate renames before or during generation win over task automation", async () => {
  for (const timing of ["before", "during", "save"]) {
    const f = fixture(); await f.titles.context(id); f.state(state("layouts"))
    const rename = () => f.info({ title: `User chosen label · ${id}` })
    if (timing === "before") rename()
    if (timing === "during") f.duringGenerate(rename)
    if (timing === "save") f.duringSave(rename)
    await f.titles.context(id)
    assert.equal(f.updates.length, 1, timing)
    assert.equal(await f.titles.title(id), `User chosen label · ${id}`)
    if (timing === "before") assert.equal((await f.titles.status(id)).action, "manual")
  }
})

test("moving, pausing, replacing, or changing the task during generation refuses the stale write", async () => {
  for (const change of ["move", "pause", "replace", "task", "child", "plan", "abort"]) {
    const f = fixture(); await f.titles.context(id); f.state(state("layouts"))
    f.duringGenerate(() => {
      if (change === "move") f.info({ location: { directory: "/other" } })
      if (change === "pause") f.state(state("layouts", "paused"))
      if (change === "replace") { const s = state("layouts"); s.current!.id = "replacement"; f.state(s) }
      if (change === "task") f.state(state("other"))
      if (change === "child") f.info({ parentID: "ses_parent" })
      if (change === "plan") f.info({ agent: "plan" })
      if (change === "abort") f.controller.abort()
    })
    await f.titles.context(id)
    assert.equal(f.updates.length, 1, change)
  }
})

test("pause during attempted-task persistence suppresses generation as well as rename", async () => {
  const f = fixture(); await f.titles.context(id); f.state(state("layouts"))
  f.duringSave(() => f.state(state("layouts", "paused")))
  await f.titles.context(id)
  assert.deepEqual(f.prompts, []); assert.equal(f.updates.length, 1)
})

test("children, forks, reviewers, foreign identity, reverts and restricted sessions never rename", async () => {
  for (const patch of [{ parentID: "ses_parent" }, { fork: {} }, { title: "Reviewer notes" },
    { metadata: { handoffOrigin: { role: "reviewer" } } }, { projectID: "foreign" },
    { metadata: { handoffOrigin: { role: "independent-worker", sourceSessionID: "ses_missing" } } },
    { metadata: { goalDocsHandoff: { sourceSessionID: "ses_missing" } } },
    { location: { directory, workspaceID: "foreign" } }, { time: { archived: 1 } }, { revert: {} }, { agent: "plan" }, { readOnly: true }]) {
    const f = fixture(); f.info(patch); await f.titles.context(id, "build")
    assert.deepEqual(f.updates, [], JSON.stringify(patch)); assert.deepEqual(f.prompts, [])
    assert.equal(await f.titles.title(id), undefined)
  }
  const f = fixture(); await f.titles.context(id, "plan"); assert.deepEqual(f.updates, [])
})

test("a goal read failure never becomes an absent-goal baseline or breaks the native caller", async () => {
  const f = fixture()
  const titles = createTaskTitles({ ...f.deps, readState: async () => { throw Error("state unavailable") } })
  await titles.context(id)
  assert.deepEqual(f.updates, []); assert.deepEqual(f.prompts, [])
  assert.equal(await titles.title(id), undefined)
  assert.equal(f.errors.length, 1)
})

test("inactive, absent, blocked and fully completed goals are not title work", async () => {
  for (const status of ["paused", "budgetLimited", "usageLimited", "complete", "unmet", "cancelled", "absent", "blocked", "done"]) {
    const f = fixture(); const s = state("input", status === "blocked" || status === "done" || status === "absent" ? "active" : status)
    if (status === "blocked") { s.current!.plan!.phases[0].status = "blocked"; s.current!.plan!.phases[0].tasks[0].status = "blocked" }
    if (status === "done") { s.current!.plan!.phases[0].status = "completed"; s.current!.plan!.phases[0].tasks[0].status = "completed" }
    f.state(status === "absent" ? null : s); await f.titles.context(id)
    assert.deepEqual(f.updates, [], status); assert.deepEqual(f.prompts, [], status)
  }
})

test("reasoning-like, multiline, instruction and path outputs are rejected without repeat dispatch", async () => {
  for (const answer of ["", "I should now think", "<think>Window layouts</think>", "Safe window layouts\nReasoning follows", "Update a bounded title", "Edit index.ts", "x".repeat(200), "Safe layouts · ses_other"]) {
    const f = fixture(); await f.titles.context(id); f.state(state("layouts")); f.answer(answer)
    await f.titles.context(id); await f.titles.context(id)
    assert.equal(f.updates.length, 1, answer); assert.equal(f.prompts.length, 1, answer)
    assert.ok(f.errors.length, answer)
  }
})

test("concurrent calls serialize; uncertain storage and malformed durable state fail closed", async () => {
  const f = fixture(); await f.titles.context(id); f.state(state("layouts"))
  await Promise.all([f.titles.context(id), f.titles.context(id), f.titles.context(id)])
  assert.equal(f.prompts.length, 1); assert.equal(f.updates.length, 2)
  const g = fixture(); g.failSave(); await g.titles.context(id)
  assert.deepEqual(g.updates, []); assert.deepEqual(g.prompts, [])
  const h = fixture(); await h.titles.context(id)
  const key = [...h.records.keys()][0]; h.records.set(key, { version: 1, directory: "/foreign" }); h.state(state("layouts"))
  await h.titles.context(id); assert.equal(h.updates.length, 1); assert.equal(h.prompts.length, 0)
})

test("a concurrent human rename rejected as a title conflict records the manual title without retry, overwrite or suspension", async () => {
  const f = fixture(); await f.titles.context(id); f.state(state("layouts"))
  f.duringUpdate(() => f.info({ title: `User chosen label · ${id}` }))
  await f.titles.context(id)
  assert.equal(f.prompts.length, 1, "generation ran once before publication")
  assert.equal(f.attempts.length, 2, "one conditional publication attempt per task transition")
  assert.deepEqual(f.updates, [`Fix desktop input · ${id}`], "the conflicting rename is never reapplied")
  assert.deepEqual(f.errors, [])
  const status = await f.titles.status(id)
  assert.equal(status.currentTitle, `User chosen label · ${id}`)
  assert.equal(status.recordedTitle, `User chosen label · ${id}`)
  assert.equal(status.action, "manual")
  assert.equal(status.suspended, false)
  assert.equal(status.taskKey, status.attemptedTaskKey, "the current task is recorded as handled")
  await f.titles.context(id)
  assert.equal(f.attempts.length, 2, "no retry and no permanent failure")
  assert.equal((await f.titles.status(id)).suspended, false)
})

test("a conflict after the task moved records nothing for a different task", async () => {
  const f = fixture(); await f.titles.context(id); f.state(state("layouts"))
  f.duringUpdate(() => { f.info({ title: `User chosen label · ${id}` }); f.state(state("other")) })
  await f.titles.context(id)
  assert.equal(f.prompts.length, 1)
  const status = await f.titles.status(id)
  assert.notEqual(status.taskKey, status.attemptedTaskKey)
  assert.equal(status.action, "generated", "the concurrent edit belongs to the previous task")
  assert.equal(status.recordedTitle, `Safe window layouts · ${id}`)
  assert.equal(status.currentTitle, `User chosen label · ${id}`)
  assert.equal(status.suspended, false)
  assert.deepEqual(f.errors, [])
})

test("mismatched-session or unrecognised publication rejections remain reported failures", async () => {
  for (const error of [{ _tag: "Session.TitleConflictError", sessionID: "ses_other" }, Error("native update failed")]) {
    const f = fixture(); await f.titles.context(id); f.state(state("layouts"))
    f.updateError(error)
    await f.titles.context(id)
    assert.equal(f.updates.length, 1)
    assert.equal(f.errors.length, 1)
    const status = await f.titles.status(id)
    assert.equal(status.suspended, true)
    assert.equal(status.action, "generated", "an unconfirmed conflict is not recorded as a manual decision")
    await f.titles.context(id)
    assert.equal(f.attempts.length, 2, "suspended controllers do not retry")
  }
})

test("a goal read failure during conflict reconciliation is reported, not silently treated as identity loss", async () => {
  const f = fixture(); await f.titles.context(id); f.state(state("layouts"))
  f.duringUpdate(() => {
    f.info({ title: `User chosen label · ${id}` })
    f.deps.readState = async () => { throw Error("reconciliation state unavailable") }
  })
  await f.titles.context(id)
  assert.equal(f.updates.length, 1, "the human title is not overwritten")
  assert.equal(f.attempts.length, 2, "no compensating rename")
  assert.equal(f.errors.length, 1, "a failed state read is not a successful benign reconciliation")
  assert.match(String(f.errors[0]), /reconciliation state unavailable/)
  f.deps.readState = async () => state("layouts")
  assert.equal((await f.titles.status(id)).suspended, true)
  assert.equal((await f.titles.status(id)).action, "generated", "an unverified manual decision is not stored")
})

test("conflict reconciliation distinguishes a changed location from a failed session read", async () => {
  for (const outcome of ["moved", "read-failed"]) {
    const f = fixture(); await f.titles.context(id); f.state(state("layouts"))
    const get = f.session.get
    f.duringUpdate(() => {
      f.info({ title: `User chosen label · ${id}` })
      if (outcome === "moved") f.info({ location: { directory: "/other" } })
      else f.session.get = async () => { throw Error("reconciliation session unavailable") }
    })
    await f.titles.context(id)
    assert.equal(f.updates.length, 1)
    assert.equal(f.attempts.length, 2)
    assert.equal(f.errors.length, outcome === "moved" ? 0 : 1, outcome)
    f.session.get = get
    f.info({ location: { directory } })
    const status = await f.titles.status(id)
    assert.equal(status.suspended, outcome === "read-failed", outcome)
    assert.equal(status.action, "generated", "unverified reconciliation must not store a manual action")
  }
})

test("read-only diagnostics advertise the publication capability contract", () => {
  type StatusSchema = { output: { properties: Record<string, { enum?: unknown[] }>; required: string[]; additionalProperties: boolean } }
  const status = (TaskTitlesRpc as unknown as { methods: { status: StatusSchema } }).methods.status
  assert.deepEqual(status.output.properties.publicationCapability.enum, ["unavailable", "conditional-title-v1"])
  assert.ok(status.output.required.includes("publicationCapability"))
  assert.equal(status.output.additionalProperties, false)
})
