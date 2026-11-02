/**
 * Per-session serialization for the desktop and browser tool surfaces.
 *
 * The runtime package already owns a bounded, owner-keyed queue. Until now it
 * was tested but not wired to the tools, so two concurrent calls in one session
 * could interleave their compositor input or page mutations. This module is the
 * single place that connects the queue to the registered tools:
 *
 * - one queue instance per plugin load, shared by both surfaces;
 * - the owner key is `surface:sessionID`, so separate sessions stay independent
 *   while one session's operations run in order;
 * - read-only observations are declared explicitly, and only status calls may
 *   interleave with other reads;
 * - every queued operation gets a deadline, so an operation that ignores its
 *   abort signal can delay one caller but can never hold the slot indefinitely;
 * - while private sign-in is active, every tool of the surface is refused except an
 *   explicit safety allowlist, so a second surface cannot observe or type into the
 *   page the guard is protecting.
 *
 * The wrapper is applied by proxying the tool editor, so individual tool modules
 * stay unaware of scheduling and a new tool inherits the behaviour by default.
 */

import {
  createOwnerOperationQueue,
  RuntimeError,
  validateCallerAttribution,
  type CallerAttribution,
  type OperationMode,
  type OwnerOperationQueue,
} from "../../../tools/computer-use-runtime/src/index.ts"

/** Upper bound for one queued tool call before its slot is released. */
export const SERIALIZED_OPERATION_DEADLINE_MS = 60_000

/**
 * Read-only tools per surface. Anything not listed is treated as a mutation, so
 * forgetting to declare a new read narrows concurrency instead of widening it.
 */
const READ_TOOLS: Readonly<Record<string, ReadonlySet<string>>> = {
  desktop: new Set(["apps", "tree", "find", "windows", "layout"]),
  // `tabs` also creates and closes tabs, so it is a mutation: classifying it as an
  // interleavable read let a create/close overlap another call's follow-up list.
  web: new Set(["snapshot", "screenshot"]),
}

/** Status calls that may run beside another read of the same session. */
const INTERLEAVABLE_READ_TOOLS: Readonly<Record<string, ReadonlySet<string>>> = {
  desktop: new Set(["apps"]),
  web: new Set(),
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u
const MAX_OWNER_LENGTH = 256

export interface SignInGuard {
  readonly guard: { getState(): string }
}

export interface SerializationOptions {
  /** Queue to use; one shared instance per plugin load is the intended wiring. */
  readonly queue?: OwnerOperationQueue
  /** Release a call's slot after this long even if the operation is still running. */
  readonly deadlineMs?: number
  /**
   * Per-tool deadline overrides, for tools that legitimately wait on a person —
   * a private sign-in dialog stays open until the human acts.
   */
  readonly deadlines?: Readonly<Record<string, number>>
  /**
   * Private sign-in guard. While its state is not "idle", every tool of this
   * surface is refused except the names in `allowDuringSignIn`.
   */
  readonly authGuard?: SignInGuard
  /**
   * Safety tools that must stay usable during sign-in — notably `release`, which
   * frees held keys and buttons. Blocking it would leave input stuck.
   */
  readonly allowDuringSignIn?: ReadonlySet<string>
  /** Filled with the ids of tools this surface registered, so later transforms can scope to them. */
  readonly registeredIds?: Set<string>
}

export interface ToolCallContext {
  readonly sessionID?: unknown
  readonly agent?: unknown
  readonly signal?: AbortSignal
  readonly [key: string]: unknown
}

export type ToolExecute = (
  input: never,
  context: never,
) => Promise<unknown> | unknown

interface ToolLike {
  readonly name?: unknown
  readonly execute?: unknown
  readonly [key: string]: unknown
}

/** Decide how one tool call participates in its session's queue. */
export function operationMode(
  surface: string,
  name: string,
): { mode: OperationMode; allowInterleave: boolean } {
  const reads = READ_TOOLS[surface]
  if (reads?.has(name) !== true) return { mode: "mutation", allowInterleave: false }
  return {
    mode: "read",
    allowInterleave: INTERLEAVABLE_READ_TOOLS[surface]?.has(name) === true,
  }
}

/**
 * Validate the caller's attribution before anything is dispatched.
 *
 * The runtime package's contract was previously used only inside the browser tab
 * registry; the tool boundary passed `sessionID`/`agent`/`messageID` straight to
 * the permission check without validating them. Mapping the tool context onto the
 * runtime's attribution shape makes a malformed caller fail closed here, before a
 * permission request, queue entry or browser/desktop action can happen.
 */
export function callerAttribution(context: ToolCallContext | undefined): CallerAttribution {
  const record = context ?? {}
  return validateCallerAttribution({
    sessionID: record.sessionID,
    agent: record.agent,
    messageID: record.messageID,
    callID: record.id,
  })
}

/** Build the queue owner key from validated attribution, refusing bad callers. */
export function ownerKey(surface: string, context: ToolCallContext | undefined): string {
  const attribution = callerAttribution(context)
  const owner = `${surface}:${attribution.sessionID}`
  if (CONTROL_CHARACTERS.test(owner) || owner.length > MAX_OWNER_LENGTH) {
    throw new RuntimeError("INVALID_CONTEXT")
  }
  return owner
}

/**
 * Raised when a queued operation overruns its deadline. Distinct from other
 * failures so the caller can report the slot release instead of a generic error.
 */
export class DeadlineExceeded extends Error {
  constructor(label: string, deadlineMs: number) {
    super(
      `${label} exceeded its ${deadlineMs} ms deadline and was abandoned; the desktop or browser state may still change`,
    )
    this.name = "DeadlineExceeded"
  }
}

/**
 * Bound one operation. The timeout rejects the caller and frees the queue slot;
 * the abandoned operation keeps running (its own inner timeouts still apply) and
 * its eventual result is discarded, including any rejection.
 */
export function withDeadline<Result>(
  operation: Promise<Result>,
  deadlineMs: number,
  label: string,
): Promise<Result> {
  return new Promise<Result>((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new DeadlineExceeded(label, deadlineMs))
    }, deadlineMs)
    operation.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

/** Wrap a tool's execute so it runs inside its session's queue. */
export function signInBlocked(
  surface: string,
  toolName: string,
  authGuard: SignInGuard | undefined,
  allowDuringSignIn: ReadonlySet<string> | undefined,
): boolean {
  if (!authGuard) return false
  let state: string
  try {
    state = authGuard.guard.getState()
  } catch {
    // A guard that cannot report its state must not be treated as idle.
    return true
  }
  if (state === "idle") return false
  void surface
  return allowDuringSignIn?.has(toolName) !== true
}

export function serializeToolExecute(
  surface: string,
  toolName: string,
  execute: (input: never, context: never) => unknown,
  queue: OwnerOperationQueue,
  deadlineMs: number,
  gate: { readonly authGuard?: SignInGuard; readonly allowDuringSignIn?: ReadonlySet<string> } = {},
): (input: never, context: never) => Promise<unknown> {
  const { mode, allowInterleave } = operationMode(surface, toolName)
  const label = `${surface}.${toolName}`
  return (input: never, context: never): Promise<unknown> => {
    if (signInBlocked(surface, toolName, gate.authGuard, gate.allowDuringSignIn)) {
      return Promise.reject(new RuntimeError("AUTH_GUARD_BLOCKED"))
    }
    let owner: string
    try {
      owner = ownerKey(surface, context as ToolCallContext | undefined)
    } catch (error) {
      return Promise.reject(error)
    }
    const signal = (context as ToolCallContext | undefined)?.signal
    // The queue deliberately folds unknown failures into a generic error, so a
    // deadline is carried back as a tagged result and rethrown outside it. Its
    // message is the only thing the caller needs, and it stays accurate.
    return queue
      .run(
        owner,
        async () => {
          // Re-check the guard when queued work actually starts. A call that passed
          // the entry check can wait behind another operation while private sign-in
          // begins; dispatching then would let a desktop action run during sign-in.
          // Tagged rather than thrown: the queue folds non-RuntimeError failures into
          // INTERNAL, and throwing here leaked an unhandled rejection in practice.
          if (signInBlocked(surface, toolName, gate.authGuard, gate.allowDuringSignIn)) {
            return { kind: "blocked" as const }
          }
          const result = execute(input, context)
          if (!(result instanceof Promise)) return { kind: "value" as const, value: result }
          try {
            return {
              kind: "value" as const,
              value: await withDeadline(result, deadlineMs, label),
            }
          } catch (error) {
            if (error instanceof DeadlineExceeded) {
              return { kind: "deadline" as const, error }
            }
            throw error
          }
        },
        { mode, allowInterleave, ...(signal ? { signal } : {}) },
      )
      .then((outcome) => {
        const tagged = outcome as { kind?: string; value?: unknown; error?: Error }
        if (tagged && tagged.kind === "blocked") throw new RuntimeError("AUTH_GUARD_BLOCKED")
        if (tagged && tagged.kind === "deadline") throw tagged.error
        if (tagged && tagged.kind === "value") return tagged.value
        return outcome
      })
  }
}

/**
 * Proxy an editor so every added tool's `execute` is serialized per session.
 *
 * Everything else (namespace, list, update, and any future method) is delegated
 * unchanged, so this cannot silently change tool shape or options.
 */
export function withSerializedTools<Editor extends object>(
  editor: Editor,
  surface: string,
  options: SerializationOptions = {},
): Editor {
  const queue = options.queue ?? createOwnerOperationQueue()
  const defaultDeadline = options.deadlineMs ?? SERIALIZED_OPERATION_DEADLINE_MS

  const wrap = (tool: unknown): unknown => {
    const candidate = tool as ToolLike | null
    if (!candidate || typeof candidate !== "object") return tool
    const { name, execute } = candidate
    if (typeof name !== "string" || typeof execute !== "function") return tool
    const declared = (candidate.options as { namespace?: unknown } | undefined)?.namespace
    const namespace = typeof declared === "string" ? declared : surface
    options.registeredIds?.add(`${namespace}_${name}`)
    return {
      ...candidate,
      execute: serializeToolExecute(
        surface,
        name,
        execute as (input: never, context: never) => unknown,
        queue,
        options.deadlines?.[name] ?? defaultDeadline,
        { authGuard: options.authGuard, allowDuringSignIn: options.allowDuringSignIn },
      ),
    }
  }

  return new Proxy(editor, {
    get(target, property, receiver) {
      if (property === "add") {
        return (tool: unknown) => {
          const method = Reflect.get(target, "add", receiver)
          if (typeof method !== "function") {
            throw new TypeError("editor.add is not callable")
          }
          return method.call(target, wrap(tool))
        }
      }
      const value = Reflect.get(target, property, receiver)
      return typeof value === "function" ? value.bind(target) : value
    },
  })
}
