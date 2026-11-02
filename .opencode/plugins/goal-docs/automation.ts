import { createHash } from "node:crypto"

import type { GoalRecord, SessionGoalState } from "./model.ts"
import { getOwnedSession, isPlanOrReadOnly, type PluginLocation, type SessionApi, type SessionInfo } from "./session.ts"
import { sourceHandoffRequest } from "./source-handoff.ts"

export const CONTEXT_HANDOFF_THRESHOLD = 500_000
export const HANDOFF_CAPABILITY_NOTICE = "Normal context boundaries only; no pre-compaction interception. Latest-step context estimate, not lifetime usage. Native compaction stays enabled."

interface AutomationSessionApi extends SessionApi {
  context(input: { sessionID: string }, options?: { signal?: AbortSignal }): Promise<unknown>
  update(input: { sessionID: string; title: string; expectedTitle?: string }, options?: { signal?: AbortSignal }): Promise<unknown>
  // Optional host capability: the installed SDK has no such member, so absence
  // stays structurally assignable and unadvertised hosts cannot publish titles.
  capabilities?(): Promise<unknown>
}

type RecordState = {
  version: 1
  directory: string
  workspaceID: string | null
  revision: number
  enabled: boolean
  goalID: string | null
  planRevision: number
  phases: Record<string, boolean>
  requested: string | null
}

export interface AutomationDependencies {
  session: AutomationSessionApi
  location: PluginLocation
  storage: { get(key: string): Promise<unknown>; set(key: string, value: RecordState): Promise<void> }
  readState(sessionID: string, options?: { signal?: AbortSignal }): Promise<SessionGoalState | null>
  signal?: AbortSignal
  report?(error: unknown): void
}

export interface HandoffSettingsView {
  sessionID: string
  revision: number
  /** The stored or default policy choice; does not claim which of the two it is. */
  configuredEnabled: boolean
  /** Role/suspension-gated policy, not proof of a trigger, request or execution. */
  enabled: boolean
  role: "worker" | "reviewer" | "unclassified"
  requested: string | null
  notice: string
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function validHash(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 64 &&
    [...value].every(char => "0123456789abcdef".includes(char))
}

function sourceID(value: unknown, session: SessionInfo): value is string {
  return typeof value === "string" && value.startsWith("ses_") && value.length <= 200 && value !== session.id
}

function lineage(session: SessionInfo): { sourceSessionID: string; hash: string; goalID?: string } | undefined {
  const metadata = object(session.metadata)
  const origin = object(metadata?.handoffOrigin)
  if (origin?.role === "independent-worker" && sourceID(origin.sourceSessionID, session)) {
    return { sourceSessionID: origin.sourceSessionID,
      hash: validHash(origin.hash) ? origin.hash : createHash("sha256").update(session.id).digest("hex").slice(0, 12) }
  }
  if (origin !== undefined) return
  const legacy = object(metadata?.goalDocsHandoff)
  const transferID = legacy?.transferID
  if (typeof transferID !== "string" || !transferID.startsWith("goalhandoff_") || transferID.length !== "goalhandoff_".length + 40 ||
    !validHash(transferID.slice("goalhandoff_".length)) || !sourceID(legacy?.sourceSessionID, session) ||
    typeof legacy?.goalID !== "string" || !legacy.goalID || legacy.goalID.length > 200) return
  // Validate the legacy producer's stable target ID, not its human-editable title.
  if (session.id !== `ses_goal_docs_${createHash("sha256").update(transferID).digest("hex").slice(0, 32)}`) return
  return { sourceSessionID: legacy.sourceSessionID, hash: transferID.slice(-12), goalID: legacy.goalID }
}

export function workerIdentity(session: SessionInfo): { role: HandoffSettingsView["role"]; hash?: string } {
  const origin = object(object(session.metadata)?.handoffOrigin)
  const title = typeof session.title === "string" ? session.title : ""
  if (origin?.role === "reviewer" || title.trim().toLowerCase().startsWith("reviewer")) return { role: "reviewer" }
  if (session.parentID || session.fork) return { role: "unclassified" }
  if (origin?.role !== undefined && origin.role !== "independent-worker") return { role: "unclassified" }
  const provenance = lineage(session)
  return provenance ? { role: "worker", hash: provenance.hash } : { role: "unclassified" }
}

const TASK_LABEL_LIMIT = 28

export function conciseTaskLabel(task: string): string | undefined {
  const label = task
    .replace(/^\s*Goal handoff\s+[a-f0-9]{8,64}\b/i, " ")
    .replace(/\s*[—–-]\s*Goal handoff\s+[a-f0-9]{8,64}\b/gi, " ")
    .replace(/(?:\s*·\s*ses_[A-Za-z0-9_-]+)+\s*$/gi, " ")
    .replace(/\bses_[A-Za-z0-9_-]+\b/gi, " ")
    .replace(/\b(?:goal(?:\s+id)?|hash)\s*[:=]?\s*[a-f0-9-]{8,64}\b/gi, " ")
    .replace(/\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b/gi, " ")
    .replace(/\b[a-f0-9]{12,64}\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^(?:task|objective|task title)\s*:\s*/i, "")
    .replace(/^(?:independent\s+)?(?:worker|reviewer)\s*:\s*/i, "")
    .replace(/[\s.!?;:,]+$/g, "")
    .trim()
  const hasFileReference = /\b(?:[\w.-]+\/)*[\w.-]+\.(?:md|mjs|cjs|js|jsx|ts|tsx|jsonc?|ya?ml|toml|py|sh|go|rs|css|html)\b/i.test(label)
  const instructionLead = /^(?:narrowly|carefully|briefly|authorized)\b|^(?:implement|update|modify|change|fix|improve|simplify|add|remove|write|create|build|verify|test|review|inspect|investigate|analyze|analyse|diagnose|trace|identify|understand|determine|check|confirm|audit|explore|find|debug|troubleshoot|refactor|document|name|rename|keep|make|ensure|resolve|repair|reconcile)\s+(?:a|an|current|bounded|scoped|supported|concise|meaningful|short)\b/i.test(label)
  const wordCount = label.split(/\s+/).filter(Boolean).length
  const genericTitle = /^(?:generic(?: native)? title|native title|new session|untitled session|goal handoff)$/i.test(label)
  if (!label || label.length > TASK_LABEL_LIMIT || wordCount < 2 || wordCount > 5 || hasFileReference || instructionLead || genericTitle) return
  return label
}

export function workerTitle(task: string, sessionID: string): string {
  return `${conciseTaskLabel(task) ?? "Continue scoped handoff"} · ${sessionID}`
}

function sessionTitle(info: SessionInfo): string {
  const originTask = object(object(info.metadata)?.handoffOrigin)?.task
  const existingTitle = typeof info.title === "string" ? info.title : ""
  const label = conciseTaskLabel(existingTitle) ? existingTitle :
    typeof originTask === "string" && conciseTaskLabel(originTask) ? originTask : "Continue scoped handoff"
  return workerTitle(label, info.id)
}

async function supportsConditionalTitle(session: AutomationSessionApi, signal?: AbortSignal): Promise<boolean> {
  if (typeof session.capabilities !== "function") return false
  let value: unknown
  try {
    value = await session.capabilities()
  } catch {
    signal?.throwIfAborted()
    // A rejecting handshake is an unsupported host, not a policy failure.
    return false
  }
  signal?.throwIfAborted()
  return object(value)?.conditionalTitleUpdate === 1
}

function titleConflict(error: unknown, sessionID: string): boolean {
  const value = object(error)
  return value?._tag === "Session.TitleConflictError" && value.sessionID === sessionID
}

function sameWorkerLineage(expected: SessionInfo, current: SessionInfo): boolean {
  const before = lineage(expected)
  const after = lineage(current)
  return workerIdentity(expected).role === "worker" && workerIdentity(current).role === "worker" &&
    expected.projectID === current.projectID && before !== undefined && after !== undefined &&
    before.sourceSessionID === after.sourceSessionID && before.hash === after.hash && before.goalID === after.goalID
}

// Mirrors V2.1.1's lastAssistantWithUsage/TokenUsage.total semantics. It is a
// last-step estimate; the session's cumulative tokens are deliberately never read.
export function currentContextEstimate(value: unknown): number | undefined {
  if (!Array.isArray(value)) return
  for (let index = value.length - 1; index >= 0; index--) {
    const message = object(value[index])
    if (message?.type === "compaction" && message.status === "completed") return
    if (message?.type !== "assistant") continue
    const tokens = object(message.tokens)
    const cache = object(tokens?.cache)
    if (!tokens || !cache || typeof object(message.time)?.completed !== "number") return
    const counts = [tokens.input, tokens.output, tokens.reasoning, cache.read, cache.write]
    if (!counts.every(count => typeof count === "number" && Number.isSafeInteger(count) && count >= 0)) return
    const total = (counts as number[]).reduce((sum, count) => sum + count, 0)
    return Number.isSafeInteger(total) ? total : undefined
  }
}

function verifiedPhases(goal: GoalRecord | null): Record<string, boolean> {
  return Object.fromEntries((goal?.plan?.phases ?? []).map(phase => [phase.id, phase.status === "completed" &&
    Boolean(phase.verification?.trim()) && phase.tasks.every(task => task.status === "completed" && Boolean(task.evidence?.trim()))]))
}

function parseRecord(raw: unknown, directory: string, workspaceID: string | null): RecordState | undefined {
  if (raw === undefined) return
  const state = object(raw)
  const phases = object(state?.phases)
  if (!state || state.version !== 1 || state.directory !== directory || state.workspaceID !== workspaceID ||
    !Number.isSafeInteger(state.revision) || (state.revision as number) < 0 || typeof state.enabled !== "boolean" ||
    !(state.goalID === null || typeof state.goalID === "string") || !Number.isSafeInteger(state.planRevision) ||
    !phases || Object.keys(phases).length > 64 || !Object.values(phases).every(value => typeof value === "boolean") ||
    !(state.requested === null || typeof state.requested === "string")) throw new Error("Invalid or foreign-worktree handoff policy state; automatic handoff refused.")
  return state as unknown as RecordState
}

export function createHandoffAutomation(deps: AutomationDependencies) {
  const queues = new Map<string, Promise<unknown>>()
  const failed = new Set<string>()
  const check = () => { if (deps.signal?.aborted) throw new Error("Handoff policy unloaded.") }
  const serial = <T>(id: string, run: () => Promise<T>): Promise<T> => {
    const prior = queues.get(id) ?? Promise.resolve()
    const next = prior.catch(() => {}).then(() => { check(); return run() })
    queues.set(id, next)
    void next.finally(() => { if (queues.get(id) === next) queues.delete(id) }).catch(() => {})
    return next
  }
  const owned = async (sessionID: string, signal = deps.signal) => {
    check()
    signal?.throwIfAborted()
    const value = await getOwnedSession(deps.session, sessionID, deps.location, signal)
    if (value.info.location.workspaceID !== deps.location.workspaceID) throw new Error("Handoff workspace identity changed.")
    check()
    signal?.throwIfAborted()
    return value
  }
  const verifiedIdentity = async (info: SessionInfo, signal = deps.signal) => {
    const identity = workerIdentity(info)
    if (identity.role !== "worker") return identity
    const provenance = lineage(info)!
    const source = (await owned(provenance.sourceSessionID, signal)).info
    if (typeof info.projectID !== "string" || source.projectID !== info.projectID) throw new Error("Handoff source project identity is unknown or differs from its worker.")
    if (provenance.goalID) {
      const state = await deps.readState(source.id, { signal })
      if (![...(state?.current ? [state.current] : []), ...(state?.archives ?? [])].some(goal => goal.id === provenance.goalID && goal.sessionID === source.id)) {
        throw new Error("Legacy handoff source goal lineage cannot be verified; no naming or rotation performed.")
      }
    }
    check()
    signal?.throwIfAborted()
    return identity
  }
  const updateSessionTitle = async (id: string, verified: SessionInfo) => {
    const current = (await owned(id)).info
    if (!sameWorkerLineage(verified, current) || isPlanOrReadOnly(current) || current.revert) return
    const title = sessionTitle(current)
    // Publication needs a concrete last-read precondition; without it the host
    // gets no unconditional rename at all.
    if (typeof current.title !== "string" || title === current.title) return
    if (!await supportsConditionalTitle(deps.session, deps.signal)) return
    const afterHandshake = (await owned(id)).info
    if (!sameWorkerLineage(current, afterHandshake) || isPlanOrReadOnly(afterHandshake) || afterHandshake.revert ||
      afterHandshake.title !== current.title) return
    try {
      await deps.session.update({ sessionID: id, title, expectedTitle: current.title }, { signal: deps.signal })
    } catch (error) {
      // A concurrent human/model rename won the compare-and-swap. Leave it in
      // place; never retry, compensate or suspend the policy for this outcome.
      if (!titleConflict(error, id)) throw error
    }
  }
  const key = (id: string) => `source-handoff/v1/${id}`
  const load = async (info: SessionInfo, directory: string): Promise<RecordState> => {
    const workspaceID = info.location.workspaceID ?? null
    return parseRecord(await deps.storage.get(key(info.id)), directory, workspaceID) ?? {
      version: 1, directory, workspaceID, revision: 0, enabled: true,
      goalID: null, planRevision: -1, phases: {}, requested: null,
    }
  }
  const view = (info: SessionInfo, state: RecordState): HandoffSettingsView => ({
    sessionID: info.id, revision: state.revision, configuredEnabled: state.enabled,
    enabled: state.enabled && workerIdentity(info).role === "worker" && !failed.has(info.id),
    role: workerIdentity(info).role, requested: state.requested,
    notice: `${HANDOFF_CAPABILITY_NOTICE}${failed.has(info.id) ? " Automatic policy suspended after an error in this loaded instance; use manual /handoff." : ""}`,
  })
  const save = async (id: string, state: RecordState, signal = deps.signal) => {
    check()
    signal?.throwIfAborted()
    await deps.storage.set(key(id), state)
    check()
    signal?.throwIfAborted()
  }
  const requestSignal = (signal?: AbortSignal) => deps.signal && signal ? AbortSignal.any([deps.signal, signal]) : signal ?? deps.signal
  const read = (id: string, signal?: AbortSignal) => serial(id, async () => {
    const { info, directory } = await owned(id, requestSignal(signal))
    await verifiedIdentity(info, requestSignal(signal))
    return view(info, await load(info, directory))
  })
  const update = (id: string, revision: number, enabled: boolean, signal?: AbortSignal) => serial(id, async () => {
    const combined = requestSignal(signal)
    const { info, directory } = await owned(id, combined)
    await verifiedIdentity(info, combined)
    const state = await load(info, directory)
    if (state.revision !== revision) throw new Error("Handoff settings changed; reopen the dialog.")
    if (enabled && state.requested !== null) throw new Error("Automatic handoff already requested; use manual /handoff.")
    if (enabled && workerIdentity(info).role !== "worker") throw new Error("Only identified independent workers can enable automatic handoff; reviewers are never rotated.")
    if (enabled && failed.has(id)) throw new Error("Automatic policy is suspended after an error; use manual /handoff.")
    const next = { ...state, revision: state.revision + 1, enabled }
    if (enabled) {
      combined?.throwIfAborted()
      const goal = (await deps.readState(id, { signal: combined }))?.current ?? null
      if (goal && goal.sessionID !== id) throw new Error("Handoff goal belongs to another session.")
      next.goalID = goal?.id ?? null
      next.planRevision = goal?.planRevision ?? -1
      next.phases = verifiedPhases(goal)
    }
    const fresh = (await owned(id, combined)).info
    await verifiedIdentity(fresh, combined)
    if (workerIdentity(fresh).role !== workerIdentity(info).role) throw new Error("Handoff session role changed; reopen settings.")
    await save(id, next, combined)
    return view(fresh, next)
  })
  const context = (id: string, agent?: string): Promise<string | undefined> => serial(id, async () => {
    if (failed.has(id)) return
    try {
      const { info, directory } = await owned(id)
      const state = await load(info, directory)
      const observed = await deps.readState(id, { signal: deps.signal })
      const goal = observed?.current ?? null
      if (goal && goal.sessionID !== id) throw new Error("Handoff goal belongs to another session.")
      const phases = verifiedPhases(goal)
      const revision = goal?.planRevision ?? -1
      if (state.goalID === (goal?.id ?? null) && revision < state.planRevision) return
      const milestone = state.goalID === goal?.id && revision > state.planRevision &&
        Object.entries(phases).some(([phaseID, verified]) => verified && state.phases[phaseID] === false) &&
        goal?.plan?.phases.some(phase => phase.tasks.some(task => task.status !== "completed"))
      const next = { ...state, goalID: goal?.id ?? null, planRevision: revision, phases }
      const identity = await verifiedIdentity(info)
      const allowed = identity.role === "worker" && !isPlanOrReadOnly(info) && agent !== "plan" &&
        !info.revert && (!goal || goal.status === "active")
      const estimate = allowed && state.enabled && !state.requested ? currentContextEstimate(await deps.session.context({ sessionID: id }, { signal: deps.signal })) : undefined
      const reason = allowed && state.enabled && !state.requested ? milestone ? "verified goal phase milestone" :
        estimate !== undefined && estimate >= CONTEXT_HANDOFF_THRESHOLD ? `latest-step context estimate ${estimate} tokens (approximately 500k threshold)` : undefined : undefined
      const fresh = (await owned(id)).info
      const freshIdentity = await verifiedIdentity(fresh)
      if (freshIdentity.role !== identity.role || freshIdentity.hash !== identity.hash || isPlanOrReadOnly(fresh) || fresh.revert) return
      const latest = await deps.readState(id, { signal: deps.signal })
      if (latest?.fingerprint !== observed?.fingerprint) {
        // A pause/replacement while reading usage is a new baseline, not an
        // invitation to act on the stale goal or replay that milestone later.
        const current = latest?.current ?? null
        await owned(id)
        await save(id, { ...state, goalID: current?.id ?? null, planRevision: current?.planRevision ?? -1, phases: verifiedPhases(current) })
        return
      }
      if (reason) {
        next.requested = reason
        next.revision = state.revision + 1
      }
      // Persist the latch before exposing the request. A crash or uncertain write
      // sacrifices an automatic retry, not safety; manual /handoff stays available.
      if (JSON.stringify(state) !== JSON.stringify(next)) await save(id, next)
      if (!reason) {
        if (allowed && identity.hash) await updateSessionTitle(id, fresh)
        return
      }
      const final = (await owned(id)).info
      const finalIdentity = await verifiedIdentity(final)
      const finalState = await deps.readState(id, { signal: deps.signal })
      if (finalState?.fingerprint !== observed?.fingerprint || finalIdentity.role !== identity.role ||
        finalIdentity.hash !== identity.hash || isPlanOrReadOnly(final) || final.revert) return
      if (allowed && identity.hash) await updateSessionTitle(id, fresh)
      return `Automatic handoff request: ${reason}. This is a one-shot source-model request, not proof of transfer.\n\n${sourceHandoffRequest(id, directory)}`
    } catch (error) {
      failed.add(id)
      deps.report?.(error)
      return
    }
  }).catch(error => {
    if (!deps.signal?.aborted) deps.report?.(error)
    return undefined
  })
  const title = (id: string) => serial(id, async () => {
    const { info } = await owned(id)
    const identity = await verifiedIdentity(info)
    if (identity.role !== "worker" || !identity.hash) return
    const goal = (await deps.readState(id, { signal: deps.signal }))?.current ?? null
    if (goal && goal.sessionID !== id) throw new Error("Handoff goal belongs to another session.")
    const current = (await owned(id)).info
    if (!sameWorkerLineage(info, current)) return
    return sessionTitle(current)
  })
  return { read, update, context, title }
}
