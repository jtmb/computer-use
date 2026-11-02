import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath, pathToFileURL } from "node:url"

const directory = path.dirname(fileURLToPath(import.meta.url))
const windowId = "12345678-1234-1234-1234-123456789abc:7"
const appId = "org.gnome.TextEditor.desktop"
const args = ["--window-id", windowId, "--app-id", appId]

// Only subprocess I/O is replaced. The real CLI, registration, serialization,
// capture/launch validation, permission recording and cleanup all run unchanged.
const transportSource = `
import { EventEmitter } from "node:events"
import { PassThrough } from "node:stream"
import { appendFileSync } from "node:fs"
const scenario = process.env.SCENARIO
let captured = false
let latest
export const events = []
function record(value) {
  events.push(value)
  appendFileSync(process.env.EVENTS, JSON.stringify(value) + "\\n")
}
export function execFile(command, argv, options, callback) {
  record({ type: "exec", command, argv })
  if (!argv.includes("list")) throw Error("unexpected subprocess: " + argv.join(" "))
  const target = {
    id: ${JSON.stringify(windowId)}, appId: ${JSON.stringify(appId)}, pid: 4312,
    rect: { x: 10, y: 20, width: 400, height: 300 },
  }
  if (scenario === "mismatch") target.appId = "org.example.Other.desktop"
  if (scenario === "drift" && captured) target.rect.x++
  const windows = scenario === "missing" ? [] : [target]
  if (scenario === "duplicate") windows.push({ ...target })
  queueMicrotask(() => callback(options.signal?.aborted ? Error("cancelled") : null,
    JSON.stringify({ ok: true, focusedWindowId: target.id, windows }), ""))
  return new EventEmitter()
}
export function spawn(command, argv, options) {
  record({ type: "spawn", command, argv, environmentKeys: Object.keys(options.env).sort() })
  const child = new EventEmitter()
  latest = child
  child.exitCode = null
  child.signalCode = null
  child.stdout = new PassThrough()
  child.stdin = new PassThrough()
  let suspended = false
  child.kill = (signal) => {
    record({ type: "signal", signal })
    if (signal === "SIGSTOP") {
      suspended = true
      if (scenario === "cancel") queueMicrotask(() => process.emit("SIGTERM"))
    }
    if (signal === "SIGCONT") suspended = false
    if (signal === "SIGKILL") {
      child.signalCode = signal
      queueMicrotask(() => child.emit("exit", null, signal))
    }
    return true
  }
  child.stdin.on("data", (chunk) => {
    const frame = JSON.parse(chunk.toString())
    record({ type: "bridge", command: frame.command, request: frame.request })
    if (suspended) return
    if (scenario === "cancelCapture" && frame.command === "capture") {
      queueMicrotask(() => process.emit("SIGTERM"))
      return
    }
    const response = { id: frame.id, ok: true, available: true }
    if (frame.command === "capture") {
      captured = true
      const png = Buffer.alloc(24)
      Buffer.from([137,80,78,71,13,10,26,10]).copy(png)
      png.writeUInt32BE(scenario === "wrongDimensions" ? 401 : 400, 16)
      png.writeUInt32BE(300, 20)
      Object.assign(response, {
        windowId: frame.request.windowId, observationId: "observation-1",
        width: 400, height: 300, sha256: "a".repeat(64), pngBase64: png.toString("base64"),
      })
    } else if (frame.command === "input") {
      Object.assign(response, { ok: false, detail: "refused unknown observation" })
    } else if (frame.command === "launch") {
      Object.assign(response, { desktopId: frame.request.desktopId, launchToken: "launch-token", beforeWindowIds: [] })
    } else if (frame.command === "confirm") {
      Object.assign(response, { appeared: true, windowIds: ["new-window"] })
    } else if (frame.command !== "release") throw Error("unexpected bridge command")
    queueMicrotask(() => child.stdout.write(JSON.stringify(response) + "\\n"))
  })
  return child
}
export function fail(channel) {
  const target = channel === "child" ? latest : latest[channel]
  target.emit("error", Object.assign(Error("injected transport failure"), { code: "EPIPE" }))
}
`

async function run(entry: string, argv: string[] = args, scenario = "normal", source?: string) {
  const scratch = await mkdtemp("/tmp/opencode/acceptance-harness-")
  try {
    const fake = path.join(scratch, "transport.mjs")
    const bootstrap = path.join(scratch, "bootstrap.mjs")
    const eventsPath = path.join(scratch, "events.jsonl")
    await writeFile(fake, transportSource)
    await writeFile(eventsPath, "")
    await writeFile(bootstrap, `
      import { registerHooks } from "node:module"
      registerHooks({ resolve(specifier, context, next) {
        if (specifier === "node:child_process") return { url: ${JSON.stringify(pathToFileURL(fake).href)}, shortCircuit: true }
        return next(specifier, context)
      } })
    `)
    let target = path.join(directory, entry)
    if (source) {
      target = path.join(scratch, "entry.mjs")
      await writeFile(target, source.replaceAll("FAKE_URL", pathToFileURL(fake).href))
    }
    const caller = entry === "fresh-shell-caller"
    if (caller) {
      const shell = await readFile(path.resolve(directory, "../../../tools/gnome-window-control/fresh-shell-acceptance.sh"), "utf8")
      const start = shell.indexOf("TARGET_META=$(node")
      const end = shell.indexOf("\nEPOCH=", start)
      assert.ok(start >= 0 && end > start, "fresh-shell target-selection block must exist")
      const calls = [...shell.matchAll(/^timeout 180 node --experimental-strip-types \\\n[\s\S]*?>"\$BASE\/(?:tool-acceptance|resilience)\.txt" 2>&1$/gm)]
      assert.equal(calls.length, 2, "both actual fresh-shell harness invocations must exist")
      await writeFile(path.join(scratch, "list.json"), JSON.stringify({
        ok: true, focusedWindowId: windowId,
        windows: [{ id: windowId, appId, pid: 4312, title: "fresh-run-target target1", rect: { x: 10, y: 20, width: 400, height: 300 } }],
      }))
      target = path.join(scratch, "caller.sh")
      await writeFile(target, `
        set -eu
        REPO=${JSON.stringify(path.resolve(directory, "../../.."))}
        BASE=${JSON.stringify(scratch)}
        TAG=fresh-run-target
        LOG="$BASE/log"
        log() { :; }
        fail() { echo "$*" >&2; exit 1; }
        node() { command ${JSON.stringify(process.execPath)} --import ${JSON.stringify(bootstrap)} "$@"; }
        timeout() { shift; "$@"; }
        ${shell.slice(start, end)}
        ${calls.map((match) => match[0]).join("\n")}
        cat "$BASE/tool-acceptance.txt" "$BASE/resilience.txt"
      `)
    }
    const output = await new Promise<{ code: number | null; signal: string | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(caller ? "/bin/bash" : process.execPath, caller ? [target] : ["--experimental-strip-types", "--import", bootstrap, target, ...argv], {
        env: { PATH: process.env.PATH, HOME: scratch, TMPDIR: "/tmp/opencode", SCENARIO: scenario, EVENTS: eventsPath },
        stdio: ["ignore", "pipe", "pipe"],
      })
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(Error("offline harness deadline")) }, 20_000)
      let stdout = "", stderr = ""
      child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 64_000) child.kill("SIGKILL") })
      child.stderr.on("data", (chunk) => { stderr += chunk; if (stderr.length > 64_000) child.kill("SIGKILL") })
      child.once("error", (error) => { clearTimeout(timer); reject(error) })
      child.once("close", (code, signal) => { clearTimeout(timer); resolve({ code, signal, stdout, stderr }) })
    })
    const events = (await readFile(eventsPath, "utf8")).trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
    return { ...output, events }
  } finally {
    await rm(scratch, { recursive: true, force: true })
  }
}

test("actual live harness is capture-only by default and verifies permission before bridge dispatch", async () => {
  const result = await run("live-desktop-acceptance.mjs")
  assert.equal(result.code, 0, result.stdout + result.stderr)
  assert.deepEqual(result.events.filter((e) => e.type === "bridge").map((e) => e.command), ["capture"])
  assert.deepEqual(result.events.filter((e) => e.type === "signal").map((e) => e.signal), ["SIGKILL"])
  assert.match(result.stdout, /exact target capture permission was granted before bridge dispatch/)
  assert.match(result.stdout, /SUMMARY: failures=0/)
})

test("actual live harness retains explicit release, refusal, selected launch and confirmation", async () => {
  const result = await run("live-desktop-acceptance.mjs", [...args, "--allow-effects", "--launch-desktop-id", "org.example.Selected.desktop"])
  assert.equal(result.code, 0, result.stdout + result.stderr)
  const calls = result.events.filter((e) => e.type === "bridge")
  assert.deepEqual(calls.map((e) => e.command), ["capture", "release", "input", "launch", "confirm"])
  assert.equal(calls.find((e) => e.command === "launch").request.desktopId, "org.example.Selected.desktop")
})

test("failed baseline validation prevents all opted-in effects in the actual harness", async () => {
  const result = await run("live-desktop-acceptance.mjs", [...args, "--allow-effects", "--launch-desktop-id", "org.example.Selected.desktop"], "wrongDimensions")
  assert.equal(result.code, 1, result.stdout + result.stderr)
  assert.deepEqual(result.events.filter((e) => e.type === "bridge").map((e) => e.command), ["capture"])
})

test("fresh-shell target-selection and actual caller snippets pass exact IDs and opt-ins offline", async () => {
  const result = await run("fresh-shell-caller")
  assert.equal(result.code, 0, result.stdout + result.stderr)
  const calls = result.events.filter((e) => e.type === "bridge")
  assert.ok(calls.filter((e) => e.command === "capture").every((e) => e.request.windowId === windowId))
  assert.equal(calls.find((e) => e.command === "launch").request.desktopId, "org.gnome.Calculator.desktop")
  assert.ok(result.events.some((e) => e.type === "signal" && e.signal === "SIGSTOP"))
  assert.equal((result.stdout.match(/SUMMARY: failures=0/g) ?? []).length, 2)
})

test("actual harnesses reject invalid selection before any subprocess I/O", async () => {
  for (const entry of ["live-desktop-acceptance.mjs", "resilience-acceptance.mjs"]) {
    for (const argv of [[], ["--window-id", "*", "--app-id", appId], [...args, "--app-id", appId]]) {
      const result = await run(entry, argv)
      assert.equal(result.code, 2, result.stdout + result.stderr)
      assert.deepEqual(result.events, [])
    }
  }
  const result = await run("live-desktop-acceptance.mjs", [...args, "--allow-effects"])
  assert.equal(result.code, 2)
  assert.deepEqual(result.events, [])
})

test("actual harness refuses stale, duplicate or mismatched inventory before capture; post-drift fails closed", async () => {
  for (const scenario of ["missing", "duplicate", "mismatch", "drift"]) {
    const result = await run("live-desktop-acceptance.mjs", args, scenario)
    assert.equal(result.code, 1, result.stdout + result.stderr)
    const calls = result.events.filter((e) => e.type === "bridge")
    assert.deepEqual(calls.map((e) => e.command), scenario === "drift" ? ["capture"] : [])
    assert.equal(result.events.filter((e) => e.type === "signal").length, scenario === "drift" ? 1 : 0)
  }
})

test("actual resilience default never suspends; selected freeze times out and recovers with owned cleanup", async () => {
  const baseline = await run("resilience-acceptance.mjs")
  assert.equal(baseline.code, 0, baseline.stdout + baseline.stderr)
  assert.deepEqual(baseline.events.filter((e) => e.type === "signal").map((e) => e.signal), ["SIGKILL"])
  const frozen = await run("resilience-acceptance.mjs", [...args, "--allow-effects"])
  assert.equal(frozen.code, 0, frozen.stdout + frozen.stderr)
  assert.deepEqual(frozen.events.filter((e) => e.type === "signal").map((e) => e.signal), ["SIGSTOP", "SIGKILL", "SIGKILL"])
  assert.match(frozen.stdout, /serialized surface recovered afterwards/)
})

test("actual resilience cancellation resumes its child, preserves signal exit and stops it", async () => {
  const result = await run("resilience-acceptance.mjs", [...args, "--allow-effects"], "cancel")
  assert.equal(result.code, 143, result.stdout + result.stderr)
  assert.deepEqual(result.events.filter((e) => e.type === "signal").map((e) => e.signal), ["SIGSTOP", "SIGCONT", "SIGKILL"])
})

test("actual live capture cancellation stops its owned child and preserves signal exit without effects", async () => {
  const result = await run("live-desktop-acceptance.mjs", [...args, "--allow-effects", "--launch-desktop-id", "org.example.Selected.desktop"], "cancelCapture")
  assert.equal(result.code, 143, result.stdout + result.stderr)
  assert.deepEqual(result.events.filter((e) => e.type === "bridge").map((e) => e.command), ["capture"])
  assert.deepEqual(result.events.filter((e) => e.type === "signal").map((e) => e.signal), ["SIGKILL"])
})

test("transport errors retire and kill even a suspended owned child, never stranding it", async () => {
  for (const channel of ["stdout", "stdin", "child"]) {
    const result = await run("", [], "normal", `
      import assert from "node:assert/strict"
      import { createBridgeExecutor } from ${JSON.stringify(pathToFileURL(path.join(directory, "bridge.ts")).href)}
      import { fail, events } from "FAKE_URL"
      const client = createBridgeExecutor()
      try {
        await client.execute("capture", {})
        const control = client.ownedDaemonControl()
        assert.equal(control.suspend(), true)
        fail(${JSON.stringify(channel)})
        assert.equal(control.isCurrent(), false)
        assert.equal(control.resume(), false)
        client.stop()
        assert.deepEqual(events.filter(e => e.type === "signal").map(e => e.signal), ["SIGSTOP", "SIGKILL"])
      } finally { client.stop() }
    `)
    assert.equal(result.code, 0, channel + ": " + result.stdout + result.stderr)
  }
})
