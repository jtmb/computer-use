import { Rpc } from "@opencode/plugin/rpc"

import { GoalDocsRpcDefinition } from "./rpc-definition.ts"
import type { HandoffResult } from "./handoff.ts"

export { GoalDocsRpcDefinition }

export const GoalDocsRpc = Rpc.define(GoalDocsRpcDefinition)

export type GoalDocsRpcClient = {
  export(input: { sourceSessionID: string; goalID?: string }): Promise<{
    status: "exported" | "missing" | "failed"
    sourceSessionID: string
    sourceDirectory: string
    docsDirectory?: string
    goalIDs: string[]
    currentGoalID?: string
    message: string
  }>
  handoff(input: { sourceSessionID: string; goalID: string }): Promise<HandoffResult>
  opened(input: { sourceSessionID: string; transferID: string; targetSessionID: string }): Promise<{
    transferID: string
    phase: "open"
    outcome: "complete" | "failed"
    targetSessionID: string
    message: string
  }>
}
