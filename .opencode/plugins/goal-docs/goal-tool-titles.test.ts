import assert from "node:assert/strict"
import { registerHooks } from "node:module"
import test from "node:test"

import { parseSessionGoalState } from "./model.ts"
import { registerGoalToolTitleRefresh } from "./goal-tool-titles.ts"

const stateReaderKey = "__goalToolTitleStateReader"
const globalState = globalThis as typeof globalThis & { [stateReaderKey]?: (sessionID: string) => unknown }

const modules = registerHooks({
  resolve(specifier, context, next) {
    const source = specifier === "@opencode/plugin" ? "export const Plugin = { define: value => value }"
      : specifier === "@opencode/plugin/rpc" ? "export const Rpc = { define: value => value }"
      : context.parentURL?.endsWith("/goal-docs/index.ts") && specifier === "./observer.ts" ? "export const startGoalObserver = () => () => {}"
      : context.parentURL?.endsWith("/goal-docs/index.ts") && specifier === "./state.ts"
        ? `export const resolveGoalPluginVersion = async () => "0.1.67"; export const readGoalStateForSession = async sessionID => globalThis.${stateReaderKey}?.(sessionID) ?? null`
        : undefined
    return source === undefined ? next(specifier, context) : { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true }
  },
})
let plugin: typeof import("./index.ts").default
try { plugin = (await import("./index.ts")).default } finally { modules.deregister() }

type GoalToolExecution = { tool: string; sessionID: string; id: string; status: string; result?: unknown; agent?: string }
type SessionHookEvent = { sessionID: string; agent: string; system: unknown[]; result?: string }

function goalState(sessionID: string, taskID = "input", description = `Implement supported ${taskID} behavior without losing current functionality`, status = "active") {
  return parseSessionGoalState({ version: 3, goals: { [sessionID]: {
    id: "goal-one", sessionID, objective: "Deliver features", status, createdAt: 1, updatedAt: 2,
    planRevision: 1, plan: { summary: "Deliver features", revision: 1, updatedAt: 2, completionCriteria: ["done"],
      phases: [{ id: "source", objective: "Source delivery", status: "in_progress", tasks: [
        { id: taskID, description, status: "in_progress" },
      ] }] },
  } } }, sessionID)
}

async function fixture() {
  const id = "ses_root_goal_tool_title_refresh"
  const directory = "/fixture/worktree"
  let current = goalState(id)
  let info: Record<string, unknown> = { id, title: "Fix desktop input", agent: "build", projectID: "project", location: { directory, workspaceID: "workspace" } }
  let generated = "Newest task outcome"
  const records = new Map<string, unknown>()
  const sessionHooks = new Map<string, (event: SessionHookEvent) => Promise<void>>()
  const toolHooks = new Map<string, (event: GoalToolExecution) => Promise<void>>()
  const disposed: string[] = []
  const updates: { sessionID: string; title: string; expectedTitle?: string }[] = []
  const prompts: string[] = []
  const rpcHandlers = new Map<string, Record<string, (input: unknown) => Promise<unknown>>>()
  globalState[stateReaderKey] = sessionID => sessionID === id ? structuredClone(current) : null

  const cleanup = await plugin.setup({
    location: { directory, workspaceID: "workspace", project: { id: "project" } },
    plugin: { async list() { return [] } },
    session: {
      async get(input: { sessionID: string }) { return input.sessionID === id ? structuredClone(info) : null },
      async update(input: { sessionID: string; title: string; expectedTitle?: string }) {
        assert.equal(typeof input.expectedTitle, "string", "conditional publication forwards the last read title")
        assert.equal(input.expectedTitle, info.title)
        updates.push(input)
        info = { ...info, title: input.title }
      },
      async generate(input: { sessionID: string; prompt: string }) { prompts.push(input.prompt); return { text: generated } },
      async capabilities() { return { conditionalTitleUpdate: 1 } },
      async hook(name: string, callback: (event: SessionHookEvent) => Promise<void>) {
        sessionHooks.set(name, callback)
        return { async dispose() { disposed.push(`session:${name}`) } }
      },
    },
    tool: {
      async hook(name: string, callback: (event: GoalToolExecution) => Promise<void>) {
        toolHooks.set(name, callback)
        return { async dispose() { disposed.push(`tool:${name}`) } }
      },
    },
    rpc: { async register(definition: { id: string }, handlers: Record<string, (input: unknown) => Promise<unknown>>) {
      rpcHandlers.set(definition.id, handlers)
      return { async dispose() { disposed.push(`rpc:${definition.id}`) } }
    } },
    storage: {
      async get(key: string) { return structuredClone(records.get(key)) },
      async set(key: string, value: unknown) { records.set(key, structuredClone(value)) },
    },
    event: {},
  } as never) as () => Promise<void>

  return {
    id,
    info: (patch: Record<string, unknown>) => { info = { ...info, ...patch } },
    state: (value: ReturnType<typeof goalState>) => { current = value },
    answer: (value: string) => { generated = value },
    sessionHooks,
    toolHooks,
    disposed,
    updates,
    prompts,
    rpcHandlers,
    cleanup: async () => {
      try { await cleanup() } finally { delete globalState[stateReaderKey] }
    },
  }
}

test("server wires successful goal-tool execution to the current root task, not read-only or failed calls", async () => {
  const f = await fixture()
  try {
    const context = f.sessionHooks.get("context")
    assert.ok(context, "the existing context fallback remains registered")
    await context({ sessionID: f.id, agent: "build", system: [] })
    assert.equal(f.updates.at(-1)?.title, `Fix desktop input · ${f.id}`)
    const diagnostics = f.rpcHandlers.get("computer-use.task-titles")
    assert.ok(diagnostics)
    const status = await diagnostics.status({ sessionID: f.id }) as { taskKey: string; attemptedTaskKey: string }
    assert.equal(status.taskKey, status.attemptedTaskKey)

    const after = f.toolHooks.get("execute.after")
    assert.ok(after, "register the supported native execute.after hook")
    const updateCount = f.updates.length
    const promptCount = f.prompts.length
    f.state(goalState(f.id, "stale", "Implement supported stale behavior"))
    await after({ tool: "update_goal_plan", sessionID: f.id, id: "failed", status: "error" })
    await after({ tool: "update_goal_plan", sessionID: f.id, id: "returned-error", status: "completed", result: { error: "plan validation failed" } })
    await after({ tool: "get_goal", sessionID: f.id, id: "read-only", status: "completed" })
    await after({ tool: "get_goal_history", sessionID: f.id, id: "history", status: "completed" })
    await after({ tool: "list_all_goals", sessionID: f.id, id: "list", status: "completed" })
    await after({ tool: "unrelated_tool", sessionID: f.id, id: "unrelated", status: "completed" })
    assert.equal(f.updates.length, updateCount, "failed mutations and successful reads do not refresh")
    assert.equal(f.prompts.length, promptCount)

    const pending = after({ tool: "update_goal_plan", sessionID: f.id, id: "successful", status: "completed", result: { content: JSON.stringify({ goal: { id: "goal-one" } }) } })
    f.state(goalState(f.id, "latest", "Implement supported latest behavior"))
    f.answer("Newest task outcome")
    await pending
    assert.equal(f.updates.at(-1)?.title, `Newest task outcome · ${f.id}`)
    assert.ok(f.prompts.at(-1)?.includes("Implement supported latest behavior"))
    assert.ok(!f.prompts.at(-1)?.includes("stale"), "the adapter reads the latest scoped goal state")

    const beforeManualRename = f.updates.length
    f.info({ title: `User chosen label · ${f.id}` })
    f.state(goalState(f.id, "manual", "Implement supported manual exclusion"))
    await after({ tool: "update_goal_status", sessionID: f.id, id: "manual", status: "completed", result: { content: JSON.stringify({ goal: { id: "goal-one" } }) } })
    assert.equal(f.updates.length, beforeManualRename, "a deliberate title edit wins")
    assert.equal(f.prompts.length, promptCount + 1, "a manual edit does not dispatch title generation")

    const exclusions: { name: string; patch: Record<string, unknown>; goalStatus?: string; agent?: string }[] = [
      { name: "child", patch: { parentID: "ses_parent" } },
      { name: "plan-agent", patch: {}, agent: "plan" },
      { name: "plan-session", patch: { agent: "plan" } },
      { name: "reviewer", patch: { title: "Reviewer notes" } },
      { name: "inactive", patch: {}, goalStatus: "paused" },
    ]
    for (const scenario of exclusions) {
      f.info({ title: `Root title · ${f.id}`, agent: "build", parentID: undefined, ...scenario.patch })
      f.state(goalState(f.id, `excluded-${scenario.name}`, "Implement supported excluded behavior", scenario.goalStatus))
      const before = f.updates.length
      await after({ tool: "update_goal_plan", sessionID: f.id, id: "excluded", status: "completed", agent: scenario.agent,
        result: { content: JSON.stringify({ goal: { id: "goal-one" } }) } })
      assert.equal(f.updates.length, before, scenario.name)
    }
  } finally {
    await f.cleanup()
  }
  assert.ok(f.disposed.includes("tool:execute.after"), "unload disposes the native tool hook")
  assert.ok(f.disposed.includes("rpc:computer-use.task-titles"), "unload disposes read-only diagnostics")
})

test("native goal receipts exclude reused, conflicting, malformed and content-only error results", async () => {
  let after: ((event: GoalToolExecution) => Promise<void>) | undefined
  const refreshed: string[] = []
  await registerGoalToolTitleRefresh({ async hook(_name, callback) {
    after = callback
    return { async dispose() {} }
  } }, { async context(sessionID) { refreshed.push(sessionID) } })
  assert.ok(after)
  const success = { goal: { id: "goal-one" } }
  const event = { tool: "create_goal", sessionID: "ses_receipt_root", id: "receipt", status: "completed" }
  for (const payload of [{ ...success, reused: true }, { ...success, conflicting: true },
    { error: "validation failed" }, { ...success, success: false }]) {
    await after({ ...event, result: { content: JSON.stringify(payload) } })
  }
  for (const result of [undefined, {}, { content: "Error: validation failed" }, { content: "{broken" },
    { content: JSON.stringify({ notice: "not a mutation receipt" }) }, { content: "x".repeat(2_000_001) }]) {
    await after({ ...event, result })
  }
  assert.deepEqual(refreshed, [], "completed execution is not proof of successful goal mutation")
  await after({ ...event, result: { content: JSON.stringify(success) } })
  await after({ ...event, tool: "update_goal_plan", result: { output: success } })
  assert.deepEqual(refreshed, [event.sessionID, event.sessionID], "native text and structured goal receipts are accepted")
})
