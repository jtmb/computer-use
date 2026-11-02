export class AssistantAuditError extends Error {
  constructor(code) {
    super(`Assistant audit refused: ${code}`)
    this.name = "AssistantAuditError"
    this.code = code
  }
}

/** Page a selected session, not its event trace. The caller must bound transport bytes/time. */
export async function collectAssistantMessages({ list, sessionID, signal, pageSize = 5, maxPages = 4 }) {
  if (typeof list !== "function" || typeof sessionID !== "string" || sessionID.length > 200 || !/^ses_[a-zA-Z0-9_]+$/.test(sessionID)) {
    throw new AssistantAuditError("invalid-request")
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 5 ||
      !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 4) {
    throw new AssistantAuditError("invalid-limits")
  }
  const messages = []
  const ids = new Set()
  const cursors = new Set()
  let cursor
  for (let pages = 1; pages <= maxPages; pages++) {
    if (signal?.aborted) throw new AssistantAuditError("aborted")
    let page
    try {
      page = await list({ sessionID, type: "assistant", limit: pageSize,
        ...(cursor === undefined ? { order: "asc" } : { cursor }) }, { signal })
    } catch {
      throw new AssistantAuditError(signal?.aborted ? "aborted" : "transport-failed")
    }
    if (signal?.aborted) throw new AssistantAuditError("aborted")
    if (!page || !Array.isArray(page.data) || page.data.length > pageSize ||
        !page.cursor || typeof page.cursor !== "object") throw new AssistantAuditError("invalid-page")
    for (const message of page.data) {
      if (message?.type !== "assistant" || typeof message.id !== "string" ||
          !message.id.startsWith("msg_") || !Array.isArray(message.content)) {
        throw new AssistantAuditError("invalid-message")
      }
      if (ids.has(message.id)) throw new AssistantAuditError("duplicate-message")
      ids.add(message.id)
      messages.push(message)
    }
    const next = page.cursor.next
    if (next === null || next === undefined) {
      return { messages, pages, completeAssistantPagination: true, completeLiveTrace: false }
    }
    if (typeof next !== "string" || next.length < 1 || next.length > 4096) {
      throw new AssistantAuditError("invalid-cursor")
    }
    if (cursors.has(next)) throw new AssistantAuditError("repeated-cursor")
    cursors.add(next)
    cursor = next
  }
  throw new AssistantAuditError("page-limit")
}
