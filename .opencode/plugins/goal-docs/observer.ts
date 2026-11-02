import { watch as fsWatch, type FSWatcher } from "node:fs"
import path from "node:path"

import { exportGoalState, type ExportDependencies } from "./exporter.ts"
import { readGoalStateForSession, resolveGoalStatePath } from "./state.ts"
import { getOwnedSession, sessionListPage, unwrapData, type SessionApi } from "./session.ts"
import { throwIfAborted } from "./abort.ts"
import type { SessionGoalState } from "./model.ts"

export interface GoalDocsEvent {
  type: string
  data: Record<string, unknown>
}

export interface EventSource {
  subscribe(options?: { signal?: AbortSignal }): AsyncIterable<unknown>
}

interface SessionListApi extends SessionApi {
  list?(input: { directory: string; limit: number; cursor?: unknown }, requestOptions?: { signal?: AbortSignal }): Promise<unknown>
}

export interface GoalObserverDependencies extends ExportDependencies {
  session: SessionListApi
  event: EventSource
  report?(message: string, error?: unknown): void
  readState?(sessionID: string, options?: { signal?: AbortSignal }): Promise<SessionGoalState | null>
  listSessions?(directory: string, options?: { signal?: AbortSignal }): Promise<string[]>
  statePath?: string
  debounceMs?: number
  watchState?(directory: string, callback: (filename: string | null) => void): { close(): void }
}

const EXPORT_EVENTS = new Set([
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
  "session.idle",
  "session.status",
])
const MAX_SESSION_PAGES = 10
const SESSION_PAGE_SIZE = 100
const DEFAULT_DEBOUNCE_MS = 100

function decodeEvent(value: unknown): GoalDocsEvent | undefined {
  let decoded = value
  if (typeof decoded === "string") {
    try {
      decoded = JSON.parse(decoded)
    } catch {
      return undefined
    }
  }
  if (typeof decoded !== "object" || decoded === null) return undefined
  const event = decoded as Record<string, unknown>
  if (typeof event.type !== "string" || typeof event.data !== "object" || event.data === null || Array.isArray(event.data)) {
    return undefined
  }
  return { type: event.type, data: event.data as Record<string, unknown> }
}

function settledEvent(event: GoalDocsEvent): boolean {
  if (event.type !== "session.status") return true
  const status = event.data.status
  return typeof status === "object" && status !== null && (status as Record<string, unknown>).type === "idle"
}

function sessionIDs(sessions: readonly unknown[]): string[] {
  const result = new Set<string>()
  for (const item of sessions) {
    const raw = unwrapData(item)
    if (typeof raw !== "object" || raw === null) continue
    const record = raw as Record<string, unknown>
    if (typeof record.id === "string" && record.id.length <= 200) result.add(record.id)
  }
  return [...result]
}

function sameExactLocation(
  session: { location?: { directory?: unknown; workspaceID?: unknown } },
  location: { directory?: string; workspaceID?: string },
  actualDirectory: string,
): boolean {
  return actualDirectory === path.resolve(location.directory ?? "") &&
    session.location?.workspaceID === location.workspaceID
}

function directoryWatcher(directory: string, callback: (filename: string | null) => void): FSWatcher {
  return fsWatch(directory, { persistent: false }, (_eventType, filename) => {
    callback(filename === null ? null : filename.toString())
  })
}

export function startGoalObserver(dependencies: GoalObserverDependencies): () => void {
  const abort = new AbortController()
  const inFlight = new Set<string>()
  const dirty = new Set<string>()
  const lastExportedFingerprint = new Map<string, string>()
  const knownSessionIDs = new Set<string>()
  const report = dependencies.report ?? ((message, error) => console.error(`[goal-docs] ${message}`, error ?? ""))
  const readState = dependencies.readState ?? ((sessionID, options) => readGoalStateForSession(sessionID, { signal: options?.signal }))
  const sourceDirectory = dependencies.location?.directory
  const statePath = dependencies.statePath ?? resolveGoalStatePath()
  let watcher: { close(): void } | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const observeOnce = async (sessionID: string): Promise<void> => {
    throwIfAborted(abort.signal)
    const owned = await getOwnedSession(dependencies.session, sessionID, dependencies.location, abort.signal)
    if (!dependencies.location || !sameExactLocation(owned.info, dependencies.location, owned.directory)) return
    const state = await readState(sessionID, { signal: abort.signal })
    throwIfAborted(abort.signal)
    if (!state || (!state.current && state.archives.length === 0)) return
    if (lastExportedFingerprint.get(sessionID) === state.fingerprint) return

    const exported = await exportGoalState({ sessionID }, dependencies, { signal: abort.signal })
    if (exported.status !== "exported" || !exported.state || !exported.write) return
    lastExportedFingerprint.set(sessionID, exported.state.fingerprint)
    if (exported.state.fingerprint !== state.fingerprint) {
      dirty.add(sessionID)
      report(`goal state changed during export for ${sessionID}; queued one trailing refresh`)
    }
  }

  const observe = async (sessionID: string): Promise<void> => {
    if (stopped || abort.signal.aborted) return
    if (inFlight.has(sessionID)) {
      dirty.add(sessionID)
      return
    }
    inFlight.add(sessionID)
    try {
      do {
        dirty.delete(sessionID)
        try {
          await observeOnce(sessionID)
        } catch (error) {
          if (!abort.signal.aborted) report(`automatic export for ${sessionID} failed or is stale; goal execution was not interrupted`, error)
        }
      } while (!abort.signal.aborted && dirty.has(sessionID))
    } finally {
      dirty.delete(sessionID)
      inFlight.delete(sessionID)
    }
  }

  const listSessionIDs = async (): Promise<string[]> => {
    if (!sourceDirectory) throw new Error("plugin location is unavailable; cannot enumerate goal sessions safely")
    if (dependencies.listSessions) return dependencies.listSessions(sourceDirectory, { signal: abort.signal })
    if (!dependencies.session.list) throw new Error("session.list is unavailable; startup goal recovery cannot be performed")
    let cursor: unknown
    let pages = 0
    const result = new Set<string>()
    do {
      throwIfAborted(abort.signal)
      if (pages >= MAX_SESSION_PAGES) throw new Error("startup session scan reached its page bound")
      const page = sessionListPage(await dependencies.session.list(
        { directory: sourceDirectory, limit: SESSION_PAGE_SIZE, ...(cursor ? { cursor } : {}) },
        { signal: abort.signal },
      ))
      for (const id of sessionIDs(page.sessions)) {
        result.add(id)
        if (result.size > MAX_SESSION_PAGES * SESSION_PAGE_SIZE) throw new Error("startup session scan exceeded its bound")
      }
      cursor = page.next
      pages += 1
    } while (cursor)
    return [...result]
  }

  const refreshAll = async (): Promise<void> => {
    try {
      const ids = await listSessionIDs()
      for (const sessionID of ids) {
        knownSessionIDs.add(sessionID)
        await observe(sessionID)
        if (abort.signal.aborted) return
      }
      for (const sessionID of knownSessionIDs) {
        if (!ids.includes(sessionID)) await observe(sessionID)
        if (abort.signal.aborted) return
      }
    } catch (error) {
      if (!abort.signal.aborted) report("startup or state-file goal refresh failed; retained exports were not deleted", error)
    }
  }

  const scheduleRefreshAll = (): void => {
    if (stopped || abort.signal.aborted) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      void refreshAll()
    }, Math.min(2_000, Math.max(10, dependencies.debounceMs ?? DEFAULT_DEBOUNCE_MS)))
    timer.unref?.()
  }

  try {
    const watch = dependencies.watchState ?? directoryWatcher
    watcher = watch(path.dirname(statePath), (filename) => {
      if (filename === null || filename === path.basename(statePath)) scheduleRefreshAll()
    })
  } catch (error) {
    report("goal state file watcher is unavailable; lifecycle events and startup recovery remain active", error)
  }

  void refreshAll()
  void (async () => {
    try {
      for await (const raw of dependencies.event.subscribe({ signal: abort.signal })) {
        if (abort.signal.aborted) break
        const event = decodeEvent(raw)
        if (!event || !EXPORT_EVENTS.has(event.type) || !settledEvent(event)) continue
        const sessionID = event.data.sessionID
        if (typeof sessionID !== "string") continue
        knownSessionIDs.add(sessionID)
        void observe(sessionID)
      }
    } catch (error) {
      if (!abort.signal.aborted) report("event observer stopped; automatic exports may be stale", error)
    }
  })()

  return () => {
    stopped = true
    abort.abort()
    if (timer) clearTimeout(timer)
    timer = undefined
    watcher?.close()
    watcher = undefined
  }
}
