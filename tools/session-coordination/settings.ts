import type { Context, KeymapCommand } from "@opencode/plugin/tui/context"
import { sessionID } from "./model.ts"
import { validatePolicy, validatePolicyView, type PolicyView, type ReceivePolicy } from "./policy.ts"

export interface Selection { sessionID: string; directory: string }
export interface SettingsHost {
  dialog: Pick<Context["ui"]["dialog"], "select" | "prompt" | "confirm" | "alert">
  toast: Context["ui"]["toast"]
  keymap: Pick<Context["keymap"], "layer">
  selected(): Selection | undefined
  read(selected: Selection, signal: AbortSignal): Promise<unknown>
  update(input: { sessionID: string; target: "project" | "chat"; expectedRevision: number; policy: ReceivePolicy | null }, selected: Selection, signal: AbortSignal): Promise<unknown>
}
export const SETTINGS_COMMAND = "computer-use.coordination.settings"
export function registerSettings(host: SettingsHost): () => void {
  let alive = true, busy = false
  const abort = new AbortController()
  function stillSelected(selected: Selection): void {
    const current = host.selected()
    if (!alive || current?.sessionID !== selected.sessionID || current.directory !== selected.directory) throw new Error("Selected chat/location changed; settings were not applied to a different chat")
  }
  function checkedView(raw: unknown, selected: Selection): PolicyView {
    validatePolicyView(raw)
    if (raw.sessionID !== selected.sessionID) throw new Error("Settings response belongs to a different chat")
    return raw
  }
  const signal = () => AbortSignal.any([abort.signal, AbortSignal.timeout(5000)])
  async function run(): Promise<void> {
    if (busy || !alive) return
    const selected = host.selected()
    if (!selected || !sessionID(selected.sessionID) || !selected.directory) {
      host.toast.show({ message: "Open an exact chat before configuring cross-session communication", variant: "warning" }); return
    }
    busy = true
    try {
      const view = checkedView(await host.read(selected, signal()), selected)
      stillSelected(selected)
      const target = await host.dialog.select({ title: `Cross-session communication · ${selected.sessionID}`,
        options: [
          { title: "This chat override", value: "chat" as const, description: `${view.inherited ? "Currently inherited" : "Override active"}: ${JSON.stringify(view.effective)}` },
          { title: "Project/worktree default", value: "project" as const, description: JSON.stringify(view.project) },
          { title: "Use project default for this chat", value: "inherit" as const, description: "Remove only this chat's override" },
          { title: "View effective policy only", value: "view" as const, description: `Revision ${view.revision}; no changes` },
        ] })
      if (target === undefined) return
      stillSelected(selected)
      if (target === "view") { await host.dialog.alert({ title: "Effective receive policy", message: JSON.stringify(view, null, 2) }); return }
      let policy: ReceivePolicy | null = null
      if (target !== "inherit") {
        const current = target === "project" ? view.project : view.effective
        const mode = await host.dialog.select<ReceivePolicy["mode"]>({ title: "Receive peer messages", current: current.mode,
          options: [{ title: "Off", value: "off", description: "Refuse new addressed posts/delivery; old inbox remains readable" },
            { title: "Inbox-only", value: "inbox-only", description: "Default: agent mailbox only; no prompt queue or model wakeup" },
            { title: "Steer-running", value: "steer-running", description: "Actionable peer input at a native safe boundary; idle wake is separate" }] })
        if (mode === undefined) return
        let idleWake = false
        if (mode === "steer-running") {
          const wake = await host.dialog.select({ title: "Allow peer input to start idle execution?", current: current.idleWake,
            options: [{ title: "No idle wakeup", value: false }, { title: "Allow idle wakeup", value: true, description: "May schedule model execution/cost; never resumes a goal or grants native permissions" }] })
          if (wake === undefined) return
          idleWake = wake
        }
        const senders = await host.dialog.prompt({ title: "Allowed exact sender session IDs", description: "* = any verified same-worktree sender; comma-separated IDs = allowlist; empty = none",
          value: current.allowedSenders === null ? "*" : current.allowedSenders.join(",") })
        if (senders === undefined) return
        const allowedSenders = senders.trim() === "*" ? null : senders.trim() === "" ? [] : senders.split(",").map(value => value.trim())
        const steerLimit = await host.dialog.select({ title: "Maximum steering reservations per recipient / 60 seconds", current: current.steerLimit,
          options: Array.from({ length: 16 }, (_, index) => ({ title: String(index + 1), value: index + 1 })) })
        if (steerLimit === undefined) return
        policy = { mode, idleWake, allowedSenders, steerLimit }; validatePolicy(policy)
      }
      stillSelected(selected)
      const confirmed = await host.dialog.confirm({ title: "Save cross-session communication policy",
        message: `${target === "project" ? "All inheriting chats in this exact project/worktree" : selected.sessionID}\n${selected.directory}\nRevision ${view.revision}\n${policy ? JSON.stringify(policy) : "Inherit project default"}\nNative permissions and goals are unchanged. Already admitted inputs are not recalled.`,
        label: { confirm: "Save policy", cancel: "Cancel" } })
      if (confirmed !== true) return
      stillSelected(selected)
      const saved = checkedView(await host.update({ sessionID: selected.sessionID, target: target === "project" ? "project" : "chat", expectedRevision: view.revision, policy }, selected, signal()), selected)
      if (saved.revision !== view.revision + 1) throw new Error("Unexpected saved revision; inspect policy before retrying")
      stillSelected(selected)
      const observed = checkedView(await host.read(selected, signal()), selected)
      if (observed.revision !== saved.revision || JSON.stringify(observed) !== JSON.stringify(saved)) throw new Error("Policy changed after save; reopen settings to inspect current policy, not automatically retry")
      host.toast.show({ title: "Cross-session communication", message: `Saved revision ${observed.revision}: ${JSON.stringify(observed.effective)}`, variant: "success" })
    } catch (error) {
      if (alive) host.toast.show({ title: "Cross-session settings not confirmed", message: error instanceof Error ? error.message : "Settings companion unavailable; no automatic activation or retry", variant: "error" })
    } finally { busy = false }
  }
  const command: KeymapCommand = { id: SETTINGS_COMMAND, title: "Cross-session communication settings", group: "Coordination", palette: true, run }
  host.keymap.layer(() => ({ mode: "global", commands: [command] }))
  return () => { alive = false; abort.abort(new Error("coordination settings unloaded")) }
}
