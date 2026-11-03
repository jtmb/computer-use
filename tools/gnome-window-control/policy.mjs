/** Pure policy shared by the compositor bridge and its non-desktop tests. */

export const PREVIEW_TTL_MS = 30_000
export const MAX_PENDING_PREVIEWS = 32
export const TILE_SLOTS = ["left", "right", "maximize", "top-left", "top-right", "bottom-left", "bottom-right"]

function object(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${label} must be an object`)
  return value
}

function keys(value, allowed, label) {
  object(value, label)
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`${label}: unsupported field ${key}`)
}

function integer(value, label, minimum = -32768, maximum = 32768) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`)
  return value
}

function target(state, id) {
  if (typeof id !== "string" || !id || id.length > 128)
    throw new Error("windowId must be an ID from the current windows inventory")
  const matches = state.windows.filter(window => window.id === id)
  if (matches.length !== 1) throw new Error("windowId is missing, ambiguous, or no longer current")
  if (matches[0].protected) throw new Error("Protected windows cannot be controlled")
  return matches[0]
}

function monitor(state, id) {
  integer(id, "monitor", 0, 15)
  const matches = state.monitors.filter(item => item.id === id)
  if (matches.length !== 1) throw new Error("Monitor is no longer current")
  return matches[0]
}

function rectangle(input, area) {
  keys(input, ["x", "y", "width", "height"], "rect")
  const result = {
    x: integer(input.x, "x"), y: integer(input.y, "y"),
    width: integer(input.width, "width", 160), height: integer(input.height, "height", 100),
  }
  if (result.x < area.x || result.y < area.y ||
      result.x + result.width > area.x + area.width ||
      result.y + result.height > area.y + area.height)
    throw new Error("Rectangle must remain inside the selected monitor work area")
  return result
}

export function tileRect(area, slot) {
  if (!TILE_SLOTS.includes(slot)) throw new Error("Unsupported tile slot")
  const left = Math.floor(area.width / 2)
  const top = Math.floor(area.height / 2)
  let result = { ...area }
  if (slot === "left" || slot.endsWith("-left")) result.width = left
  if (slot === "right" || slot.endsWith("-right")) {
    result.x += left
    result.width -= left
  }
  if (slot.startsWith("top-")) result.height = top
  if (slot.startsWith("bottom-")) {
    result.y += top
    result.height -= top
  }
  return rectangle(result, area)
}

function placement(input, state) {
  keys(input, ["windowId", "monitor", "rect", "slot"], "placement")
  const window = target(state, input.windowId)
  if (window.fullscreen) throw new Error("Leave fullscreen manually before placing this window")
  if (!window.canMove || !window.canResize) throw new Error("Window does not allow move/resize")
  if (input.slot === "maximize" && !window.canMaximize) throw new Error("Window does not allow maximize")
  if ((input.rect === undefined) === (input.slot === undefined))
    throw new Error("A placement needs exactly one of rect or slot")
  const display = monitor(state, input.monitor ?? window.monitor)
  const rect = input.slot === undefined
    ? rectangle(input.rect, display.workArea)
    : tileRect(display.workArea, input.slot)
  const request = { windowId: window.id, monitor: display.id }
  if (input.slot !== undefined) request.slot = input.slot
  else request.rect = rect
  return { request, windowId: window.id, monitor: display.id, rect, maximize: input.slot === "maximize" }
}

function overlaps(first, second) {
  return first.x < second.x + second.width && second.x < first.x + first.width &&
    first.y < second.y + second.height && second.y < first.y + first.height
}

export function compileRequest(input, state) {
  object(state, "state")
  if (state.version !== 1) throw new Error("Unsupported window bridge version")
  if (state.locked || state.blockedReason) throw new Error(`Desktop unavailable: ${state.blockedReason ?? "locked"}`)
  const context = { epoch: state.epoch, workspace: state.workspace }
  keys(input, ["action", "windowId", "monitor", "rect", "slot", "placements", "focusWindowId"], "request")
  if (input.action === "focus") {
    keys(input, ["action", "windowId"], "focus")
    const window = target(state, input.windowId)
    return { ...context, request: { action: "focus", windowId: window.id }, placements: [], focusWindowId: window.id, targetIds: [window.id] }
  }
  if (input.action === "place" || input.action === "tile") {
    keys(input, ["action", "windowId", "monitor", input.action === "place" ? "rect" : "slot"], input.action)
    const { action, ...rest } = input
    const item = placement(rest, state)
    return { ...context, request: { action, ...item.request }, placements: [item], focusWindowId: null, targetIds: [item.windowId] }
  }
  if (input.action !== "layout") throw new Error("Unsupported window action")
  keys(input, ["action", "placements", "focusWindowId"], "layout")
  if (!Array.isArray(input.placements) || input.placements.length < 2 || input.placements.length > 4)
    throw new Error("A layout needs two to four placements")
  const placements = input.placements.map(item => placement(item, state))
  const targetIds = placements.map(item => item.windowId)
  if (new Set(targetIds).size !== targetIds.length) throw new Error("Layout window IDs must be unique")
  for (let index = 0; index < placements.length; index++)
    for (let other = index + 1; other < placements.length; other++)
      if (overlaps(placements[index].rect, placements[other].rect))
        throw new Error("Layout placements must not overlap")
  const focusWindowId = input.focusWindowId ?? null
  if (focusWindowId !== null && !targetIds.includes(focusWindowId))
    throw new Error("Layout focusWindowId must be one of its placed windows")
  return {
    ...context,
    request: { action: "layout", placements: placements.map(item => item.request), focusWindowId },
    placements, focusWindowId, targetIds,
  }
}

function fingerprint(plan, state) {
  return JSON.stringify({
    epoch: state.epoch, workspace: state.workspace, focusedWindowId: state.focusedWindowId,
    monitors: state.monitors,
    windows: [...plan.targetIds].sort().map(id => target(state, id)),
  })
}

export class PreviewStore {
  constructor({ now = () => Date.now(), nonce }) {
    this.now = now
    this.nonce = nonce
    this.pending = new Map()
  }

  issue(input, state) {
    const now = this.now()
    for (const [token, entry] of this.pending)
      if (now - entry.issuedAt > PREVIEW_TTL_MS) this.pending.delete(token)
    if (this.pending.size >= MAX_PENDING_PREVIEWS) throw new Error("Too many pending previews; let older previews expire")
    const plan = compileRequest(input, state)
    const token = this.nonce()
    if (typeof token !== "string" || token.length < 16 || token.length > 128 || this.pending.has(token))
      throw new Error("Could not issue a unique preview token")
    this.pending.set(token, { issuedAt: now, plan, fingerprint: fingerprint(plan, state) })
    return {
      preview: true, target_token: token, expiresInSeconds: PREVIEW_TTL_MS / 1000,
      plan, before: plan.targetIds.map(id => target(state, id)),
      coordinateSpace: "logical-desktop", atomic: false,
    }
  }

  consume(input, token, state) {
    const entry = this.pending.get(token)
    // Burn the token before validating request or state, so even failed or stale
    // attempts cannot be replayed.
    this.pending.delete(token)
    if (!entry) throw new Error("Unknown or already-used preview token")
    const age = this.now() - entry.issuedAt
    if (age < 0 || age > PREVIEW_TTL_MS) throw new Error("Preview expired; request a fresh preview")
    const plan = compileRequest(input, state)
    if (JSON.stringify(plan.request) !== JSON.stringify(entry.plan.request))
      throw new Error("Request differs from its preview")
    if (fingerprint(plan, state) !== entry.fingerprint)
      throw new Error("Window, focus, workspace, or monitor state changed; request a fresh preview")
    return entry.plan
  }

  clear() {
    this.pending.clear()
  }
}

export function verifyPlan(plan, state, tolerance = 2) {
  const checks = plan.placements.map(item => {
    const actual = state.windows.find(window => window.id === item.windowId)
    const matches = actual && actual.monitor === item.monitor && !actual.minimized && !actual.fullscreen && !actual.protected &&
      actual.maximized === item.maximize &&
      ["x", "y", "width", "height"].every(key => Math.abs(actual.rect[key] - item.rect[key]) <= tolerance)
    return { windowId: item.windowId, verified: Boolean(matches), expected: item, actual: actual ?? null }
  })
  const focused = state.windows.find(window => window.id === plan.focusWindowId)
  const focusVerified = plan.focusWindowId === null || Boolean(focused && !focused.minimized && !focused.protected && state.focusedWindowId === plan.focusWindowId)
  const contextVerified = plan.epoch === state.epoch && plan.workspace === state.workspace
  return {
    verified: contextVerified && !state.locked && !state.blockedReason && focusVerified && checks.every(item => item.verified),
    contextVerified, focusVerified, focusedWindowId: state.focusedWindowId, checks,
  }
}

export async function executePlan(plan, backend) {
  const attempted = []
  try {
    for (const item of plan.placements) {
      attempted.push(item.windowId)
      backend.place(item)
    }
    if (plan.focusWindowId !== null) {
      attempted.push(plan.focusWindowId)
      backend.focus(plan.focusWindowId)
    }
    const verification = await backend.verify(plan)
    return { applied: true, atomic: false, attempted, ...verification,
      outcome: verification.verified ? "verified" : "unverified-or-partial",
      nextStep: verification.verified ? "Take a fresh screenshot" : "Inspect fresh state; do not replay the consumed token" }
  } catch (error) {
    let readback = null
    if (backend.observe) {
      try { readback = verifyPlan(plan, backend.observe()) }
      catch { /* Keep the original failure; observation is best-effort after a partial apply. */ }
    }
    return { applied: attempted.length > 0, verified: false, atomic: false, attempted,
      outcome: "unverified-or-partial", error: String(error.message ?? error), readback,
      nextStep: "Inspect fresh state before any new preview; no automatic rollback or retry was attempted" }
  }
}
