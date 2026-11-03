import { bounded } from "./store.ts"
import { LIMITS, type Assignment } from "./model.ts"

export interface Observation { foreground: "running" | "idle" | "unknown"; savedOutcome?: string; observedAt: number; basis?: "native-active-snapshot" | "sdk-unavailable" }
export interface WatchStatus {
  assignment: Assignment; warnings: string[]; observation?: Observation; terminalEvent?: string
  error?: string; ownership: "retained"; acceptance: "parent-required"
}
export interface Scheduler { set(callback: () => void, ms: number): unknown; clear(handle: unknown): void }
interface Entry {
  status: WatchStatus; timers: unknown[]; inspect: (signal: AbortSignal) => Promise<Observation>
  busy: boolean; disabled: boolean; generation: number; pending?: string; lastTrigger?: string; terminalTypes: Set<string>
  inFlight?: Promise<Observation>
}
const scheduler: Scheduler = { set: (callback, ms) => { const timer = setTimeout(callback, ms); timer.unref(); return timer }, clear: handle => clearTimeout(handle as NodeJS.Timeout) }

export function warnings(assignment: Assignment, now: number): string[] {
  if (assignment.stoppedAt !== undefined) return ["monitoring-stopped-explicitly; ownership-retained"]
  const result: string[] = []
  if (now - assignment.progressAt >= assignment.inactivityMs) result.push("inactivity-warning")
  if (now - assignment.startedAt >= assignment.wallMs) result.push("wall-clock-warning")
  if (assignment.waitingReason) result.push("declared-wait; not proof of deadlock")
  return result
}

export class Watchdog {
  private readonly entries = new Map<string, Entry>()
  private readonly abort = new AbortController()
  private readonly clock: () => number
  private readonly timers: Scheduler
  private readonly requestMs: number
  constructor(clock = Date.now, timers: Scheduler = scheduler, requestMs = 5000) {
    this.clock = clock; this.timers = timers; this.requestMs = requestMs
  }
  add(assignment: Assignment, inspect: (signal: AbortSignal) => Promise<Observation>): void {
    const previous = this.entries.get(assignment.id)
    if (previous && (previous.status.assignment.owner !== assignment.owner || previous.status.assignment.worker !== assignment.worker)) throw new Error("watch identity cannot change")
    if (!previous && this.entries.size >= LIMITS.assignments) throw new Error("watch capacity reached")
    if (previous && JSON.stringify(previous.status.assignment) === JSON.stringify(assignment)) { previous.inspect = inspect; return }
    if (previous) for (const timer of previous.timers) this.timers.clear(timer)
    const entry: Entry = previous ?? { status: { assignment: structuredClone(assignment), warnings: [], ownership: "retained", acceptance: "parent-required" },
      timers: [], inspect, busy: false, disabled: false, generation: 0, terminalTypes: new Set() }
    entry.status.assignment = structuredClone(assignment)
    entry.status.warnings = warnings(assignment, this.clock())
    entry.timers = []; entry.inspect = inspect; entry.generation++; entry.lastTrigger = undefined
    this.entries.set(assignment.id, entry)
    if (assignment.stoppedAt !== undefined || this.abort.signal.aborted) { entry.pending = undefined; return }
    for (const [trigger, due] of [["inactivity", assignment.progressAt + assignment.inactivityMs], ["wall", assignment.startedAt + assignment.wallMs]] as const) {
      entry.timers.push(this.timers.set(() => { void this.reconcile(assignment.id, trigger) }, Math.max(1, due - this.clock())))
    }
    // One reconnect/registration reconciliation, not a recurring polling loop.
    void this.reconcile(assignment.id, "register")
  }
  async reconcile(id: string, trigger: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry || entry.disabled || this.abort.signal.aborted || entry.status.assignment.stoppedAt !== undefined) return
    if (entry.lastTrigger === trigger) return
    // One in-flight request plus one coalesced follow-up, even when progress changes.
    if (entry.busy) { entry.pending = trigger; return }
    entry.busy = true; entry.lastTrigger = trigger
    const generation = entry.generation, inspect = entry.inspect
    try {
      entry.inFlight = bounded(inspect, this.abort.signal, this.requestMs)
      const observation = await entry.inFlight
      if (this.entries.get(id) !== entry || entry.generation !== generation) return
      entry.status.observation = observation
    } catch (error) {
      // An adapter ignoring abort must not accumulate more requests on every event.
      entry.disabled = true; entry.pending = undefined
      delete entry.status.observation
      entry.status.error = error instanceof Error ? error.message : "watch observation failed"
    } finally {
      entry.busy = false
      entry.inFlight = undefined
      entry.status.warnings = warnings(entry.status.assignment, this.clock())
      if (this.entries.get(id) === entry) {
        const pending = entry.pending; entry.pending = undefined
        if (pending) void this.reconcile(id, pending)
      }
    }
  }
  async refresh(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry || entry.disabled || this.abort.signal.aborted || entry.status.assignment.stoppedAt !== undefined) return
    if (entry.busy) { await entry.inFlight?.catch(() => {}); return }
    entry.lastTrigger = undefined
    await this.reconcile(id, "explicit-status")
  }
  event(worker: string, type: string): void {
    if (!["session.execution.succeeded", "session.execution.failed", "session.execution.interrupted"].includes(type)) return
    for (const [id, entry] of this.entries) {
      if (entry.status.assignment.worker !== worker || entry.terminalTypes.has(type)) continue
      entry.terminalTypes.add(type)
      entry.status.terminalEvent = type
      for (const timer of entry.timers) this.timers.clear(timer)
      void this.reconcile(id, type)
    }
  }
  status(owner: string): WatchStatus[] {
    return [...this.entries.values()].filter(entry => entry.status.assignment.owner === owner || entry.status.assignment.worker === owner)
      .map(entry => structuredClone({ ...entry.status, warnings: warnings(entry.status.assignment, this.clock()) }))
  }
  dispose(): void {
    this.abort.abort(new Error("coordination watchdog unloaded"))
    for (const entry of this.entries.values()) for (const timer of entry.timers) this.timers.clear(timer)
    this.entries.clear()
  }
}
