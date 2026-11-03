import assert from "node:assert/strict"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { makeService, type Dependencies } from "../service.ts"
import { Watchdog, type Observation, type WatchStatus } from "../watchdog.ts"

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp("/tmp/opencode/coordination-status-refresh-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const watchdog = new Watchdog(() => 1000)
  t.after(() => watchdog.dispose())
  let foreground: Observation["foreground"] = "running", calls = 0, deniedResource: string | undefined, failObservation = false
  const permissions: string[] = []
  let observed!: () => void
  const first = new Promise<void>(resolve => { observed = resolve })
  const dependencies: Dependencies = {
    scope: { directory, projectID: "status-refresh-fixture" }, stateDirectory: path.join(directory, "state"), watchdog,
    now: () => 1000,
    session: {
      get: async ({ sessionID }) => ({ id: sessionID, projectID: "status-refresh-fixture", location: { directory } }),
      prompt: async () => { throw new Error("status must never prompt a model") },
    },
    assert: async input => {
      permissions.push(input.source?.id ?? "no-tool-context")
      if (deniedResource && input.resources.includes(deniedResource)) throw new Error("current native read denied")
    },
    observe: async () => {
      calls++; observed()
      if (failObservation) throw new Error("native active snapshot failed")
      return { foreground, observedAt: 1000 + calls }
    },
  }
  const service = makeService(dependencies)
  const call = (id: string) => ({ sessionID: "ses_owner", messageID: `msg_${id}`, id })
  await service.execute({ op: "watch", id: "watch-1", worker: "ses_worker", task: "Check fixture", expectedResult: "bounded report" }, call("initial-watch"))
  await first
  await new Promise<void>(resolve => setImmediate(resolve))
  const status = async (id: string) => await service.execute({ op: "status" }, call(id)) as { statuses: WatchStatus[] }
  return { service, watchdog, dependencies, call, status, permissions, calls: () => calls,
    idle: () => { foreground = "idle" }, deny: (resource = "session:ses_worker") => { deniedResource = resource }, fail: () => { failObservation = true } }
}

test("explicit status refreshes the native observation using the current tool permission context", async t => {
  const f = await fixture(t)
  assert.equal(f.watchdog.status("ses_owner")[0].observation?.foreground, "running")
  f.idle()
  const before = f.permissions.length
  const result = await f.status("fresh-status")
  assert.equal(result.statuses[0].observation?.foreground, "idle")
  assert.equal(f.calls(), 2)
  assert.ok(f.permissions.slice(before).includes("fresh-status"))
  assert.ok(!f.permissions.slice(before).includes("initial-watch"), "do not reuse stale tool/agent permission context")
  await f.status("another-status")
  assert.equal(f.calls(), 3, "distinct explicit reads are not a permanent cached registration")
  assert.equal(result.statuses[0].ownership, "retained")
  assert.equal(result.statuses[0].acceptance, "parent-required")
})

test("current worker-read denial propagates before cached or in-flight status can be disclosed", async t => {
  const f = await fixture(t)
  f.deny()
  await assert.rejects(f.status("denied-status"), /current native read denied/)
  assert.equal(f.calls(), 1)
})

test("a failed native snapshot clears old foreground evidence and cannot revive observation retries", async t => {
  const f = await fixture(t)
  f.fail()
  const result = await f.status("denied-status")
  assert.match(result.statuses[0].error!, /native active snapshot failed/)
  assert.equal(result.statuses[0].observation, undefined)
  assert.equal(f.calls(), 2)
  await f.status("still-disabled")
  assert.equal(f.calls(), 2)
  assert.equal(f.watchdog.status("ses_owner")[0].ownership, "retained")
})

test("worker-side status cannot disclose an owner's cached assignment after owner-read denial", async t => {
  const f = await fixture(t)
  f.deny("session:ses_owner")
  await assert.rejects(f.service.execute({ op: "status" }, { ...f.call("worker-denied"), sessionID: "ses_worker" }), /current native read denied/)
  assert.equal(f.calls(), 1)
})

test("worker-side status refreshes and reconciles the same assignment after service restart", async t => {
  const f = await fixture(t)
  f.idle()
  const call = { ...f.call("worker-status"), sessionID: "ses_worker" }
  const current = await f.service.execute({ op: "status" }, call) as { statuses: WatchStatus[] }
  assert.equal(current.statuses[0].observation?.foreground, "idle")
  const restarted = new Watchdog(() => 1000)
  t.after(() => restarted.dispose())
  const service = makeService({ ...f.dependencies, watchdog: restarted })
  const result = await service.execute({ op: "status" }, { ...call, id: "worker-restart" }) as { statuses: WatchStatus[] }
  assert.equal(result.statuses.length, 1)
  assert.equal(result.statuses[0].observation?.foreground, "idle")
  assert.equal(result.statuses[0].assignment.startedAt, current.statuses[0].assignment.startedAt)
  assert.equal(result.statuses[0].ownership, "retained")
})
