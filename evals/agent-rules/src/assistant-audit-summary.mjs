const states = ["completed", "error", "running", "streaming"]
const validLabel = value => typeof value === "string" && value.length <= 200 && /^[a-zA-Z0-9_.:/-]+$/.test(value)
const refuse = () => { throw new Error("Assistant audit summary refused") }

/** Body-free diagnostic projection, not transport validation, semantic grading or provider attestation. */
export function summarizeAssistantAudit(audit) {
  if (!audit || !Number.isInteger(audit.pages) || audit.pages < 1 || audit.pages > 4 ||
      typeof audit.completeAssistantPagination !== "boolean" || !Array.isArray(audit.messages) || audit.messages.length > 20) refuse()
  const messageIDs = new Set(), callIDs = new Set(), models = new Map(), tools = []
  const toolStates = { completed: 0, error: 0, running: 0, streaming: 0, unknown: 0 }
  let messagesWithoutValidModel = 0
  for (const message of audit.messages) {
    if (message?.type !== "assistant" || !validLabel(message.id) || !message.id.startsWith("msg_") ||
        messageIDs.has(message.id) || !Array.isArray(message.content) || message.content.length > 128) refuse()
    messageIDs.add(message.id)
    const model = message.model
    if (model && validLabel(model.providerID) && validLabel(model.id) &&
        (model.variant === undefined || validLabel(model.variant))) {
      const ref = { providerID: model.providerID, id: model.id,
        ...(model.variant === undefined ? {} : { variant: model.variant }) }
      models.set(JSON.stringify(ref), ref)
    } else messagesWithoutValidModel++
    for (const part of message.content) {
      if (part?.type !== "tool") continue
      if (!validLabel(part.id) || !validLabel(part.name) || callIDs.has(part.id) || tools.length >= 128) refuse()
      callIDs.add(part.id)
      const status = states.includes(part.state?.status) ? part.state.status : "unknown"
      toolStates[status]++
      tools.push({ messageID: message.id, callID: part.id, name: part.name, status })
    }
  }
  return {
    pages: audit.pages,
    uniqueAssistantMessages: messageIDs.size,
    messageIDs: [...messageIDs],
    reportedModels: [...models.values()],
    messagesWithoutValidModel,
    tools,
    toolStates,
    completedTools: toolStates.completed,
    completeAssistantPagination: audit.completeAssistantPagination,
    completeLiveTrace: false,
    providerEffectiveModel: null,
    semanticGrade: null,
  }
}
