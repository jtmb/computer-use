/**
 * Live profile-lock acceptance: a browser profile held by a living process must be
 * refused, and a lock left by a dead process must be reclaimed instead of blocking the
 * session forever.
 *
 *   node --experimental-strip-types tools/computer-use-browser/profile-lock-acceptance.mjs
 *
 * It drives the production `web` tools against real Chrome, writes the same
 * `SingletonLock` shape Chromium uses, and removes the profile it created.
 */

import { existsSync, readdirSync, rmSync, symlinkSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { hostname, homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, "../..")
const PLUGIN = join(REPO, ".opencode/plugins/computer-use/browser-tools.ts")
const SESSION = `ses_profilelock_${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const PAGE = "https://example.com/"

if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error("this acceptance needs a graphical session (DISPLAY or WAYLAND_DISPLAY)")
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
  { assertPermission: async () => true, dataDirectory, authGuard: undefined },
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

function profilePath() {
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
  return found[0]
}

function isAlive(pid) {
  try { process.kill(pid, 0); return true } catch { return false }
}

const cleanup = () => {
  const path = profilePath()
  if (path && existsSync(path)) rmSync(path, { recursive: true, force: true })
}

try {
  // 1. A first open creates the profile and closes its worker.
  const firstText = textOf(await call("open", { url: PAGE })).trim()
  let firstTab = null
  try { firstTab = JSON.parse(firstText).tabId } catch { firstTab = null }
  check("a first open succeeds", typeof firstTab === "string", firstText.slice(0, 100).replace(/\s+/g, " "))
  await call("close").catch(() => {})

  const profile = profilePath()
  check("the session profile exists on disk", typeof profile === "string", profile ?? "missing")
  if (!profile) throw new Error("no profile to lock")

  // 2. A lock held by a live process must refuse the session.
  const liveTarget = `${hostname()}-${process.pid}`
  symlinkSync(liveTarget, join(profile, "SingletonLock"))
  const lockedText = textOf(await call("open", { url: PAGE })).trim()
  check("a profile locked by a live process is refused", /PROFILE_LOCKED/.test(lockedText),
    lockedText.slice(0, 140).replace(/\s+/g, " "))

  // 3. A lock left by a dead process must be reclaimed. `spawnSync` reaps the child, so its
  // pid is guaranteed dead rather than assumed.
  rmSync(join(profile, "SingletonLock"), { force: true })
  const deadPid = spawnSync("true").pid
  check("the probe pid is really gone", typeof deadPid === "number" && !isAlive(deadPid), String(deadPid))
  symlinkSync(`${hostname()}-${deadPid}`, join(profile, "SingletonLock"))
  const staleText = textOf(await call("open", { url: PAGE })).trim()
  let staleTab = null
  try { staleTab = JSON.parse(staleText).tabId } catch { staleTab = null }
  check("a stale lock from a dead process is reclaimed", typeof staleTab === "string",
    staleText.slice(0, 120).replace(/\s+/g, " "))
  check("the stale lock file is gone after reclaiming", !existsSync(join(profile, "SingletonLock")))

  await call("close").catch(() => {})
} finally {
  cleanup()
  console.log(failures === 0 ? "SUMMARY: failures=0" : `SUMMARY: failures=${failures}`)
  process.exitCode = failures === 0 ? 0 : 1
}
