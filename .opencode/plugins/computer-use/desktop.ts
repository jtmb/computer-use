/**
 * Bounded adapter around `scripts/desktop-control.py`.
 *
 * The Python utility owns AT-SPI traversal, preview tokens, and protected-field
 * handling. This module only builds a safe argv, runs it with a timeout, and
 * turns failures into model-readable text.
 */

import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

/** Repository root, derived from this plugin's location. */
export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
)

export const DESKTOP_CONTROL_SCRIPT = path.join(
  REPO_ROOT,
  "scripts",
  "desktop-control.py",
)

export const DESKTOP_CONTROL_TIMEOUT_MS = 30_000
export const DESKTOP_CONTROL_MAX_OUTPUT_BYTES = 256 * 1024

/** Bounds that keep a single traversal from exhausting the tool result budget. */
export const MAX_DEPTH_LIMIT = 40
export const MAX_NODES_LIMIT = 20_000
export const MAX_WAIT_SECONDS = 10
export const MAX_TEXT_LENGTH = 10_000
export const MAX_QUERY_LENGTH = 256

export type DesktopMutationVerb = "action" | "focus" | "set-text"

export interface DesktopMatchInput {
  app?: string
  appIndex?: number
  appId?: string
  name?: string
  exactName?: boolean
  role?: string
  showing?: boolean
  nth?: number
  maxDepth?: number
  maxNodes?: number
}

export interface DesktopCommandInput extends DesktopMatchInput {
  verb: "apps" | "tree" | "find" | DesktopMutationVerb
  all?: boolean
  includeText?: boolean
  action?: string
  text?: string
  waitSeconds?: number
  apply?: boolean
  expectToken?: string
}

export type DesktopArgResult = { args: string[] } | { error: string }

export interface DesktopPermissionRequest {
  sessionID: string
  agent: string
  source: { type: "tool"; messageID: string; id: string }
  action: string
  resources: string[]
  save: string[]
}

export interface DesktopToolContext {
  sessionID: string
  agent: string
  messageID: string
  id: string
  signal?: AbortSignal
}

type DesktopToolResult = {
  content: Array<
    | { type: "text"; text: string }
    | { type: "file"; uri: string; mime: string; name: string }
  >
}

type DesktopToolDefinition = {
  name: string
  description: string
  input: Record<string, unknown>
  options: { namespace: "desktop"; codemode: false }
  execute(input: Record<string, unknown>, context: DesktopToolContext): Promise<DesktopToolResult>
}

export interface DesktopToolEditor<TTool> {
  namespace(input: { name: string; description: string }): void
  add(tool: TTool): void
}

export interface DesktopToolDependencies {
  assertPermission(input: DesktopPermissionRequest): Promise<void>
  executeDesktop?: typeof executeDesktop
  screenshot?(
    input: { mode?: "screen" | "window" },
    signal?: AbortSignal,
  ): Promise<DesktopToolResult>
}

const DESKTOP_NAMESPACE = "desktop"
const DESKTOP_TOOL_OPTIONS = { namespace: DESKTOP_NAMESPACE, codemode: false } as const

function permissionSegment(value: string): string {
  return encodeURIComponent(value).replaceAll("*", "%2A")
}

function permissionResource(...parts: string[]): string {
  return [DESKTOP_NAMESPACE, ...parts.map(permissionSegment)].join("/")
}

function permissionRequest(
  context: DesktopToolContext,
  action: string,
  resource: string,
): DesktopPermissionRequest {
  return {
    sessionID: context.sessionID,
    agent: context.agent,
    source: { type: "tool", messageID: context.messageID, id: context.id },
    action,
    resources: [resource],
    save: [resource],
  }
}

async function assertDesktopPermission(
  dependencies: DesktopToolDependencies,
  context: DesktopToolContext,
  action: string,
  resource: string,
): Promise<void> {
  context.signal?.throwIfAborted()
  await dependencies.assertPermission(permissionRequest(context, action, resource))
  context.signal?.throwIfAborted()
}

function appResource(input: DesktopMatchInput): string {
  return input.appId ?? input.app ?? `#${input.appIndex ?? ""}`
}

function matchResource(input: DesktopMatchInput, operation: string): string {
  return permissionResource(
    operation,
    appResource(input),
    `name:${input.name ?? ""}`,
    `role:${input.role ?? ""}`,
  )
}

function actResource(input: DesktopCommandInput): string {
  return permissionResource(
    "act",
    appResource(input),
    input.verb,
    `name:${input.name ?? ""}`,
    `role:${input.role ?? ""}`,
    `nth:${input.nth ?? ""}`,
    `action:${input.action ?? ""}`,
  )
}

function textResult(text: string): DesktopToolResult {
  return { content: [{ type: "text", text }] }
}

const matchProperties = {
  app: {
    type: "string",
    description: "Application name from desktop_apps; exact match wins, else case-insensitive substring",
  },
  appIndex: {
    type: "integer",
    minimum: 1,
    maximum: 1000,
    description:
      "Point-in-time 1-based index from desktop_apps. Not stable across application-list changes; use appId for persistent handles.",
  },
  appId: {
    type: "string",
    pattern: "^app:[a-f0-9]{64}$",
    description: "Exact process-incarnation identity from desktop_apps. Refuses when that application exits; safe for persistent handles.",
  },
  name: { type: "string", description: "Accessible-name substring unless exactName" },
  exactName: { type: "boolean", description: "Match name exactly" },
  role: { type: "string", description: "Exact AT-SPI role name, case-insensitive" },
  showing: { type: "boolean", description: "Keep only showing and visible elements" },
  nth: {
    type: "integer",
    minimum: 1,
    description: "Nth match (1-based); required when several match",
  },
  maxDepth: {
    type: "integer",
    minimum: 1,
    maximum: 40,
    description: "Depth bound (default 30 matching, 12 tree)",
  },
  maxNodes: {
    type: "integer",
    minimum: 1,
    maximum: 20000,
    description: "Node bound (default 5000, 1000 tree)",
  },
} as const

const matchRequired = [] as const

export function registerDesktopTools<TTool>(
  editor: DesktopToolEditor<TTool>,
  dependencies: DesktopToolDependencies,
): void {
  editor.namespace({
    name: DESKTOP_NAMESPACE,
    description:
      "Native GNOME computer use: AT-SPI inspection and control plus request-owned window capture, " +
      "compositor input and application launch. Tools: capture, apps, tree, find, act, input, release, launch; " +
      "optional compositor bridge: windows, window_act, layout. Capture and input require the deployed, reviewed " +
      "Shell bridge and refuse when it is absent. This namespace may be truncated in the catalog; " +
      'if an entry above is missing, call search({ namespace: "desktop" }) to read its signature before calling it.',
  })

  const add = (tool: DesktopToolDefinition) => editor.add(tool as unknown as TTool)
  const execute = dependencies.executeDesktop ?? executeDesktop

  add({
    name: "apps",
    description:
      "List accessible AT-SPI applications as JSON (name, role, child count). Read-only. Call first to learn exact application names for desktop_tree, desktop_find, and desktop_act.",
    input: { type: "object", properties: {}, additionalProperties: false },
    options: DESKTOP_TOOL_OPTIONS,
    execute: async (_input, context) => {
      await assertDesktopPermission(dependencies, context, "read", permissionResource("apps"))
      return textResult(await execute({ verb: "apps" }, context.signal))
    },
  })

  add({
    name: "tree",
    description:
      "Dump the useful accessible elements of one GNOME application as JSON, with traversal completeness. Read-only. Use desktop_find when you already know the control name or role.",
    input: {
      type: "object",
      properties: {
        app: matchProperties.app,
        appIndex: matchProperties.appIndex,
        appId: matchProperties.appId,
        maxDepth: matchProperties.maxDepth,
        maxNodes: matchProperties.maxNodes,
        all: {
          type: "boolean",
          description: "Include nodes with no accessible name and no actions",
        },
        includeText: {
          type: "boolean",
          description: "Include text previews for non-sensitive text widgets; protected fields stay redacted",
        },
      },
      required: [...matchRequired],
      additionalProperties: false,
    },
    options: DESKTOP_TOOL_OPTIONS,
    execute: async (input, context) => {
      if (input.verb !== undefined) return textResult("Invalid desktop request: tree is read-only and does not accept verb")
      const request = { ...input, verb: "tree" } as DesktopCommandInput
      const built = buildDesktopArgs(request)
      if ("error" in built) return textResult(`Invalid desktop request: ${built.error}`)
      await assertDesktopPermission(
        dependencies,
        context,
        "read",
        permissionResource("tree", appResource(request)),
      )
      return textResult(await execute(request, context.signal))
    },
  })

  add({
    name: "find",
    description:
      "Find elements in one GNOME application by name and/or role as JSON, with traversal completeness. Read-only. When several match, the result lists them and requires an explicit nth.",
    input: {
      type: "object",
      properties: {
        ...matchProperties,
        includeText: {
          type: "boolean",
          description: "Include text previews for non-sensitive text widgets; protected fields stay redacted",
        },
      },
      required: [...matchRequired],
      additionalProperties: false,
    },
    options: DESKTOP_TOOL_OPTIONS,
    execute: async (input, context) => {
      if (input.verb !== undefined) return textResult("Invalid desktop request: find is read-only and does not accept verb")
      const request = { ...input, verb: "find" } as DesktopCommandInput
      const built = buildDesktopArgs(request)
      if ("error" in built) return textResult(`Invalid desktop request: ${built.error}`)
      await assertDesktopPermission(
        dependencies,
        context,
        "read",
        matchResource(request, "find"),
      )
      return textResult(await execute(request, context.signal))
    },
  })

  add({
    name: "act",
    description:
      "Invoke an accessibility action, move keyboard focus, or replace an editable field's text in a GNOME application over AT-SPI. Preview by default; the preview returns a short-lived target_token, and you must call again with apply=true and expectToken set to that exact token to execute. Take a fresh desktop_screenshot afterwards to verify the visible result. Password and protected fields are refused. Ask the user before anything consequential.",
    input: {
      type: "object",
      properties: {
        ...matchProperties,
        verb: {
          type: "string",
          enum: ["action", "focus", "set-text"],
          description:
            "action invokes an advertised action; focus moves keyboard focus; set-text replaces an editable field's text",
        },
        action: {
          type: "string",
          description: "Action name advertised by desktop_tree or desktop_find for verb=action (default: click)",
        },
        text: {
          type: "string",
          maxLength: MAX_TEXT_LENGTH,
          description: "Text to write for verb=set-text",
        },
        waitSeconds: {
          type: "number",
          exclusiveMinimum: 0,
          maximum: MAX_WAIT_SECONDS,
          description: "Seconds to wait for focus or text readback with verb=focus or set-text (default 2)",
        },
        apply: {
          type: "boolean",
          description: "Execute the mutation instead of previewing it; requires expectToken",
        },
        expectToken: {
          type: "string",
          description: "target_token returned by the immediately preceding preview call",
        },
      },
      required: ["verb", ...matchRequired],
      additionalProperties: false,
    },
    options: DESKTOP_TOOL_OPTIONS,
    execute: async (input, context) => {
      const verb = input.verb
      if (verb !== "action" && verb !== "focus" && verb !== "set-text") {
        return textResult("Invalid desktop request: verb must be action, focus, or set-text")
      }
      const request: DesktopCommandInput = { ...input, verb }
      const built = buildDesktopArgs(request)
      if ("error" in built) return textResult(`Invalid desktop request: ${built.error}`)

      const resource = actResource(request)
      await assertDesktopPermission(dependencies, context, "read", resource)
      if (request.apply === true) {
        await assertDesktopPermission(dependencies, context, "desktop_mutate", resource)
        await assertDesktopPermission(dependencies, context, "edit", resource)
        const token = request.expectToken?.match(/^(\d{16,22}):([a-f0-9]{64})$/)
        if (token && Date.now() - Number(BigInt(token[1]) / 1_000_000n) > 25_000) {
          // Human approval can outlast the 30 s freshness window. Refresh only
          // the timestamp, never silently rebind to a different target.
          const { apply: _apply, expectToken: _token, ...previewRequest } = request
          const previewText = await execute(previewRequest, context.signal)
          context.signal?.throwIfAborted()
          let fresh: unknown
          try { fresh = JSON.parse(previewText) } catch { return textResult("The target could not be rechecked after approval; observe again before retrying.") }
          const freshToken = (fresh as { dry_run?: boolean; target_token?: string })?.target_token
          if (!(fresh as { dry_run?: boolean })?.dry_run || typeof freshToken !== "string" || freshToken.split(":")[1] !== token[2]) {
            return textResult("The target changed while awaiting approval; no action was applied. Observe again before retrying.")
          }
          request.expectToken = freshToken
        }
      }
      return textResult(await execute(request, context.signal))
    },
  })
}

function tooLong(label: string, value: string, limit: number): string | undefined {
  return value.length > limit
    ? `${label} is longer than ${limit} characters`
    : undefined
}

function checkBounds(input: DesktopMatchInput): string | undefined {
  if (input.maxDepth !== undefined) {
    if (!Number.isInteger(input.maxDepth) || input.maxDepth < 1 || input.maxDepth > MAX_DEPTH_LIMIT) {
      return `maxDepth must be an integer from 1 to ${MAX_DEPTH_LIMIT}`
    }
  }
  if (input.maxNodes !== undefined) {
    if (!Number.isInteger(input.maxNodes) || input.maxNodes < 1 || input.maxNodes > MAX_NODES_LIMIT) {
      return `maxNodes must be an integer from 1 to ${MAX_NODES_LIMIT}`
    }
  }
  if (input.nth !== undefined && (!Number.isInteger(input.nth) || input.nth < 1)) {
    return "nth must be a positive integer"
  }
  return undefined
}

function pushBounds(args: string[], input: DesktopMatchInput): void {
  if (input.maxDepth !== undefined) args.push("--max-depth", String(input.maxDepth))
  if (input.maxNodes !== undefined) args.push("--max-nodes", String(input.maxNodes))
}

function pushMatcher(args: string[], input: DesktopMatchInput): void {
  if (input.name !== undefined) args.push("--name", input.name)
  if (input.exactName) args.push("--exact-name")
  if (input.role !== undefined) args.push("--role", input.role)
  if (input.showing) args.push("--showing")
  if (input.nth !== undefined) args.push("--nth", String(input.nth))
}

/**
 * Exactly one selector. Only appId binds a process incarnation; appIndex is a
 * point-in-time convenience, never stable identity for a persistent handle.
 */
function pushApp(args: string[], input: DesktopMatchInput): string | undefined {
  if ([input.app, input.appIndex, input.appId].filter(value => value !== undefined).length > 1) {
    if (input.appId !== undefined) return "use exactly one of app, appIndex or appId"
    return "use app or appIndex, not both"
  }
  if (input.appId !== undefined) {
    if (typeof input.appId !== "string" || !/^app:[a-f0-9]{64}$/.test(input.appId)) return "appId must be an exact identity from desktop_apps"
    args.push("--app-id", input.appId)
    return undefined
  }
  if (input.appIndex !== undefined) {
    if (!Number.isSafeInteger(input.appIndex) || input.appIndex < 1 || input.appIndex > 1000) {
      return "appIndex must be an integer from 1 to 1000"
    }
    args.push("--app-index", String(input.appIndex))
    return undefined
  }
  if (input.app === undefined) return "an application name or appIndex is required"
  args.push("--app", input.app)
  return undefined
}

/**
 * Build the argv for `desktop-control.py`.
 *
 * Validates the request here so an invalid combination never reaches the
 * Python utility, and so mutation requests cannot omit the preview token.
 */
export function buildDesktopArgs(input: DesktopCommandInput): DesktopArgResult {
  const boundsError = checkBounds(input)
  if (boundsError) return { error: boundsError }

  if (input.app !== undefined) {
    const appError = tooLong("app", input.app, MAX_QUERY_LENGTH)
    if (appError) return { error: appError }
  }
  if (input.name !== undefined) {
    const nameError = tooLong("name", input.name, MAX_QUERY_LENGTH)
    if (nameError) return { error: nameError }
  }
  if (input.role !== undefined) {
    const roleError = tooLong("role", input.role, MAX_QUERY_LENGTH)
    if (roleError) return { error: roleError }
  }

  const args: string[] = [input.verb]

  if (input.verb === "apps" || input.verb === "tree" || input.verb === "find") {
    // Reject mutation-only fields on read verbs instead of silently ignoring
    // them, so a model cannot believe it applied a change it only previewed.
    for (const field of ["action", "text", "waitSeconds", "apply", "expectToken"] as const) {
      if (input[field] !== undefined) {
        return { error: `${field} is only valid with a mutation verb` }
      }
    }
  }

  if (input.verb === "tree") {
    for (const field of ["name", "exactName", "role", "showing", "nth"] as const) {
      if (input[field] !== undefined) {
        return { error: `${field} is not supported with tree` }
      }
    }
  }

  switch (input.verb) {
    case "apps":
      return { args }

    case "tree": {
      if (input.app === undefined && input.appIndex === undefined && input.appId === undefined) {
        return { error: "tree requires an application name or appIndex" }
      }
      const appError = pushApp(args, input)
      if (appError) return { error: appError }
      pushBounds(args, input)
      if (input.all) args.push("--all")
      if (input.includeText) args.push("--include-text")
      return { args }
    }

    case "find": {
      if (input.app === undefined && input.appIndex === undefined && input.appId === undefined) {
        return { error: "find requires an application name or appIndex" }
      }
      if (!input.name && !input.role) return { error: "find requires a name and/or role" }
      const appError = pushApp(args, input)
      if (appError) return { error: appError }
      pushMatcher(args, input)
      pushBounds(args, input)
      if (input.includeText) args.push("--include-text")
      return { args }
    }

    case "action":
    case "focus":
    case "set-text": {
      const verb = input.verb
      if (input.app === undefined && input.appIndex === undefined && input.appId === undefined) {
        return { error: `${verb} requires an application name or appIndex` }
      }
      if (verb === "action" && !input.name) {
        return { error: "action requires a name (desktop-control.py requires --name for actions)" }
      }
      if (verb !== "action" && !input.name && !input.role) {
        return { error: `${verb} requires a name and/or role` }
      }
      if (verb !== "action" && input.action !== undefined) {
        return { error: "action is only valid with the action verb" }
      }
      if (verb === "set-text" && input.text === undefined) {
        return { error: "set-text requires text" }
      }
      if (verb !== "set-text" && input.text !== undefined) {
        return { error: "text is only valid with the set-text verb" }
      }
      if (verb === "action" && input.waitSeconds !== undefined) {
        return { error: "waitSeconds is only valid with the focus and set-text verbs" }
      }
      if (input.text !== undefined) {
        const textError = tooLong("text", input.text, MAX_TEXT_LENGTH)
        if (textError) return { error: textError }
      }
      if (input.waitSeconds !== undefined) {
        if (!(input.waitSeconds > 0) || input.waitSeconds > MAX_WAIT_SECONDS) {
          return { error: `waitSeconds must be greater than 0 and at most ${MAX_WAIT_SECONDS}` }
        }
      }
      if (input.expectToken !== undefined && !input.apply) {
        return { error: "expectToken is only valid together with apply=true" }
      }
      if (input.apply && !input.expectToken) {
        return { error: "apply=true requires expectToken from a preview result" }
      }

      const appError = pushApp(args, input)
      if (appError) return { error: appError }
      pushMatcher(args, input)
      pushBounds(args, input)
      if (verb === "action" && input.action !== undefined) args.push("--action", input.action)
      if (verb === "set-text" && input.text !== undefined) args.push("--text", input.text)
      if (verb !== "action" && input.waitSeconds !== undefined) {
        args.push("--wait-seconds", String(input.waitSeconds))
      }
      if (input.apply && input.expectToken) {
        args.push("--expect-token", input.expectToken, "--apply")
      }
      return { args }
    }

    default:
      return { error: `unsupported verb: ${String(input.verb)}` }
  }
}

function truncateUtf8(value: string, maximumBytes: number): string {
  const bytes = Buffer.from(value, "utf8")
  if (bytes.length <= maximumBytes) return value
  const decodeWithin = (limit: number) => {
    let end = Math.min(limit, bytes.length)
    let sequenceStart = end - 1
    while (sequenceStart >= 0 && (bytes[sequenceStart] & 0xc0) === 0x80) sequenceStart--
    if (sequenceStart >= 0) {
      const lead = bytes[sequenceStart]
      const sequenceLength =
        lead <= 0x7f ? 1 :
          lead >= 0xc2 && lead <= 0xdf ? 2 :
            lead >= 0xe0 && lead <= 0xef ? 3 :
              lead >= 0xf0 && lead <= 0xf4 ? 4 : 1
      if (sequenceStart + sequenceLength > end) end = sequenceStart
    }
    return bytes.subarray(0, end).toString("utf8")
  }
  const marker = "\n...[truncated]"
  const markerBytes = Buffer.byteLength(marker, "utf8")
  if (maximumBytes <= markerBytes) {
    return decodeWithin(maximumBytes)
  }
  return `${decodeWithin(maximumBytes - markerBytes)}${marker}`
}

/**
 * Condense a helper's JSON failure into one line.
 *
 * The helpers print `{"available":..,"ok":false,"error":"<kind>","detail":"<why>"}`.
 * Dumping that verbatim into a tool result buries the reason the model needs, so a
 * parsable failure becomes `error — detail` (bounded) instead.
 */
function condensedJsonFailure(stdout: string | undefined): string {
  const text = stdout?.trim()
  if (!text || text.startsWith("{") === false) return ""
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return ""
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return ""
  const record = parsed as Record<string, unknown>
  const kind = typeof record.error === "string" ? record.error.trim() : ""
  const detail = typeof record.detail === "string" ? record.detail.trim() : ""
  if (!kind && !detail) return ""
  const summary = [kind, detail].filter(Boolean).join(" — ")
  return summary.length > 300 ? `${summary.slice(0, 297)}...` : summary
}

function formatFailureOutput(
  stdout: string | undefined,
  stderr: string | undefined,
  maximumBytes: number,
): string {
  const condensed = condensedJsonFailure(stdout)
  if (condensed) {
    // Truncate by bytes, not characters: a multibyte reason would otherwise exceed
    // the caller's byte budget even after slicing.
    return truncateUtf8(`reason: ${condensed}`, maximumBytes)
  }
  const sections = [
    { label: "stdout", text: stdout?.trim() ?? "" },
    { label: "stderr", text: stderr?.trim() ?? "" },
  ].filter((section) => section.text.length > 0)
  if (sections.length === 0) return ""

  const separator = "\n\n"
  const headingBytes = sections.reduce(
    (total, section) => total + Buffer.byteLength(`${section.label}:\n`, "utf8"),
    0,
  ) + Buffer.byteLength(separator, "utf8") * (sections.length - 1)
  const contentBudget = Math.max(0, maximumBytes - headingBytes)
  const contentLimits = sections.length === 1
    ? [contentBudget]
    : [Math.floor(contentBudget / 2), Math.ceil(contentBudget / 2)]

  return sections
    .map((section, index) => {
      const content = truncateUtf8(section.text, contentLimits[index])
      return `${section.label}:\n${content}`
    })
    .join(separator)
}

export function describeDesktopFailure(error: unknown, mutating = false): string {
  const failure = error as {
    code?: number | string
    killed?: boolean
    name?: string
    stdout?: string
    stderr?: string
    message?: string
  }
  const code = typeof failure.code === "number" ? failure.code : "unknown"
  let reason = ""
  let mayHaveApplied = false
  if (failure.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
    reason = `output exceeded ${DESKTOP_CONTROL_MAX_OUTPUT_BYTES} bytes; narrow the query`
  } else if (failure.name === "AbortError") {
    reason = "was cancelled"
    mayHaveApplied = mutating
  } else if (failure.killed) {
    reason = `timed out after ${DESKTOP_CONTROL_TIMEOUT_MS / 1000}s`
    mayHaveApplied = mutating
  }

  const prefix = `desktop-control.py failed (exit ${code})${reason ? `: ${reason}` : ""}`
  const availableBytes = DESKTOP_CONTROL_MAX_OUTPUT_BYTES - Buffer.byteLength(prefix, "utf8") - 1
  const output = formatFailureOutput(failure.stdout, failure.stderr, availableBytes)
  // A kill stops the helper after the toolkit may have accepted the mutation, so
  // the caller must observe again instead of retrying the whole request.
  const caveat = mayHaveApplied
    ? "\nThe request may already have been applied or dispatched before it stopped; observe the window again before retrying."
    : ""
  const result = output
    ? `${prefix}\n${output}${caveat}`
    : `${prefix}: ${failure.message || reason || "unknown failure"}${caveat}`
  return truncateUtf8(result, DESKTOP_CONTROL_MAX_OUTPUT_BYTES)
}

/** Runs the Python utility with a timeout, output cap, and cancellation. */
export function runDesktopControl(
  args: string[],
  signal?: AbortSignal,
  script: string = DESKTOP_CONTROL_SCRIPT,
  mutating = false,
): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      "python3",
      [script, ...args],
      {
        timeout: DESKTOP_CONTROL_TIMEOUT_MS,
        maxBuffer: DESKTOP_CONTROL_MAX_OUTPUT_BYTES,
        encoding: "utf8",
        signal,
      },
      (error, stdout, stderr) => {
        if (error) {
          resolve(describeDesktopFailure(Object.assign(error, { stdout, stderr }), mutating))
          return
        }
        resolve(stdout.trim() || "(desktop-control.py returned no output)")
      },
    )
  })
}

/** Validate and run one desktop request. */
export async function executeDesktop(
  input: DesktopCommandInput,
  signal?: AbortSignal,
): Promise<string> {
  const built = buildDesktopArgs(input)
  if ("error" in built) return `Invalid desktop request: ${built.error}`
  return runDesktopControl(built.args, signal, DESKTOP_CONTROL_SCRIPT, input.apply === true)
}
