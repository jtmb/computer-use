import { createHash } from "node:crypto"

export const GOAL_PLUGIN_VERSION = "0.1.67"
export const GOAL_STATUSES = [
  "active",
  "paused",
  "budgetLimited",
  "usageLimited",
  "complete",
  "unmet",
  "cancelled",
] as const

export type GoalStatus = (typeof GOAL_STATUSES)[number]
export type PlanStatus = "pending" | "in_progress" | "completed" | "blocked"

export interface GoalPlanTask {
  id: string
  description: string
  status: PlanStatus
  evidence?: string | null
  blocker?: string | null
}

export interface GoalPlanPhase {
  id: string
  objective: string
  status: PlanStatus
  tasks: GoalPlanTask[]
  verification?: string | null
  blocker?: string | null
}

export interface GoalPlanChange {
  revision: number
  reason: string
  timestamp: number
  revisitEvidence?: string
}

export interface GoalPlan {
  summary: string
  completionCriteria: string[]
  phases: GoalPlanPhase[]
  decisions: string[]
  revision: number
  updatedAt: number
  changes: GoalPlanChange[]
}

export interface GoalHistoryEntry {
  type: string
  detail: string
  timestamp: number
}

export interface GoalCheckpoint {
  summary: string
  timestamp: number
}

export interface GoalRecord {
  id: string
  sessionID: string
  objective: string
  status: GoalStatus
  plan: GoalPlan | null
  planRevision: number
  createdAt: number
  updatedAt: number
  closedAt: number | null
  completionEvidence: string | null
  blocker: string | null
  stopReason: string | null
  history: GoalHistoryEntry[]
  checkpoints: GoalCheckpoint[]
  sourceKind: "current" | "archive"
  historyNotice: string
}

export interface SessionGoalState {
  version: 1 | 2 | 3
  current: GoalRecord | null
  archives: GoalRecord[]
  historyNotice: string
  fingerprint: string
}

export interface ExportSource {
  sessionID: string
  directory: string
  exportedAt: string
  repository: RepositoryMetadata
}

export interface RepositoryMetadata {
  kind: "git" | "not-git-repository" | "unavailable"
  identity: string | null
  worktree: string | null
  scope: string | null
  gaps: string[]
}

export interface GoalSnapshot {
  schemaVersion: 1
  renderVersion: 1
  source: ExportSource
  goal: GoalRecord
  historyNotice: string
  contentFingerprint: string
  generatedFiles: Record<string, string>
}

const MAX_TEXT_CHARS = 16_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, label: string, limit = MAX_TEXT_CHARS): string {
  if (typeof value !== "string" || [...value].length > limit) {
    throw new Error(`invalid goal state: ${label} must be a string of at most ${limit} characters`)
  }
  return sanitizeText(value, limit)
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null
  return requiredString(value, label)
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`invalid goal state: ${label} must be a finite number`)
  }
  return value
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`invalid goal state: ${label} must be a non-negative integer`)
  }
  return value
}

function planStatus(value: unknown, label: string): PlanStatus {
  if (value === "pending" || value === "in_progress" || value === "completed" || value === "blocked") {
    return value
  }
  throw new Error(`invalid goal state: ${label} has an unsupported status`)
}

function boundedArray(value: unknown, label: string, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) {
    throw new Error(`invalid goal state: ${label} must contain at most ${max} entries`)
  }
  return value
}

function parsePlan(value: unknown): GoalPlan | null {
  if (value == null) return null
  if (!isRecord(value)) throw new Error("invalid goal state: plan must be an object or null")

  const criteria = boundedArray(value.completionCriteria, "plan.completionCriteria", 32)
  const phases = boundedArray(value.phases, "plan.phases", 64).map((item, phaseIndex) => {
    if (!isRecord(item)) throw new Error(`invalid goal state: plan.phases[${phaseIndex}] must be an object`)
    const tasks = boundedArray(item.tasks, `plan.phases[${phaseIndex}].tasks`, 128).map((task, taskIndex) => {
      if (!isRecord(task)) throw new Error(`invalid goal state: plan task ${phaseIndex}.${taskIndex} must be an object`)
      return {
        id: requiredString(task.id, "plan task id", 80),
        description: requiredString(task.description, "plan task description", 2_000),
        status: planStatus(task.status, "plan task"),
        ...(task.evidence == null ? {} : { evidence: optionalText(task.evidence, "plan task evidence") }),
        ...(task.blocker == null ? {} : { blocker: optionalText(task.blocker, "plan task blocker") }),
      }
    })
    if (tasks.length === 0) throw new Error(`invalid goal state: plan.phases[${phaseIndex}].tasks must not be empty`)
    return {
      id: requiredString(item.id, "plan phase id", 80),
      objective: requiredString(item.objective, "plan phase objective", 2_000),
      status: planStatus(item.status, "plan phase"),
      tasks,
      ...(item.verification == null ? {} : { verification: optionalText(item.verification, "plan phase verification") }),
      ...(item.blocker == null ? {} : { blocker: optionalText(item.blocker, "plan phase blocker") }),
    }
  })
  const decisions = boundedArray(value.decisions ?? [], "plan.decisions", 32).map((item, index) =>
    requiredString(item, `plan.decisions[${index}]`, 2_000),
  )
  const changes = boundedArray(value.changes ?? [], "plan.changes", 32).map((item, index) => {
    if (!isRecord(item)) throw new Error(`invalid goal state: plan.changes[${index}] must be an object`)
    return {
      revision: nonNegativeInteger(item.revision, "plan change revision"),
      reason: requiredString(item.reason, "plan change reason", 2_000),
      timestamp: finiteNumber(item.timestamp, "plan change timestamp"),
      ...(item.revisitEvidence == null
        ? {}
        : { revisitEvidence: requiredString(item.revisitEvidence, "plan change revisit evidence", 2_000) }),
    }
  })

  if (criteria.length === 0 || phases.length === 0) {
    throw new Error("invalid goal state: a persisted plan needs completion criteria and phases")
  }
  return {
    summary: requiredString(value.summary, "plan.summary", 2_000),
    completionCriteria: criteria.map((item, index) => requiredString(item, `plan.completionCriteria[${index}]`, 2_000)),
    phases,
    decisions,
    revision: nonNegativeInteger(value.revision, "plan.revision"),
    updatedAt: finiteNumber(value.updatedAt, "plan.updatedAt"),
    changes,
  }
}

function parseHistory(value: unknown, label: string, max: number): GoalHistoryEntry[] {
  return boundedArray(value ?? [], label, max).map((item, index) => {
    if (!isRecord(item)) throw new Error(`invalid goal state: ${label}[${index}] must be an object`)
    return {
      type: requiredString(item.type, `${label}[${index}].type`, 80),
      detail: requiredString(item.detail, `${label}[${index}].detail`, 2_000),
      timestamp: finiteNumber(item.timestamp, `${label}[${index}].timestamp`),
    }
  })
}

function parseCheckpoints(value: unknown, label: string): GoalCheckpoint[] {
  return boundedArray(value ?? [], label, 8).map((item, index) => {
    if (!isRecord(item)) throw new Error(`invalid goal state: ${label}[${index}] must be an object`)
    return {
      summary: requiredString(item.summary, `${label}[${index}].summary`, 280),
      timestamp: finiteNumber(item.timestamp, `${label}[${index}].timestamp`),
    }
  })
}

function parseGoal(value: unknown, sessionID: string, sourceKind: GoalRecord["sourceKind"]): GoalRecord {
  if (!isRecord(value) || value.sessionID !== sessionID) {
    throw new Error("invalid goal state: goal session ID does not match the selected source session")
  }
  if (typeof value.status !== "string" || !GOAL_STATUSES.includes(value.status as GoalStatus)) {
    throw new Error("invalid goal state: unsupported goal status")
  }
  const createdAt = finiteNumber(value.createdAt, "goal.createdAt")
  const plan = parsePlan(value.plan)
  const planRevision = value.planRevision === undefined
    ? plan?.revision ?? 0
    : nonNegativeInteger(value.planRevision, "goal.planRevision")
  const historyLimit = sourceKind === "archive" ? 20 : 50
  return {
    id: value.id === undefined
      ? `legacy:${sessionID}:${createdAt}`
      : requiredString(value.id, "goal.id", 200),
    sessionID,
    objective: requiredString(value.objective, "goal.objective", 100_000),
    status: value.status as GoalStatus,
    plan,
    planRevision,
    createdAt,
    updatedAt: finiteNumber(value.updatedAt, "goal.updatedAt"),
    closedAt: value.closedAt == null ? null : finiteNumber(value.closedAt, "goal.closedAt"),
    completionEvidence: optionalText(value.completionEvidence, "goal.completionEvidence"),
    blocker: optionalText(value.blocker, "goal.blocker"),
    stopReason: optionalText(value.stopReason, "goal.stopReason"),
    history: parseHistory(value.history, "goal.history", historyLimit),
    checkpoints: parseCheckpoints(value.checkpoints, "goal.checkpoints"),
    sourceKind,
    historyNotice: sourceKind === "archive"
      ? "This is one retained archived goal. The goal plugin bounds archived records, so older records may have been pruned."
      : "The goal plugin retains bounded lifecycle history. This export cannot prove that no earlier history entries were pruned.",
  }
}

export function parseSessionGoalState(raw: unknown, sessionID: string): SessionGoalState {
  if (!isRecord(raw) || ![1, 2, 3].includes(raw.version as number) || !isRecord(raw.goals)) {
    throw new Error("unsupported goal state schema; expected goal-plugin state version 1, 2, or 3")
  }
  if (!sessionID || sessionID.length > 200) throw new Error("invalid source session ID")

  const version = raw.version as SessionGoalState["version"]
  const currentValue = raw.goals[sessionID]
  const current = currentValue === undefined ? null : parseGoal(currentValue, sessionID, "current")
  if (raw.archives !== undefined && (!isRecord(raw.archives) || Object.keys(raw.archives).length > 1_000)) {
    throw new Error("invalid goal state: archives must be a bounded object")
  }
  const archiveValues = raw.archives === undefined
    ? []
    : isRecord(raw.archives)
      ? boundedArray(raw.archives[sessionID] ?? [], "session archives", 20)
      : (() => { throw new Error("invalid goal state: archives must be an object") })()
  const archives = archiveValues.map((item) => parseGoal(item, sessionID, "archive"))
  const historyNotice = version === 1
    ? "Goal state version 1 has no archive collection. Cleared/replaced goal history cannot be reconstructed from this source."
    : archives.length >= 20
      ? "The source retains the maximum per-session archive count; earlier cleared/replaced goals may have been pruned."
      : "Only retained archived goals are available. The plugin also bounds archives globally, so full historical completeness cannot be proven."
  const selected = [...archives, ...(current ? [current] : [])]
  const uniqueIDs = new Set<string>()
  for (const goal of selected) {
    if (uniqueIDs.has(goal.id)) throw new Error(`invalid goal state: duplicate goal ID ${goal.id} in the selected session`)
    uniqueIDs.add(goal.id)
  }
  const fingerprint = sha256(JSON.stringify({
    version,
    historyNotice,
    goals: semanticFingerprint(selected),
  }))
  return { version, current, archives, historyNotice, fingerprint }
}

export function semanticFingerprint(goals: readonly GoalRecord[]): string {
  const semantic = goals.map((goal) => ({
    id: goal.id,
    sessionID: goal.sessionID,
    objective: goal.objective,
    status: goal.status,
    plan: goal.plan,
    planRevision: goal.planRevision,
    closedAt: goal.closedAt,
    completionEvidence: goal.completionEvidence,
    blocker: goal.blocker,
    stopReason: goal.stopReason,
    history: goal.history,
    checkpoints: goal.checkpoints,
    sourceKind: goal.sourceKind,
  }))
  return sha256(JSON.stringify(semantic))
}

export function safeGoalDirectoryName(goalID: string): string {
  if (!goalID || goalID.length > 200 || /[\\/\0]/.test(goalID) || goalID === "." || goalID === "..") {
    throw new Error("goal ID is not safe to use as a documentation directory")
  }
  const value = goalID.replace(/[^A-Za-z0-9._-]/g, "_")
  if (!value || value === "." || value === "..") throw new Error("goal ID has no safe directory representation")
  return value
}

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

export function sanitizeText(value: string, limit = MAX_TEXT_CHARS): string {
  // Loopback document URLs carry short-lived access capabilities, not portable evidence.
  const scrubbed = value
    .replace(/http:\/\/127\.0\.0\.1:\d{1,5}\/[A-Za-z0-9_-]{32,64}(?:\/[0-3])?(?![A-Za-z0-9_/-])/g, "[redacted local document URL]")
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, "$1 [redacted]")
    .replace(/\b(?:github_pat_[A-Za-z0-9_]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|xox[baprs]-[A-Za-z0-9-]{16,})\b/g, "[redacted credential]")
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, "[redacted private key]")
    .replace(/((?:password|passwd|secret|client[_-]?secret|private[_-]?key|api[_-]?key|access[_-]?token|refresh[_-]?token|token|authorization)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi, "$1[redacted]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
  const chars = [...scrubbed]
  return chars.length > limit ? `${chars.slice(0, limit).join("")}… [truncated]` : scrubbed
}

export function quoteMarkdown(value: string): string {
  return sanitizeText(value, 100_000).split("\n").map((line) => {
    const safe = line
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replace(/[\\`*_{}\[\]()#+.!|~-]/g, "\\$&")
    return `> ${safe}`
  }).join("\n")
}

export function isoTimestamp(value: number | null): string {
  if (value === null) return "Not recorded"
  const milliseconds = value > 10_000_000_000 ? value : value * 1000
  const date = new Date(milliseconds)
  return Number.isNaN(date.valueOf()) ? `Invalid timestamp (${value})` : date.toISOString()
}

export function buildGoalSnapshot(
  source: ExportSource,
  goal: GoalRecord,
  historyNotice: string,
  generatedFiles: Record<string, string>,
): GoalSnapshot {
  const contentFingerprint = semanticFingerprint([goal])
  return { schemaVersion: 1, renderVersion: 1, source, goal, historyNotice, contentFingerprint, generatedFiles }
}
