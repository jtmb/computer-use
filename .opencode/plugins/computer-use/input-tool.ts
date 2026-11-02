import {
  errorMessage,
  failureText,
  executeBridge as runBridge,
  parseBridgeResponse,
  permissionRequest,
  permissionResource,
  type BridgePermissionDependencies,
  type BridgeRequest,
} from "./bridge.ts"
import type { DesktopToolContext, DesktopToolEditor } from "./desktop.ts"

const ACTIONS = ["click", "drag", "scroll", "press_key", "type_text"] as const
type InputAction = typeof ACTIONS[number]
type Request = Record<string, unknown>
type ToolResult = {
  content: Array<{ type: "text"; text: string }>
}
type InputToolDefinition = {
  name: string
  description: string
  input: Record<string, unknown>
  options: { namespace: "desktop"; codemode: true }
  execute(input: Request, context: DesktopToolContext): Promise<ToolResult>
}

const coordinate = { type: "number", minimum: 0 }
const duration = { type: "integer", minimum: 0, maximum: 2000 }
const actionFields: Record<InputAction, string[]> = {
  click: ["x", "y", "button", "clickCount", "durationMs", "keyChord"],
  drag: ["fromX", "fromY", "toX", "toY", "durationMs"],
  scroll: ["x", "y", "direction", "amount"],
  press_key: ["key", "durationMs"],
  type_text: ["text"],
}

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] }
}

function invalid(message: string): ToolResult {
  return textResult(`Invalid desktop input request: ${message}`)
}

function only(input: Request, allowed: string[]): void {
  for (const key of Object.keys(input))
    if (!allowed.includes(key)) throw new Error(`unsupported field: ${key}`)
}

function validateInput(input: Request): { observationId: string; action: InputAction; request: BridgeRequest } {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("expected an object")
  const action = input.action
  if (typeof action !== "string" || !ACTIONS.includes(action as InputAction))
    throw new Error("action must be click, drag, scroll, press_key, or type_text")
  only(input, ["observationId", "action", ...actionFields[action as InputAction]])
  const observationId = input.observationId
  if (typeof observationId !== "string" || observationId.length < 1 || observationId.length > 128)
    throw new Error("observationId must be a non-empty string of at most 128 characters")

  const required: Record<InputAction, string[]> = {
    click: ["x", "y"],
    drag: ["fromX", "fromY", "toX", "toY"],
    scroll: ["x", "y", "direction"],
    press_key: ["key"],
    type_text: ["text"],
  }
  for (const field of required[action as InputAction])
    if (!(field in input)) throw new Error(`${action} requires ${field}`)

  const coordinates: Partial<Record<InputAction, string[]>> = {
    click: ["x", "y"],
    drag: ["fromX", "fromY", "toX", "toY"],
    scroll: ["x", "y"],
  }
  for (const field of coordinates[action as InputAction] ?? []) {
    const value = input[field]
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
      throw new Error(`${field} must be a finite non-negative number`)
  }
  if (input.durationMs !== undefined && (!Number.isSafeInteger(input.durationMs) || Number(input.durationMs) < 0 || Number(input.durationMs) > 2000))
    throw new Error("durationMs must be an integer from 0 to 2000")
  if (action === "click") {
    if (input.button !== undefined && (!Number.isSafeInteger(input.button) || Number(input.button) < 1 || Number(input.button) > 32))
      throw new Error("button must be an integer from 1 to 32")
    if (input.clickCount !== undefined && (!Number.isSafeInteger(input.clickCount) || Number(input.clickCount) < 1 || Number(input.clickCount) > 10))
      throw new Error("clickCount must be an integer from 1 to 10")
    if (input.keyChord !== undefined && input.keyChord !== null &&
        !(typeof input.keyChord === "string" && input.keyChord.length <= 256 ||
          Array.isArray(input.keyChord) && input.keyChord.length <= 8 &&
          input.keyChord.every((key) => typeof key === "string" && key.length <= 64)))
      throw new Error("keyChord must be a short string or list of strings")
  }
  if (action === "scroll") {
    if (!(["up", "down", "left", "right"] as unknown[]).includes(input.direction))
      throw new Error("direction must be up, down, left, or right")
    if (input.amount !== undefined && (!Number.isSafeInteger(input.amount) || Number(input.amount) < 1 || Number(input.amount) > 100))
      throw new Error("amount must be an integer from 1 to 100")
  }
  if (action === "press_key" && (typeof input.key !== "string" || input.key.length < 1 || input.key.length > 128))
    throw new Error("key must be a non-empty string of at most 128 characters")
  if (action === "type_text" && (typeof input.text !== "string" || input.text.length > 1024 || /[^\x20-\x7e]/.test(input.text)))
    throw new Error("text must contain at most 1024 printable ASCII characters")

  return { observationId, action: action as InputAction, request: { ...input } }
}

function failureResult(prefix: string, error: unknown): ToolResult {
  const message = failureText(prefix, error)
  return textResult(message)
}

export function registerInputTools<TTool>(
  editor: DesktopToolEditor<TTool>,
  dependencies: BridgePermissionDependencies,
): void {
  const add = (tool: InputToolDefinition) => editor.add(tool as unknown as TTool)
  const execute = dependencies.executeBridge ?? runBridge

  add({
    name: "input",
    description:
      "Perform one bounded click, drag, scroll, key press, or printable-text action using a fresh desktop_capture observationId. For press_key use key (for example ctrl+p), not keyChord; scroll requires x and y. Requires read and desktop mutation permissions. Timed holds are limited to two seconds; use desktop_release to release held input.",
    input: {
      type: "object",
      properties: {
        observationId: { type: "string", minLength: 1, maxLength: 128 },
        action: { type: "string", enum: ACTIONS },
        x: coordinate,
        y: coordinate,
        fromX: coordinate,
        fromY: coordinate,
        toX: coordinate,
        toY: coordinate,
        button: { type: "integer", minimum: 1, maximum: 32 },
        clickCount: { type: "integer", minimum: 1, maximum: 10 },
        durationMs: duration,
        keyChord: { description: "Click modifiers only; for press_key put the entire chord in key.", oneOf: [{ type: "string", maxLength: 256 }, { type: "array", maxItems: 8, items: { type: "string", maxLength: 64 } }] },
        direction: { type: "string", enum: ["up", "down", "left", "right"] },
        amount: { type: "integer", minimum: 1, maximum: 100 },
        key: { description: "For press_key, a named key or complete chord such as escape or ctrl+p.", type: "string", minLength: 1, maxLength: 128 },
        text: { type: "string", maxLength: 1024, pattern: "^[\\x20-\\x7e]*$" },
      },
      required: ["observationId", "action"],
      additionalProperties: false,
    },
    options: { namespace: "desktop", codemode: true },
    execute: async (input, context) => {
      let request: ReturnType<typeof validateInput>
      try {
        request = validateInput(input)
      } catch (error) {
        return invalid(errorMessage(error))
      }
      const resource = permissionResource("input", request.action)
      await dependencies.assertPermission(permissionRequest(context, "read", resource))
      await dependencies.assertPermission(permissionRequest(context, "desktop_mutate", resource))

      let raw: string
      try {
        raw = await execute("input", request.request, context.signal)
      } catch (error) {
        return failureResult("Desktop input executor failed", error)
      }
      try {
        const response = parseBridgeResponse(raw, "Desktop input")
        return textResult(`Desktop ${request.action} completed: ${JSON.stringify(response)}`)
      } catch (error) {
        return failureResult("Desktop input failed", error)
      }
    },
  })

  add({
    name: "release",
    description: "Release all held desktop mouse buttons and keys through the GNOME bridge. This cleanup action requires desktop/input read permission but no mutation permission.",
    input: { type: "object", properties: {}, additionalProperties: false },
    // Content-only on purpose: a declared `output` schema makes the harness surface
    // that object instead of the content, and every return path would have to satisfy
    // it. A failure path that omits it fails with "did not return its declared output".
    options: { namespace: "desktop", codemode: true },
    execute: async (input, context) => {
      try {
        only(input, [])
      } catch (error) {
        return invalid(errorMessage(error))
      }
      await dependencies.assertPermission(permissionRequest(context, "read", permissionResource("input")))
      let raw: string
      try {
        raw = await execute("release", undefined, context.signal)
      } catch (error) {
        return failureResult("Desktop release executor failed", error)
      }
      try {
        const response = parseBridgeResponse(raw, "Desktop release")
        return textResult(`Released all held desktop input. ${JSON.stringify(response)}`)
      } catch (error) {
        return failureResult("Desktop release failed", error)
      }
    },
  })

  add({
    name: "launch",
    description:
      "Launch an installed GNOME application by exact desktop ID, then verify whether a matching new window appeared within five seconds. A successful launch does not imply that a window appeared.",
    input: {
      type: "object",
      properties: { desktopId: { type: "string", minLength: 3, maxLength: 128, pattern: "^[A-Za-z0-9._-]+$" } },
      required: ["desktopId"],
      additionalProperties: false,
    },
    options: { namespace: "desktop", codemode: true },
    execute: async (input, context) => {
      try {
        only(input, ["desktopId"])
      } catch (error) {
        return invalid(errorMessage(error))
      }
      if (typeof input.desktopId !== "string" || input.desktopId.length < 3 || input.desktopId.length > 128 ||
          !/^[A-Za-z0-9._-]+$/.test(input.desktopId) || !input.desktopId.includes("."))
        return invalid("desktopId must be a valid application desktop ID")

      const desktopId = input.desktopId
      await dependencies.assertPermission(permissionRequest(
        context,
        "desktop_mutate",
        permissionResource("launch", desktopId),
      ))

      let launchResponse: Record<string, unknown>
      try {
        const raw = await execute("launch", { desktopId }, context.signal)
        launchResponse = parseBridgeResponse(raw, "Desktop launch")
      } catch (error) {
        return failureResult("Desktop launch failed", error)
      }
      const beforeWindowIds = launchResponse.beforeWindowIds
      const launchToken = launchResponse.launchToken
      if (launchResponse.desktopId !== desktopId || typeof launchToken !== "string" ||
          launchToken.length < 1 || launchToken.length > 128 ||
          !Array.isArray(beforeWindowIds) ||
          beforeWindowIds.length > 256 || beforeWindowIds.some((id) => typeof id !== "string" || id.length < 1 || id.length > 128))
        return textResult("Desktop launch returned invalid confirmation data: invalid launch reply")

      let confirmation: Record<string, unknown>
      try {
        // The bridge binds confirmation to this launch capability, so a caller
        // cannot fabricate an "appeared" result or reuse someone else's.
        const raw = await execute("confirm", { launchToken, timeoutMs: 5000 }, context.signal)
        confirmation = parseBridgeResponse(raw, "Desktop launch confirmation")
      } catch (error) {
        return failureResult("Application launched, but window appearance could not be confirmed", error)
      }
      const windowIds = confirmation.windowIds
      if (typeof confirmation.appeared !== "boolean" || !Array.isArray(windowIds) ||
          windowIds.length > 256 || windowIds.some((id) => typeof id !== "string" || id.length < 1 || id.length > 128))
        return textResult("Application launched, but the bridge returned invalid confirmation data: invalid confirmation reply")

      const output = { launched: true, appeared: confirmation.appeared, windowIds, desktopId }
      return textResult(
        `${confirmation.appeared
          ? `Launched ${desktopId}; matching window(s) appeared: ${windowIds.join(", ")}.`
          : `Launched ${desktopId}, but no matching new window appeared within five seconds.`} ${JSON.stringify(output)}`,
      )
    },
  })
}
