import assert from "node:assert/strict"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { test } from "node:test"
import { join } from "node:path"

import {
  BRIDGE_CAPTURE_TIMEOUT_MS,
  BRIDGE_REQUEST_TIMEOUT_MS,
  createBridgeExecutor,
} from "./bridge.ts"

async function fakeDaemon(): Promise<{
  scriptPath: string
  readStarts(): Promise<number>
  readRequests(): Promise<string[]>
  cleanup(): Promise<void>
}> {
  const directory = await mkdtemp("/tmp/opencode/bridge-daemon-test-")
  const startsPath = join(directory, "starts")
  const requestsPath = join(directory, "requests")
  const scriptPath = join(directory, "fake-daemon.py")
  const source = `import json
import os
import sys
import time

with open(${JSON.stringify(startsPath)}, "a", encoding="utf-8") as starts:
    starts.write("start\\n")

for line in sys.stdin:
    message = json.loads(line)
    request = message["request"]
    with open(${JSON.stringify(requestsPath)}, "a", encoding="utf-8") as requests:
        requests.write(str(request.get("marker")) + "\\n")
    mode = request.get("mode")
    if mode in ("closed", "refused"):
        print(json.dumps({"id": message["id"], "available": True, "ok": False,
                          "error": "bridge-rejected", "detail": "original refusal",
                          "transportClosed": mode == "closed"}), flush=True)
        continue
    if mode == "delay":
        time.sleep(1.5)
    if mode == "malformed":
        sys.stderr.write("secret daemon stderr\\n")
        print("{not-json", flush=True)
        continue
    result = {
        "available": True,
        "ok": True,
        "observedId": message["id"],
        "marker": request.get("marker"),
        "environmentKeys": sorted(os.environ),
        "secretInherited": "OPENCODE_BRIDGE_TEST_SECRET" in os.environ,
    }
    print(json.dumps({"id": message["id"], **result}), flush=True)
`
  await writeFile(scriptPath, source, { mode: 0o600 })
  return {
    scriptPath,
    async readStarts() {
      try {
        return (await readFile(startsPath, "utf8")).trim().split("\n").length
      } catch {
        return 0
      }
    },
    async readRequests() {
      return (await readFile(requestsPath, "utf8")).trim().split("\n")
    },
    async cleanup() {
      await rm(directory, { recursive: true, force: true })
    },
  }
}

test("persistent client serializes calls, reuses one daemon, and correlates response IDs", async () => {
  const fake = await fakeDaemon()
  const previousSecret = process.env.OPENCODE_BRIDGE_TEST_SECRET
  process.env.OPENCODE_BRIDGE_TEST_SECRET = "must-not-reach-daemon"
  const client = createBridgeExecutor({ scriptPath: fake.scriptPath })
  try {
    const [firstRaw, secondRaw] = await Promise.all([
      client.execute("input", { marker: "first", mode: "delay" }),
      client.execute("capture", { marker: "second" }),
    ])
    const first = JSON.parse(firstRaw) as Record<string, unknown>
    const second = JSON.parse(secondRaw) as Record<string, unknown>
    assert.equal(first.observedId, 1)
    assert.equal(first.marker, "first")
    assert.equal(second.observedId, 2)
    assert.equal(second.marker, "second")
    // The allowlist carries D-Bus session addressing (addresses, never secrets) plus
    // the display variables, because a daemon without them cannot reach the bus.
    const allowed = new Set([
      "HOME",
      "LANG",
      "PATH",
      "DBUS_SESSION_BUS_ADDRESS",
      "XDG_RUNTIME_DIR",
      "DISPLAY",
      "WAYLAND_DISPLAY",
    ])
    assert.ok(Array.isArray(first.environmentKeys))
    for (const key of first.environmentKeys) {
      assert.ok(allowed.has(key), `${key} is not an allowed daemon variable`)
    }
    for (const required of ["HOME", "LANG", "PATH"]) {
      assert.ok(first.environmentKeys.includes(required), `${required} must reach the daemon`)
    }
    for (const forbidden of ["OPENCODE_BRIDGE_TEST_SECRET", "NODE_OPTIONS", "DEBUG", "PWDEBUG"]) {
      assert.equal(first.environmentKeys.includes(forbidden), false, `${forbidden} must not reach the daemon`)
    }
    assert.equal(first.secretInherited, false)
    assert.equal(await fake.readStarts(), 1)
  } finally {
    client.stop()
    if (previousSecret === undefined) delete process.env.OPENCODE_BRIDGE_TEST_SECRET
    else process.env.OPENCODE_BRIDGE_TEST_SECRET = previousSecret
    await fake.cleanup()
  }
})

test("timeout kills the daemon and the next request starts a new one", async () => {
  const fake = await fakeDaemon()
  const client = createBridgeExecutor({ scriptPath: fake.scriptPath, timeoutMs: 750, captureTimeoutMs: 750 })
  try {
    await client.execute("input", { marker: "before-timeout" })
    const oldControl = client.ownedDaemonControl()
    assert.ok(oldControl?.isCurrent())
    const timedOut = await client.execute("input", { mode: "delay" })
    assert.match(timedOut, /timed out/)
    assert.equal(oldControl?.isCurrent(), false, "the old capability must become stale when its child dies")
    assert.equal(oldControl?.suspend(), false, "a stale capability must not suspend a replacement child")
    assert.equal(oldControl?.resume(), false, "a stale capability must not signal a replacement child")
    const recovered = JSON.parse(await client.execute("input", { marker: "after-timeout" })) as Record<string, unknown>
    assert.equal(recovered.marker, "after-timeout")
    assert.equal(await fake.readStarts(), 2)
    assert.equal(oldControl?.isCurrent(), false)
  } finally {
    client.stop()
    await fake.cleanup()
  }
})

test("owned daemon control exposes sanitized spawn metadata and only suspends its live child", async () => {
  const fake = await fakeDaemon()
  const client = createBridgeExecutor({ scriptPath: fake.scriptPath })
  try {
    await client.execute("capture", { marker: "establish-owned-daemon" })
    const control = client.ownedDaemonControl()
    assert.ok(control)
    assert.equal(control.isCurrent(), true)
    const allowedEnvironment = new Set([
      "DBUS_SESSION_BUS_ADDRESS",
      "DISPLAY",
      "HOME",
      "LANG",
      "PATH",
      "WAYLAND_DISPLAY",
      "XDG_RUNTIME_DIR",
    ])
    assert.ok(control.environmentKeys.every((name) => allowedEnvironment.has(name)), "spawn metadata contains only allowlisted names")
    for (const required of ["HOME", "LANG", "PATH"])
      assert.ok(control.environmentKeys.includes(required), `${required} must be in the owned spawn metadata`)
    assert.equal(control.environmentKeys.includes("OPENCODE_BRIDGE_TEST_SECRET"), false)
    assert.equal(control.suspend(), true)
    assert.equal(control.suspend(), false, "the same child cannot be suspended twice through the capability")
    assert.equal(control.resume(), true)
    assert.equal(control.resume(), false, "resume is only available after this capability suspended the child")
    assert.equal(control.isCurrent(), true)
    client.stop()
    assert.equal(control.isCurrent(), false, "a stopped client invalidates its capability")
    assert.equal(control.resume(), false, "stopped clients cannot be resumed")
  } finally {
    client.stop()
    await fake.cleanup()
  }
})

test("closed transport retires only its owned daemon for a later fresh request, without replay", async () => {
  const fake = await fakeDaemon()
  const client = createBridgeExecutor({ scriptPath: fake.scriptPath })
  try {
    await client.execute("capture", { marker: "before-close" })
    const oldControl = client.ownedDaemonControl()
    const failed = JSON.parse(await client.execute("input", { mode: "closed", marker: "failed-mutation" }))
    assert.equal(failed.ok, false)
    assert.equal(failed.detail, "original refusal")
    assert.equal(oldControl?.isCurrent(), false)
    assert.equal(await fake.readStarts(), 1, "failure must not start a replacement or replay the action")
    assert.deepEqual(await fake.readRequests(), ["before-close", "failed-mutation"])
    const fresh = JSON.parse(await client.execute("capture", { marker: "fresh-observation" }))
    assert.equal(fresh.marker, "fresh-observation")
    assert.equal(await fake.readStarts(), 2)
    assert.deepEqual(await fake.readRequests(), ["before-close", "failed-mutation", "fresh-observation"])
    assert.equal(oldControl?.suspend(), false)
  } finally {
    client.stop()
    await fake.cleanup()
  }
})

test("an ordinary bridge refusal does not retire a healthy transport", async () => {
  const fake = await fakeDaemon()
  const client = createBridgeExecutor({ scriptPath: fake.scriptPath })
  try {
    const refused = JSON.parse(await client.execute("input", { mode: "refused", marker: "stale-target" }))
    assert.equal(refused.ok, false)
    assert.equal(client.ownedDaemonControl()?.isCurrent(), true)
    await client.execute("capture", { marker: "fresh-observation" })
    assert.equal(await fake.readStarts(), 1)
  } finally {
    client.stop()
    await fake.cleanup()
  }
})

test("malformed daemon frames kill the client without exposing stderr", async () => {
  const fake = await fakeDaemon()
  const client = createBridgeExecutor({ scriptPath: fake.scriptPath })
  try {
    const malformed = await client.execute("input", { mode: "malformed" })
    assert.match(malformed, /invalid daemon protocol/)
    assert.doesNotMatch(malformed, /secret daemon stderr/)
    const recovered = JSON.parse(await client.execute("input", { marker: "after-corruption" })) as Record<string, unknown>
    assert.equal(recovered.marker, "after-corruption")
    assert.equal(await fake.readStarts(), 2)
  } finally {
    client.stop()
    await fake.cleanup()
  }
})

test("bridge timeout defaults preserve the 30 second operation and 11 second capture budgets", () => {
  assert.equal(BRIDGE_REQUEST_TIMEOUT_MS, 30_000)
  assert.equal(BRIDGE_CAPTURE_TIMEOUT_MS, 11_000)
})
