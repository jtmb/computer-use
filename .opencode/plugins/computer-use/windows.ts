/** Typed, permission-gated client for the optional compositor window bridge. */

import { execFile } from "node:child_process"
import path from "node:path"

import {
  REPO_ROOT, describeDesktopFailure,
  type DesktopPermissionRequest, type DesktopToolContext, type DesktopToolEditor,
} from "./desktop.ts"

export const WINDOW_SCRIPT = path.join(REPO_ROOT, "scripts", "desktop-windows.py")
const MAX_REPLY_BYTES = 256 * 1024
const SLOTS = ["left", "right", "maximize", "top-left", "top-right", "bottom-left", "bottom-right"]

type Request = Record<string, unknown>
type Result = { content: Array<{ type: "text"; text: string }> }
type Dependencies = {
  assertPermission(request: DesktopPermissionRequest): Promise<void>
  call?: typeof callWindows
}

function text(value: string): Result {
  return { content: [{ type: "text", text: value }] }
}

function only(input: Request, allowed: string[]): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Expected an object")
  for (const key of Object.keys(input))
    if (!allowed.includes(key)) throw new Error(`Unsupported field: ${key}`)
}

function id(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 128)
    throw new Error("Use an exact windowId from desktop_windows")
}

function placement(input: Request): void {
  only(input, ["windowId", "monitor", "slot", "rect"])
  id(input.windowId)
  if (input.monitor !== undefined && (!Number.isInteger(input.monitor) || Number(input.monitor) < 0 || Number(input.monitor) > 15))
    throw new Error("monitor must be an integer from 0 to 15")
  if ((input.slot === undefined) === (input.rect === undefined)) throw new Error("Use exactly one of slot or rect")
  if (input.slot !== undefined && !SLOTS.includes(String(input.slot))) throw new Error("Unsupported tile slot")
  if (input.rect !== undefined) {
    const rect = input.rect as Request
    only(rect, ["x", "y", "width", "height"])
    for (const key of ["x", "y", "width", "height"]) {
      const minimum = key === "width" ? 160 : key === "height" ? 100 : -32768
      if (!Number.isInteger(rect[key]) || Number(rect[key]) < minimum || Number(rect[key]) > 32768)
        throw new Error(`Invalid rectangle ${key}`)
    }
  }
}

export function windowRequest(input: Request, layout: boolean): { request: Request; apply: boolean; token?: string; ids: string[] } {
  const { apply = false, expectToken, ...request } = input
  if (typeof apply !== "boolean") throw new Error("apply must be boolean")
  if (apply !== (expectToken !== undefined)) throw new Error("apply and expectToken must be supplied together")
  if (expectToken !== undefined && (typeof expectToken !== "string" || expectToken.length < 16 || expectToken.length > 128))
    throw new Error("Invalid preview token")
  let ids: string[]
  if (layout) {
    only(request, ["placements", "focusWindowId"])
    if (!Array.isArray(request.placements) || request.placements.length < 2 || request.placements.length > 4)
      throw new Error("A layout needs two to four placements")
    for (const item of request.placements) placement(item)
    ids = request.placements.map(item => item.windowId)
    if (new Set(ids).size !== ids.length) throw new Error("Layout window IDs must be unique")
    if (request.focusWindowId !== undefined && !ids.includes(String(request.focusWindowId)))
      throw new Error("focusWindowId must be a placed window")
    request.action = "layout"
  } else {
    const action = request.action
    if (!["focus", "place", "tile"].includes(String(action))) throw new Error("Unsupported window action")
    if (action === "focus") {
      only(request, ["action", "windowId"])
      id(request.windowId)
    } else {
      only(request, ["action", "windowId", "monitor", action === "place" ? "rect" : "slot"])
      const { action: _, ...item } = request
      placement(item)
    }
    ids = [request.windowId as string]
  }
  return { request, apply, token: expectToken as string | undefined, ids }
}

export function callWindows(request: Request | null, token?: string, signal?: AbortSignal): Promise<string> {
  const args = [WINDOW_SCRIPT, request === null ? "list" : "act"]
  if (request !== null) args.push("--request", JSON.stringify(request))
  if (token !== undefined) args.push("--apply", "--expect-token", token)
  return new Promise(resolve => {
    execFile("/usr/bin/python3", args, { timeout: 11000, maxBuffer: MAX_REPLY_BYTES, signal }, (error, stdout, stderr) => {
      if (error) resolve(describeDesktopFailure({ ...error, stdout, stderr }, token !== undefined).replace("desktop-control.py failed", "desktop-windows.py failed"))
      else resolve(stdout.trim())
    })
  })
}

const rectSchema = {
  type: "object", additionalProperties: false, required: ["x", "y", "width", "height"],
  properties: {
    x: { type: "integer", minimum: -32768, maximum: 32768 },
    y: { type: "integer", minimum: -32768, maximum: 32768 },
    width: { type: "integer", minimum: 160, maximum: 32768 },
    height: { type: "integer", minimum: 100, maximum: 32768 },
  },
}
const placementProperties = {
  windowId: { type: "string", minLength: 1, maxLength: 128, description: "Exact current compositor ID from desktop_windows" },
  monitor: { type: "integer", minimum: 0, maximum: 15, description: "Monitor ID; defaults to the target window's current monitor" },
  slot: { type: "string", enum: SLOTS, description: "Tile within the monitor work area; use slot or rect, never both" },
  rect: { ...rectSchema, description: "Logical-desktop rectangle inside the monitor work area, not screenshot pixels" },
}
const applyProperties = {
  apply: { type: "boolean", description: "Execute only with an exact fresh preview token; default false" },
  expectToken: { type: "string", minLength: 16, maxLength: 128, description: "Single-use target_token from the same request's immediately preceding preview" },
}

export function registerWindowTools<T>(editor: DesktopToolEditor<T>, dependencies: Dependencies): void {
  const call = dependencies.call ?? callWindows
  const permission = (context: DesktopToolContext, action: string, resources: string[]) => dependencies.assertPermission({
    sessionID: context.sessionID, agent: context.agent,
    source: { type: "tool", messageID: context.messageID, id: context.id },
    action, resources, save: resources,
  })
  const add = (definition: object) => editor.add(definition as T)
  add({
    name: "windows", options: { namespace: "desktop", codemode: false },
    description: "List current-workspace compositor windows with stable IDs, PID, app ID, focus, logical global geometry, and monitor work areas. Requires the separately approved GNOME window bridge. No window content is read. Do not call during credential entry; bridge refuses control while locked or modal.",
    input: { type: "object", properties: {}, additionalProperties: false },
    execute: async (input: Request, context: DesktopToolContext) => {
      only(input, [])
      await permission(context, "read", ["desktop/windows"])
      return text(await call(null, undefined, context.signal))
    },
  })
  for (const layout of [false, true]) add({
    name: layout ? "layout" : "window_act", options: { namespace: "desktop", codemode: false },
    description: layout
      ? "Preview arranging two to four exact window IDs, optionally focusing one afterwards. Single-use token required for apply; stale focus/geometry/workspace rejects the request. Not atomic: inspect actual readback after partial failure, never replay a token. Take a fresh screenshot after apply. Never change unrelated windows or act during authentication."
      : "Preview focus, logical-desktop placement, or tiling of one exact compositor window ID. Apply requires its fresh single-use target_token and separate mutation permissions. Readback verifies actual focus/geometry; dispatch alone is not success. Take a fresh screenshot after apply. No hotkey fallback, closing, input injection, or fullscreen exit.",
    input: {
      type: "object", additionalProperties: false,
      properties: layout ? {
        placements: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", properties: placementProperties, required: ["windowId"], additionalProperties: false } },
        focusWindowId: { type: "string", minLength: 1, maxLength: 128, description: "Optional placed window to activate after arranging" },
        ...applyProperties,
      } : { action: { type: "string", enum: ["focus", "place", "tile"] }, ...placementProperties, ...applyProperties },
      required: layout ? ["placements"] : ["action", "windowId"],
    },
    execute: async (input: Request, context: DesktopToolContext) => {
      let built: ReturnType<typeof windowRequest>
      try { built = windowRequest(input, layout) }
      catch (error) { return text(`Invalid window request: ${error instanceof Error ? error.message : String(error)}`) }
      const resources = [...built.ids].sort().map(value =>
        `desktop/windows/${layout ? "layout" : built.request.action}/${encodeURIComponent(value).replaceAll("*", "%2A")}`)
      await permission(context, "read", resources)
      if (built.apply) {
        await permission(context, "desktop_mutate", resources)
        await permission(context, "edit", resources)
      }
      return text(await call(built.request, built.token, context.signal))
    },
  })
}
