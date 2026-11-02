import { Plugin } from "@opencode/plugin"

import { startGoalObserver } from "./observer.ts"
import { GoalDocsRpc } from "./rpc.ts"
import { createGoalDocsRpcHandlers } from "./rpc-handlers.ts"
import type { EventSource } from "./observer.ts"
import type { HandoffDependencies, HandoffSessionApi } from "./handoff.ts"
import type { PermissionAssertion, PluginLocation } from "./session.ts"
import { readGoalStateForSession, resolveGoalPluginVersion, type PluginListApi } from "./state.ts"
import { createHandoffAutomation } from "./automation.ts"
import { HandoffSettingsRpc } from "./automation-rpc.ts"
import { createTaskTitles } from "./task-titles.ts"
import { registerGoalToolTitleRefresh } from "./goal-tool-titles.ts"
import { TaskTitlesRpc } from "./task-titles-rpc.ts"

export default Plugin.define({
  id: "computer-use.goal-docs",
  async setup(ctx) {
    const lifecycle = new AbortController()
    let verifiedVersion: string | undefined
    const readState: NonNullable<HandoffDependencies["readState"]> = async (sessionID, options) => {
      if (verifiedVersion === undefined) {
        try {
          verifiedVersion = await resolveGoalPluginVersion(ctx.plugin as unknown as PluginListApi, options?.signal)
        } catch (error) {
          if (!process.env.OPENCODE_GOAL_PLUGIN_PACKAGE_JSON) throw error
          return readGoalStateForSession(sessionID, { signal: options?.signal })
        }
      }
      return readGoalStateForSession(sessionID, { packageVersion: verifiedVersion, signal: options?.signal })
    }
    const dependencies: HandoffDependencies = {
      session: ctx.session as unknown as HandoffSessionApi,
      permission: ctx.permission as unknown as PermissionAssertion,
      location: ctx.location as PluginLocation | undefined,
      readState,
    }
    const registration = await ctx.rpc.register(
      GoalDocsRpc,
      createGoalDocsRpcHandlers(dependencies, { signal: lifecycle.signal }),
    )
    const automation = createHandoffAutomation({
      session: ctx.session as unknown as Parameters<typeof createHandoffAutomation>[0]["session"],
      storage: ctx.storage,
      location: ctx.location,
      readState,
      signal: lifecycle.signal,
      report: error => console.error("[goal-docs] automatic handoff disabled for this session after an error", error),
    })
    const taskTitles = createTaskTitles({
      session: ctx.session,
      storage: ctx.storage,
      location: ctx.location,
      readState,
      signal: lifecycle.signal,
      report: error => console.error("[goal-docs] task-title automation suspended for this session", error),
    })
    const titleStatus = await ctx.rpc.register(TaskTitlesRpc, {
      status: (input) => taskTitles.status((input as { sessionID: string }).sessionID),
    })
    const settings = await ctx.rpc.register(HandoffSettingsRpc, {
      read: (input, context) => automation.read((input as { sessionID: string }).sessionID, context.signal),
      update: (input, context) => {
        const value = input as { sessionID: string; revision: number; enabled: boolean }
        return automation.update(value.sessionID, value.revision, value.enabled, context.signal)
      },
    })
    const contextHook = await ctx.session.hook("context", async event => {
      await taskTitles.context(event.sessionID, event.agent)
      const request = await automation.context(event.sessionID, event.agent)
      if (request && !lifecycle.signal.aborted) event.system.push({ type: "text", text: request })
    })
    const titleHook = await ctx.session.hook("title", async event => {
      try {
        const title = await taskTitles.title(event.sessionID) ?? await automation.title(event.sessionID)
        if (title && !lifecycle.signal.aborted) event.result = title
      } catch { /* A missing policy/title must not break native title generation. */ }
    })
    const goalToolTitleHook = await registerGoalToolTitleRefresh(ctx.tool, taskTitles, lifecycle.signal)
    if (!goalToolTitleHook) console.warn("[goal-docs] native execute.after hook unavailable; direct goal-tool title refresh is disabled")
    const stopObserver = startGoalObserver({
      ...dependencies,
      event: ctx.event as unknown as EventSource,
    })
    return async () => {
      stopObserver()
      lifecycle.abort(new Error("goal-docs plugin unloaded"))
      await contextHook.dispose()
      await titleHook.dispose()
      await goalToolTitleHook?.dispose()
      await titleStatus.dispose()
      await settings.dispose()
      await registration.dispose()
    }
  },
})
