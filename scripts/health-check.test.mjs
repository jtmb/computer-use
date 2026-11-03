import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises"
import { spawn } from "node:child_process"
import path from "node:path"
import { PassThrough } from "node:stream"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { pumpBounded } from "../.opencode/plugins/memory/acceptance/native-host.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const required = ["computer-use.desktop", "local.goal-mode.server", "computer-use.goal-docs"]
const active = () => ({
  location: { directory: root },
  data: required.map((id) => ({ id, state: { status: "active" } })),
})

async function runHealth(inventory, {
  apiExit = 0, testsExit = 0, serviceStatus = "http://127.0.0.1:49374", serviceExit = 0, args = [],
} = {}) {
  const directory = await mkdtemp("/tmp/opencode/health-check-test-")
  const bin = path.join(directory, "bin")
  await mkdir(bin)
  await writeFile(path.join(directory, "inventory.json"),
    typeof inventory === "string" ? inventory : JSON.stringify(inventory))
  const route = `/api/plugin?location%5Bdirectory%5D=${encodeURIComponent(root)}`
  await writeFile(path.join(bin, "opencode"), `#!/bin/bash
printf '%s\n' "$*" >> "$HEALTH_TEST_DIRECTORY/command-calls.txt"
case "$*" in
  --version) echo 'opencode v2.1.1' ;;
  'service status') printf '%s\n' "$HEALTH_TEST_SERVICE_STATUS"; exit "$HEALTH_TEST_SERVICE_EXIT" ;;
  'mcp list') printf 'github connected\nplaywright connected\n' ;;
  'debug config') echo '.opencode/skills' ;;
  'api get ${route}')
    cat "$HEALTH_TEST_DIRECTORY/inventory.json"
    exit "$HEALTH_TEST_API_EXIT" ;;
  *) exit 64 ;;
esac
`, { mode: 0o700 })
  await writeFile(path.join(bin, "node"), `#!/bin/bash
printf '%s\n' "$*" >> "$HEALTH_TEST_DIRECTORY/test-calls.txt"
exit "$HEALTH_TEST_TESTS_EXIT"
`, { mode: 0o700 })
  const child = spawn("bash", [path.join(root, "scripts/health-check.sh"), ...args], {
    cwd: root,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: `${bin}:/usr/bin:/bin`, HOME: directory, LANG: "C.UTF-8", PYTHONDONTWRITEBYTECODE: "1",
      HEALTH_TEST_DIRECTORY: directory,
      HEALTH_TEST_API_EXIT: String(apiExit),
      HEALTH_TEST_TESTS_EXIT: String(testsExit),
      HEALTH_TEST_SERVICE_STATUS: serviceStatus,
      HEALTH_TEST_SERVICE_EXIT: String(serviceExit),
    },
  })
  const chunks = { stdout: [], stderr: [] }
  const budget = { remaining: 65536 }
  let refused = false
  const stop = () => {
    refused = true
    try { process.kill(-child.pid, "SIGKILL") } catch (error) { if (error.code !== "ESRCH") throw error }
  }
  const timer = setTimeout(stop, 8000)
  for (const [key, stream] of [["stdout", child.stdout], ["stderr", child.stderr]]) {
    pumpBounded(stream, new PassThrough().resume(), block => chunks[key].push(block), stop, 65536, budget)
  }
  const status = await new Promise((resolve, reject) => {
    child.once("error", reject)
    child.once("close", resolve)
  }).finally(() => clearTimeout(timer))
  assert.equal(refused, false, "the controlled health fixture must settle within its process/output bounds")
  const readCalls = file => readFile(path.join(directory, file), "utf8").catch(error => {
    if (error.code === "ENOENT") return ""
    throw error
  })
  return {
    status,
    output: Buffer.concat([...chunks.stdout, ...chunks.stderr]).toString(),
    calls: await readCalls("test-calls.txt"),
    commands: (await readCalls("command-calls.txt")).trim().split("\n"),
  }
}

test("healthy location-scoped plugins pass and both source suites are requested", async () => {
  const result = await runHealth(active())
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /Health check PASSED/)
  assert.match(result.output, /not live handoff acceptance/)
  assert.match(result.calls, /computer-use\/contract\.test\.ts/)
  assert.match(result.calls, /goal-docs\/.*\.test\.ts/)
})

test("a failed companion cannot be hidden by passing unit tests", async () => {
  const inventory = active()
  inventory.data[2].state = { status: "failed", error: "fixture private detail" }
  const result = await runHealth(inventory)
  assert.equal(result.status, 1)
  assert.match(result.output, /inactive plugin/)
  assert.doesNotMatch(result.output, /fixture private detail|Health check PASSED/)
})

test("inventory from another directory is refused", async () => {
  const inventory = active()
  inventory.location.directory = "/some/other/worktree"
  assert.equal((await runHealth(inventory)).status, 1)
})

test("missing and duplicate plugin IDs are refused", async () => {
  const missing = active()
  missing.data.shift()
  assert.equal((await runHealth(missing)).status, 1)
  const duplicate = active()
  duplicate.data.push(duplicate.data[0])
  assert.equal((await runHealth(duplicate)).status, 1)
})

test("malformed or unsuccessful inventory responses fail closed", async () => {
  assert.equal((await runHealth("not JSON")).status, 1)
  assert.equal((await runHealth({ data: {} })).status, 1)
  const result = await runHealth(active(), { apiExit: 1 })
  assert.equal(result.status, 1)
  assert.match(result.output, /cannot read the location-scoped/)
})

test("failed unit suites cannot produce a healthy result", async () => {
  const result = await runHealth(active(), { testsExit: 1 })
  assert.equal(result.status, 1)
  assert.match(result.output, /computer-use plugin tests failed/)
  assert.match(result.output, /goal-docs companion tests failed/)
  assert.doesNotMatch(result.output, /Health check PASSED/)
})

for (const scenario of [
  { name: "documented stopped with exit zero", serviceStatus: "stopped", serviceExit: 0 },
  { name: "failed status command", serviceStatus: "", serviceExit: 1 },
  { name: "empty successful status", serviceStatus: "", serviceExit: 0 },
  { name: "malformed endpoint", serviceStatus: "http:///broken", serviceExit: 0 },
  { name: "extra status output", serviceStatus: "http://127.0.0.1:49374\nunexpected", serviceExit: 0 },
]) {
  for (const args of [[], ["--status-only"]]) {
    test(`unavailable service stops before discovery or tests: ${scenario.name}, ${args[0] ?? "full"}`, async () => {
      const result = await runHealth(active(), { ...scenario, args })
      assert.equal(result.status, 1, result.output)
      assert.deepEqual(result.commands, ["--version", "service status"])
      assert.equal(result.calls, "")
      assert.doesNotMatch(result.output, /Health check PASSED|Status diagnostics PASSED/)
      assert.match(result.output, /stopped before API discovery/)
    })
  }
}

test("documented endpoint permits status-only discovery without requesting either source suite", async () => {
  const result = await runHealth(active(), { args: ["--status-only"] })
  assert.equal(result.status, 0, result.output)
  assert.equal(result.commands.filter(command => command.startsWith("api get ")).length, 1)
  assert.ok(result.commands.includes("mcp list"))
  assert.ok(result.commands.includes("debug config"))
  assert.equal(result.calls, "")
  assert.match(result.output, /Status diagnostics PASSED/)
  assert.doesNotMatch(result.output, /Health check PASSED/)
})
