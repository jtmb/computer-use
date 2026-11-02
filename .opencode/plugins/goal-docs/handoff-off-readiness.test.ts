import assert from "node:assert/strict"
import test from "node:test"

import { assessHandoffOffReadiness, type HandoffOffReadinessInput } from "./handoff-off-readiness.ts"

const source = { repositoryID: "repo-fixture", worktreeID: "worktree-fixture", sessionID: "ses-source-fixture" }

function manual(overrides: Partial<Extract<HandoffOffReadinessInput, { kind: "manual-command" }>> = {}) {
  return {
    kind: "manual-command" as const,
    explicit: true,
    command: "/handoff_resume",
    automaticEnabled: false,
    expectedSource: source,
    observedSource: { identity: source, status: "idle" as const },
    receiverSessionID: "ses-receiver-fixture",
    goalID: null,
    overlappingEdits: false,
    ...overrides,
  }
}

test("a seed, open, read, or focus event is passive and never becomes continuation", () => {
  for (const kind of ["seed", "open", "read", "focus"] as const) {
    assert.equal(assessHandoffOffReadiness({ kind }).disposition, "passive")
  }
})

test("OFF blocks only automatic requests; manual handoff remains a separate explicit path", () => {
  assert.equal(assessHandoffOffReadiness({
    kind: "automatic-context", enabled: false, role: "worker", requested: false,
  }).disposition, "passive")
  assert.equal(assessHandoffOffReadiness({
    kind: "automatic-context", enabled: true, role: "reviewer", requested: false,
  }).disposition, "passive")
  assert.equal(assessHandoffOffReadiness({
    kind: "automatic-context", enabled: true, role: "worker", requested: true,
  }).disposition, "passive")
  assert.deepEqual(assessHandoffOffReadiness({
    kind: "automatic-context", enabled: true, role: "worker", requested: false,
  }), { disposition: "automatic-request-allowed" })

  const off = assessHandoffOffReadiness(manual({ automaticEnabled: false }))
  const on = assessHandoffOffReadiness(manual({ automaticEnabled: true }))
  assert.deepEqual(off, { disposition: "explicit-continuation-ready", automaticEnabled: false })
  assert.deepEqual(on, { disposition: "explicit-continuation-ready", automaticEnabled: true })
})

test("only the exact explicit command can request the manual continuation path", () => {
  assert.equal(assessHandoffOffReadiness(manual({ explicit: false })).disposition, "passive")
  assert.deepEqual(assessHandoffOffReadiness(manual({ command: "/handoff" })), {
    disposition: "blocked", reason: "The explicit continuation command does not match.",
  })
})

test("a foreign source or a source reused as receiver blocks continuation", () => {
  assert.equal(assessHandoffOffReadiness(manual({
    observedSource: { identity: { ...source, worktreeID: "other-worktree" }, status: "idle" },
  })).disposition, "blocked")
  assert.equal(assessHandoffOffReadiness(manual({ receiverSessionID: source.sessionID })).disposition, "blocked")
})

test("goal-scoped work requires the matching source goal to be currently active", () => {
  const base = manual({ goalID: "goal-fixture", observedSource: { identity: source, status: "idle", goal: {
    id: "goal-fixture", sessionID: source.sessionID, status: "active",
  } } })
  assert.equal(assessHandoffOffReadiness(base).disposition, "explicit-continuation-ready")
  assert.equal(assessHandoffOffReadiness(manual({
    ...base,
    observedSource: { identity: source, status: "idle", goal: { id: "other-goal", sessionID: source.sessionID, status: "active" } },
  })).disposition, "blocked")
  assert.equal(assessHandoffOffReadiness(manual({
    ...base,
    observedSource: { identity: source, status: "idle", goal: { id: "goal-fixture", sessionID: source.sessionID, status: "paused" } },
  })).disposition, "blocked")
})

test("overlapping edits require complete live idleness, while non-overlapping work does not", () => {
  assert.equal(assessHandoffOffReadiness(manual({
    observedSource: { identity: source, status: "running" },
    overlappingEdits: false,
  })).disposition, "explicit-continuation-ready")

  const blocked = [
    manual({ overlappingEdits: true, workers: { complete: true, allIdle: true }, observedSource: { identity: source, status: "running" } }),
    manual({ overlappingEdits: true, workers: { complete: false, allIdle: true } }),
    manual({ overlappingEdits: true, workers: { complete: true, allIdle: false } }),
    manual({ overlappingEdits: true, workers: undefined }),
  ]
  for (const input of blocked) assert.equal(assessHandoffOffReadiness(input).disposition, "blocked")
  assert.equal(assessHandoffOffReadiness(manual({
    overlappingEdits: true, workers: { complete: true, allIdle: true },
  })).disposition, "explicit-continuation-ready")
})
