import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import test from "node:test"

import { LIMITS, observeOwnedProcess, superviseProcess } from "./full-graph-diagnostics.mjs"

function fixture(context) {
  const root = Object.assign(new EventEmitter(), {
    pid: 900000001, stdout: new PassThrough(), stderr: new PassThrough(),
    exitCode: null, signalCode: null, unref() {},
  })
  const signals = []
  context.mock.method(process, "kill", (pid, signal) => { signals.push({ pid, signal }); return true })
  return { root, signals }
}

function entry(pid, ppid = 1) {
  return { pid, ppid, pgrp: 900000001, startTime: "100", state: "S" }
}

function close(root) {
  root.exitCode = 0
  root.emit("exit", 0, null)
  root.emit("close", 0, null)
}

function supervise(root, overrides = {}) {
  return superviseProcess({
    command: "injected-no-process", args: [], cwd: "/tmp/opencode", env: {},
    spawn() { queueMicrotask(() => close(root)); return root },
    available: () => 4096, readStartTime: () => "100", observeOwned: () => "unknown",
    sampleTree: () => ({ rssMiB: 1, processes: [entry(root.pid)], workEntries: 1 }),
    limits: { ...LIMITS, sampleMs: 1 },
    ...overrides,
  })
}

function statLine(pid, ppid, state) {
  return `${pid} (fixture) ${[state, String(ppid), String(ppid), ...Array(16).fill("0"), "100"].join(" ")}`
}

test("aggregate sampler charges dispatch and invalid work counts without resetting after root exit", async context => {
  for (const workEntries of [LIMITS.samplerEntries - 1, LIMITS.samplerEntries, -1, NaN, Infinity, 0.5]) {
    const { root, signals } = fixture(context)
    const result = await supervise(root, {
      sampleTree() {
        root.exitCode = 0
        return { rssMiB: 1, processes: [entry(root.pid)], workEntries }
      },
    })
    if (workEntries === LIMITS.samplerEntries - 1) {
      assert.equal(result.reason, null, JSON.stringify(result))
      assert.equal(result.cleanup.verified, true)
    } else {
      assert.equal(result.reason, "monitor-unavailable", JSON.stringify(result))
      assert.match(result.monitorError, /entry bound/)
    }
    assert.deepEqual(signals, [])
    context.mock.restoreAll()
  }
})

test("aggregate sampler does not charge callback-accounted work twice", async context => {
  const { root, signals } = fixture(context)
  const result = await supervise(root, {
    sampleTree(_pid, _io, options) {
      options.accountWork(LIMITS.samplerEntries - 2)
      return { rssMiB: 1, processes: [entry(root.pid)], workEntries: LIMITS.samplerEntries - 2 }
    },
  })
  assert.equal(result.reason, null, JSON.stringify(result))
  assert.equal(result.cleanup.verified, true)
  assert.deepEqual(signals, [])
})

test("aggregate registry charges the real observer's group and identity reads across PIDs", async context => {
  const { root, signals } = fixture(context)
  const descendants = Array.from({ length: 300 }, (_, index) => entry(root.pid + index + 1, root.pid))
  let observations = 0
  let procReads = 0
  const io = {
    readFileSync(selected) {
      procReads++
      const fields = selected.split("/")
      const pid = Number(fields[2])
      const tid = fields.length === 6 ? Number(fields[4]) : pid
      assert.ok(selected.endsWith("/stat"))
      return statLine(tid, root.pid, tid === pid ? "Z" : "S")
    },
    readdirSync(selected) {
      const pid = Number(selected.split("/")[2])
      return [String(pid), ...Array.from({ length: 64 }, (_, index) => String(pid + 1000 + index))]
    },
  }
  const result = await supervise(root, {
    sampleTree: () => ({ rssMiB: 1, processes: [entry(root.pid), ...descendants], workEntries: 1 }),
    observeOwned(pid, start, _unused, options) {
      if (pid === root.pid) return "unknown"
      observations++
      return observeOwnedProcess(pid, start, io, options)
    },
  })
  // The sampler and the cleanup walk share one allowance, and this fixture is
  // large enough that the sampling phase exhausts the wall-clock share while the
  // cleanup phase reaches and charges the entry bound. Both refusals are
  // asserted so the test proves the bound is enforced without pretending a
  // particular phase must be the one that notices it.
  assert.ok(
    result.reason === "monitor-unavailable" || result.reason === "descendant-cleanup-unverified",
    JSON.stringify(result),
  )
  assert.match(result.monitorError, /aggregate.*(entry bound|deadline)/)
  assert.match(result.cleanupError, /aggregate.*entry bound/)
  assert.equal(result.cleanup.verified, false)
  assert.ok(observations < descendants.length * 2, "each phase stops rather than replenishing per PID")
  assert.ok(procReads > 0 && procReads < LIMITS.samplerEntries * 2)
  assert.deepEqual(signals, [])
})

test("aggregate retained-tree exhaustion stays failed even with a root exit racing the refusal", async context => {
  const { root, signals } = fixture(context)
  const descendants = [entry(root.pid + 1, root.pid), entry(root.pid + 2, root.pid)]
  let samples = 0
  let cleanup = false
  let identityReads = 0
  const result = await supervise(root, {
    spawn() { return root },
    sampleTree() {
      samples++
      if (samples === 1) return { rssMiB: 1, processes: [entry(root.pid), ...descendants], workEntries: 1 }
      root.exitCode = 0
      queueMicrotask(() => { cleanup = true; close(root) })
      return { rssMiB: 1, processes: [entry(root.pid)], workEntries: LIMITS.samplerEntries - 4 }
    },
    observeOwned(pid, start, _unused, options) {
      if (cleanup || pid === root.pid) return "unknown"
      return observeOwnedProcess(pid, start, {
        readFileSync: () => { identityReads++; return statLine(pid, root.pid, "S") },
      }, options)
    },
  })
  assert.equal(samples, 2)
  assert.equal(identityReads, 1)
  assert.equal(result.reason, "monitor-unavailable", JSON.stringify(result))
  assert.match(result.monitorError, /aggregate.*(?:entry bound|remaining budget)/)
  assert.equal(result.cleanup.verified, false)
  assert.deepEqual(signals, [])
})

test("aggregate cleanup retains an issued signal when the next eligibility observation exhausts the budget", async context => {
  const { root, signals } = fixture(context)
  const descendants = [entry(root.pid + 1, root.pid), entry(root.pid + 2, root.pid)]
  let cleanup = false
  let observations = 0
  const destroy = root.stdout.destroy.bind(root.stdout)
  root.stdout.destroy = (...args) => { cleanup = true; return destroy(...args) }
  const result = await supervise(root, {
    sampleTree: () => ({ rssMiB: 1, processes: [entry(root.pid), ...descendants], workEntries: 1 }),
    observeOwned(pid, _start, _unused, options) {
      if (!cleanup || pid === root.pid) return "unknown"
      observations++
      if (observations === descendants.length + 2) options.accountWork(LIMITS.samplerEntries)
      return "alive"
    },
  })
  assert.equal(signals.length, 1)
  assert.equal(signals[0].pid, descendants[0].pid)
  assert.equal(result.descendantSignals, 1)
  assert.equal(result.cleanup.signalled, true)
  assert.equal(result.cleanup.verified, false)
  assert.match(result.cleanupError, /aggregate.*entry bound/)
})

test("aggregate cleanup shares its deadline between descendant and root drain phases", async context => {
  const { root, signals } = fixture(context)
  const descendant = entry(root.pid + 1, root.pid)
  let cleanup = false
  let clock = 0
  let cleanupStarted = null
  const rootDeadlines = []
  const destroy = root.stdout.destroy.bind(root.stdout)
  root.stdout.destroy = (...args) => { cleanup = true; cleanupStarted = clock; return destroy(...args) }
  const result = await supervise(root, {
    spawn() { queueMicrotask(() => root.stdout.write("xx")); return root },
    now: () => clock,
    sampleTree: () => ({ rssMiB: 1, processes: [entry(root.pid), descendant], workEntries: 1 }),
    observeOwned(pid, _start, _unused, options) {
      if (cleanup && pid === root.pid) rootDeadlines.push(options.deadlineMs)
      clock += 10
      return pid === descendant.pid && signals.some(signal => signal.pid === pid) ? "missing" : "alive"
    },
    limits: { ...LIMITS, sampleMs: 1, stdoutBytes: 1, drainMs: 50 },
  })
  assert.equal(result.reason, "stdout-budget")
  assert.equal(result.cleanup.verified, false)
  assert.equal(clock - cleanupStarted, 50)
  assert.equal(rootDeadlines.length, 2)
  assert.ok(rootDeadlines[0] <= 20 && rootDeadlines[1] <= 10, JSON.stringify(rootDeadlines))
  assert.deepEqual(signals.map(signal => signal.pid), [-root.pid, descendant.pid])
})

test("aggregate wall deadline remains effective with a frozen injected clock", async context => {
  const { root, signals } = fixture(context)
  const result = await supervise(root, {
    now: () => 0,
    sampleTree() {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 35)
      return { rssMiB: 1, processes: [entry(root.pid)], workEntries: 1 }
    },
    limits: { ...LIMITS, sampleMs: 1, samplerMs: 20 },
  })
  assert.equal(result.reason, "monitor-unavailable", JSON.stringify(result))
  assert.match(result.monitorError, /aggregate.*deadline/)
  assert.deepEqual(signals, [])
})

test("aggregate injected-clock rollback fails closed rather than extending the allowance", async context => {
  const { root, signals } = fixture(context)
  let clock = 10
  const result = await supervise(root, {
    now: () => clock,
    sampleTree() {
      clock = 0
      return { rssMiB: 1, processes: [entry(root.pid)], workEntries: 1 }
    },
  })
  assert.equal(result.reason, "monitor-unavailable", JSON.stringify(result))
  assert.match(result.monitorError, /aggregate.*deadline/)
  assert.deepEqual(signals, [])
})
