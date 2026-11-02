import { createHash } from "node:crypto"
import { createCredentialSafety, type CredentialSafety } from "./credential-safety.ts"
import {
  spawnSecretEntry,
  type SecretEntryResult,
  type SecretEntrySpec,
} from "../../../tools/computer-use-runtime/src/index.ts"

import {
  BrowserBackendError,
  BROWSER_ERROR_CODES,
  MAX_SNAPSHOT_BYTES,
  createBrowserManager,
  type BrowserManager,
  type BrowserOperation,
  type BrowserErrorCode,
  type TabSummary,
} from "../../../tools/computer-use-browser/src/index.ts"
import type { AuthGuardRuntime, AuthGuardView } from "../../../tools/computer-use-runtime/src/index.ts"

type Request = Record<string, unknown>
type TextPart = { type: "text"; text: string }
type FilePart = { type: "file"; uri: string; mime: string; name: string }
type BrowserToolResult = { content: Array<TextPart | FilePart> }

export interface BrowserPermissionRequest {
  sessionID: string
  agent: string
  source: { type: "tool"; messageID: string; id: string }
  action: "browser_open" | "browser_act" | "browser_read" | "browser_close"
  resources: string[]
  save: string[]
}

export interface BrowserToolContext {
  sessionID: string
  agent: string
  messageID: string
  id: string
  signal?: AbortSignal
}

export interface BrowserToolEditor<TTool> {
  namespace(input: { name: string; description: string }): void
  add(tool: TTool): void
}

type GuardDependency =
  | Pick<AuthGuardRuntime, "guard">
  | Pick<AuthGuardView, "getState">

/** The parts of the guard a private sign-in needs. */
type SignInDependency = Pick<AuthGuardRuntime, "signInPath" | "userActions">

type SignInDialog = (spec: SecretEntrySpec, options: { signal?: AbortSignal }) => Promise<SecretEntryResult>

export interface BrowserToolDependencies {
  assertPermission(request: BrowserPermissionRequest): Promise<void>
  manager?: BrowserManager
  createManager?: () => BrowserManager
  dataDirectory?: string
  authGuard?: GuardDependency
  /** Injectable dialog transport; defaults to the runtime helper. */
  signInDialog?: SignInDialog
  /** Shared with the desktop surface so a filled tab blocks compositor capture too. */
  credentialSafety?: CredentialSafety
}

export type BrowserToolDefinition = {
  name: string
  description: string
  input: Record<string, unknown>
  options: { namespace: "web"; codemode: true }
  execute(input: Request, context: BrowserToolContext): Promise<BrowserToolResult>
}

const TOOL_OPTIONS = { namespace: "web", codemode: true } as const
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024
const MAX_TEXT_LENGTH = 8_192
const MAX_SNAPSHOT_DEPTH = 40

const BACKEND_ERROR_TEXT: Record<BrowserErrorCode, string> = {
  INVALID_INPUT: "The browser request was invalid.",
  PROFILE_INVALID: "The isolated browser profile could not be prepared safely.",
  PROFILE_LOCKED: "The isolated browser profile is already in use.",
  CAPACITY_EXCEEDED: "The browser worker limit has been reached.",
  FOREIGN_TAB: "That tab does not belong to this session's browser worker.",
  TAB_LIMIT: "The browser worker has reached its tab limit.",
  TAB_PROTECTED: "User-owned tabs cannot be closed by the browser tool.",
  STALE_REF: "The element reference is no longer valid; take a fresh snapshot.",
  SNAPSHOT_TOO_LARGE: "The accessibility snapshot exceeds the browser text budget.",
  SCREENSHOT_TOO_LARGE: "The browser screenshot is invalid or exceeds its byte limit.",
  UPLOAD_INVALID: "The upload request is invalid.",
  WORKER_CRASHED: "The browser worker stopped unexpectedly; reopen the browser session.",
  WORKER_START_FAILED: "The browser worker could not be started.",
  CANCELLED: "The browser operation was cancelled; an already-dispatched page action may still have completed.",
  OPERATION_FAILED: "The browser operation failed.",
  PROTOCOL_INVALID: "The browser worker returned an invalid response.",
  SESSION_STATE: "The browser session is not in a state that can perform this operation.",
  AUTH_GUARD_BLOCKED: "Browser operations are blocked while private sign-in is active.",
  CREDENTIAL_FILL_BLOCKED: "The protected credential operation was refused.",
  CREDENTIAL_TARGET_INVALID: "The protected credential target is no longer valid.",
  CREDENTIAL_FILL_UNCERTAIN: "The protected credential fill may have changed the page; close its browser before observation.",
}

function textResult(text: string): BrowserToolResult {
  return { content: [{ type: "text", text }] }
}

function jsonResult(value: unknown): BrowserToolResult {
  return textResult(JSON.stringify(value))
}

function only(input: Request, allowed: readonly string[]): void {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Expected an object")
  }
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) throw new Error(`Unsupported field: ${key}`)
  }
}

function stringField(value: unknown, name: string, maximum = 8_192): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    throw new Error(`${name} must be a non-empty string no longer than ${maximum} characters`)
  }
}

function httpUrl(value: unknown): asserts value is string {
  stringField(value, "url")
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error("url must be a valid HTTP or HTTPS URL")
  }
  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) {
    throw new Error("url must use HTTP or HTTPS and must not contain embedded credentials")
  }
}

function permissionResource(...parts: string[]): string {
  return ["web", ...parts.map((part) => encodeURIComponent(part).replaceAll("*", "%2A"))].join("/")
}

function permissionRequest(
  context: BrowserToolContext,
  action: BrowserPermissionRequest["action"],
  resource: string,
): BrowserPermissionRequest {
  return {
    sessionID: context.sessionID,
    agent: context.agent,
    source: { type: "tool", messageID: context.messageID, id: context.id },
    action,
    resources: [resource],
    save: [resource],
  }
}

const CRASH_HINT_VALUES = Object.freeze({
  readiness: new Set(["not-observed", "observed"]),
  childEvent: new Set(["exit", "spawn-error", "unknown"]),
  signal: new Set(["SIGTERM", "SIGKILL", "SIGABRT", "SIGSEGV", "SIGPIPE", "SIGINT", "SIGHUP", "other"]),
});

/** Render only the fixed crash vocabulary; hostile or malformed metadata renders nothing. */
function crashHint(error: unknown): string {
  try {
    if (!(error instanceof BrowserBackendError)) return "";
    const descriptor = Object.getOwnPropertyDescriptor(error, "crashMetadata");
    if (!descriptor || !("value" in descriptor)) return "";
    const metadata = descriptor.value;
    if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) return "";
    const own = (key: string): unknown => {
      const item = Object.getOwnPropertyDescriptor(metadata, key);
      return item && "value" in item ? item.value : undefined;
    };
    const readiness = own("readiness");
    const childEvent = own("childEvent");
    const exitCode = own("exitCode");
    const signal = own("signal");
    if (typeof readiness !== "string" || !CRASH_HINT_VALUES.readiness.has(readiness)) return "";
    if (typeof childEvent !== "string" || !CRASH_HINT_VALUES.childEvent.has(childEvent)) return "";
    const codeText = exitCode === null
      ? "null"
      : typeof exitCode === "number" && Number.isSafeInteger(exitCode) && exitCode >= 0 && exitCode <= 255
        ? String(exitCode)
        : "";
    if (codeText === "") return "";
    if (!(signal === null || (typeof signal === "string" && CRASH_HINT_VALUES.signal.has(signal)))) return "";
    return ` [readiness=${readiness} child=${childEvent} exit=${codeText} signal=${signal === null ? "null" : signal}]`;
  } catch {
    return "";
  }
}

function backendFailure(error: unknown): BrowserToolResult {
  const code = error && typeof error === "object" && "code" in error
    ? (error as { code?: unknown }).code
    : undefined
  if (typeof code === "string" && (BROWSER_ERROR_CODES as readonly string[]).includes(code)) {
    const friendly = BACKEND_ERROR_TEXT[code as BrowserErrorCode]
    // A startup failure is often an environment problem (missing sandbox,
    // unwritable profile) that the user must act on, so surface its bounded
    // cause. Other codes keep withholding raw detail.
    const carriesDetail = code === "WORKER_START_FAILED" || code === "OPERATION_FAILED"
    const message = carriesDetail && error && typeof (error as { message?: unknown }).message === "string"
      ? (error as { message: string }).message
      : ""
    // The backend only attaches a bounded reason it is safe to show (a Chromium network
    // failure name such as ERR_CERT_AUTHORITY_INVALID), so surface it instead of dropping
    // the one detail that explains the failure.
    const detail = carriesDetail && message && !friendly.includes(message)
      ? ` ${message.slice(0, 300)}`
      : ""
    const hint = code === "WORKER_CRASHED" ? crashHint(error) : ""
    return textResult(`Browser error (${code}): ${friendly}${detail}${hint}`)
  }
  return textResult("Browser operation failed. Raw backend details were withheld.")
}

function guardState(guard: GuardDependency | undefined): string {
  if (!guard) {
    // Until the private-entry stage injects this guard, the adapter cannot independently preflight sign-in state.
    return "idle"
  }
  if ("guard" in guard) return guard.guard.getState()
  return guard.getState()
}

function managerError(error: unknown): BrowserToolResult {
  if (error instanceof BrowserBackendError || (
    error && typeof error === "object" && "code" in error &&
    (BROWSER_ERROR_CODES as readonly string[]).includes(String((error as { code: unknown }).code))
  )) return backendFailure(error)
  return backendFailure(undefined)
}

function truncateUtf8(value: string, maximumBytes: number): string {
  const bytes = Buffer.from(value, "utf8")
  if (bytes.byteLength <= maximumBytes) return value
  const marker = "\n...[truncated]"
  const markerBytes = Buffer.byteLength(marker, "utf8")
  const appendMarker = maximumBytes > markerBytes
  const limit = appendMarker ? maximumBytes - markerBytes : maximumBytes
  let end = limit
  if (end < bytes.byteLength) {
    let sequenceStart = end
    while (sequenceStart > 0 && (bytes[sequenceStart]! & 0xc0) === 0x80) sequenceStart -= 1
    const lead = bytes[sequenceStart]!
    const sequenceLength = lead <= 0x7f ? 1 : lead <= 0xdf ? 2 : lead <= 0xef ? 3 : 4
    if (sequenceStart + sequenceLength > end) end = sequenceStart
  }
  return `${bytes.subarray(0, end).toString("utf8")}${appendMarker ? marker : ""}`
}

function atDepth(snapshot: string, depth?: number): string {
  return depth === undefined
    ? snapshot
    : snapshot.split("\n").filter((line) => {
      const indentation = line.match(/^[\t ]*/u)?.[0].replaceAll("\t", "  ").length ?? 0
      return Math.floor(indentation / 2) <= depth
    }).join("\n")
}

function snapshotResult(tabId: string, generation: number, snapshot: string): BrowserToolResult {
  let low = 0
  let high = MAX_SNAPSHOT_BYTES
  let best = JSON.stringify({ tabId, generation, snapshot: "" })
  while (low <= high) {
    const budget = Math.floor((low + high) / 2)
    const candidate = JSON.stringify({ tabId, generation, snapshot: truncateUtf8(snapshot, budget) })
    if (Buffer.byteLength(candidate, "utf8") <= MAX_SNAPSHOT_BYTES) {
      best = candidate
      low = budget + 1
    } else {
      high = budget - 1
    }
  }
  return textResult(best)
}

function isTabSummary(value: unknown): value is TabSummary {
  return !!value && typeof value === "object" &&
    typeof (value as TabSummary).id === "string" &&
    typeof (value as TabSummary).url === "string" &&
    typeof (value as TabSummary).title === "string"
}

function snapshotKey(sessionID: string, tabId: string): string {
  return `${sessionID}\0${tabId}`
}

export function registerBrowserTools<TTool>(
  editor: BrowserToolEditor<TTool>,
  dependencies: BrowserToolDependencies,
): { dispose(): Promise<void> } {
  let manager = dependencies.manager
  let disposed = false
  const currentGenerations = new Map<string, number>()
  const credentialSafety: CredentialSafety = dependencies.credentialSafety ?? createCredentialSafety()
  const projectKey = createHash("sha256").update(process.cwd()).digest("hex").slice(0, 32)

  const getManager = (): BrowserManager => {
    // The manager gets the same guard the tools use, so the fill gate and the
    // sign-in state are one source of truth rather than two opinions.
    const signIn = signInParts(dependencies.authGuard)
    manager ??= dependencies.createManager?.() ?? createBrowserManager(signIn ? { authGuard: signIn } : {})
    return manager
  }

  const add = (tool: BrowserToolDefinition) => editor.add(tool as unknown as TTool)

  // The guard is one instance per plugin load, so recovery must only be performed by the
  // session whose sign-in is active — otherwise another session could unblock it.
  let signInOwner: string | null = null

  /** The guard's sign-in parts, when the injected dependency actually provides them. */
  const signInParts = (
    guard: GuardDependency | undefined,
  ): (SignInDependency & Pick<AuthGuardRuntime, "guard" | "operatorActions">) | undefined => {
    if (!guard) return undefined
    const candidate = guard as Partial<AuthGuardRuntime>
    if (!candidate.signInPath || !candidate.userActions || !candidate.guard || !candidate.operatorActions) return undefined
    return {
      guard: candidate.guard,
      signInPath: candidate.signInPath,
      userActions: candidate.userActions,
      operatorActions: candidate.operatorActions,
    }
  }

  /** Failures raised before the worker types anything into the page. */
  const FILL_NEVER_REACHED_THE_PAGE: ReadonlySet<string> = new Set([
    "CREDENTIAL_TARGET_INVALID",
    "CREDENTIAL_FILL_BLOCKED",
    "INVALID_INPUT",
    "STALE_REF",
    "FOREIGN_TAB",
    "TAB_PROTECTED",
  ])

  const run = async (
    context: BrowserToolContext,
    action: BrowserPermissionRequest["action"],
    resource: string,
    operation: () => Promise<BrowserToolResult>,
    additionalPermissions: Array<{ action: BrowserPermissionRequest["action"]; resource: string }> = [],
  ): Promise<BrowserToolResult> => {
    if (disposed) return textResult("Browser tools were unloaded; this operation did not run.")
    if (context.signal?.aborted) return backendFailure(new BrowserBackendError("CANCELLED", BACKEND_ERROR_TEXT.CANCELLED))
    try {
      await dependencies.assertPermission(permissionRequest(context, action, resource))
    } catch (error) {
      if (context.signal?.aborted) return backendFailure(new BrowserBackendError("CANCELLED", BACKEND_ERROR_TEXT.CANCELLED))
      throw error
    }
    if (context.signal?.aborted) return backendFailure(new BrowserBackendError("CANCELLED", BACKEND_ERROR_TEXT.CANCELLED))
    for (const permission of additionalPermissions) {
      try {
        await dependencies.assertPermission(permissionRequest(context, permission.action, permission.resource))
      } catch (error) {
        if (context.signal?.aborted) return backendFailure(new BrowserBackendError("CANCELLED", BACKEND_ERROR_TEXT.CANCELLED))
        throw error
      }
      if (context.signal?.aborted) return backendFailure(new BrowserBackendError("CANCELLED", BACKEND_ERROR_TEXT.CANCELLED))
    }
    if (disposed) return textResult("Browser tools were unloaded; this operation did not run.")
    let state: string
    try {
      state = guardState(dependencies.authGuard)
    } catch {
      return textResult("Browser operation refused because the private-sign-in guard could not be inspected.")
    }
    // Closing the worker discards the pages, so it is the safe way out of an uncertain
    // sign-in: nothing can be observed afterwards. It is not allowed while a fill is in
    // flight, because interrupting one is what creates the uncertainty in the first place.
    const recoveryClose = action === "browser_close" && (state === "submitted-uncertain" || state === "blocked")
    if (state !== "idle" && !recoveryClose) {
      return textResult(`Browser operation refused while private sign-in is ${state}.`)
    }
    if (context.signal?.aborted) return backendFailure(new BrowserBackendError("CANCELLED", BACKEND_ERROR_TEXT.CANCELLED))
    try {
      return await operation()
    } catch (error) {
      if (context.signal?.aborted) return backendFailure(new BrowserBackendError("CANCELLED", BACKEND_ERROR_TEXT.CANCELLED))
      return managerError(error)
    }
  }

  const ensureRunning = async (sessionID: string, browser: BrowserManager, signal?: AbortSignal): Promise<void> => {
    const session = browser.listSessions().find((item) => item.sessionId === sessionID)
    if (session?.status === "running") return
    if (session?.status === "crashed") {
      for (const key of currentGenerations.keys()) {
        if (key.startsWith(`${sessionID}\0`)) currentGenerations.delete(key)
      }
      await browser.restart(sessionID, signal)
      return
    }
    if (session) throw new BrowserBackendError("SESSION_STATE", "The browser session is already changing state.")
    if (!dependencies.dataDirectory) {
      throw new BrowserBackendError("PROFILE_INVALID", "The discovered OpenCode data directory was not provided.")
    }
    // When a sign-in capable guard exists, sessions start in the protected auth-flow
    // context so a private sign-in can target a page the model already opened. The
    // protection is the guard plus the manager's fillCredential gate, not this flag;
    // the flag only blocks service workers, which a tool browser does not need.
    // Without such a guard the session starts normally and `signin` reports
    // unavailable rather than pretending.
    const protectedContext = signInParts(dependencies.authGuard) !== undefined
    await browser.start({
      sessionId: sessionID,
      projectKey,
      opencodeDataDir: dependencies.dataDirectory,
      ...(protectedContext ? { authFlow: true } : {}),
    }, signal)
  }

  const tool = (name: string, description: string, input: Record<string, unknown>, execute: BrowserToolDefinition["execute"]) => {
    add({ name, description, input, options: TOOL_OPTIONS, execute })
  }

  editor.namespace({
    name: "web",
    description: "Session-isolated browser tools for opening tabs, reading page structure, and interacting with current snapshot references.",
  })

  tool(
    "open",
    "Start this OpenCode session's isolated browser worker if needed, open a new tab, and navigate to an HTTP(S) URL.",
    {
      type: "object",
      properties: { url: { type: "string", minLength: 1, maxLength: 8_192 } },
      required: ["url"],
      additionalProperties: false,
    },
    async (input, context) => {
      try {
        only(input, ["url"])
        httpUrl(input.url)
      } catch (error) {
        return textResult(`Invalid browser request: ${error instanceof Error ? error.message : "invalid input"}`)
      }
      return run(context, "browser_open", permissionResource("url", input.url), async () => {
        const browser = getManager()
        await ensureRunning(context.sessionID, browser, context.signal)
        const openTab = async (): Promise<TabSummary> => {
          const created = await browser.execute(context.sessionID, { method: "tabs.new" }, context.signal)
          if (!isTabSummary(created)) throw new BrowserBackendError("PROTOCOL_INVALID", "The new tab response was invalid.")
          const navigated = await browser.execute(context.sessionID, {
            method: "navigate", tabId: created.id, url: input.url as string,
          }, context.signal)
          if (!isTabSummary(navigated)) throw new BrowserBackendError("PROTOCOL_INVALID", "The navigation response was invalid.")
          return navigated
        }
        let navigated: TabSummary
        try {
          navigated = await openTab()
        } catch (error) {
          // Opening a tab is idempotent, so one recovery attempt is safe after a
          // crashed worker. Mutations never retry implicitly.
          if (!(error instanceof BrowserBackendError) || error.code !== "WORKER_CRASHED") throw error
          await browser.restart(context.sessionID, context.signal)
          navigated = await openTab()
        }
        currentGenerations.delete(snapshotKey(context.sessionID, navigated.id))
        return jsonResult({ tabId: navigated.id, url: navigated.url, title: navigated.title })
      })
    },
  )

  tool(
    "tabs",
    "List tabs with their ownership class, create a new agent-owned tab, or close one explicit non-user-owned tab.",
    {
      type: "object",
      properties: {
        action: { type: "string", enum: ["list", "new", "close"] },
        tabId: { type: "string", minLength: 1, maxLength: 128 },
        url: { type: "string", minLength: 1, maxLength: 8_192 },
      },
      required: ["action"],
      additionalProperties: false,
    },
    async (input, context) => {
      let action: "list" | "new" | "close"
      try {
        only(input, ["action", "tabId", "url"])
        if (input.action !== "list" && input.action !== "new" && input.action !== "close") throw new Error("action must be list, new, or close")
        action = input.action
        if (action === "close") stringField(input.tabId, "tabId", 128)
        else if (input.tabId !== undefined) throw new Error("tabId is only valid with action close")
        if (action === "new" && input.url !== undefined) httpUrl(input.url)
        else if (input.url !== undefined) throw new Error("url is only valid with action new")
      } catch (error) {
        return textResult(`Invalid browser request: ${error instanceof Error ? error.message : "invalid input"}`)
      }
      const permission = action === "list" ? "browser_read" : action === "close" ? "browser_close" : "browser_open"
      const resource = action === "close"
        ? permissionResource("tab", input.tabId as string)
        : action === "new" && typeof input.url === "string"
          ? permissionResource("url", input.url)
          : permissionResource("tabs", action)
      return run(context, permission, resource, async () => {
        const browser = getManager()
        const summary = ({ id, ownership, url, title }: TabSummary) => ({ tabId: id, ownership, url, title })
        if (action === "new") {
          await ensureRunning(context.sessionID, browser, context.signal)
          const created = await browser.execute(context.sessionID, { method: "tabs.new" }, context.signal)
          if (!isTabSummary(created)) throw new BrowserBackendError("PROTOCOL_INVALID", "The new tab response was invalid.")
          if (typeof input.url === "string") {
            currentGenerations.delete(snapshotKey(context.sessionID, created.id))
            await browser.execute(context.sessionID, { method: "navigate", tabId: created.id, url: input.url }, context.signal)
          }
          // Only the tab this call created: `browser_open` must not disclose the
          // URLs and titles of tabs it did not open.
          return jsonResult({ tab: summary(created) })
        }
        if (action === "close") {
          const tabId = input.tabId as string
          await browser.execute(context.sessionID, { method: "tabs.close", tabId }, context.signal)
          currentGenerations.delete(snapshotKey(context.sessionID, tabId))
          credentialSafety.clear(context.sessionID, tabId)
          return jsonResult({ closed: tabId })
        }
        const tabs = await browser.execute(context.sessionID, { method: "tabs.list" }, context.signal)
        return jsonResult({ tabs: (tabs as TabSummary[]).map(summary) })
      }, action === "new" && input.url !== undefined
        ? [{ action: "browser_act", resource: permissionResource("url", input.url as string) }]
        : [])
    },
  )

  tool(
    "navigate",
    "Navigate an owned tab to an HTTP(S) URL or use its back, forward, or reload action.",
    {
      type: "object",
      properties: {
        tabId: { type: "string", minLength: 1, maxLength: 128 },
        url: { type: "string", minLength: 1, maxLength: 8_192 },
        action: { type: "string", enum: ["back", "forward", "reload"] },
      },
      required: ["tabId"],
      additionalProperties: false,
      oneOf: [{ required: ["url"], not: { required: ["action"] } }, { required: ["action"], not: { required: ["url"] } }],
    },
    async (input, context) => {
      try {
        only(input, ["tabId", "url", "action"])
        stringField(input.tabId, "tabId", 128)
        if ((input.url === undefined) === (input.action === undefined)) throw new Error("Supply exactly one of url or action")
        if (input.url !== undefined) httpUrl(input.url)
        if (input.action !== undefined && !["back", "forward", "reload"].includes(String(input.action))) throw new Error("action must be back, forward, or reload")
      } catch (error) {
        return textResult(`Invalid browser request: ${error instanceof Error ? error.message : "invalid input"}`)
      }
      const resource = input.url !== undefined
        ? permissionResource("tab", input.tabId as string, "url", input.url as string)
        : permissionResource("tab", input.tabId as string, String(input.action))
      return run(context, "browser_act", resource, async () => {
        const browser = getManager()
        const operation: BrowserOperation = input.url !== undefined
          ? { method: "navigate", tabId: input.tabId as string, url: input.url as string }
          : { method: input.action as "back" | "forward" | "reload", tabId: input.tabId as string }
        currentGenerations.delete(snapshotKey(context.sessionID, input.tabId as string))
        const result = await browser.execute(context.sessionID, operation, context.signal)
        if (!isTabSummary(result)) throw new BrowserBackendError("PROTOCOL_INVALID", "The navigation response was invalid.")
        // Only a new URL clears the refusal. Back/forward/reload can restore form state
        // from cache, so they keep the tab protected.
        if (input.url !== undefined) credentialSafety.clear(context.sessionID, input.tabId as string)
        return jsonResult({ tabId: result.id, url: result.url, title: result.title })
      })
    },
  )

  tool(
    "snapshot",
    "Return the current tab's accessibility snapshot as text. Refs are valid only for the returned generation; depth limits visible nesting.",
    {
      type: "object",
      properties: {
        tabId: { type: "string", minLength: 1, maxLength: 128 },
        depth: { type: "integer", minimum: 1, maximum: MAX_SNAPSHOT_DEPTH },
      },
      required: ["tabId"],
      additionalProperties: false,
    },
    async (input, context) => {
      try {
        only(input, ["tabId", "depth"])
        stringField(input.tabId, "tabId", 128)
        if (input.depth !== undefined && (!Number.isSafeInteger(input.depth) || Number(input.depth) < 1 || Number(input.depth) > MAX_SNAPSHOT_DEPTH)) {
          throw new Error(`depth must be an integer from 1 to ${MAX_SNAPSHOT_DEPTH}`)
        }
      } catch (error) {
        return textResult(`Invalid browser request: ${error instanceof Error ? error.message : "invalid input"}`)
      }
      const tabId = input.tabId as string
      return run(context, "browser_read", permissionResource("tab", tabId), async () => {
        const result = await getManager().execute(context.sessionID, { method: "snapshot", tabId }, context.signal)
        if (!result || typeof result !== "object" || !Number.isSafeInteger((result as { generation: number }).generation) || typeof (result as { snapshot: unknown }).snapshot !== "string" || (result as { tabId: unknown }).tabId !== tabId) {
          throw new BrowserBackendError("PROTOCOL_INVALID", "The snapshot response was invalid.")
        }
        const snapshot = result as { tabId: string; generation: number; snapshot: string }
        currentGenerations.set(snapshotKey(context.sessionID, tabId), snapshot.generation)
        return snapshotResult(snapshot.tabId, snapshot.generation, atDepth(snapshot.snapshot, input.depth as number | undefined))
      })
    },
  )

  tool(
    "act",
    "Interact with a ref from the tab's latest snapshot generation. A successful action invalidates that generation; snapshot again before the next ref action.",
    {
      type: "object",
      properties: {
        tabId: { type: "string", minLength: 1, maxLength: 128 },
        generation: { type: "integer", minimum: 1 },
        ref: { type: "string", minLength: 1, maxLength: 128 },
        action: { type: "string", enum: ["click", "fill", "type", "press", "hover", "select"] },
        value: {
          oneOf: [
            { type: "string", maxLength: MAX_TEXT_LENGTH },
            { type: "array", minItems: 1, maxItems: 100, items: { type: "string", maxLength: MAX_TEXT_LENGTH } },
          ],
        },
        key: { type: "string", minLength: 1, maxLength: MAX_TEXT_LENGTH },
        button: { type: "string", enum: ["left", "right", "middle"] },
        clickCount: { type: "integer", minimum: 1, maximum: 3 },
        modifiers: { type: "array", items: { type: "string", enum: ["Alt", "Control", "Meta", "Shift"] }, uniqueItems: true },
      },
      required: ["tabId", "generation", "ref", "action"],
      additionalProperties: false,
    },
    async (input, context) => {
      let action: string
      try {
        only(input, ["tabId", "generation", "ref", "action", "value", "key", "button", "clickCount", "modifiers"])
        stringField(input.tabId, "tabId", 128)
        stringField(input.ref, "ref", 128)
        if (!Number.isSafeInteger(input.generation) || Number(input.generation) < 1) throw new Error("generation must be a positive integer")
        if (!["click", "fill", "type", "press", "hover", "select"].includes(String(input.action))) throw new Error("action is unsupported")
        action = String(input.action)
        if ((action === "fill" || action === "type" || action === "select") && input.value === undefined) throw new Error(`${action} requires value`)
        if (action === "press") stringField(input.key, "key", MAX_TEXT_LENGTH)
        if (action !== "press" && input.key !== undefined) throw new Error("key is only valid with press")
        if (input.value !== undefined) {
          if (Array.isArray(input.value)) {
            if (action !== "select" || input.value.length < 1 || input.value.length > 100 || input.value.some((item) => typeof item !== "string" || item.length > MAX_TEXT_LENGTH)) throw new Error("value array is only valid for select and must contain bounded strings")
          } else if (typeof input.value !== "string" || input.value.length > MAX_TEXT_LENGTH || (action !== "fill" && action !== "type" && action !== "select")) {
            throw new Error("value is only valid for fill, type, or select and must be bounded text")
          }
        }
        if (action !== "click" && (input.button !== undefined || input.clickCount !== undefined || input.modifiers !== undefined)) throw new Error("button, clickCount, and modifiers are only valid with click")
        if (input.button !== undefined && !["left", "right", "middle"].includes(String(input.button))) throw new Error("button is unsupported")
        if (input.clickCount !== undefined && (!Number.isSafeInteger(input.clickCount) || Number(input.clickCount) < 1 || Number(input.clickCount) > 3)) throw new Error("clickCount must be from 1 to 3")
        if (input.modifiers !== undefined && (!Array.isArray(input.modifiers) || input.modifiers.some((item) => !["Alt", "Control", "Meta", "Shift"].includes(String(item))))) throw new Error("modifiers contains an unsupported key")
      } catch (error) {
        return textResult(`Invalid browser request: ${error instanceof Error ? error.message : "invalid input"}`)
      }
      const tabId = input.tabId as string
      const generation = input.generation as number
      return run(context, "browser_act", permissionResource("tab", tabId, "ref", String(input.ref), action), async () => {
        if (currentGenerations.get(snapshotKey(context.sessionID, tabId)) !== generation) {
          return textResult("The supplied element ref is not from this tab's current snapshot generation; take a fresh snapshot.")
        }
        const target = { tabId, generation, ref: input.ref as string }
        let operation: BrowserOperation
        switch (action) {
          case "click":
            operation = {
              method: "click", target,
              ...(input.button === undefined ? {} : { button: input.button as "left" | "right" | "middle" }),
              ...(input.clickCount === undefined ? {} : { clickCount: input.clickCount as number }),
              ...(input.modifiers === undefined ? {} : { modifiers: input.modifiers as Array<"Alt" | "Control" | "Meta" | "Shift"> }),
            }
            break
          case "fill":
            operation = { method: "fill", target, value: input.value as string }
            break
          case "type":
            operation = { method: "type", target, value: input.value as string }
            break
          case "press":
            operation = { method: "press", target, key: input.key as string }
            break
          case "hover":
            operation = { method: "hover", target }
            break
          default:
            operation = { method: "selectOption", target, values: input.value as string | readonly string[] }
        }
        await getManager().execute(context.sessionID, operation, context.signal)
        currentGenerations.delete(snapshotKey(context.sessionID, tabId))
        return jsonResult({ tabId, generation })
      })
    },
  )

  tool(
    "screenshot",
    "Capture an owned browser tab as a PNG and attach it as a data URI. Screenshots are limited to 8 MiB and are never written to disk. fullPage is not yet supported by the backend.",
    {
      type: "object",
      properties: {
        tabId: { type: "string", minLength: 1, maxLength: 128 },
        fullPage: { type: "boolean", description: "Request a full-page image; currently only false is supported" },
      },
      required: ["tabId"],
      additionalProperties: false,
    },
    async (input, context) => {
      try {
        only(input, ["tabId", "fullPage"])
        stringField(input.tabId, "tabId", 128)
        if (input.fullPage !== undefined && typeof input.fullPage !== "boolean") throw new Error("fullPage must be boolean")
      } catch (error) {
        return textResult(`Invalid browser request: ${error instanceof Error ? error.message : "invalid input"}`)
      }
      const tabId = input.tabId as string
      return run(context, "browser_read", permissionResource("tab", tabId, "screenshot"), async () => {
        if (input.fullPage === true) return textResult("Full-page screenshots are not supported by the current browser backend.")
        if (credentialSafety.isTabFilled(context.sessionID, tabId)) {
          return textResult(
            "Refused: this tab had a credential filled and has not navigated since. The page may display that value in clear text; navigate first, then screenshot.",
          )
        }
        const result = await getManager().execute(context.sessionID, { method: "screenshot", tabId }, context.signal)
        if (!(result instanceof Uint8Array)) throw new BrowserBackendError("PROTOCOL_INVALID", "The screenshot response was invalid.")
        if (result.byteLength > MAX_SCREENSHOT_BYTES) throw new BrowserBackendError("SCREENSHOT_TOO_LARGE", "The screenshot exceeds the tool attachment limit.")
        const bytes = Buffer.from(result)
        return {
          content: [
            { type: "text", text: JSON.stringify({ tabId, bytes: bytes.byteLength, mime: "image/png" }) },
            { type: "file", uri: `data:image/png;base64,${bytes.toString("base64")}`, mime: "image/png", name: `browser-${tabId}.png` },
          ],
        }
      })
    },
  )

  tool(
    "signin",
    "Open a local dialog for the human to type the password for one form field, then fill that field. The value never enters tool arguments, results, logs or the transcript: only a status is returned. Requires a fresh snapshot ref for the password field, and never submits the form.",
    {
      type: "object",
      properties: {
        tabId: { type: "string", minLength: 1, maxLength: 128 },
        ref: { type: "string", minLength: 1, maxLength: 128 },
        generation: { type: "integer", minimum: 1 },
      },
      required: ["tabId", "ref", "generation"],
      additionalProperties: false,
    },
    async (input, context) => {
      try {
        only(input, ["tabId", "ref", "generation"])
        stringField(input.tabId, "tabId", 128)
        stringField(input.ref, "ref", 128)
        if (!Number.isSafeInteger(input.generation) || Number(input.generation) < 1) {
          throw new Error("generation must be a positive integer")
        }
      } catch (error) {
        return textResult(`Invalid browser request: ${error instanceof Error ? error.message : "invalid input"}`)
      }
      const tabId = input.tabId as string
      const target = { tabId, ref: input.ref as string, generation: input.generation as number }
      return run(context, "browser_act", permissionResource("tab", tabId, "signin"), async () => {
        // Cheap staleness check first: never ask a human to type into a target that
        // the tool layer already knows is out of date.
        if (currentGenerations.get(snapshotKey(context.sessionID, tabId)) !== target.generation) {
          return textResult("The supplied element ref is not from this tab's current snapshot generation; take a fresh snapshot.")
        }
        const signIn = signInParts(dependencies.authGuard)
        if (!signIn) return textResult("Private sign-in is unavailable in this configuration.")
        if (signIn.guard.getState() !== "idle") return textResult("A private sign-in is already active.")
        if (!signIn.signInPath.begin()) return textResult("A private sign-in could not be started.")
        signInOwner = context.sessionID
        const dialog: SignInDialog = dependencies.signInDialog ?? spawnSecretEntry
        let outcome: SecretEntryResult
        try {
          outcome = await dialog(
            {
              title: "OpenCode private sign-in",
              label: "Password",
              description: "Typed locally. It is sent only to the page, never to the model or the transcript.",
              minLength: 1,
              maxLength: 256,
            },
            { ...(context.signal ? { signal: context.signal } : {}) },
          )
        } catch {
          signIn.userActions.cancel()
          signInOwner = null
          return textResult("Private sign-in failed before it could be used; nothing was filled.")
        }
        if (outcome.status !== "ok") {
          signIn.userActions.cancel()
          signInOwner = null
          return textResult(`Private sign-in ${outcome.status === "cancelled" ? "cancelled" : "failed"}; nothing was filled.`)
        }
        if (!signIn.signInPath.beginFilling()) {
          outcome.value.fill(0)
          signIn.userActions.cancel()
          signInOwner = null
          return textResult("Private sign-in could not enter its filling state; nothing was filled.")
        }
        try {
          const browser = getManager()
          credentialSafety.mark(context.sessionID, tabId)
          const filled = await browser.fillCredential(signIn.signInPath, {
            sessionId: context.sessionID,
            target,
            value: outcome.value,
            requirePasswordField: true,
            ...(context.signal ? { signal: context.signal } : {}),
          })
          signIn.userActions.cancel()
          signInOwner = null
          return jsonResult({ status: filled.status })
        } catch (error) {
          // Status only: never a value, never page text, never a replay.
          const code = error instanceof BrowserBackendError ? error.code : "OPERATION_FAILED"
          if (FILL_NEVER_REACHED_THE_PAGE.has(code)) {
            // The manager refused before typing, so nothing is on the page and the guard
            // may return to idle.
            credentialSafety.clear(context.sessionID, tabId)
            signIn.userActions.cancel()
            signInOwner = null
            return textResult(`Private sign-in could not fill the field (${code}); nothing was typed.`)
          }
          // The worker may have typed the value before its acknowledgement was lost (crash,
          // timeout, dropped response). Treat the outcome as uncertain: block observation of
          // this tab and keep the guard out of idle instead of assuming nothing happened.
          credentialSafety.mark(context.sessionID, tabId)
          signIn.signInPath.markSubmittedUncertain()
          // Keep signInOwner: only this session may clear the blocked state.
          return textResult(
            `Private sign-in could not confirm the fill (${code}). The field may have received the value; ` +
              "snapshots, screenshots and desktop captures stay blocked until this session's browser is closed.",
          )
        } finally {
          outcome.value.fill(0)
        }
      })
    },
  )

  tool(
    "close",
    "Cancel only this OpenCode session's browser worker. Its tabs are discarded; the isolated profile data is retained.",
    { type: "object", properties: {}, additionalProperties: false },
    async (input, context) => {
      try {
        only(input, [])
      } catch (error) {
        return textResult(`Invalid browser request: ${error instanceof Error ? error.message : "invalid input"}`)
      }
      return run(context, "browser_close", permissionResource("session", context.sessionID), async () => {
        const cancelled = await getManager().cancel(context.sessionID, context.signal)
        if (cancelled) {
          for (const key of currentGenerations.keys()) {
            if (key.startsWith(`${context.sessionID}\0`)) currentGenerations.delete(key)
          }
          credentialSafety.clearSession(context.sessionID)
          // Closing discards THIS session's pages. Only the session that owns the active
          // sign-in may clear the guard: another session closing its own browser must not
          // unblock a page that may still show a value.
          if (signInOwner === context.sessionID) {
            signInParts(dependencies.authGuard)?.operatorActions?.recover()
            signInOwner = null
          }
        }
        return jsonResult({
          cancelled,
          discarded: cancelled ? ["browser worker", "tabs"] : [],
          retained: ["isolated profile data"],
        })
      })
    },
  )
  return {
    async dispose() {
      if (disposed) return
      disposed = true
      const results = await Promise.allSettled((manager?.listSessions() ?? []).map(async session => {
        await manager!.cancel(session.sessionId)
      }))
      currentGenerations.clear()
      const failures = results.filter(result => result.status === "rejected").map(result => result.reason)
      if (failures.length) throw new AggregateError(failures, "Some owned browser workers could not be closed on unload.")
    },
  }
}
