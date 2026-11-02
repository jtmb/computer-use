import assert from "node:assert/strict"
import { test } from "node:test"

import {
  compileRequest, executePlan, MAX_PENDING_PREVIEWS, PreviewStore, PREVIEW_TTL_MS,
  tileRect, verifyPlan,
} from "../../../tools/gnome-window-control/policy.mjs"

function state() {
  const rect = { x: 63, y: 32, width: 1233, height: 832 }
  return {
    version: 1, epoch: "epoch-1", workspace: 0, locked: false, blockedReason: null as string | null,
    focusedWindowId: "epoch-1:1",
    monitors: [{ id: 0, rect, workArea: rect, scale: 5 / 3 }],
    windows: [1, 2, 3, 4].map(id => ({
      id: `epoch-1:${id}`, appId: id === 1 ? "demo-terminal.desktop" : "demo-browser.desktop",
      pid: 1000 + id, title: id === 1 ? "OpenCode Demo" : "YouTube",
      monitor: 0, rect: { ...rect }, minimized: false, maximized: false, fullscreen: false,
      canMove: true, canResize: true, canMaximize: true, protected: false,
    })),
  }
}

type State = ReturnType<typeof state>
type Placement = { windowId: string; rect: State["windows"][number]["rect"] }

function store() {
  let clock = 100_000
  let serial = 0
  const previews = new PreviewStore({ now: () => clock, nonce: () => `opaque-preview-token-${++serial}` })
  return { previews, advance: (amount: number) => { clock += amount } }
}

const layout = {
  action: "layout",
  placements: [{ windowId: "epoch-1:1", slot: "left" }, { windowId: "epoch-1:2", slot: "right" }],
  focusWindowId: "epoch-1:2",
}

test("odd work-area widths tile without gaps and use compositor logical coordinates", () => {
  const snapshot = state()
  const plan = compileRequest(layout, snapshot)
  assert.deepEqual(plan.placements.map((item: Placement) => item.rect), [
    { x: 63, y: 32, width: 616, height: 832 },
    { x: 679, y: 32, width: 617, height: 832 },
  ])
  assert.equal(plan.focusWindowId, "epoch-1:2")
  assert.deepEqual(tileRect(snapshot.monitors[0].workArea, "bottom-right"),
    { x: 679, y: 448, width: 617, height: 416 })
  assert.deepEqual(tileRect(snapshot.monitors[0].workArea, "maximize"), snapshot.monitors[0].workArea)
})

test("focus, explicit placement, and maximize compile only against current exact IDs", () => {
  const snapshot = state()
  const focused = compileRequest({ action: "focus", windowId: "epoch-1:2" }, snapshot)
  assert.deepEqual(focused.placements, [])
  assert.equal(focused.focusWindowId, "epoch-1:2")
  const placed = compileRequest({ action: "place", windowId: "epoch-1:1", rect: { x: 100, y: 100, width: 400, height: 300 } }, snapshot)
  assert.equal(placed.placements[0].monitor, 0)
  assert.equal(compileRequest({ action: "tile", windowId: "epoch-1:1", slot: "maximize" }, snapshot).placements[0].maximize, true)
  assert.throws(() => compileRequest({ action: "focus", windowId: "YouTube" }, snapshot), /missing, ambiguous/)
  snapshot.windows.push({ ...snapshot.windows[0] })
  assert.throws(() => compileRequest({ action: "focus", windowId: "epoch-1:1" }, snapshot), /ambiguous/)
})

test("invalid shapes, arbitrary commands, off-screen rectangles, and overlapping layouts are refused", () => {
  for (const invalid of [
    { action: "close", windowId: "epoch-1:1" },
    { action: "focus", windowId: "epoch-1:1", script: "anything" },
    { action: "tile", windowId: "epoch-1:1", slot: "left", rect: {} },
    { action: "place", windowId: "epoch-1:1", rect: { x: 0, y: 0, width: 1000, height: 500 } },
    { action: "place", windowId: "epoch-1:1", rect: { x: 63, y: 32, width: 1, height: 500 } },
    { action: "place", windowId: "epoch-1:1", rect: { x: 63.5, y: 32, width: 400, height: 500 } },
    { action: "tile", windowId: "epoch-1:1", slot: "missing" },
    { action: "tile", windowId: "epoch-1:1", slot: "left", monitor: 7 },
    { action: "layout", placements: [layout.placements[0]] },
    { action: "layout", placements: Array(5).fill(layout.placements[0]) },
    { action: "layout", placements: [layout.placements[0], layout.placements[0]] },
    { action: "layout", placements: [{ windowId: "epoch-1:1", slot: "maximize" }, layout.placements[1]] },
    { ...layout, focusWindowId: "epoch-1:3" },
  ]) assert.throws(() => compileRequest(invalid, state()), JSON.stringify(invalid))
})

test("locked, modal, fullscreen, protected, and immovable states fail closed", () => {
  for (const field of ["locked", "blockedReason"] as const) {
    const snapshot = state()
    if (field === "locked") snapshot.locked = true
    else snapshot.blockedReason = "shell-modal-active"
    assert.throws(() => compileRequest(layout, snapshot), /Desktop unavailable/)
  }
  for (const [field, value] of [["fullscreen", true], ["protected", true], ["canMove", false], ["canResize", false]] as const) {
    const snapshot = state()
    snapshot.windows[0][field] = value
    assert.throws(() => compileRequest(layout, snapshot))
  }
  const snapshot = state()
  snapshot.windows[0].canMaximize = false
  assert.throws(() => compileRequest({ action: "tile", windowId: "epoch-1:1", slot: "maximize" }, snapshot), /maximize/)
})

test("preview issuance is non-mutating, input-bound, expiring, and strictly single-use", () => {
  const { previews, advance } = store()
  const snapshot = state()
  const original = structuredClone(snapshot)
  const issued = previews.issue(layout, snapshot)
  assert.deepEqual(snapshot, original)
  assert.equal(issued.coordinateSpace, "logical-desktop")
  assert.deepEqual(previews.consume(layout, issued.target_token, snapshot), issued.plan)
  assert.throws(() => previews.consume(layout, issued.target_token, snapshot), /already-used/)
  const changed = previews.issue(layout, snapshot)
  assert.throws(() => previews.consume({ ...layout, focusWindowId: "epoch-1:1" }, changed.target_token, snapshot), /differs/)
  assert.throws(() => previews.consume(layout, changed.target_token, snapshot), /already-used/)
  const expired = previews.issue(layout, snapshot)
  advance(PREVIEW_TTL_MS + 1)
  assert.throws(() => previews.consume(layout, expired.target_token, snapshot), /expired/)
  const backwards = previews.issue(layout, snapshot)
  advance(-1)
  assert.throws(() => previews.consume(layout, backwards.target_token, snapshot), /expired/)
})

test("changing identity, title, geometry, focus, workspace, or monitor invalidates a preview", () => {
  const changes: Array<(snapshot: State) => void> = [
    snapshot => { snapshot.epoch = "restart" },
    snapshot => { snapshot.windows[0].title = "Different page" },
    snapshot => { snapshot.windows[0].rect.x += 1 },
    snapshot => { snapshot.windows[0].pid += 1 },
    snapshot => { snapshot.focusedWindowId = "epoch-1:3" },
    snapshot => { snapshot.workspace += 1 },
    snapshot => { snapshot.monitors[0].scale = 2 },
    snapshot => { snapshot.windows.splice(0, 1) },
  ]
  for (const change of changes) {
    const { previews } = store()
    const snapshot = state()
    const issued = previews.issue(layout, snapshot)
    change(snapshot)
    assert.throws(() => previews.consume(layout, issued.target_token, snapshot))
  }
})

test("preview storage is bounded and disable clears pending authority", () => {
  const { previews, advance } = store()
  for (let index = 0; index < MAX_PENDING_PREVIEWS; index++) previews.issue(layout, state())
  assert.throws(() => previews.issue(layout, state()), /Too many/)
  advance(PREVIEW_TTL_MS + 1)
  const issued = previews.issue(layout, state())
  previews.clear()
  assert.throws(() => previews.consume(layout, issued.target_token, state()), /Unknown/)
})

test("readback requires the actual focus, geometry, monitor, and non-minimized window", () => {
  const snapshot = state()
  const plan = compileRequest(layout, snapshot)
  assert.equal(verifyPlan(plan, snapshot).verified, false)
  for (const item of plan.placements) {
    const target = snapshot.windows.find(window => window.id === item.windowId)
    assert.ok(target)
    Object.assign(target, { rect: item.rect })
  }
  snapshot.focusedWindowId = plan.focusWindowId
  assert.equal(verifyPlan(plan, snapshot).verified, true)
  for (const field of ["fullscreen", "protected", "minimized"] as const) {
    snapshot.windows[0][field] = true
    assert.equal(verifyPlan(plan, snapshot).verified, false, field)
    snapshot.windows[0][field] = false
  }
  snapshot.windows[1].rect = { ...snapshot.windows[1].rect, width: 700 }
  assert.equal(verifyPlan(plan, snapshot).verified, false)
  snapshot.windows.splice(1, 1)
  assert.equal(verifyPlan(plan, snapshot).verified, false)
})

test("focus-only readback requires a live, non-minimized target in the approved workspace", () => {
  const snapshot = state()
  const plan = compileRequest({ action: "focus", windowId: "epoch-1:1" }, snapshot)
  assert.equal(verifyPlan(plan, snapshot).verified, true)
  snapshot.windows[0].minimized = true
  assert.equal(verifyPlan(plan, snapshot).verified, false)
  snapshot.windows[0].minimized = false
  snapshot.workspace = 1
  assert.equal(verifyPlan(plan, snapshot).contextVerified, false)
  snapshot.workspace = 0
  snapshot.windows.splice(0, 1)
  assert.equal(verifyPlan(plan, snapshot).focusVerified, false)
})

test("execution reports partial failure without retry, rollback, or false success", async () => {
  const plan = compileRequest(layout, state())
  const calls: string[] = []
  const partial = await executePlan(plan, {
    place(item: Placement) { calls.push(item.windowId); if (calls.length === 2) throw new Error("compositor refused second window") },
    focus() { throw new Error("must not focus after failure") },
    verify() { throw new Error("must not claim success") },
    observe() { return state() },
  })
  assert.equal(partial.applied, true)
  assert.equal(partial.verified, false)
  assert.equal(partial.outcome, "unverified-or-partial")
  assert.deepEqual(calls, ["epoch-1:1", "epoch-1:2"])
  assert.equal(partial.readback.verified, false)
  const successful = await executePlan(plan, {
    place() {}, focus() {}, async verify() { return { verified: true, checks: [] } },
  })
  assert.equal(successful.outcome, "verified")
  const clamped = await executePlan(plan, {
    place() {}, focus() {}, async verify() { return { verified: false, checks: [] } },
  })
  assert.equal(clamped.verified, false)
})
