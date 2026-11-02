import assert from "node:assert/strict"
import { test } from "node:test"

import { exportGoalState } from "./exporter.ts"
import { handoffPrompt, type GoalDocBundle } from "./render.ts"
import type { SessionInfo } from "./session.ts"
import { GOAL_PLUGIN_VERSION } from "./model.ts"
import { readGoalStateForSession } from "./state.ts"
import type { WriteBundleResult } from "./writer.ts"

const SOURCE_SESSION_ID = "ses_source_fixture"
const INVOKING_SESSION_ID = "ses_unrelated_fixture"
const SOURCE_DIRECTORY = "/fixture/source-worktree"
const PACKAGE_PATH = "/fixture/package.json"
const STATE_PATH = "/fixture/goals.json"
const PLAN_SUMMARY = "Preserve the selected source goal plan"
const PLAN_TASK = "Keep the exact source task and its evidence"
const HISTORY_ENTRY = "Source lifecycle history remains historical context"
const CHECKPOINT = "Source checkpoint remains historical context"

const repositoryMetadata = async () => ({
  kind: "git" as const,
  identity: "github.com/example/source-repository",
  worktree: "linked/topic",
  scope: "packages/source",
  gaps: [],
})

function codedError(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

function rawGoal(
  id: string,
  sessionID: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    sessionID,
    objective: `Objective for ${id}`,
    status: "active",
    planRevision: 7,
    plan: {
      summary: PLAN_SUMMARY,
      completionCriteria: ["Keep this completion criterion."],
      phases: [{
        id: "phase_source",
        objective: "Verify the selected source goal.",
        status: "in_progress",
        tasks: [{ id: "task_source", description: PLAN_TASK, status: "in_progress", evidence: "Source task evidence." }],
        verification: "Source phase verification.",
      }],
      decisions: ["Keep source decisions with the selected goal."],
      revision: 7,
      updatedAt: 1_798_000_000,
      changes: [{ revision: 7, reason: "Retained source plan decision.", timestamp: 1_799_000_000 }],
    },
    createdAt: 1_797_000_000,
    updatedAt: 1_800_000_000,
    closedAt: null,
    completionEvidence: null,
    blocker: null,
    stopReason: null,
    history: [{ type: "created", detail: HISTORY_ENTRY, timestamp: 1_798_000_000 }],
    checkpoints: [{ summary: CHECKPOINT, timestamp: 1_799_000_000 }],
    ...overrides,
  }
}

interface FixtureOptions {
  stateError?: Error
  missingState?: boolean
  sessionError?: Error
  returnedSessionID?: string
}

function exportFixture(rawState: unknown, options: FixtureOptions = {}) {
  const calls = {
    sessionIDs: [] as string[],
    stateSessionIDs: [] as string[],
    stateReads: 0,
    permissionSessionIDs: [] as string[],
    writeDirectories: [] as string[],
  }
  const stateText = JSON.stringify(rawState)
  const sourceSession: SessionInfo = {
    id: SOURCE_SESSION_ID,
    location: { directory: SOURCE_DIRECTORY },
    projectID: "project-source",
    agent: "build",
  }

  async function readFixtureFile(filePath: string, byteLimit: number, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw signal.reason ?? new Error("fixture read aborted")
    if (filePath === PACKAGE_PATH) {
      const packageText = JSON.stringify({ name: "@prevalentware/opencode-goal-plugin", version: GOAL_PLUGIN_VERSION })
      if (Buffer.byteLength(packageText, "utf8") > byteLimit) throw new Error("fixture package metadata exceeds read bound")
      return packageText
    }
    if (filePath !== STATE_PATH) throw codedError("ENOENT", `fixture file not found: ${filePath}`)
    calls.stateReads += 1
    if (options.stateError) throw options.stateError
    if (options.missingState) throw codedError("ENOENT", "fixture goal state is absent")
    if (Buffer.byteLength(stateText, "utf8") > byteLimit) throw new Error("fixture goal state exceeds read bound")
    return stateText
  }

  const dependencies = {
    session: {
      get: async ({ sessionID }: { sessionID: string }) => {
        calls.sessionIDs.push(sessionID)
        if (options.sessionError) throw options.sessionError
        return { ...sourceSession, id: options.returnedSessionID ?? sessionID }
      },
    },
    permission: {
      assert: async ({ sessionID }: { sessionID: string }) => { calls.permissionSessionIDs.push(sessionID) },
    },
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-source" } },
    repositoryMetadata,
    readState: async (sessionID: string, readOptions?: { signal?: AbortSignal }) => {
      calls.stateSessionIDs.push(sessionID)
      return readGoalStateForSession(sessionID, {
        readFile: async (filePath) => readFixtureFile(filePath, Number.MAX_SAFE_INTEGER, readOptions?.signal),
        readFileBounded: readFixtureFile,
        packageJsonPath: PACKAGE_PATH,
        statePath: STATE_PATH,
        ...(readOptions?.signal ? { signal: readOptions.signal } : {}),
      })
    },
    writeBundles: async (directory: string, bundles: readonly GoalDocBundle[]): Promise<WriteBundleResult> => {
      calls.writeDirectories.push(directory)
      const generated = [...bundles]
      return {
        bundles: generated,
        docsDirectory: `${directory}/docs/goals`,
        written: [],
        unchanged: [],
        goals: generated.map((bundle) => bundle.goalID),
      }
    },
    now: () => Date.UTC(2026, 9, 27),
  }

  return { dependencies, calls }
}

test("matching source session and goal retain source identity, plan, and historical context", async () => {
  const rawState = {
    version: 3,
    goals: {
      [SOURCE_SESSION_ID]: rawGoal("goal-source", SOURCE_SESSION_ID),
      [INVOKING_SESSION_ID]: rawGoal("goal-unrelated", INVOKING_SESSION_ID, { objective: "Do not substitute this goal." }),
    },
  }
  const fixture = exportFixture(rawState)
  const result = await exportGoalState({ sessionID: SOURCE_SESSION_ID, goalID: "goal-source" }, fixture.dependencies)

  assert.equal(result.status, "exported")
  assert.equal(result.source.sessionID, SOURCE_SESSION_ID)
  assert.equal(result.source.directory, SOURCE_DIRECTORY)
  assert.equal(result.selected?.goalID, "goal-source")
  assert.equal(result.selected?.source.sessionID, SOURCE_SESSION_ID)
  assert.equal(result.selected?.source.repository.identity, "github.com/example/source-repository")
  assert.equal(result.selected?.source.repository.worktree, "linked/topic")
  assert.equal(result.selected?.source.repository.scope, "packages/source")
  assert.deepEqual(fixture.calls.sessionIDs, [SOURCE_SESSION_ID])
  assert.deepEqual(fixture.calls.stateSessionIDs, [SOURCE_SESSION_ID])
  assert.deepEqual(result.bundles.map((bundle) => bundle.goalID), ["goal-source"])

  const selected = result.selected
  assert.ok(selected)
  const snapshot = JSON.parse(selected.files["snapshot.json"])
  assert.equal(snapshot.source.sessionID, SOURCE_SESSION_ID)
  assert.equal(snapshot.goal.sessionID, SOURCE_SESSION_ID)
  assert.equal(snapshot.goal.id, "goal-source")
  assert.equal(snapshot.goal.planRevision, 7)

  const text = handoffPrompt(selected, result.source)
  assert.match(text, /explicit \/handoff_resume\b/)
  assert.doesNotMatch(text, /(^|\s)\/handoff(?:\s|$)/)
  assert.doesNotMatch(text, /(^|\s)\/resume(?:\s|$)/)
  assert.match(text, /## Plan/)
  assert.match(text, /## Historical documentation/)
  assert.match(text, /HANDOFF\.md/)
  assert.match(text, /plan\.md/)
  assert.match(text, /work-history\.md/)
  assert.match(text, /github\.com\/example\/source-repository/)
  assert.match(text, /linked\/topic/)
  assert.match(text, /packages\/source/)
  assert.ok(text.includes(PLAN_SUMMARY))
  assert.ok(text.includes(PLAN_TASK))
  assert.ok(text.includes(HISTORY_ENTRY))
  assert.ok(text.includes(CHECKPOINT))
  assert.doesNotMatch(text, /goal-unrelated|Do not substitute this goal/)
})

test("an absent source goal or state file is reported as missing without writing or choosing another session", async (t) => {
  const scenarios: Array<{ name: string; rawState: unknown; options: FixtureOptions }> = [
    { name: "validated state has no source record", rawState: { version: 3, goals: {} }, options: {} },
    { name: "source state file is absent", rawState: { version: 3, goals: {} }, options: { missingState: true } },
  ]
  for (const scenario of scenarios) {
    await t.test(scenario.name, async () => {
      const fixture = exportFixture(scenario.rawState, scenario.options)
      const result = await exportGoalState({ sessionID: SOURCE_SESSION_ID, goalID: "goal-source" }, fixture.dependencies)

      assert.equal(result.status, "missing")
      assert.deepEqual(result.bundles, [])
      assert.deepEqual(fixture.calls.stateSessionIDs, [SOURCE_SESSION_ID])
      assert.deepEqual(fixture.calls.permissionSessionIDs, [])
      assert.deepEqual(fixture.calls.writeDirectories, [])
      if (scenario.options.missingState) assert.equal(result.state, null)
      else assert.equal(result.state?.current, null)
    })
  }
})

test("a goal belonging only to an unrelated current session is never substituted", async () => {
  const fixture = exportFixture({
    version: 3,
    goals: {
      [SOURCE_SESSION_ID]: rawGoal("goal-source-current", SOURCE_SESSION_ID),
      [INVOKING_SESSION_ID]: rawGoal("goal-requested", INVOKING_SESSION_ID),
    },
  })

  await assert.rejects(
    exportGoalState({ sessionID: SOURCE_SESSION_ID, goalID: "goal-requested" }, fixture.dependencies),
    /not present in the selected session's validated state/,
  )
  assert.deepEqual(fixture.calls.sessionIDs, [SOURCE_SESSION_ID])
  assert.deepEqual(fixture.calls.stateSessionIDs, [SOURCE_SESSION_ID])
  assert.deepEqual(fixture.calls.permissionSessionIDs, [])
  assert.deepEqual(fixture.calls.writeDirectories, [])
})

test("a source record whose embedded session ID is unrelated is rejected by the actual adapter", async () => {
  const fixture = exportFixture({
    version: 3,
    goals: { [SOURCE_SESSION_ID]: rawGoal("goal-forged", INVOKING_SESSION_ID) },
  })

  await assert.rejects(
    exportGoalState({ sessionID: SOURCE_SESSION_ID, goalID: "goal-forged" }, fixture.dependencies),
    /goal session ID does not match the selected source session/,
  )
  assert.deepEqual(fixture.calls.stateSessionIDs, [SOURCE_SESSION_ID])
  assert.deepEqual(fixture.calls.writeDirectories, [])
})

test("an inaccessible source goal-state file fails closed instead of becoming a missing goal", async () => {
  const fixture = exportFixture({ version: 3, goals: {} }, {
    stateError: codedError("EACCES", "fixture source state is inaccessible"),
  })

  await assert.rejects(
    exportGoalState({ sessionID: SOURCE_SESSION_ID, goalID: "goal-source" }, fixture.dependencies),
    /fixture source state is inaccessible/,
  )
  assert.deepEqual(fixture.calls.sessionIDs, [SOURCE_SESSION_ID])
  assert.deepEqual(fixture.calls.stateSessionIDs, [SOURCE_SESSION_ID])
  assert.deepEqual(fixture.calls.permissionSessionIDs, [])
  assert.deepEqual(fixture.calls.writeDirectories, [])
})

test("an inaccessible or mismatched source session is rejected before state lookup", async () => {
  const inaccessible = exportFixture({ version: 3, goals: {} }, {
    sessionError: codedError("EACCES", "fixture source session is inaccessible"),
  })
  await assert.rejects(
    exportGoalState({ sessionID: SOURCE_SESSION_ID, goalID: "goal-source" }, inaccessible.dependencies),
    /fixture source session is inaccessible/,
  )
  assert.deepEqual(inaccessible.calls.stateSessionIDs, [])

  const mismatched = exportFixture({ version: 3, goals: {} }, { returnedSessionID: INVOKING_SESSION_ID })
  await assert.rejects(
    exportGoalState({ sessionID: SOURCE_SESSION_ID, goalID: "goal-source" }, mismatched.dependencies),
    /different session ID/,
  )
  assert.deepEqual(mismatched.calls.stateSessionIDs, [])
  assert.deepEqual(mismatched.calls.writeDirectories, [])
})

test("paused source-goal status and its context survive export and handoff rendering", async () => {
  const fixture = exportFixture({
    version: 3,
    goals: { [SOURCE_SESSION_ID]: rawGoal("goal-paused", SOURCE_SESSION_ID, { status: "paused" }) },
  })
  const result = await exportGoalState({ sessionID: SOURCE_SESSION_ID, goalID: "goal-paused" }, fixture.dependencies)

  assert.equal(result.status, "exported")
  assert.equal(result.selected?.status, "paused")
  assert.equal(result.selected?.source.sessionID, SOURCE_SESSION_ID)
  assert.equal(JSON.parse(result.selected!.files["snapshot.json"]).goal.status, "paused")
  assert.match(result.selected!.files["HANDOFF.md"], /Goal status is `paused`/)
  const text = handoffPrompt(result.selected!, result.source)
  assert.match(text, /Preserve paused\/closed status/)
  assert.match(text, /Wait for the user's explicit \/handoff_resume/)
  assert.match(text, /Source lifecycle history remains historical context/)
  assert.match(text, /Source checkpoint remains historical context/)
  assert.equal(fixture.calls.permissionSessionIDs[0], SOURCE_SESSION_ID)
})

test("closed archived source goals retain their exact status and are not replaced by the active current goal", async (t) => {
  for (const status of ["complete", "unmet", "cancelled"] as const) {
    await t.test(status, async () => {
      const closedAt = 1_800_123_456
      const fixture = exportFixture({
        version: 3,
        goals: { [SOURCE_SESSION_ID]: rawGoal("goal-current-active", SOURCE_SESSION_ID) },
        archives: {
          [SOURCE_SESSION_ID]: [rawGoal(`goal-closed-${status}`, SOURCE_SESSION_ID, {
            status,
            closedAt,
            completionEvidence: status === "complete" ? "Recorded completion evidence." : null,
            blocker: status === "unmet" ? "Recorded unmet blocker." : null,
            stopReason: status === "cancelled" ? "Recorded cancellation reason." : null,
          })],
        },
      })
      const goalID = `goal-closed-${status}`
      const result = await exportGoalState({ sessionID: SOURCE_SESSION_ID, goalID }, fixture.dependencies)

      assert.equal(result.status, "exported")
      assert.equal(result.selected?.goalID, goalID)
      assert.equal(result.selected?.status, status)
      assert.equal(result.selected?.source.sessionID, SOURCE_SESSION_ID)
      assert.deepEqual(result.bundles.map((bundle) => bundle.goalID), [goalID, "goal-current-active"])

      const snapshot = JSON.parse(result.selected!.files["snapshot.json"])
      assert.equal(snapshot.goal.status, status)
      assert.equal(snapshot.goal.closedAt, closedAt)
      assert.equal(snapshot.goal.sourceKind, "archive")
      assert.equal(snapshot.goal.sessionID, SOURCE_SESSION_ID)
      const text = handoffPrompt(result.selected!, result.source)
      assert.match(text, /Preserve paused\/closed status/)
      assert.ok(text.includes("Goal status is `" + status + "`;"))
      assert.match(text, /## Plan/)
      assert.match(text, /## Historical documentation/)
      assert.match(text, /Source lifecycle history remains historical context/)
      assert.match(text, /Source checkpoint remains historical context/)
      assert.doesNotMatch(text, /goal-current-active/)
    })
  }
})
