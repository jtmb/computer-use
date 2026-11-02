import assert from "node:assert/strict"
import { execFile, spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, rm } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"
import { test } from "node:test"
import { promisify } from "node:util"
import { createBridgeExecutor } from "./bridge.ts"

async function stop(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), 1000)
    child.once("close", () => { clearTimeout(timeout); resolve() })
    child.kill("SIGTERM")
  })
}

function start(command: string, args: string[], readyLine: string): {
  child: ChildProcess
  ready: Promise<void>
  calls(): number
  output(): string
} {
  const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
  let output = ""
  let error = ""
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Private fixture readiness timeout: ${error}`)), 8000)
    child.stdout!.on("data", bytes => {
      output = (output + bytes.toString()).slice(-8000)
      if (output.includes(readyLine)) { clearTimeout(timeout); resolve() }
    })
    child.stderr!.on("data", bytes => { error = (error + bytes.toString()).slice(-4000) })
    child.once("error", failure => { clearTimeout(timeout); reject(failure) })
    child.once("exit", () => { clearTimeout(timeout); reject(new Error(`Private fixture exited: ${error}`)) })
  })
  return { child, ready, calls: () => output.split("call\n").length - 1, output: () => output }
}

test("real private D-Bus replacement retires a cached closed connection without replaying the failed request", { timeout: 25000 }, async () => {
  const root = await mkdtemp("/tmp/opencode/bridge-session-test-")
  // This address is created for the fixture, not derived by weakening an operator identity.
  const address = `unix:path=${root}/bus`
  const previousAddress = process.env.DBUS_SESSION_BUS_ADDRESS
  const helper = fileURLToPath(new URL("../../../tools/gnome-window-control/private-bus-fixture.py", import.meta.url))
  let bus: ChildProcess | undefined
  let service: ChildProcess | undefined
  const client = createBridgeExecutor()
  const busArgs = ["--session", "--nofork", `--address=${address}`, "--print-address=1"]
  try {
    process.env.DBUS_SESSION_BUS_ADDRESS = address
    const firstBus = start("dbus-daemon", busArgs, "unix:path=")
    bus = firstBus.child
    await firstBus.ready
    const firstService = start("/usr/bin/python3", ["-B", helper, "--address", address, "--stage", "first"], "ready\n")
    service = firstService.child
    await firstService.ready
    const first = JSON.parse(await client.execute("release"))
    assert.equal(first.ok, true)
    assert.equal(first.stage, "first")
    const old = client.ownedDaemonControl()
    await stop(service)
    await stop(bus)
    const replacement = start("dbus-daemon", busArgs, "unix:path=")
    bus = replacement.child
    await replacement.ready
    const nextService = start("/usr/bin/python3", ["-B", helper, "--address", address, "--stage", "second"], "ready\n")
    service = nextService.child
    await nextService.ready
    const failed = JSON.parse(await client.execute("release"))
    assert.equal(failed.ok, false)
    assert.equal(failed.transportClosed, true)
    assert.equal(old?.isCurrent(), false)
    assert.equal(nextService.calls(), 0, "the failed request must not be replayed on the replacement bus")
    const fresh = JSON.parse(await client.execute("release"))
    assert.equal(fresh.ok, true)
    assert.equal(fresh.stage, "second")
    assert.equal(fresh.calls, 1)
    assert.equal(nextService.calls(), 1)
  } finally {
    client.stop()
    if (previousAddress === undefined) delete process.env.DBUS_SESSION_BUS_ADDRESS
    else process.env.DBUS_SESSION_BUS_ADDRESS = previousAddress
    await stop(service)
    await stop(bus)
    await rm(root, { recursive: true, force: true })
  }
})

for (const discovery of [false, true]) {
  test(`installed AT-SPI uses a complete private accessibility identity via ${discovery ? "production discovery" : "per-process AT_SPI_BUS_ADDRESS"}`, { timeout: 25000 }, async () => {
    const root = await mkdtemp("/tmp/opencode/bridge-session-test-")
    const accessRoot = await mkdtemp("/tmp/opencode/bridge-session-test-")
    const address = `unix:path=${root}/bus`
    const accessAddress = `unix:path=${accessRoot}/bus`
    const helper = fileURLToPath(new URL("../../../tools/gnome-window-control/private-bus-fixture.py", import.meta.url))
    const production = fileURLToPath(new URL("../../../scripts/desktop-control.py", import.meta.url))
    const children: ChildProcess[] = []
    const owned = (command: string, args: string[], ready: string) => {
      const process = start(command, args, ready)
      children.push(process.child)
      return process
    }
    try {
      const session = owned("dbus-daemon", ["--session", "--nofork", `--address=${address}`, "--print-address=1"], "unix:path=")
      const access = owned("dbus-daemon", ["--session", "--nofork", `--address=${accessAddress}`, "--print-address=1"], "unix:path=")
      await Promise.all([session.ready, access.ready])
      const oldIdentity = session.output().trim().split("\n")[0]
      const completeAccess = access.output().trim().split("\n")[0]
      assert.ok(completeAccess.includes(",guid="))
      const registry = owned("/usr/bin/python3", ["-B", helper, "--address", accessAddress, "--stage", "registry", "--registry"], "ready\n")
      await registry.ready
      await stop(session.child)
      const replacement = owned("dbus-daemon", ["--session", "--nofork", `--address=${address}`, "--print-address=1"], "unix:path=")
      await replacement.ready
      const provider = owned("/usr/bin/python3", ["-B", helper, "--address", address, "--stage", "address-provider", "--accessibility-address", completeAccess], "ready\n")
      await provider.ready
      const env: NodeJS.ProcessEnv = { HOME: root, PATH: "/usr/bin:/bin", LANG: "C.UTF-8", DBUS_SESSION_BUS_ADDRESS: oldIdentity }
      if (!discovery) env.AT_SPI_BUS_ADDRESS = completeAccess
      const { stdout } = await promisify(execFile)("/usr/bin/python3", ["-B", production, "apps"], { env, timeout: 10000, maxBuffer: 100000 })
      assert.deepEqual(JSON.parse(stdout), [])
      assert.equal(env.DBUS_SESSION_BUS_ADDRESS, oldIdentity, "preserve the complete original session identity")
      if (!discovery) assert.equal(env.AT_SPI_BUS_ADDRESS, completeAccess)
    } finally {
      for (const child of children.reverse()) await stop(child)
      await rm(root, { recursive: true, force: true })
      await rm(accessRoot, { recursive: true, force: true })
    }
  })
}
