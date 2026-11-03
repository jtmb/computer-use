/**
 * Live browser crash-recovery measurement.
 *
 * Kills the worker process behind a live tab, then measures how long it takes the next
 * tool call to work again. This is the browser-side counterpart to the desktop
 * frozen-daemon test, and it is a measurement, not an assumption: the number reported is
 * observed on this machine.
 *
 *   node --experimental-strip-types tools/computer-use-browser/crash-recovery-acceptance.mjs
 */

import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync, rmSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, "../..")
const PLUGIN = join(REPO, ".opencode/plugins/computer-use/browser-tools.ts")
const SESSION = `ses_crashrecovery_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const PAGE = "https://example.com/"

if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error("this acceptance needs a graphical session")
  process.exit(2)
}

const dataDirectory =
  process.env.OPENCODE_DATA_DIR ?? join(homedir(), ".opencode-v2-pilot", "data", "opencode")
const profileRoot = join(dataDirectory, "browser-profiles")

const { registerBrowserTools } = await import(PLUGIN)
const { withSerializedTools } = await import(join(REPO, ".opencode/plugins/computer-use/serialization.ts"))

const tools = new Map()
const editor = {
  namespace() {},
  add(tool) { tools.set(tool.name, tool) },
  list() { return [...tools.values()] },
  update() {},
}
registerBrowserTools(
  withSerializedTools(editor, "web"),
  { assertPermission: async () => true, dataDirectory },
)

const context = {
  sessionID: SESSION,
  agent: "build",
  messageID: `msg_${SESSION}`,
  id: `call_${SESSION}`,
}
const call = async (name, args = {}) => {
  const tool = tools.get(name)
  if (!tool) throw new Error(`the plugin did not register a ${name} tool`)
  return tool.execute(args, context)
}
const textOf = (result) =>
  (result.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n")

let failures = 0
const check = (name, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${detail}`}`)
  if (!ok) failures += 1
}

/** Worker child processes whose command line mentions this session's id. */
function workerPids() {
  const pids = []
  let entries = []
  try { entries = readdirSync("/proc") } catch { return pids }
  for (const name of entries) {
    if (!/^\d+$/.test(name)) continue
    try {
      const cmdline = readFileSync(`/proc/${name}/cmdline`, "utf8").replace(/\0/g, " ")
      if (cmdline.includes("worker-child") && cmdline.includes(SESSION)) pids.push(Number(name))
    } catch { /* exited */ }
  }
  return pids
}

function chromeForSession() {
  try {
    const output = execFileSync("ps", ["-eo", "args"], { encoding: "utf8" })
    return output.split("\n").filter((line) => line.includes(SESSION) && /chrome/i.test(line)).length
  } catch {
    return -1
  }
}

const cleanup = () => {
  const found = []
  const walk = (directory, depth) => {
    if (depth > 6) return
    let entries = []
    try { entries = readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = join(directory, entry.name)
      if (entry.name === SESSION) found.push(full)
      else walk(full, depth + 1)
    }
  }
  walk(profileRoot, 0)
  for (const path of found) rmSync(path, { recursive: true, force: true })
}

try {
  const opened = JSON.parse(textOf(await call("open", { url: PAGE })).trim())
  check("a tab is open", typeof opened.tabId === "string", opened.title ?? "")
  const pids = workerPids()
  check("the worker process was found for this session", pids.length === 1, pids.join(","))

  if (pids.length === 1) {
    process.kill(pids[0], "SIGKILL")
    const killedAt = Date.now()
    // The documented behaviour is fail-closed: the dead worker is reported, not silently
    // replayed. Recovery is an explicit reopen, which is what this measures.
    const crashedText = textOf(await call("snapshot", { tabId: opened.tabId }))
    check("a killed worker is reported as WORKER_CRASHED, not hidden",
      /WORKER_CRASHED/.test(crashedText) && !/"generation"/.test(crashedText),
      crashedText.slice(0, 120))
    const reopened = JSON.parse(textOf(await call("open", { url: PAGE })).trim())
    check("an explicit reopen starts a new worker", typeof reopened.tabId === "string",
      reopened.title ?? "")
    const snap = textOf(await call("snapshot", { tabId: reopened.tabId }))
    check("the surface works again after the reopen", /"generation"/.test(snap), snap.slice(0, 80))
    console.log(`MEASURED browser recovery (crash reported, then explicit reopen): ${Date.now() - killedAt} ms`)
  }

  await call("close").catch(() => {})
  await new Promise((done) => setTimeout(done, 1500))
  const leftoverWorkers = workerPids().length
  const leftoverChrome = chromeForSession()
  check("no worker process is left behind", leftoverWorkers === 0, `${leftoverWorkers} worker(s)`)
  check("no Chrome process is left behind for this session", leftoverChrome === 0, `${leftoverChrome} chrome process(es)`)
} finally {
  cleanup()
  console.log(failures === 0 ? "SUMMARY: failures=0" : `SUMMARY: failures=${failures}`)
  process.exitCode = failures === 0 ? 0 : 1
}
