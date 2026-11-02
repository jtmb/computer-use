/**
 * Tool-level desktop acceptance against a live bridge.
 *
 * Drives the production tool definitions (registration + serialization + the shared
 * credential guard) instead of a fake executor, so this is the only check that proves
 * `desktop.capture` returns a real PNG file part all the way from the Shell bridge.
 *
 * Run it inside a private GNOME Shell session, e.g. from
 * tools/gnome-window-control/fresh-shell-acceptance.sh, which supplies the bus and the
 * window:
 *
 *   node --experimental-strip-types .opencode/plugins/computer-use/live-desktop-acceptance.mjs \
 *     --window-id <uuid:n> --app-id <desktop-id> [--allow-effects --launch-desktop-id <desktop-id>]
 *
 * Exit 0 when every selected check passes, 1 otherwise, 2 on usage error. Default mode
 * validates one exact target and captures it without input, launch, or release calls.
 * Legacy refusal/launch/release checks require --allow-effects and an explicit launch ID.
 */

import { Buffer } from "node:buffer"

import { registerCaptureTools } from "./capture-tool.ts"
import { registerInputTools } from "./input-tool.ts"
import { registerWindowTools } from "./windows.ts"
import { registerDesktopTools } from "./desktop.ts"
import { executeBridge, ownedBridgeDaemonControl, stopBridgeDaemon } from "./bridge.ts"
import { applyCodemodeDefault } from "./codemode.ts"
import { withSerializedTools } from "./serialization.ts"
import { createCredentialSafety } from "./credential-safety.ts"
import {
  createAuthGuard,
  createOwnerOperationQueue,
} from "../../../tools/computer-use-runtime/src/index.ts"
import {
  captureWithStableTarget,
  checkSanitizedEnvironmentNames,
  parseAcceptanceArgs,
  parseInventoryText,
  runExplicitEffects,
} from "./acceptance-safety.mjs"

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let failures = 0
function report(ok, message) {
  console.log(`${ok ? "PASS" : "FAIL"} ${message}`)
  if (!ok) failures += 1
}

let acceptanceOptions
try {
  acceptanceOptions = parseAcceptanceArgs(process.argv.slice(2), { requireLaunchForEffects: true })
} catch (error) {
  console.error(
    "usage: live-desktop-acceptance.mjs --window-id <uuid:n> --app-id <desktop-id> " +
    "[--allow-effects --launch-desktop-id <desktop-id>]",
  )
  console.error(error?.message ?? error)
  process.exit(2)
}
const windowId = acceptanceOptions.windowId

/**
 * Minimal editor with the same surface the real one offers: add/namespace for
 * registration and list/update for the exposure transform (which mutates options).
 */
const byId = new Map()
const byName = new Map()
const editor = {
  namespace() {},
  add(tool) {
    const id = `${tool.options?.namespace ?? "desktop"}_${tool.name}`
    byId.set(id, tool)
    byName.set(tool.name, tool)
  },
  list() {
    return [...byId.entries()].map(([id, tool]) => ({ id, options: tool.options }))
  },
  update(id, mutate) {
    const tool = byId.get(id)
    if (!tool) return
    const entry = { options: tool.options }
    mutate(entry)
    tool.options = entry.options
  },
}
const tools = byName

const permissions = []
const events = []
const assertPermission = async (request) => {
  permissions.push(request)
  events.push("permission")
  events.push(`permission:${request.resources?.[0] ?? ""}`)
}

const registeredIds = new Set()
const desktopEditor = withSerializedTools(editor, "desktop", {
  queue: createOwnerOperationQueue(),
  authGuard: createAuthGuard(),
  allowDuringSignIn: new Set(["release"]),
  registeredIds,
})
registerDesktopTools(desktopEditor, { assertPermission })
registerWindowTools(desktopEditor, { assertPermission })
registerCaptureTools(desktopEditor, {
  assertPermission,
  credentialSafety: createCredentialSafety(),
  executeBridge(command, request, signal) {
    events.push(`bridge:${command}`)
    return executeBridge(command, request, signal)
  },
})
registerInputTools(desktopEditor, { assertPermission })

// The plugin applies the exposure policy in a second transform; do the same, or the
// harness would report the raw declarations instead of what the model actually sees.
applyCodemodeDefault(editor, { directTools: false, only: registeredIds })

const cancellation = new AbortController()
const context = {
  sessionID: "ses_live_acceptance",
  agent: "acceptance",
  messageID: "msg_live_acceptance",
  id: "call_live_acceptance",
  signal: cancellation.signal,
}
const cancelHandlers = new Map([
  ["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129],
].map(([signal, code]) => [signal, () => {
  process.exitCode = code
  cancellation.abort()
  stopBridgeDaemon()
}]))

const timings = {}
const call = async (name, input = {}) => {
  const tool = tools.get(name)
  if (!tool) throw new Error(`tool ${name} is not registered`)
  events.push(`dispatch:${name}`)
  const started = performance.now()
  const result = await tool.execute(input, context)
  timings[name] = Math.round(performance.now() - started)
  return result
}
const textOf = (result) =>
  (result.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n")

async function main() {
  const expected = ["act", "apps", "capture", "find", "input", "launch", "layout", "release", "tree", "window_act", "windows"]
  const names = [...tools.keys()].sort()
  report(JSON.stringify(names) === JSON.stringify(expected),
    `registered exactly the expected ${expected.length} desktop tools: ${names.join(",")}`)
  const exposed = [...tools.values()].filter((tool) => tool.options?.codemode === true)
  report(exposed.length === tools.size, `${exposed.length}/${tools.size} tools default to Code Mode`)
  report([...tools.values()].every((tool) => tool.options?.namespace === "desktop"),
    "every tool declares the desktop namespace")

  await call("windows")   // warm the daemon so the reported latency is a round trip
  delete timings.windows
  const checkedCapture = await captureWithStableTarget({
    options: acceptanceOptions,
    inventory: async () => parseInventoryText(textOf(await call("windows"))),
    capture: (target) => call("capture", { windowId: target.id }),
  })
  const captured = checkedCapture.result
  report(true, `desktop.windows uniquely matches ${windowId} to ${acceptanceOptions.appId}`)
  report(true, "desktop.capture left window IDs, app IDs, PIDs, geometry, and focus unchanged")
  report(captured.output === undefined, "desktop.capture declares no output schema (content-only)")
  const file = (captured.content ?? []).find((part) => part.type === "file")
  const captureText = textOf(captured)
  if (!file) {
    report(false, `desktop.capture returned no file part: ${captureText.slice(0, 200)}`)
    return
  }
  const prefix = "data:image/png;base64,"
  report(file.mime === "image/png" && typeof file.uri === "string" && file.uri.startsWith(prefix),
    "desktop.capture returns an inline PNG file part")
  const raw = Buffer.from(file.uri.slice(prefix.length), "base64")
  report(raw.subarray(0, 8).equals(PNG_SIGNATURE), `the file part decodes to a PNG (${raw.length} bytes)`)

  const metadataStart = captureText.indexOf("{")
  const metadata = metadataStart >= 0 ? JSON.parse(captureText.slice(metadataStart)) : null
  if (!metadata) {
    report(false, `desktop.capture returned no metadata text: ${captureText.slice(0, 200)}`)
    return
  }
  const width = raw.readUInt32BE(16)
  const height = raw.readUInt32BE(20)
  report(metadata.windowId === windowId && typeof metadata.observationId === "string",
    "the metadata names the window and an observation id")
  report(metadata.width === width && metadata.height === height && width > 0 && height > 0,
    `the metadata dimensions match the PNG (${width}x${height})`)
  report(metadata.path === undefined, "no filesystem path is reported")
  const permissionIndex = events.indexOf("permission")
  const captureIndex = events.indexOf("bridge:capture")
  const exactCapturePermissionIndex = events.indexOf(`permission:desktop/capture/${encodeURIComponent(windowId)}`)
  const permissionText = JSON.stringify(permissions)
  report(permissionText.includes("desktop/capture") && permissionIndex >= 0 &&
          captureIndex >= 0 && permissionIndex < captureIndex,
    "capture requested a desktop/capture permission before dispatching to the bridge")
  report(exactCapturePermissionIndex >= 0 && exactCapturePermissionIndex < captureIndex,
    "the exact target capture permission was granted before bridge dispatch")

  if (failures > 0) return

  // This flag selects acceptance checks; the registered tools still invoke their
  // permission dependency before dispatch (recorded here rather than native policy).
  await runExplicitEffects(acceptanceOptions, async ({ launchDesktopId }) => {
    const released = await call("release")
    report(textOf(released).toLowerCase().includes("released"),
      "desktop.release succeeds against the bridge")

    const refusedClick = await call("input", {
      observationId: "00000000-0000-4000-8000-000000000000",
      action: "click",
      x: 40,
      y: 40,
    })
    const clickText = textOf(refusedClick)
    report(!/observationId must be a non-empty string/.test(clickText),
      "desktop.input accepted a well-formed observation id")
    report(/refus|fail|stale|invalid/i.test(clickText) && !/\bat .*\.ts:\d+/.test(clickText),
      `an unknown observation is refused in bounded text: ${clickText.slice(0, 120)}`)

    const launched = await call("launch", { desktopId: launchDesktopId })
    const launchText = textOf(launched)
    const launchOk = /appeared/i.test(launchText) && !/Desktop launch failed/i.test(launchText)
    report(launchOk && !/\bat .*\.ts:\d+/.test(launchText),
      `desktop.launch selected ${launchDesktopId}: ${launchText.slice(0, 120)}`)
  })
  if (!acceptanceOptions.allowEffects)
    report(true, "release, input-refusal, and launch checks were not dispatched without --allow-effects")

  // A caller with unusable attribution must be refused before anything dispatches.
  let attributionRefused = false
  try {
    const bad = await tools.get("capture").execute({ windowId }, {
      sessionID: "",
      agent: "acceptance",
      messageID: "msg_bad",
      id: "call_bad",
    })
    const badText = (bad.content ?? []).filter((part) => part.type === "text").map((part) => part.text).join("\n")
    attributionRefused = !(bad.content ?? []).some((part) => part.type === "file") && /context|attribution|invalid/i.test(badText)
  } catch (error) {
    attributionRefused = /context|attribution/i.test(String(error?.message ?? error))
  }
  report(attributionRefused, "a caller with empty attribution is refused before dispatch")

  const daemonControl = ownedBridgeDaemonControl()
  const environmentCheck = checkSanitizedEnvironmentNames(daemonControl?.environmentKeys)
  report(Boolean(daemonControl?.isCurrent()) && environmentCheck.ok,
    `the spawn-owned bridge client has sanitized environment metadata${environmentCheck.unexpected.length
      ? ` (unexpected: ${environmentCheck.unexpected.join(",")})` : ""}`)

  console.log(`LATENCY ms: ${Object.entries(timings).map(([name, ms]) => `${name}=${ms}`).join(" ")}`)
}

// Every path — including the early returns above — ends here, so a failed check can never
// leave the process exiting 0 and the persistent daemon is always stopped.
try {
  for (const [signal, cancel] of cancelHandlers) process.once(signal, cancel)
  await main()
} catch (error) {
  console.error("FAIL harness crashed:", error?.message ?? error)
  failures += 1
} finally {
  for (const [signal, cancel] of cancelHandlers) process.removeListener(signal, cancel)
  console.log(failures === 0 ? "SUMMARY: failures=0" : `SUMMARY: failures=${failures}`)
  stopBridgeDaemon()
  if (process.exitCode === undefined || process.exitCode === 0)
    process.exitCode = failures === 0 ? 0 : 1
}
