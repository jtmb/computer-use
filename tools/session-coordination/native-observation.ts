import { realpath } from "node:fs/promises"
import type { SessionApi } from "@opencode/client/promise/api"
import { record, sessionID, unwrap, type Scope } from "./model.ts"
import { bounded, checkAbort } from "./store.ts"
import type { Observation } from "./watchdog.ts"

export interface NativeObservationSession {
  get(input: { sessionID: string }, options?: { signal?: AbortSignal }): Promise<unknown>
  // This is the actual public client contract, optional until the native plugin bridge exists.
  active?: SessionApi["active"]
}
const MAX_ACTIVE_SESSIONS = 1024

async function selectedSession(session: NativeObservationSession, worker: string, scope: Scope, signal: AbortSignal) {
  checkAbort(signal)
  const value = unwrap(await session.get({ sessionID: worker }, { signal }))
  checkAbort(signal)
  if (!record(value) || value.id !== worker || value.projectID !== scope.projectID || !record(value.location) ||
      value.location.directory !== scope.directory || value.location.workspaceID !== scope.workspaceID ||
      record(value.time) && value.time.archived !== undefined || await realpath(scope.directory) !== scope.directory) {
    throw new Error("native observation session moved, archived, mismatched or outside the selected scope")
  }
  return value
}

function activeSnapshot(value: unknown, worker: string): boolean {
  if (!record(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("invalid native active-session snapshot")
  const entries = Object.entries(value)
  if (entries.length > MAX_ACTIVE_SESSIONS || entries.some(([id, status]) => !sessionID(id) || !record(status) ||
      Object.keys(status).length !== 1 || status.type !== "running")) throw new Error("invalid or over-budget native active-session snapshot")
  return Object.hasOwn(value, worker)
}

export function createNativeObserver(scope: Scope, session: NativeObservationSession, now = Date.now, requestMs = 5000) {
  if (!Number.isInteger(requestMs) || requestMs < 1 || requestMs > 5000) throw new Error("native observation deadline must be 1..5000ms")
  return async (worker: string, signal: AbortSignal): Promise<Observation> => {
    checkAbort(signal)
    if (!sessionID(worker)) throw new Error("native observation needs an exact session ID")
    return bounded(async abort => {
      let metadata = await selectedSession(session, worker, scope, abort)
      let foreground: Observation["foreground"] = "unknown"
      let observedAt: number
      const active = session.active
      const available = typeof active === "function"
      if (available) {
        const running = activeSnapshot(await active.call(session, { signal: abort }), worker)
        observedAt = now()
        checkAbort(abort)
        metadata = await selectedSession(session, worker, scope, abort)
        foreground = running ? "running" : "idle"
      } else observedAt = now()
      if (!Number.isSafeInteger(observedAt) || observedAt < 0) throw new Error("invalid native observation timestamp")
      const savedOutcome = typeof metadata.outcome === "string" && ["succeeded", "failed", "interrupted"].includes(metadata.outcome) ? metadata.outcome : undefined
      return { foreground, observedAt, basis: available ? "native-active-snapshot" : "sdk-unavailable",
        ...(savedOutcome ? { savedOutcome } : {}) }
    }, signal, requestMs)
  }
}
