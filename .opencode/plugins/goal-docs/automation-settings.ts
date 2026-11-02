import type { Context } from "@opencode/plugin/tui/context"

import type { HandoffSettingsView } from "./automation.ts"
import { sameExactWorktree, type TuiLocation } from "./tui-contract.ts"

export const HANDOFF_SETTINGS_COMMAND = "goal-docs.handoff.settings"
interface Selection { sessionID: string; location: TuiLocation }
interface SettingsHost {
  dialog: Pick<Context["ui"]["dialog"], "select">
  toast: Context["ui"]["toast"]
  keymap: Pick<Context["keymap"], "layer">
  selected(): Selection | undefined
  read(selected: Selection, signal: AbortSignal): Promise<unknown>
  update(input: { sessionID: string; revision: number; enabled: boolean }, selected: Selection, signal: AbortSignal): Promise<unknown>
}

export function checkedHandoffSettings(raw: unknown, sessionID: string): HandoffSettingsView {
  if (typeof raw !== "object" || raw === null) throw new Error("Invalid handoff settings response.")
  const value = raw as Record<string, unknown>
  if (value.sessionID !== sessionID || typeof value.enabled !== "boolean" || typeof value.configuredEnabled !== "boolean" ||
    !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 ||
    typeof value.role !== "string" || !["worker", "reviewer", "unclassified"].includes(value.role) ||
    !(value.requested === null || typeof value.requested === "string") || typeof value.notice !== "string") {
    throw new Error("Handoff settings response is malformed, stale, or belongs to another chat.")
  }
  // Effective ON is impossible when the configured policy is OFF or the role
  // can never rotate, so a mixed response must not be guessed into a save.
  if (value.enabled && (!value.configuredEnabled || value.role !== "worker")) {
    throw new Error("Handoff settings response is inconsistent; no automatic handoff state was changed.")
  }
  return value as unknown as HandoffSettingsView
}

export function registerHandoffSettings(host: SettingsHost): () => void {
  const abort = new AbortController()
  let busy = false
  const stillSelected = (selected: Selection) => {
    const current = host.selected()
    if (abort.signal.aborted || current?.sessionID !== selected.sessionID ||
      !sameExactWorktree(current.location, selected.location) || current.location.workspaceID !== selected.location.workspaceID) {
      throw new Error("Selected chat/worktree changed; reopen Handoff settings.")
    }
  }
  const signal = () => AbortSignal.any([abort.signal, AbortSignal.timeout(5_000)])
  const run = async () => {
    if (busy || abort.signal.aborted) return
    const selected = host.selected()
    if (!selected) {
      host.toast.show({ message: "Open a session in the handoff worktree first.", variant: "warning" })
      return
    }
    busy = true
    try {
      const view = checkedHandoffSettings(await host.read(selected, signal()), selected.sessionID)
      stillSelected(selected)
      const masked = view.configuredEnabled && !view.enabled
      const suspended = masked && view.role === "worker"
      const enabled = await host.dialog.select({
        title: `Handoff settings · ${view.role} · configured ${view.configuredEnabled ? "ON" : "OFF"}${masked ? ` · effective OFF (${suspended ? "suspended" : "ineligible role"})` : ""} · ${selected.sessionID}`,
        current: view.configuredEnabled,
        options: [
          { title: "Automatic handoff OFF", value: false,
            description: masked ? "Save OFF and clear the configured ON policy that this role or a suspension currently masks." : "Stay in this chat with native compaction. Manual /handoff remains available." },
          { title: "Automatic handoff ON", value: true, disabled: view.role !== "worker" || view.requested !== null || suspended,
            description: view.requested ? "Already requested once in this source chat; reconcile manually, never auto-retry." : view.role !== "worker" ? "Only identified independent workers; reviewers are never rotated." : suspended ? "Configured ON but inactive after an error in this loaded instance; use manual /handoff." : "Request a source-authored handoff at a new verified phase milestone or about 500k current-context tokens." },
        ],
        placeholder: view.notice,
      })
      if (enabled === undefined || (enabled && enabled === view.configuredEnabled)) return
      stillSelected(selected)
      if (enabled) {
        const latest = checkedHandoffSettings(await host.read(selected, signal()), selected.sessionID)
        stillSelected(selected)
        if (latest.role !== "worker" || view.role !== "worker") {
          throw new Error("Only identified independent workers can enable automatic handoff; reopen settings.")
        }
        if (latest.requested !== null || view.requested !== null) {
          throw new Error("An automatic handoff request was already issued; reopen settings and use manual /handoff.")
        }
        if (latest.revision !== view.revision || latest.configuredEnabled !== view.configuredEnabled || latest.enabled !== view.enabled) {
          throw new Error("Handoff settings changed; reopen the dialog.")
        }
      }
      // `enabled` is the configured choice; an explicit OFF must also clear a
      // configured ON value masked by an ineligible role or suspended policy.
      const saved = checkedHandoffSettings(await host.update({ sessionID: selected.sessionID, revision: view.revision, enabled }, selected, signal()), selected.sessionID)
      stillSelected(selected)
      if (saved.revision !== view.revision + 1 || saved.configuredEnabled !== enabled || saved.enabled !== enabled) {
        throw new Error("Handoff settings save could not be confirmed; reopen instead of retrying.")
      }
      const observed = checkedHandoffSettings(await host.read(selected, signal()), selected.sessionID)
      stillSelected(selected)
      if (observed.revision !== saved.revision || observed.configuredEnabled !== saved.configuredEnabled ||
        observed.enabled !== saved.enabled || observed.requested !== saved.requested) {
        throw new Error("Handoff settings changed after save; reopen instead of retrying.")
      }
      host.toast.show({ message: `Automatic handoff ${enabled ? "ON" : "OFF"} for this chat; confirmed configured ${saved.configuredEnabled ? "ON" : "OFF"} and effective ${observed.enabled ? "ON" : "OFF"}. Native compaction and manual /handoff are unchanged. Already issued requests are not recalled.`, variant: "success" })
    } catch (error) {
      if (!abort.signal.aborted) host.toast.show({ message: error instanceof Error ? error.message : "Handoff settings companion unavailable.", variant: "error" })
    } finally { busy = false }
  }
  host.keymap.layer(() => ({ mode: "global", commands: [{
    id: HANDOFF_SETTINGS_COMMAND, title: "Handoff settings", description: "Per-chat automatic source handoff; not native Open settings",
    group: "Settings", palette: true, run,
  }] }))
  return () => abort.abort()
}
