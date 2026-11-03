import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import test from "node:test"
import { createNativeObserver, type NativeObservationSession } from "../native-observation.ts"
import { bounded } from "../store.ts"

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp("/tmp/opencode/coordination-native-observation-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const scope = { directory, projectID: "native-observation-fixture", workspaceID: "workspace-fixture" }
  const metadata = { id: "ses_worker", projectID: scope.projectID, location: { directory, workspaceID: scope.workspaceID }, outcome: "succeeded", time: { idle: 50 } }
  const session: NativeObservationSession = { get: async () => structuredClone(metadata) }
  return { scope, metadata, session, signal: new AbortController().signal,
    observe: () => createNativeObserver(scope, session, () => 1000) }
}

test("an unpatched SDK remains unknown even when saved metadata has a successful idle outcome", async t => {
  const f = await fixture(t)
  assert.deepEqual(await f.observe()("ses_worker", f.signal), {
    foreground: "unknown", savedOutcome: "succeeded", observedAt: 1000, basis: "sdk-unavailable",
  })
})

test("actual native active-map presence controls foreground, not the saved outcome or another session", async t => {
  const f = await fixture(t)
  let calls = 0, getCalls = 0
  f.session.get = async () => { getCalls++; return structuredClone(f.metadata) }
  f.session.active = async function (options) {
    assert.equal(this, f.session)
    assert.ok(options?.signal instanceof AbortSignal, "the native no-input API receives request options first")
    calls++
    return { [calls === 1 ? "ses_worker" : "ses_unrelated"]: { type: "running" } }
  }
  assert.deepEqual(await f.observe()("ses_worker", f.signal), {
    foreground: "running", savedOutcome: "succeeded", observedAt: 1000, basis: "native-active-snapshot",
  })
  const idle = await f.observe()("ses_worker", f.signal)
  assert.equal(idle.foreground, "idle")
  assert.equal(getCalls, 4, "both samples recheck scope before and after the native snapshot")
  assert.ok(!JSON.stringify(idle).includes("ses_unrelated"), "only the selected worker's status is returned")
  assert.equal("allWorkStopped" in idle, false)
})

test("malformed, oversized and wrapper-shaped native receipts cannot prove idle", async t => {
  const f = await fixture(t)
  const invalid: unknown[] = [null, [], { data: {} }, { ses_worker: { type: "idle" } },
    { ses_worker: { type: "running", stopped: true } }, { foreign: { type: "running" } },
    Object.fromEntries(Array.from({ length: 1025 }, (_, i) => [`ses_${i}`, { type: "running" }])),
    Object.create({ ses_worker: { type: "running" } })]
  for (const receipt of invalid) {
    f.session.active = async () => receipt as Awaited<ReturnType<NonNullable<NativeObservationSession["active"]>>>
    await assert.rejects(f.observe()("ses_worker", f.signal), /native active-session snapshot/)
  }
})

test("moved, foreign, archived and wrong-identity sessions refuse before native snapshot access", async t => {
  const f = await fixture(t)
  let activeCalls = 0
  f.session.active = async () => { activeCalls++; return {} }
  for (const patch of [
    { id: "ses_other" }, { projectID: "foreign" }, { location: { directory: f.scope.directory } },
    { location: { directory: "/tmp/opencode/foreign", workspaceID: f.scope.workspaceID } }, { time: { archived: 9 } },
  ]) {
    f.session.get = async () => ({ ...f.metadata, ...patch })
    await assert.rejects(f.observe()("ses_worker", f.signal), /outside the selected scope/)
  }
  assert.equal(activeCalls, 0)
})

test("a scope move during native lookup refuses the result rather than returning a stale idle sample", async t => {
  const f = await fixture(t)
  f.session.active = async () => { f.metadata.location.workspaceID = "moved"; return {} }
  await assert.rejects(f.observe()("ses_worker", f.signal), /outside the selected scope/)
})

test("native lookup errors propagate; no fallback can turn denied or failed access into idle", async t => {
  const f = await fixture(t)
  f.session.active = async () => { throw new Error("native active read denied") }
  await assert.rejects(f.observe()("ses_worker", f.signal), /native active read denied/)
})

test("pre-abort prevents metadata/native calls and an ignored abort still hits the aggregate deadline", async t => {
  const f = await fixture(t)
  let getCalls = 0
  f.session.get = async () => { getCalls++; return structuredClone(f.metadata) }
  const cancelled = new AbortController()
  cancelled.abort(new Error("caller cancelled"))
  await assert.rejects(f.observe()("ses_worker", cancelled.signal), /caller cancelled/)
  assert.equal(getCalls, 0)
  let notify!: () => void
  const stopped = new Promise<void>(resolve => { notify = resolve })
  f.session.active = async options => {
    options!.signal!.addEventListener("abort", notify, { once: true })
    return new Promise<never>(() => {})
  }
  const observe = createNativeObserver(f.scope, f.session, () => 1000, 15)
  await assert.rejects(observe("ses_worker", f.signal), /exceeded/)
  await bounded(() => stopped, undefined, 1000)
  assert.equal(getCalls, 1, "no post-snapshot metadata read follows a timed-out native lookup")
})

test("invalid selected IDs and timestamps fail without manufacturing an observation", async t => {
  const f = await fixture(t)
  await assert.rejects(f.observe()("not-a-session", f.signal), /exact session ID/)
  await assert.rejects(createNativeObserver(f.scope, f.session, () => Number.NaN)("ses_worker", f.signal), /timestamp/)
})

test("observation time belongs to the native snapshot, not a later scope recheck", async t => {
  const f = await fixture(t)
  let now = 10, gets = 0
  f.session.get = async () => { if (++gets === 2) now = 99; return structuredClone(f.metadata) }
  f.session.active = async () => { now = 20; return {} }
  const result = await createNativeObserver(f.scope, f.session, () => now)("ses_worker", f.signal)
  assert.equal(result.observedAt, 20)
  assert.equal(now, 99)
})
