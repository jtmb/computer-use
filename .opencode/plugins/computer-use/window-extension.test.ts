import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import vm from "node:vm"

import { PreviewStore, executePlan, verifyPlan } from "../../../tools/gnome-window-control/policy.mjs"

// Mock only GJS/compositor boundaries; execute the canonical extension methods.
const source = readFileSync(new URL("../../../tools/gnome-window-control/extension.js", import.meta.url), "utf8")
  .split("\n").filter(line => !line.startsWith("import ")).join("\n")
  .replace("export default class WindowControl", "globalThis.WindowControl = class WindowControl")

function fixture() {
  const calls: unknown[] = []
  const timers = new Map<number, () => unknown>()
  const workspace = { index: () => 0, get_work_area_for_monitor: () => ({ x: 0, y: 24, width: 1200, height: 876 }) }
  const windows = [1, 2, 3].map(serial => ({
    minimized: false, maximized: false, resizeable: true, monitor: 0, title: `Demo ${serial}`, type: 0,
    rect: { x: 20, y: 40, width: 800, height: 600 },
    get_stable_sequence: () => serial, get_window_type() { return this.type },
    get_transient_for: () => null, located_on_workspace: () => true,
    get_wm_class: () => "demo", get_pid: () => 1000 + serial,
    get_title() { return this.title }, get_monitor() { return this.monitor },
    get_frame_rect() { return this.rect }, get_maximize_flags() { return this.maximized ? 3 : 0 },
    is_fullscreen: (): boolean => false, is_maximized() { return this.maximized }, allows_move: () => true,
    allows_resize() { return this.resizeable && !this.maximized }, can_maximize: () => true,
    get_min_size: () => [true, 100, 100], get_max_size: () => [false, 0, 0],
    unminimize() { this.minimized = false }, unmaximize() { this.maximized = false },
    move_to_monitor(monitor: number) { calls.push(["monitor", serial, monitor]); this.monitor = monitor },
    move_resize_frame(user: boolean, x: number, y: number, width: number, height: number) {
      calls.push(["place", serial, user]); this.rect = { x, y, width, height }
    },
    maximize() { this.maximized = true },
  }))
  let focused = windows[0]
  let serial = 0
  let clock = 100000
  const Main = {
    sessionMode: { isLocked: false, hasWindows: true }, modalCount: 0, overview: { visible: false },
    layoutManager: { monitors: [{ x: 0, y: 0, width: 1200, height: 900 }] },
    activateWindow(window: typeof windows[0], time: number, index: number) {
      calls.push(["focus", window.get_stable_sequence(), time, index]); focused = window
    },
  }
  const context = vm.createContext({
    PreviewStore, executePlan, verifyPlan, Extension: class {}, Main,
    Meta: { WindowType: { NORMAL: 0 } },
    Shell: { WindowTracker: { get_default: () => ({ get_window_app: () => ({ get_id: () => "demo.desktop" }) }) } },
    Clutter: {
      InputDeviceType: { KEYBOARD_DEVICE: 1, POINTER_DEVICE: 2 },
      KeyState: { PRESSED: 1, RELEASED: 0 },
      ButtonState: { PRESSED: 1, RELEASED: 0 },
      ScrollDirection: { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 },
      ScrollSource: { WHEEL: 0 },
      KEY_Return: 0xff0d, KEY_Tab: 0xff09, KEY_Escape: 0xff1b,
    },
    virtualDevice: { notify_keyval() {}, notify_button() {}, notify_absolute_motion() {}, notify_discrete_scroll() {} },
    global: {
      stage: { context: { get_backend: () => ({ get_default_seat: () => ({
        create_virtual_device: () => context.virtualDevice,
      }) }) } },
      get_pointer: () => [0, 0],
      workspace_manager: {
        get_active_workspace: () => workspace,
        get_workspace_by_index: () => workspace,
      },
      get_window_actors: () => windows.map(meta_window => ({ meta_window })),
      display: { get_focus_window: () => focused, get_monitor_scale: () => 1.5 },
      get_current_time: () => 123,
    },
    Gio: {
      DBusExportedObject: { wrapJSObject: () => ({ export() {}, unexport() { calls.push("unexport") } }) },
      DBus: { session: {} }, BusNameOwnerFlags: { NONE: 0 },
      bus_own_name_on_connection: () => 1, bus_unown_name() { calls.push("unown") },
    },
    GLib: {
      uuid_string_random: () => `test-opaque-uuid-${++serial}`, PRIORITY_DEFAULT: 0,
      SOURCE_REMOVE: false, SOURCE_CONTINUE: true, get_monotonic_time: () => clock,
      timeout_add(_priority: number, _interval: number, callback: () => unknown) { timers.set(++serial, callback); return serial },
      source_remove(id: number) { timers.delete(id) },
      Variant: class {
        type: string
        value: unknown
        constructor(type: string, value: unknown) { this.type = type; this.value = value }
      },
    },
  })
  vm.runInContext(source, context)
  const bridge = new context.WindowControl()
  bridge.enable()
  const apply = (request: object, token: string) => new Promise<any>(resolve => bridge.ApplyAsync([JSON.stringify(request), token], {
    return_value: (reply: any) => resolve(JSON.parse(reply.value[0])),
    return_dbus_error: (name: string, message: string) => resolve({ error: name, message }),
  }))
  return { bridge, Main, windows, calls, timers, apply, tick() { clock += 50000; for (const callback of [...timers.values()]) callback() } }
}

test("extension inventories stable IDs and refuses previews under lock, overview, or modal state", () => {
  const f = fixture()
  const before = JSON.parse(f.bridge.GetState())
  assert.equal(before.windows.length, 3)
  assert.equal(before.windows[0].id, JSON.parse(f.bridge.GetState()).windows[0].id)
  const request = JSON.stringify({ action: "focus", windowId: before.windows[0].id })
  f.Main.modalCount = 1
  assert.throws(() => f.bridge.Preview(request), /shell-modal-active/)
  f.Main.modalCount = 0
  f.Main.overview.visible = true
  assert.throws(() => f.bridge.Preview(request), /overview-active/)
  f.Main.overview.visible = false
  f.Main.sessionMode.isLocked = true
  assert.equal(JSON.parse(f.bridge.GetState()).windows.length, 0)
  assert.throws(() => f.bridge.Preview(request), /locked/)
  f.bridge.disable()
})

test("extension applies only selected windows, verifies real mock readback, and rejects token replay", async () => {
  const f = fixture()
  const before = JSON.parse(f.bridge.GetState())
  const request = { action: "layout", placements: [
    { windowId: before.windows[0].id, slot: "left" },
    { windowId: before.windows[1].id, slot: "right" },
  ], focusWindowId: before.windows[1].id }
  const unrelated = structuredClone(f.windows[2].rect)
  const preview = JSON.parse(f.bridge.Preview(JSON.stringify(request)))
  assert.deepEqual(f.calls, [])
  const pending = f.apply(request, preview.target_token)
  f.tick()
  assert.equal((await pending).verified, true)
  assert.deepEqual(f.calls, [["place", 1, true], ["place", 2, true], ["focus", 2, 123, 0]])
  assert.deepEqual(f.windows[2].rect, unrelated)
  assert.match((await f.apply(request, preview.target_token)).message, /already-used/)
  f.bridge.disable()
})

test("extension shutdown resolves pending verification without claiming success", async () => {
  const f = fixture()
  const id = JSON.parse(f.bridge.GetState()).windows[1].id
  const request = { action: "focus", windowId: id }
  const preview = JSON.parse(f.bridge.Preview(JSON.stringify(request)))
  const pending = f.apply(request, preview.target_token)
  f.bridge.disable()
  assert.equal(f.timers.size, 0)
  const result = await pending
  assert.equal(result.verified, false)
  assert.match(result.error, /disabled/)
  assert.throws(() => f.bridge.Preview(JSON.stringify(request)), /disabled/)
})

test("maximized resizable windows can be previewed and restored before placement", async () => {
  const f = fixture()
  f.windows[0].maximized = true
  assert.equal(f.windows[0].allows_resize(), false)
  const snapshot = JSON.parse(f.bridge.GetState())
  assert.equal(snapshot.windows[0].canResize, true)
  const request = { action: "tile", windowId: snapshot.windows[0].id, slot: "left" }
  const preview = JSON.parse(f.bridge.Preview(JSON.stringify(request)))
  assert.equal(f.windows[0].maximized, true, "preview must not restore the window")
  const pending = f.apply(request, preview.target_token)
  f.tick()
  assert.equal((await pending).verified, true)
  assert.equal(f.windows[0].maximized, false)
  assert.deepEqual(f.windows[0].rect, { x: 0, y: 24, width: 600, height: 876 })
  f.bridge.disable()
})

test("restore capability does not permit intrinsically fixed-size or fullscreen windows", () => {
  for (const kind of ["intrinsic", "hints", "fullscreen"]) {
    const f = fixture()
    f.windows[0].maximized = true
    if (kind === "intrinsic") f.windows[0].resizeable = false
    if (kind === "hints") f.windows[0].get_max_size = () => [true, 100, 100]
    if (kind === "fullscreen") f.windows[0].is_fullscreen = () => true
    const snapshot = JSON.parse(f.bridge.GetState())
    assert.equal(snapshot.windows[0].canResize, false, kind)
    assert.throws(() => f.bridge.Preview(JSON.stringify({
      action: "tile", windowId: snapshot.windows[0].id, slot: "left",
    })), /resize|fullscreen/)
    assert.deepEqual(f.calls, [])
    f.bridge.disable()
  }
})

// ---------------------------------------------------------------------------
// Capture, input and launch endpoints (controllers injected through the seams)
// ---------------------------------------------------------------------------

type Reply = { reply?: any; error?: { name: string; message: string } }

function invocation(sender = ":1.42"): Reply & {
  get_sender(): string
  return_value(value: any): void
  return_dbus_error(name: string, message: string): void
} {
  const box: Reply = {}
  return Object.assign(box, {
    get_sender: () => sender,
    return_value: (value: any) => { box.reply = JSON.parse(value.value[0]) },
    return_dbus_error: (name: string, message: string) => { box.error = { name, message } },
  })
}

function captureReply() {
  return {
    handle: "handle-1", size: 1024, chunkCount: 1, width: 640, height: 480,
    resourceScale: 2, bufferRect: { x: 0, y: 0, width: 640, height: 480 },
    frameRect: { x: 0, y: 0, width: 640, height: 480 },
    windowId: "epoch:1", epoch: "epoch",
  }
}

test("capture End mints a sender-bound single-use observation that input must consume", async () => {
  const f = fixture()
  const calls: string[] = []
  ;(f.bridge as any)._loadCaptureModule = async () => ({
    createCaptureController: () => ({
      Begin: (_request: string, sender: string) => { calls.push(`Begin:${sender}`); return captureReply() },
      End: (handle: string, sender: string) => { calls.push(`End:${sender}:${handle}`); return { ...captureReply(), sha256: "a".repeat(64) } },
      dispose: () => undefined,
    }),
  })
  ;(f.bridge as any)._loadInputModule = async () => ({
    createInputController: () => ({
      begin: (observation: any, sender: string) => { calls.push(`begin:${sender}:${observation.windowId}`); return "op-1" },
      releaseAll: (sender: string) => { calls.push(`release:${sender}`) },
      dispose: () => undefined,
    }),
  })

  const end = invocation()
  await f.bridge.EndAsync(["handle-1"], end)
  assert.equal(typeof end.reply.observationId, "string")
  assert.deepEqual(calls, ["End::1.42:handle-1"])

  const begin = invocation()
  await f.bridge.InputBeginAsync([JSON.stringify({ observationId: end.reply.observationId })], begin)
  assert.equal(begin.reply?.operationId, "op-1", JSON.stringify(begin.error ?? begin.reply))
  assert.deepEqual(calls.slice(-1), ["begin::1.42:epoch:1"])

  const replay = invocation()
  await f.bridge.InputBeginAsync([JSON.stringify({ observationId: end.reply.observationId })], replay)
  assert.match(replay.error!.name, /INVALID_HANDLE$/)

  const release = invocation(":1.99")
  await f.bridge.InputReleaseAllAsync([], release)
  assert.deepEqual(release.reply, { released: true })
  assert.deepEqual(calls.slice(-1), ["release::1.99"])
  f.bridge.disable()
})

test("capture endpoint maps controller codes onto D-Bus error names", async () => {
  const f = fixture()
  ;(f.bridge as any)._loadCaptureModule = async () => ({
    createCaptureController: () => ({
      Begin: () => { const error: any = new Error("INTERNAL"); error.captureCode = "BUSY"; throw error },
      dispose: () => undefined,
    }),
  })
  const call = invocation()
  await f.bridge.BeginAsync([JSON.stringify({ windowId: "epoch:1" })], call)
  assert.match(call.error!.name, /Error\.BUSY$/)
  f.bridge.disable()
})

test("launch confirmation is a sender-bound one-use capability, not a client claim", async () => {
  const f = fixture()
  const launched: string[] = []
  ;(f.bridge as any)._loadLaunchModule = async () => ({
    createLaunchController: () => ({
      launch: (id: string, sender: string) => {
        launched.push(`${id}:${sender}`)
        return { desktopId: id, beforeWindowIds: ["a", "b"], at: 1 }
      },
      confirm: (before: string[], options: any) => ({
        appeared: before.length === 2 && before[0] === "a",
        windowIds: ["c"],
        desktopId: options.desktopId,
      }),
      dispose: () => undefined,
    }),
  })

  const call = invocation()
  await f.bridge.LaunchAsync(["org.gnome.Calculator"], call)
  assert.deepEqual(call.reply.beforeWindowIds, ["a", "b"])
  assert.equal(typeof call.reply.launchToken, "string")
  assert.deepEqual(launched, ["org.gnome.Calculator::1.42"])

  // A fabricated baseline without the capability is refused.
  const forged = invocation()
  await f.bridge.ConfirmLaunchAsync([JSON.stringify(["a"]), JSON.stringify({ desktopId: "x", timeoutMs: 100 })], forged)
  assert.match(forged.error!.name, /Error\.INVALID_HANDLE$/)
  assert.equal(forged.reply, undefined)

  // Only the launching sender may redeem it.
  const foreign = invocation(":1.99")
  await f.bridge.ConfirmLaunchAsync([call.reply.launchToken, JSON.stringify({ timeoutMs: 100 })], foreign)
  assert.match(foreign.error!.name, /Error\.INVALID_HANDLE$/)

  const confirmed = invocation()
  await f.bridge.ConfirmLaunchAsync([call.reply.launchToken, JSON.stringify({ timeoutMs: 100 })], confirmed)
  assert.deepEqual(confirmed.reply, { appeared: true, windowIds: ["c"], desktopId: "org.gnome.Calculator" })

  // Single use: replaying the same capability is refused.
  const replay = invocation()
  await f.bridge.ConfirmLaunchAsync([call.reply.launchToken, JSON.stringify({ timeoutMs: 100 })], replay)
  assert.match(replay.error!.name, /Error\.INVALID_HANDLE$/)
  f.bridge.disable()
})
