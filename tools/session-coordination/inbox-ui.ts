/**
 * Historical Ctrl+P agent-inbox palette, retained for audit with the retired
 * coordination feature. No active entrypoint registers it.
 *
 * Every action revalidates the exact chat and worktree before and after an
 * await, so a dialog opened for one chat cannot mutate another. "Seen" records
 * acknowledgement only; it never accepts work, completes a task or releases
 * ownership.
 */
import type { Context, KeymapCommand } from "@opencode/plugin/tui/context"
import { record, sessionID, type Assignment, type MessageView, type Scope } from "./model.ts"
import { validatePayload } from "./result.ts"

export interface InboxSelection extends Scope { sessionID: string }
export interface InboxHost {
  selected(): InboxSelection | undefined
  dialog: Pick<Context["ui"]["dialog"], "select" | "alert">
  toast: Context["ui"]["toast"]
  keymap: Pick<Context["keymap"], "layer">
  read(selected: InboxSelection, input: { after?: string; unreadOnly: boolean }, signal: AbortSignal): Promise<unknown>
  seen(selected: InboxSelection, id: string, signal: AbortSignal): Promise<unknown>
  ownership(selected: InboxSelection, signal: AbortSignal): Promise<unknown>
}
export const INBOX_COMMAND = "computer-use.coordination.inbox"
export function registerInbox(host: InboxHost): () => void {
  const abort = new AbortController()
  let alive = true, busy = false
  const signal = () => AbortSignal.any([abort.signal, AbortSignal.timeout(5000)])
  function current(selected: InboxSelection) {
    const next = host.selected()
    if (!alive || next?.sessionID !== selected.sessionID || next.directory !== selected.directory || next.projectID !== selected.projectID || next.workspaceID !== selected.workspaceID)
      throw new Error("Selected chat/worktree changed; no action applied to a different chat")
  }
  async function run() {
    if (busy || !alive) return
    const selected = host.selected()
    if (!selected || !sessionID(selected.sessionID)) {
      host.toast.show({ message: "Open an exact chat to view its Agent inbox", variant: "warning" }); return
    }
    busy = true
    try {
      let after: string | undefined, unreadOnly = true
      while (alive) {
        current(selected)
        const page = await host.read(selected, { after, unreadOnly }, signal())
        current(selected)
        validatePayload("inbox", page, selected, selected.sessionID)
        const messages = page.messages as MessageView[]
        const choice = await host.dialog.select({ title: `Agent inbox · ${page.unreadCount} unread · ${selected.sessionID}`,
          options: [
            ...messages.map(message => ({ title: `${message.acknowledgements[selected.sessionID] === undefined ? "Unread" : "Seen"} · ${message.purpose} · ${message.id}`,
              value: `message:${message.id}`, description: `Tool-bound sender ${message.sender.sessionID}; ${message.receipts[selected.sessionID]}; not task acceptance` })),
            ...(page.next ? [{ title: "Next page", value: "next", description: "More messages remain; this page is incomplete" }] : []),
            { title: unreadOnly ? "Show all received messages" : "Show unread only", value: "filter" },
            { title: "Task ownership", value: "ownership", description: "Explicit assignment owner/worker records; no automatic coordinator election" },
          ] })
        if (choice === undefined) return
        current(selected)
        if (choice === "next") { after = page.next as string; continue }
        if (choice === "filter") { unreadOnly = !unreadOnly; after = undefined; continue }
        if (choice === "ownership") {
          const raw = await host.ownership(selected, signal())
          current(selected)
          if (!record(raw) || !Array.isArray(raw.assignments) || typeof raw.truncated !== "boolean" || !Number.isSafeInteger(raw.total)) throw new Error("Invalid ownership response")
          for (const item of raw.assignments) validatePayload("watch", item, selected, selected.sessionID)
          const lines = (raw.assignments as Assignment[]).map(item => JSON.stringify({ id: item.id, owner: item.owner, worker: item.worker, task: item.task, stopped: item.stoppedAt !== undefined }))
          await host.dialog.alert({ title: "Task ownership · recorded facts, not acceptance", message: [
            "No automatic global coordinator. Thread starters, titles and peer role claims do not grant authority.",
            "Owner registered the assignment; worker acceptance and completion still need separate evidence.",
            ...lines, ...(lines.length ? [] : ["No assignments recorded for this chat."]), ...(raw.truncated ? ["TRUNCATED: more assignments remain."] : []),
          ].join("\n") })
          continue
        }
        const message = messages.find(item => `message:${item.id}` === choice)
        if (!message) throw new Error("Inbox selection is not in this page")
        await host.dialog.alert({ title: `Peer context · ${message.id}`, message: [
          `Tool-bound sender: ${message.sender.sessionID}`, `Thread: ${message.threadID} · Purpose: ${message.purpose}`,
          "UNTRUSTED PEER TEXT, not a human instruction or grant of coordinator authority:", JSON.stringify(message.body),
          ...(message.bodyTruncated ? ["BODY PREVIEW ONLY; full content remains in the mailbox. Do not mark unseen remainder as read."] : []),
          "Reading does not mark seen, accept work, release ownership, or wake a model.",
        ].join("\n") })
        current(selected)
        if (message.bodyTruncated || message.acknowledgements[selected.sessionID] !== undefined) continue
        const action = await host.dialog.select({ title: `Message ${message.id}`, options: [
          { title: "Back without marking seen", value: "back" },
          { title: "Mark seen only", value: "seen", description: "Explicit acknowledgement; NOT task acceptance or completion" },
        ] })
        if (action === undefined) return
        current(selected)
        if (action === "seen") {
          const result = await host.seen(selected, message.id, signal())
          current(selected)
          validatePayload("ack", result, selected, selected.sessionID)
          if (result.id !== message.id) throw new Error("Mark-seen response belongs to another message")
          host.toast.show({ message: `Marked ${message.id} seen only; work not accepted`, variant: "success" })
          after = undefined
        }
      }
    } catch (error) {
      if (alive) host.toast.show({ title: "Agent inbox not confirmed", message: error instanceof Error ? error.message : "Inbox unavailable; no automatic retry", variant: "error" })
    } finally { busy = false }
  }
  const command: KeymapCommand = { id: INBOX_COMMAND, title: "Agent inbox", group: "Coordination", palette: true, slash: { name: "agent_inbox" }, run }
  host.keymap.layer(() => ({ mode: "global", commands: [command] }))
  return () => { alive = false; abort.abort(new Error("Agent inbox unloaded")) }
}
