import assert from "node:assert/strict"
import { test } from "node:test"

import { createOwnerOperationQueue } from "../../../tools/computer-use-runtime/src/index.ts"
import { registerCaptureTools } from "./capture-tool.ts"
import { registerInputTools } from "./input-tool.ts"
import { withSerializedTools } from "./serialization.ts"
import {
  assertInventoryUnchanged,
  captureWithStableTarget,
  checkSanitizedEnvironmentNames,
  parseAcceptanceArgs,
  parseInventoryText,
  runExplicitEffects,
  selectUniqueRunTarget,
  selectUniqueTarget,
  withOwnedDaemonSuspension,
} from "./acceptance-safety.mjs"

const WINDOW_ID = "12345678-1234-1234-1234-123456789abc:7"
const APP_ID = "org.gnome.TextEditor.desktop"

function options(extra: string[] = []) {
  return parseAcceptanceArgs(["--window-id", WINDOW_ID, "--app-id", APP_ID, ...extra])
}

function inventory(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    focusedWindowId: WINDOW_ID,
    windows: [{
      id: WINDOW_ID,
      appId: APP_ID,
      pid: 4312,
      rect: { x: 10, y: 20, width: 800, height: 600 },
    }],
    ...overrides,
  }
}

test("acceptance CLI requires exact current IDs and explicit effect selection", () => {
  assert.deepEqual(options(), {
    windowId: WINDOW_ID,
    appId: APP_ID,
    allowEffects: false,
  })
  assert.throws(() => parseAcceptanceArgs(["--window-id", WINDOW_ID]), /--app-id/)
  assert.throws(() => parseAcceptanceArgs(["--window-id", "*", "--app-id", APP_ID]), /exact current identifier/)
  assert.throws(() => parseAcceptanceArgs(["--window-id", WINDOW_ID, "--app-id", "org.example.*"]), /exact current identifier/)
  assert.throws(() => parseAcceptanceArgs(["--window-id", WINDOW_ID, "--app-id", APP_ID, "--window-id", WINDOW_ID]), /only once/)
  assert.throws(() => options(["--launch-desktop-id", "org.gnome.Calculator.desktop"]), /requires --allow-effects/)
  assert.throws(() => parseAcceptanceArgs([
    "--window-id", WINDOW_ID,
    "--app-id", APP_ID,
    "--allow-effects",
  ], { requireLaunchForEffects: true }), /explicit --launch-desktop-id/)
  assert.deepEqual(parseAcceptanceArgs([
    "--window-id", WINDOW_ID,
    "--app-id", APP_ID,
    "--allow-effects",
    "--launch-desktop-id", "org.gnome.Calculator.desktop",
  ], { requireLaunchForEffects: true }), {
    windowId: WINDOW_ID,
    appId: APP_ID,
    allowEffects: true,
    launchDesktopId: "org.gnome.Calculator.desktop",
  })
})

test("inventory text parser and exact unique target selection reject stale, duplicate, and mismatched targets", () => {
  assert.deepEqual(parseInventoryText(`bridge reply: ${JSON.stringify(inventory())}`), inventory())
  assert.deepEqual(selectUniqueTarget(inventory(), options()), {
    id: WINDOW_ID,
    appId: APP_ID,
    pid: 4312,
    rect: { x: 10, y: 20, width: 800, height: 600 },
  })
  assert.throws(() => selectUniqueTarget(inventory({ windows: [] }), options()), /absent/)
  assert.throws(() => selectUniqueTarget(inventory({ windows: [inventory().windows[0], inventory().windows[0]] }), options()), /duplicate ID/)
  assert.throws(() => selectUniqueTarget(inventory({ windows: [{ ...inventory().windows[0], appId: "org.other.App.desktop" }] }), options()), /does not match/)
  assert.throws(() => selectUniqueTarget(inventory({ blockedReason: "shell-modal-active" }), options()), /locked or blocked/)
  assert.throws(() => parseInventoryText("{not-json}"), /invalid inventory JSON/)
})

test("fresh-shell target selection returns only one current run's exact window and app IDs", () => {
  const runTag = "ocwc-fresh-shell.A1B2C3"
  const current = inventory({ windows: [
    { ...inventory().windows[0], id: WINDOW_ID, appId: APP_ID, title: `${runTag} target1.txt` },
    { ...inventory().windows[0], id: "abcdefab-cdef-abcd-efab-cdefabcdefab:8", title: "unrelated.txt" },
  ] })
  assert.deepEqual(selectUniqueRunTarget(current, runTag), { windowId: WINDOW_ID, appId: APP_ID })
  assert.throws(() => selectUniqueRunTarget(current, "*"), /exact non-empty value/)
  assert.throws(() => selectUniqueRunTarget(inventory({ windows: [] }), runTag), /exactly one target match/)
  assert.throws(() => selectUniqueRunTarget(inventory({ windows: [
    { ...current.windows[0], id: WINDOW_ID, title: `${runTag} target1.txt` },
    { ...current.windows[0], id: "abcdefab-cdef-abcd-efab-cdefabcdefab:8", title: `${runTag} target1.txt` },
  ] }), runTag), /exactly one target match/)
})

test("capture validates fresh target first and refuses changed IDs, app, PID, geometry, or focus", async () => {
  let captures = 0
  const stable = await captureWithStableTarget({
    options: options(),
    inventory: async () => inventory(),
    capture: async (target: any) => {
      captures += 1
      assert.equal(target.id, WINDOW_ID)
      return "png-result"
    },
  })
  assert.equal(stable.result, "png-result")
  assert.equal(captures, 1)

  let invalidTargetCapture = 0
  await assert.rejects(captureWithStableTarget({
    options: options(),
    inventory: async () => inventory({ windows: [{ ...inventory().windows[0], appId: "org.other.App.desktop" }] }),
    capture: async () => { invalidTargetCapture += 1 },
  }), /does not match/)
  assert.equal(invalidTargetCapture, 0, "mismatched app is rejected before capture dispatch")

  for (const moved of [
    inventory({ windows: [{ ...inventory().windows[0], rect: { x: 11, y: 20, width: 800, height: 600 } }] }),
    inventory({ windows: [{ ...inventory().windows[0], pid: 4313 }] }),
    inventory({ focusedWindowId: "different-window" }),
    inventory({ windows: [{ ...inventory().windows[0], appId: "org.other.App.desktop" }] }),
    inventory({ windows: [{ ...inventory().windows[0], id: "12345678-1234-1234-1234-123456789abc:8" }] }),
  ]) {
    let reads = 0
    await assert.rejects(captureWithStableTarget({
      options: options(),
      inventory: async () => (++reads === 1 ? inventory() : moved),
      capture: async () => "captured",
    }), /inventory changed/)
  }
  assert.throws(() => assertInventoryUnchanged(inventory(), inventory({ focusedWindowId: null })), /inventory changed/)
})

test("default effect gate dispatches nothing; opt-in carries the exact launch desktop ID", async () => {
  let dispatched = 0
  const defaultResult = await runExplicitEffects(options(), async () => { dispatched += 1 })
  assert.equal(defaultResult, undefined)
  assert.equal(dispatched, 0)
  const optedIn = options(["--allow-effects", "--launch-desktop-id", "org.gnome.Calculator.desktop"])
  const result = await runExplicitEffects(optedIn, async (selection: any) => {
    dispatched += 1
    return selection.launchDesktopId
  })
  assert.equal(result, "org.gnome.Calculator.desktop")
  assert.equal(dispatched, 1)
})

test("opted-in effect block runs release, refusal, and selected launch through production tools", async () => {
  const tools = new Map<string, any>()
  const editor = { namespace() {}, add(tool: any) { tools.set(tool.name, tool) } }
  const serializedEditor = withSerializedTools(editor, "desktop", { queue: createOwnerOperationQueue() })
  const bridgeCalls: Array<{ command: string; request?: Record<string, unknown> }> = []
  const permissions: string[] = []
  registerInputTools(serializedEditor, {
    assertPermission: async (request) => { permissions.push(request.action) },
    executeBridge: async (command, request) => {
      bridgeCalls.push({ command, request })
      if (command === "input")
        return JSON.stringify({ ok: false, available: true, error: "REFUSED", detail: "unknown observation" })
      if (command === "launch")
        return JSON.stringify({ ok: true, available: true, desktopId: request?.desktopId, launchToken: "launch-token", beforeWindowIds: [] })
      if (command === "confirm")
        return JSON.stringify({ ok: true, available: true, appeared: true, windowIds: ["new-window"] })
      return JSON.stringify({ ok: true, available: true })
    },
  })
  const context = {
    sessionID: "ses_effect_test",
    agent: "acceptance",
    messageID: "msg_effect_test",
    id: "call_effect_test",
  }
  const selected = options(["--allow-effects", "--launch-desktop-id", "org.gnome.Calculator.desktop"])
  await runExplicitEffects(selected, async ({ launchDesktopId }: { launchDesktopId?: any }) => {
    await tools.get("release").execute({}, context)
    const refused = await tools.get("input").execute({
      observationId: "00000000-0000-4000-8000-000000000000",
      action: "click",
      x: 40,
      y: 40,
    }, context)
    assert.match(refused.content[0].text, /unknown observation/i)
    const launched = await tools.get("launch").execute({ desktopId: launchDesktopId }, context)
    assert.match(launched.content[0].text, /Launched org\.gnome\.Calculator\.desktop/)
  })
  assert.deepEqual(bridgeCalls.map(({ command }) => command), ["release", "input", "launch", "confirm"])
  assert.equal(bridgeCalls[2].request?.desktopId, "org.gnome.Calculator.desktop")
  assert.deepEqual(permissions, ["read", "read", "desktop_mutate", "desktop_mutate"])
})

test("serialization wraps the registered production capture tool when its proxy is retained", async () => {
  const tools = new Map<string, any>()
  const editor = { namespace() {}, add(tool: any) { tools.set(tool.name, tool) } }
  const serializedEditor = withSerializedTools(editor, "desktop", { queue: createOwnerOperationQueue() })
  const starts: string[] = []
  let releaseFirst!: () => void
  let markFirstStarted!: () => void
  const firstStarted = new Promise<void>((resolve) => { markFirstStarted = resolve })
  const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve })
  registerCaptureTools(serializedEditor, {
    assertPermission: async () => {},
    executeBridge: async (_command, request) => {
      const windowId = String(request?.windowId)
      starts.push(windowId)
      if (windowId === WINDOW_ID) {
        markFirstStarted()
        await firstGate
      }
      return JSON.stringify({
        ok: true,
        available: true,
        windowId,
        observationId: `observation-${windowId}`,
        width: 1,
        height: 1,
        sha256: "a".repeat(64),
        pngBase64: "iVBORw0KGgo=",
      })
    },
  })
  const context = {
    sessionID: "ses_acceptance_test",
    agent: "acceptance",
    messageID: "msg_acceptance_test",
    id: "call_acceptance_test",
  }
  const tool = tools.get("capture")
  let firstResultBeforeQueue: any
  const first = tool.execute({ windowId: WINDOW_ID }, context)
  const firstProgress = await Promise.race([
    firstStarted.then(() => "bridge-started"),
    first.then((result: any) => { firstResultBeforeQueue = result; return "capture-finished" }),
  ])
  assert.equal(firstProgress, "bridge-started", JSON.stringify(firstResultBeforeQueue?.content))
  const second = tool.execute({ windowId: "abcdefab-cdef-abcd-efab-cdefabcdefab:8" }, context)
  await Promise.resolve()
  assert.deepEqual(starts, [WINDOW_ID], "the second bridge call waits behind the actual serialized registration")
  releaseFirst()
  const [firstResult, secondResult] = await Promise.all([first, second])
  assert.deepEqual(starts, [WINDOW_ID, "abcdefab-cdef-abcd-efab-cdefabcdefab:8"])
  assert.ok(firstResult.content.some((part: any) => part.type === "file"))
  assert.ok(secondResult.content.some((part: any) => part.type === "file"))
})

test("owned daemon cleanup resumes only its current capability after success or failure", async () => {
  let current = true
  let suspended = false
  let signals = 0
  let exitCleanup: (() => boolean) | undefined
  let removed = false
  const control = {
    isCurrent: () => current,
    suspend: () => {
      if (!current || suspended) return false
      suspended = true
      signals += 1
      return true
    },
    resume: () => {
      if (!current || !suspended) return false
      suspended = false
      signals += 1
      return true
    },
  }
  const registerExit = (cleanup: () => boolean) => {
    exitCleanup = cleanup
    return () => { removed = true }
  }
  assert.equal(await withOwnedDaemonSuspension(control, async () => "completed", registerExit as any), "completed")
  assert.equal(signals, 2)
  assert.equal(suspended, false)

  await assert.rejects(withOwnedDaemonSuspension(control, async () => {
    assert.equal(suspended, true)
    throw new Error("injected cancellation")
  }, registerExit as any), /injected cancellation/)
  assert.equal(signals, 4)
  assert.equal(suspended, false)
  assert.equal(typeof exitCleanup, "function")
  assert.equal(removed, true)

  await assert.rejects(withOwnedDaemonSuspension({ ...control, isCurrent: () => false }, async () => {}), /absent, stale, replaced, or stopped/)
  current = false
  assert.equal(exitCleanup?.(), false, "late exit cleanup cannot signal a stale or replaced child")
  assert.equal(signals, 4)
})

test("sanitized environment metadata retains the spawn allowlist without reading a process environment", () => {
  assert.equal(checkSanitizedEnvironmentNames([
    "HOME", "PATH", "LANG", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR", "DISPLAY", "WAYLAND_DISPLAY",
  ]).ok, true)
  assert.deepEqual(checkSanitizedEnvironmentNames(["HOME", "OPENAI_API_KEY"]).secretish, ["OPENAI_API_KEY"])
  assert.equal(checkSanitizedEnvironmentNames(["HOME", "NODE_OPTIONS"]).ok, false)
})
