export type HandoffSourceIdentity = Readonly<{
  repositoryID: string
  worktreeID: string
  sessionID: string
}>

type AutomaticRole = "worker" | "reviewer" | "unclassified"

export type HandoffOffReadinessInput =
  | { kind: "seed" }
  | { kind: "open" }
  | { kind: "read" }
  | { kind: "focus" }
  | { kind: "automatic-context"; enabled: boolean; role: AutomaticRole; requested: boolean }
  | {
      kind: "manual-command"
      explicit: boolean
      command: string
      automaticEnabled: boolean
      expectedSource: HandoffSourceIdentity
      observedSource: {
        identity: HandoffSourceIdentity
        status: "idle" | "running" | "unknown"
        goal?: { id: string; sessionID: string; status: string } | null
      }
      receiverSessionID: string
      goalID: string | null
      overlappingEdits: boolean
      workers?: { complete: boolean; allIdle: boolean }
    }

export type HandoffOffReadiness =
  | { disposition: "passive"; reason: string }
  | { disposition: "automatic-request-allowed" }
  | { disposition: "blocked"; reason: string }
  | { disposition: "explicit-continuation-ready"; automaticEnabled: boolean }

function sameSource(left: HandoffSourceIdentity, right: HandoffSourceIdentity): boolean {
  return [left.repositoryID, left.worktreeID, left.sessionID].every(value => typeof value === "string" && value.length > 0) &&
    left.repositoryID === right.repositoryID && left.worktreeID === right.worktreeID && left.sessionID === right.sessionID
}

const SESSION_ID_PATTERN = /^ses[-_][A-Za-z0-9_-]+$/
const MAX_SESSION_ID_LENGTH = 200

function validSessionID(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_SESSION_ID_LENGTH && SESSION_ID_PATTERN.test(value)
}

export function assessHandoffOffReadiness(input: HandoffOffReadinessInput): HandoffOffReadiness {
  if (input.kind === "seed" || input.kind === "open" || input.kind === "read" || input.kind === "focus") {
    return { disposition: "passive", reason: "Only an explicit /handoff_resume invocation can request continuation." }
  }

  if (input.kind === "automatic-context") {
    if (typeof input.enabled !== "boolean" || typeof input.requested !== "boolean") {
      return { disposition: "passive", reason: "Automatic handoff policy is malformed; no automatic request." }
    }
    if (!input.enabled) return { disposition: "passive", reason: "Automatic handoff is OFF; native compaction and manual commands are unchanged." }
    if (input.role !== "worker") return { disposition: "passive", reason: "Automatic requests are limited to identified workers." }
    if (input.requested) return { disposition: "passive", reason: "This source already has its one-shot automatic request." }
    return { disposition: "automatic-request-allowed" }
  }

  if (typeof input.explicit !== "boolean") return { disposition: "blocked", reason: "Explicit continuation intent is malformed." }
  if (!input.explicit) return { disposition: "passive", reason: "The command was not explicitly invoked." }
  if (input.command !== "/handoff_resume") return { disposition: "blocked", reason: "The explicit continuation command does not match." }
  if (!sameSource(input.expectedSource, input.observedSource.identity)) {
    return { disposition: "blocked", reason: "The current source repository, worktree, or session does not match the handoff." }
  }
  if (!validSessionID(input.receiverSessionID) || input.receiverSessionID === input.expectedSource.sessionID) {
    return { disposition: "blocked", reason: "Continuation must remain in a distinct receiving session." }
  }
  if (input.goalID !== null) {
    const goal = input.observedSource.goal
    if (!goal || goal.id !== input.goalID || goal.sessionID !== input.expectedSource.sessionID || goal.status !== "active") {
      return { disposition: "blocked", reason: "Goal-scoped continuation requires the exact source goal to be currently active." }
    }
  }
  if (input.overlappingEdits && (input.observedSource.status !== "idle" || !input.workers || !input.workers.complete || !input.workers.allIdle)) {
    return { disposition: "blocked", reason: "Overlapping edits require a verified idle source and a complete, idle worker set." }
  }

  return { disposition: "explicit-continuation-ready", automaticEnabled: input.automaticEnabled }
}
