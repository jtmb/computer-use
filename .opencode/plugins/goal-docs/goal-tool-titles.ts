type GoalToolExecution = {
  tool?: unknown
  sessionID?: unknown
  agent?: unknown
  status?: unknown
  result?: unknown
}

export interface GoalToolHookContext {
  hook(
    name: "execute.after",
    callback: (input: GoalToolExecution) => Promise<void>,
  ): Promise<{ dispose(): Promise<void> }>
}

interface TaskTitleController {
  context(sessionID: string, agent?: string): Promise<void>
}

const MUTATING_GOAL_TOOLS: ReadonlySet<string> = new Set([
  "update_goal_plan",
  "create_goal",
  "set_goal",
  "update_goal_objective",
  "update_goal",
  "update_goal_status",
  "stop_goal",
  "replace_goal",
  "clear_goal",
])

const FAILURE_STATES = new Set([
  "failed", "failure", "error", "cancelled", "canceled", "aborted", "abort", "interrupted",
  "running", "pending", "incomplete", "partial", "timeout", "timed_out",
])

const MAX_RECEIPT_BYTES = 2_000_000

function exceedsTextLimit(value: unknown): boolean {
  return typeof value === "string" &&
    (value.length > MAX_RECEIPT_BYTES || Buffer.byteLength(value, "utf8") > MAX_RECEIPT_BYTES)
}

function toolResultFailed(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const result = value as Record<string, unknown>
  if ((result.error !== undefined && result.error !== null) || result.success === false) return true
  const state = result.state ?? result.status
  if (exceedsTextLimit(state) || (typeof state === "string" && FAILURE_STATES.has(state.trim().toLowerCase()))) return true
  const metadata = typeof result.metadata === "object" && result.metadata !== null && !Array.isArray(result.metadata)
    ? result.metadata as Record<string, unknown>
    : undefined
  const metadataState = metadata?.state ?? metadata?.status
  if (exceedsTextLimit(metadataState) || (typeof metadataState === "string" && FAILURE_STATES.has(metadataState.trim().toLowerCase()))) return true
  if (exceedsTextLimit(result.output)) return true
  const output = typeof result.output === "string" ? result.output.trim() : ""
  const outputState = /^state:\s*([\w-]+)\b/im.exec(output)?.[1]
  return (outputState !== undefined && FAILURE_STATES.has(outputState.toLowerCase())) ||
    /^<(?:error|tool-error)>/i.test(output) || /^error:/i.test(output)
}

function successfulGoalMutation(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value) || toolResultFailed(value)) return false
  const result = value as Record<string, unknown>
  if (result.error !== undefined && result.error !== null) return false
  let payload = result.output ?? result.content
  if (Array.isArray(payload)) {
    if (payload.length > 128) return false
    const parts: string[] = []
    // Empty and nontext slots still contribute join separators.
    let bytes = Math.max(0, payload.length - 1)
    for (const part of payload) {
      const text = typeof part === "object" && part !== null && part.type === "text" &&
        typeof part.text === "string" ? part.text : ""
      const remaining = MAX_RECEIPT_BYTES - bytes
      if (text.length > remaining) return false
      const textBytes = Buffer.byteLength(text, "utf8")
      if (textBytes > remaining) return false
      bytes += textBytes
      parts.push(text)
    }
    payload = parts.join("\n")
  }
  if (typeof payload === "string") {
    if (exceedsTextLimit(payload)) return false
    try { payload = JSON.parse(payload) } catch { return false }
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return false
  const receipt = payload as Record<string, unknown>
  // The pinned goal plugin returns {goal}; a completed create/set can instead
  // reuse or conflict with an existing goal without changing it.
  if (!("goal" in receipt) || receipt.reused === true || receipt.conflicting === true ||
    receipt.success === false || receipt.error !== undefined) return false
  return receipt.goal === null || (typeof receipt.goal === "object" && receipt.goal !== null &&
    !Array.isArray(receipt.goal) && "id" in receipt.goal && typeof receipt.goal.id === "string" && receipt.goal.id.length > 0)
}

export function registerGoalToolTitleRefresh(
  tool: GoalToolHookContext | undefined,
  titles: TaskTitleController,
  signal?: AbortSignal,
): Promise<{ dispose(): Promise<void> } | undefined> {
  if (!tool || typeof tool.hook !== "function") return Promise.resolve(undefined)
  return tool.hook("execute.after", async input => {
    if (signal?.aborted || input.status !== "completed" || typeof input.tool !== "string" ||
      !MUTATING_GOAL_TOOLS.has(input.tool) || !successfulGoalMutation(input.result) || typeof input.sessionID !== "string" ||
      input.sessionID.length === 0 || input.sessionID.length > 200) return
    await titles.context(input.sessionID, typeof input.agent === "string" ? input.agent : undefined)
  })
}
