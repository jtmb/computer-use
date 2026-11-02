import assert from "node:assert/strict"
import test from "node:test"
import path from "node:path"
import { pathToFileURL } from "node:url"

// The same regression runs against the canonical modules (red) and against the
// patched scratch copy (green) without editing the repository.
const TARGET = process.env.DESKTOP_TS ?? 
  path.join(path.dirname(new URL(import.meta.url).pathname), "desktop.ts")
const BRIDGE = process.env.BRIDGE_TS ?? path.join(path.dirname(TARGET), "bridge.ts")
const { describeDesktopFailure, runDesktopControl } = await import(pathToFileURL(TARGET).href)
const { createBridgeExecutor } = await import(pathToFileURL(BRIDGE).href)

const HERE = path.dirname(new URL(import.meta.url).pathname)
const SLOW_HELPER = path.join(HERE, "slow-mutation.py")
const SLOW_BRIDGE = path.join(HERE, "slow-bridge-daemon.py")
const MAY_HAVE_HAPPENED = /may already have been (applied|dispatched)/i
const MAX_PROMPT_MS = 3000

function aborted() {
  const failure = new Error("The operation was aborted")
  failure.name = "AbortError"
  ;(failure as any).code = "ABORT_ERR"
  return failure
}

// A timed-out child is reported by Node as killed with no numeric exit code.
function timedOut() {
  return { code: null, killed: true, signal: "SIGTERM", message: "Command failed: killed" }
}

test("a cancelled mutating request says the mutation may already have happened", () => {
  const text = describeDesktopFailure(aborted(), true)
  assert.match(text, /was cancelled/)
  assert.match(text, MAY_HAVE_HAPPENED)
})

test("a timed-out mutating request says the mutation may already have happened", () => {
  const text = describeDesktopFailure(timedOut(), true)
  assert.match(text, /timed out after 30s/)
  assert.match(text, MAY_HAVE_HAPPENED)
})

test("cancelled and timed-out read-only requests never claim a mutation", () => {
  for (const failure of [aborted(), timedOut()]) {
    const explicit = describeDesktopFailure(failure, false)
    const implicit = describeDesktopFailure(failure)
    assert.doesNotMatch(explicit, MAY_HAVE_HAPPENED)
    assert.doesNotMatch(implicit, MAY_HAVE_HAPPENED)
  }
})

test("an aborted apply through the runner carries the post-dispatch warning", async () => {
  const controller = new AbortController()
  const started = Date.now()
  const pending = runDesktopControl(
    ["set-text", "--apply", "--expect-token", "1700000000000000000:" + "a".repeat(64)],
    controller.signal,
    SLOW_HELPER,
    true,
  )
  setTimeout(() => controller.abort(), 150)
  const text = await pending
  assert.ok(Date.now() - started < MAX_PROMPT_MS, "the abort must stop the helper promptly")
  assert.match(text, /was cancelled/)
  assert.match(text, MAY_HAVE_HAPPENED)
})

test("an aborted preview through the runner stays a plain cancellation", async () => {
  const controller = new AbortController()
  const pending = runDesktopControl(["find", "--name", "Save"], controller.signal, SLOW_HELPER, false)
  setTimeout(() => controller.abort(), 150)
  const text = await pending
  assert.match(text, /was cancelled/)
  assert.doesNotMatch(text, MAY_HAVE_HAPPENED)
})

test("an aborted bridge input request warns that the action may already have run", async () => {
  const client = createBridgeExecutor({ scriptPath: SLOW_BRIDGE })
  try {
    const controller = new AbortController()
    const started = Date.now()
    const pending = client.execute("input", { marker: "cancel-me" }, controller.signal)
    setTimeout(() => controller.abort(), 300)
    const text = await pending
    assert.ok(Date.now() - started < MAX_PROMPT_MS, "the abort must stop the daemon promptly")
    assert.match(text, /was cancelled/)
    assert.match(text, MAY_HAVE_HAPPENED)
  } finally {
    client.stop()
  }
})

test("an aborted bridge capture stays a plain cancellation", async () => {
  const client = createBridgeExecutor({ scriptPath: SLOW_BRIDGE })
  try {
    const controller = new AbortController()
    const pending = client.execute("capture", { windowId: "0".repeat(8) }, controller.signal)
    setTimeout(() => controller.abort(), 300)
    const text = await pending
    assert.match(text, /was cancelled/)
    assert.doesNotMatch(text, MAY_HAVE_HAPPENED)
  } finally {
    client.stop()
  }
})
