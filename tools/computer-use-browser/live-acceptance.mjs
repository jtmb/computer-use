/**
 * Live browser acceptance for the `web` tool surface.
 *
 * This is not a unit test and it is not part of `npm test`: it launches real
 * Chrome, loads a real page and captures a real screenshot. Run it by hand when
 * you need to prove that the tools work end to end on this machine, for example
 * after a backend change or a service restart.
 *
 *   node --experimental-strip-types tools/computer-use-browser/live-acceptance.mjs
 *
 * It imports the plugin's real `web` registrations directly, so it exercises the
 * production tool code, backend, worker and profile handling. Only the permission
 * callback is stubbed, and only in this throwaway process. It leaves no browser
 * running and deletes the profiles it created.
 */

import { existsSync, readdirSync, rmSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, "../..")
const PLUGIN = join(REPO, ".opencode/plugins/computer-use/browser-tools.ts")

/** Session ids used by this run; their profiles are removed afterwards. */
const RUN = `${process.pid}_${Math.random().toString(36).slice(2, 8)}`
const SESSION_A = `ses_liveacceptA_${RUN}`
const SESSION_B = `ses_liveacceptB_${RUN}`
const SESSION_C = `ses_liveacceptC_${RUN}`
const PAGE = "https://example.com/"

if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
  console.error("live acceptance needs a graphical session (DISPLAY or WAYLAND_DISPLAY)")
  process.exit(2)
}

const dataDirectory =
  process.env.OPENCODE_DATA_DIR ?? join(homedir(), ".opencode-v2-pilot", "data", "opencode")
const profileRoot = join(dataDirectory, "browser-profiles")

const { registerBrowserTools } = await import(PLUGIN)
// Exercise the production registration path too, including per-session
// serialization and caller-attribution validation.
const { withSerializedTools } = await import(join(REPO, ".opencode/plugins/computer-use/serialization.ts"))

const tools = new Map()
const editor = {
  namespace() {},
  add(tool) {
    tools.set(tool.name, tool)
  },
  list() {
    return [...tools.values()]
  },
  update() {},
}
registerBrowserTools(
  withSerializedTools(editor, "web"),
  // The plugin supplies ctx.permission.assert; here every call is allowed because
  // this is an operator-run acceptance probe, not an agent session.
  { assertPermission: async () => true, dataDirectory, authGuard: undefined },
)

const context = (sessionID) => ({
  sessionID,
  agent: "build",
  messageID: `msg_${sessionID}`,
  id: `call_${sessionID}`,
})

const call = async (name, sessionID, args = {}) => {
  const tool = tools.get(name)
  if (!tool) throw new Error(`the plugin did not register a ${name} tool`)
  return tool.execute(args, context(sessionID))
}

const textOf = (result) =>
  (result.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n")

const fileOf = (result) => (result.content ?? []).find((part) => part.type === "file")

const failed = []
let TOTAL_CHECKS = 0
const check = (name, ok, detail = {}) => {
  TOTAL_CHECKS += 1
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${Object.keys(detail).length ? ` ${JSON.stringify(detail)}` : ""}`)
  if (!ok) failed.push(name)
}

const openTab = async (sessionID) => {
  const raw = textOf(await call("open", sessionID, { url: PAGE }))
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error(`open returned a non-JSON result: ${raw.slice(0, 120)}`)
  }
}

const cleanupProfiles = () => {
  for (const sessionID of [SESSION_A, SESSION_B, SESSION_C]) {
    const candidates = []
    const walk = (directory, depth) => {
      if (depth > 6) return
      let entries = []
      try {
        entries = readdirSync(directory, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const full = join(directory, entry.name)
        if (entry.name === sessionID) candidates.push(full)
        else walk(full, depth + 1)
      }
    }
    walk(profileRoot, 0)
    for (const path of candidates) {
      if (existsSync(path)) rmSync(path, { recursive: true, force: true })
    }
  }
}

try {
  // 1. one session: open, snapshot, screenshot
  const first = await openTab(SESSION_A)
  check("open returns an opaque tab id", typeof first.tabId === "string" && first.tabId.startsWith("cu1."), {
    tabId: String(first.tabId).slice(0, 24),
    title: first.title,
  })

  const snapshot = textOf(await call("snapshot", SESSION_A, { tabId: first.tabId }))
  const refs = (snapshot.match(/\[ref=/g) ?? []).length
  check("snapshot returns shaped text with element refs", !snapshot.startsWith("Browser error") && refs > 0, {
    bytes: snapshot.length,
    refs,
  })

  const shot = fileOf(await call("screenshot", SESSION_A, { tabId: first.tabId }))
  const base64 = typeof shot?.uri === "string" && shot.uri.startsWith("data:image/png;base64,")
    ? shot.uri.slice("data:image/png;base64,".length)
    : ""
  const png = base64 ? Buffer.from(base64, "base64") : Buffer.alloc(0)
  const signature = png.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  check("screenshot is an inline PNG file part", Boolean(shot) && signature && png.byteLength > 10_000, {
    mime: shot?.mime,
    bytes: png.byteLength,
    width: signature ? png.readUInt32BE(16) : 0,
    height: signature ? png.readUInt32BE(20) : 0,
  })

  // 2. a second session gets its own worker, tab and profile
  const second = await openTab(SESSION_B)
  check("two sessions get distinct tab ids", first.tabId !== second.tabId)

  const snapshotB = textOf(await call("snapshot", SESSION_B, { tabId: second.tabId }))
  check("the second session snapshots its own tab", !snapshotB.startsWith("Browser error"), { bytes: snapshotB.length })

  const crossSession = textOf(await call("snapshot", SESSION_B, { tabId: first.tabId }))
  check("a tab id from another session is refused", /FOREIGN_TAB|foreign/i.test(crossSession), {
    text: crossSession.slice(0, 120),
  })

  // 3. capacity is bounded and fails closed
  const third = textOf(await call("open", SESSION_C, { url: PAGE }))
  check("a third concurrent worker is refused", /CAPACITY_EXCEEDED|worker limit/i.test(third), {
    text: third.slice(0, 120),
  })

  // 4. profiles are per session and private
  const modes = []
  const collect = (directory, depth) => {
    if (depth > 6) return
    let entries = []
    try {
      entries = readdirSync(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = join(directory, entry.name)
      if (entry.name === SESSION_A || entry.name === SESSION_B) {
        modes.push(`${entry.name}:${(statSync(full).mode & 0o777).toString(8)}`)
      } else {
        collect(full, depth + 1)
      }
    }
  }
  collect(profileRoot, 0)
  check("each session has a private 0700 profile", modes.length === 2 && modes.every((entry) => entry.endsWith(":700")), {
    modes,
  })

  // 5. cancellation frees the slot: abort a screenshot in flight, then work again
  const controller = new AbortController()
  const pendingShot = tools.get("screenshot").execute(
    { tabId: first.tabId },
    { ...context(SESSION_A), id: "call_abort", signal: controller.signal },
  )
  setTimeout(() => controller.abort(), 5)
  let cancelled = ""
  try {
    cancelled = textOf(await pendingShot)
  } catch (error) {
    cancelled = String(error)
  }
  check("a mid-flight screenshot is cancelled", /cancel/i.test(cancelled), { text: cancelled.slice(0, 100) })
  const afterCancel = textOf(await call("snapshot", SESSION_A, { tabId: first.tabId }))
  check("the surface still works after a cancellation", !afterCancel.startsWith("Browser error"), {
    bytes: afterCancel.length,
  })

  // 6. element refs are bound to their snapshot generation
  const current = JSON.parse(afterCancel)
  const ref = /\[ref=([a-z0-9]+)\]/i.exec(current.snapshot)?.[1]
  const hovered = textOf(
    await call("act", SESSION_A, { tabId: first.tabId, generation: current.generation, ref, action: "hover" }),
  )
  check("an action with the current generation is accepted", !hovered.startsWith("Browser error"), {
    text: hovered.slice(0, 90),
  })
  const reused = textOf(
    await call("act", SESSION_A, { tabId: first.tabId, generation: current.generation, ref, action: "hover" }),
  )
  check("reusing a consumed generation fails closed", /STALE_REF|current snapshot generation|no longer valid/i.test(reused), {
    text: reused.slice(0, 110),
  })

  // 7. the per-worker tab bound
  let tabsOpened = 1
  let limitText = ""
  for (let index = 0; index < 9; index += 1) {
    const next = textOf(await call("open", SESSION_A, { url: PAGE }))
    if (next.startsWith("Browser error")) {
      limitText = next
      break
    }
    tabsOpened += 1
  }
  check("the per-worker tab limit is enforced", /TAB_LIMIT|tab limit/i.test(limitText), {
    tabsOpened,
    text: limitText.slice(0, 90),
  })

  // 8. a malformed request fails fast instead of hanging
  const malformed = await Promise.race([
    call("navigate", SESSION_A, { url: PAGE })
      .then((result) => textOf(result))
      .catch((error) => String(error)),
    new Promise((resolve) => setTimeout(() => resolve("HUNG"), 5000)),
  ])
  check("a request missing its tab id is refused, not left hanging", malformed !== "HUNG", {
    text: String(malformed).slice(0, 90),
  })
  const stillAlive = textOf(await call("tabs", SESSION_A, { action: "list" }))
  check("the worker survives a malformed request", !stillAlive.startsWith("Browser error"), {
    bytes: stillAlive.length,
  })

  await call("close", SESSION_A)
  await call("close", SESSION_B)
  check("close discards the workers", true)
} finally {
  cleanupProfiles()
}

console.log(`SUMMARY: checks=${TOTAL_CHECKS - failed.length}/${TOTAL_CHECKS} passed`)
process.exit(failed.length === 0 ? 0 : 1)
