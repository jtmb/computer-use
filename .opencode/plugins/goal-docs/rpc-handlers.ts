import { coordinateHandoff, markHandoffOpened, type HandoffDependencies } from "./handoff.ts"
import { exportGoalState } from "./exporter.ts"
import { sanitizeText } from "./model.ts"

export interface GoalDocsRpcCallContext {
  readonly signal: AbortSignal
}

export interface GoalDocsRpcHandlers {
  export(input: unknown, context?: GoalDocsRpcCallContext): Promise<{
    status: "exported" | "missing" | "failed"
    sourceSessionID: string
    sourceDirectory: string
    docsDirectory?: string
    goalIDs: string[]
    currentGoalID?: string
    message: string
  }>
  handoff(input: unknown, context?: GoalDocsRpcCallContext): ReturnType<typeof coordinateHandoff>
  opened(input: unknown, context?: GoalDocsRpcCallContext): ReturnType<typeof markHandoffOpened>
}

export function createGoalDocsRpcHandlers(
  dependencies: HandoffDependencies,
  options: { signal?: AbortSignal } = {},
): GoalDocsRpcHandlers {
  const lifecycleSignal = options.signal
  // A caller can cancel its RPC while the plugin itself remains loaded.
  const callOptions = (context?: GoalDocsRpcCallContext) => {
    const signal = context?.signal
    return {
      signal: lifecycleSignal && signal && lifecycleSignal !== signal
        ? AbortSignal.any([lifecycleSignal, signal])
        : lifecycleSignal ?? signal,
    }
  }
  return {
    async export(value, context) {
      const input = value as { sourceSessionID: string; goalID?: string }
      try {
        const result = await exportGoalState({ sessionID: input.sourceSessionID, goalID: input.goalID }, dependencies, callOptions(context))
        if (result.status === "missing") {
          return {
            status: "missing",
            sourceSessionID: result.source.sessionID,
            sourceDirectory: result.source.directory,
            goalIDs: [],
            message: "No validated goal records are available for this source session.",
          }
        }
        const goalIDs = result.bundles.map((bundle) => bundle.goalID)
        return {
          status: "exported",
          sourceSessionID: result.source.sessionID,
          sourceDirectory: result.source.directory,
          ...(result.write ? { docsDirectory: result.write.docsDirectory } : {}),
          goalIDs,
          ...(result.state?.current ? { currentGoalID: result.state.current.id } : {}),
          message: `Exported ${goalIDs.length} retained goal record(s) to ${result.write?.docsDirectory ?? "the source worktree"}.`,
        }
      } catch (error) {
        return {
          status: "failed",
          sourceSessionID: sanitizeText(input.sourceSessionID, 200),
          sourceDirectory: "",
          goalIDs: [],
          message: sanitizeText(error instanceof Error ? error.message : String(error), 2_000),
        }
      }
    },
    async handoff(value, context) {
      const input = value as { sourceSessionID: string; goalID: string }
      return coordinateHandoff(input, dependencies, callOptions(context))
    },
    async opened(value, context) {
      const input = value as { sourceSessionID: string; transferID: string; targetSessionID: string }
      return markHandoffOpened(input, dependencies, callOptions(context))
    },
  }
}
