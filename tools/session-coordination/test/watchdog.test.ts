import assert from "node:assert/strict"
import test from "node:test"
import { Watchdog, warnings, type Scheduler } from "../watchdog.ts"
import type { Assignment } from "../model.ts"
import { bounded } from "../store.ts"

function assignment(extra: Partial<Assignment> = {}): Assignment {
  return { id: "run-1", owner: "ses_parent", worker: "ses_child", task: "Check API", expectedResult: "bounded evidence report", startedAt: 0, progressAt: 0,
    evidence: "registered", inactivityMs: 1000, wallMs: 5000, ...extra }
}
function clockFixture() {
  let now = 0, serial = 0
  const pending = new Map<number, { callback: () => void; due: number }>()
  const scheduler: Scheduler = { set(callback, ms) { const id = ++serial; pending.set(id, { callback, due: now + ms }); return id }, clear(id) { pending.delete(id as number) } }
  return { scheduler, now: () => now, pending, advance(to: number) { now = to; for (const [id, timer] of [...pending]) if (timer.due <= now) { pending.delete(id); timer.callback() } } }
}
const settle = () => new Promise<void>(resolve => setImmediate(resolve))

test("inactivity, wall time and declared wait are distinct; none releases ownership", () => {
  assert.deepEqual(warnings(assignment(), 999), [])
  assert.deepEqual(warnings(assignment({ progressAt: 4500, waitingReason: "waiting for permission" }), 5000), ["wall-clock-warning", "declared-wait; not proof of deadlock"])
  assert.deepEqual(warnings(assignment(), 5000), ["inactivity-warning", "wall-clock-warning"])
  assert.deepEqual(warnings(assignment({ stoppedAt: 100 }), 5000), ["monitoring-stopped-explicitly; ownership-retained"])
})
test("finite registration/deadline reconciliations do not poll forever or confuse idle with stopped", async () => {
  const f = clockFixture(); let calls = 0
  const watchdog = new Watchdog(f.now, f.scheduler)
  const inspect = async () => { calls++; return { foreground: "idle" as const, savedOutcome: "succeeded", observedAt: f.now() } }
  watchdog.add(assignment(), inspect); await settle()
  assert.equal(calls, 1)
  f.advance(1000); await settle(); assert.equal(calls, 2)
  f.advance(5000); await settle(); assert.equal(calls, 3)
  f.advance(1e9); await settle(); assert.equal(calls, 3)
  const status = watchdog.status("ses_parent")[0]
  assert.equal(status.ownership, "retained"); assert.equal(status.acceptance, "parent-required")
  assert.equal(status.observation?.foreground, "idle")
  assert.deepEqual(status.warnings, ["inactivity-warning", "wall-clock-warning"])
  watchdog.dispose(); assert.equal(f.pending.size, 0)
})
test("meaningful progress reschedules inactivity but preserves the original wall deadline", async () => {
  const f = clockFixture(); const watchdog = new Watchdog(f.now, f.scheduler)
  const inspect = async () => ({ foreground: "running" as const, observedAt: f.now() })
  watchdog.add(assignment(), inspect); await settle()
  f.advance(900)
  watchdog.add(assignment({ progressAt: 900, evidence: "3 of 5 fixtures verified" }), inspect); await settle()
  f.advance(1000); await settle()
  assert.deepEqual(watchdog.status("ses_parent")[0].warnings, [])
  f.advance(5000); await settle()
  assert.ok(watchdog.status("ses_parent")[0].warnings.includes("wall-clock-warning"))
  watchdog.dispose()
})
test("terminal notification is deduplicated evidence, never automatic acceptance", async () => {
  const f = clockFixture(); let calls = 0
  const watchdog = new Watchdog(f.now, f.scheduler)
  watchdog.add(assignment(), async () => { calls++; return { foreground: "idle", observedAt: f.now() } }); await settle()
  watchdog.event("ses_other", "session.execution.succeeded"); await settle(); assert.equal(calls, 1)
  watchdog.event("ses_child", "session.execution.succeeded"); await settle()
  watchdog.event("ses_child", "session.execution.succeeded"); await settle()
  assert.equal(calls, 2)
  assert.equal(watchdog.status("ses_parent")[0].terminalEvent, "session.execution.succeeded")
  assert.equal(watchdog.status("ses_parent")[0].acceptance, "parent-required")
  assert.equal(f.pending.size, 0)
  watchdog.dispose()
})
test("terminal event arriving during registration observation is reconciled once after the busy observation", async t => {
  const f = clockFixture(); let calls = 0, finish!: (value: { foreground: "running"; observedAt: number }) => void
  const first = new Promise<{ foreground: "running"; observedAt: number }>(resolve => { finish = resolve })
  const watchdog = new Watchdog(f.now, f.scheduler); t.after(() => watchdog.dispose())
  watchdog.add(assignment(), async () => { calls++; return calls === 1 ? first : { foreground: "idle", observedAt: f.now(), savedOutcome: "succeeded" } })
  await settle()
  watchdog.event("ses_child", "session.execution.succeeded")
  assert.equal(calls, 1, "do not overlap native observations")
  finish({ foreground: "running", observedAt: 0 }); await settle(); await settle()
  assert.equal(calls, 2, "busy handling must not drop the only terminal reconciliation")
  const status = watchdog.status("ses_parent")[0]
  assert.equal(status.observation?.foreground, "idle")
  assert.equal(status.terminalEvent, "session.execution.succeeded")
  assert.equal(status.acceptance, "parent-required"); assert.equal(status.ownership, "retained")
  watchdog.event("ses_child", "session.execution.succeeded"); await settle(); assert.equal(calls, 2)
})
test("progress changes coalesce behind an existing observation instead of accumulating concurrent requests", async t => {
  const f = clockFixture(); let calls = 0, active = 0, maximum = 0
  const finishers: (() => void)[] = []
  const watchdog = new Watchdog(f.now, f.scheduler); t.after(() => { finishers.forEach(finish => finish()); watchdog.dispose() })
  const inspect = async () => {
    calls++; active++; maximum = Math.max(maximum, active)
    await new Promise<void>(resolve => { finishers.push(resolve) })
    active--; return { foreground: "running" as const, observedAt: f.now() }
  }
  watchdog.add(assignment(), inspect); await settle()
  watchdog.add(assignment({ evidence: "first bounded progress report", progressAt: 100 }), inspect)
  watchdog.add(assignment({ evidence: "second bounded progress report", progressAt: 200 }), inspect)
  await settle()
  assert.equal(calls, 1); assert.equal(maximum, 1)
  finishers[0](); await settle(); await settle()
  assert.equal(calls, 2, "only the newest pending progress snapshot needs reconciliation")
  assert.equal(watchdog.status("ses_parent")[0].assignment.progressAt, 200)
  assert.equal(watchdog.status("ses_parent")[0].observation, undefined, "old-generation observation cannot masquerade as the new progress snapshot")
  finishers[1](); await settle()
  assert.equal(maximum, 1)
})
test("a timed-out uncooperative observation cannot be reenabled by later progress or status registration", async t => {
  const f = clockFixture(); let calls = 0, noticeAbort!: () => void
  const aborted = new Promise<void>(resolve => { noticeAbort = resolve })
  const watchdog = new Watchdog(f.now, f.scheduler, 15); t.after(() => watchdog.dispose())
  const inspect = async (signal: AbortSignal) => {
    calls++; signal.addEventListener("abort", noticeAbort, { once: true }); return new Promise<never>(() => {})
  }
  watchdog.add(assignment(), inspect)
  await bounded(() => aborted, undefined, 1000); await settle()
  watchdog.add(assignment({ evidence: "reported progress after observation failure", progressAt: 200 }), inspect)
  await settle(); f.advance(5000); await settle()
  assert.equal(calls, 1, "reporting progress is not permission to pile onto an ignored-abort request")
  assert.match(watchdog.status("ses_parent")[0].error!, /exceeded/)
  assert.equal(watchdog.status("ses_parent")[0].ownership, "retained")
})
test("late out-of-order terminal types have a finite reconciliation budget without terminal-event loops", async t => {
  const f = clockFixture(); let calls = 0
  const watchdog = new Watchdog(f.now, f.scheduler); t.after(() => watchdog.dispose())
  watchdog.add(assignment({ waitingReason: "provider retry; background work unknown" }), async () => { calls++; return { foreground: "unknown", observedAt: f.now() } })
  await settle()
  for (const type of ["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted", "session.execution.succeeded", "session.execution.failed"]) {
    watchdog.event("ses_child", type); await settle()
  }
  assert.equal(calls, 4, "one registration plus three distinct terminal types, not every delayed repeat")
  assert.equal(watchdog.status("ses_parent")[0].terminalEvent, "session.execution.interrupted")
  assert.equal(watchdog.status("ses_parent")[0].ownership, "retained")
  assert.equal(watchdog.status("ses_parent")[0].observation?.foreground, "unknown")
  assert.ok(watchdog.status("ses_parent")[0].warnings.includes("declared-wait; not proof of deadlock"))
})
test("explicit monitor stop during an observation discards queued follow-up without releasing ownership", async t => {
  const f = clockFixture(); let calls = 0, finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const watchdog = new Watchdog(f.now, f.scheduler); t.after(() => { finish(); watchdog.dispose() })
  const inspect = async () => { calls++; await gate; return { foreground: "idle" as const, observedAt: f.now() } }
  watchdog.add(assignment(), inspect); await settle()
  watchdog.event("ses_child", "session.execution.interrupted")
  watchdog.add(assignment({ stoppedAt: 10 }), inspect)
  finish(); await settle(); await settle()
  assert.equal(calls, 1)
  assert.deepEqual(watchdog.status("ses_parent")[0].warnings, ["monitoring-stopped-explicitly; ownership-retained"])
  assert.equal(watchdog.status("ses_parent")[0].ownership, "retained")
  assert.equal(f.pending.size, 0)
})
test("uncooperative inspection times out once and disables automatic retries; unload aborts work", async () => {
  const f = clockFixture(); let calls = 0, aborted = false
  let observedAbort!: () => void
  const stopped = new Promise<void>(resolve => { observedAbort = resolve })
  const watchdog = new Watchdog(f.now, f.scheduler, 15)
  watchdog.add(assignment(), async signal => { calls++; signal.addEventListener("abort", () => { aborted = true; observedAbort() }); return new Promise(() => {}) })
  await bounded(() => stopped, undefined, 1000)
  await settle()
  assert.equal(aborted, true)
  assert.match(watchdog.status("ses_parent")[0].error!, /exceeded/)
  f.advance(5000); watchdog.event("ses_child", "session.execution.interrupted"); await settle()
  assert.equal(calls, 1)
  assert.equal(watchdog.status("ses_parent")[0].ownership, "retained")
  watchdog.dispose(); assert.equal(f.pending.size, 0)
})
test("identity conflicts and excess registrations fail; disposal leaves no timer keeping node alive", async () => {
  const f = clockFixture(); const watchdog = new Watchdog(f.now, f.scheduler)
  const inspect = async () => ({ foreground: "unknown" as const, observedAt: f.now() })
  watchdog.add(assignment(), inspect)
  assert.throws(() => watchdog.add(assignment({ worker: "ses_different" }), inspect), /cannot change/)
  for (let i = 1; i < 32; i++) watchdog.add(assignment({ id: `run-${i + 1}` }), inspect)
  assert.throws(() => watchdog.add(assignment({ id: "too-many" }), inspect), /capacity/)
  watchdog.dispose(); await settle()
  assert.equal(f.pending.size, 0)
  assert.deepEqual(watchdog.status("ses_parent"), [])
})

test("explicit refreshes share an in-flight native read without overlap or new polling timers", async t => {
  const f = clockFixture(), watchdog = new Watchdog(f.now, f.scheduler)
  let finish!: () => void, calls = 0, completed = false
  const gate = new Promise<void>(resolve => { finish = resolve })
  t.after(() => { finish(); watchdog.dispose() })
  watchdog.add(assignment(), async () => { calls++; await gate; return { foreground: "idle", observedAt: 7 } })
  await settle()
  const first = watchdog.refresh("run-1").then(() => { completed = true })
  const second = watchdog.refresh("run-1")
  await settle()
  assert.equal(completed, false)
  assert.equal(calls, 1)
  assert.equal(f.pending.size, 2, "only the existing inactivity/wall deadlines exist")
  finish()
  await Promise.all([first, second])
  assert.equal(watchdog.status("ses_parent")[0].observation?.foreground, "idle")
  assert.equal(calls, 1)
})

test("explicit refresh cannot revive a stopped or timed-out uncooperative monitor", async t => {
  const f = clockFixture(), watchdog = new Watchdog(f.now, f.scheduler, 15)
  let calls = 0, noticeAbort!: () => void
  const aborted = new Promise<void>(resolve => { noticeAbort = resolve })
  t.after(() => watchdog.dispose())
  watchdog.add(assignment(), async signal => {
    calls++; signal.addEventListener("abort", noticeAbort, { once: true }); return new Promise<never>(() => {})
  })
  await bounded(() => aborted, undefined, 1000)
  await settle()
  await watchdog.refresh("run-1")
  assert.equal(calls, 1)
  watchdog.add(assignment({ id: "stopped", stoppedAt: 1 }), async () => { calls++; return { foreground: "idle", observedAt: 1 } })
  await watchdog.refresh("stopped")
  assert.equal(calls, 1)
  assert.equal(watchdog.status("ses_parent")[0].ownership, "retained")
})
