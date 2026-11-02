import { createEffect, createSignal, untrack } from "solid-js"
import { Plugin } from "@opencode/plugin/tui"

import { sourceHandoffRequest } from "./source-handoff.ts"
import { buildHandoffKeymapLayer, guardedHandoffCall, sameExactWorktree, type TuiLocation } from "./tui-contract.ts"
import { HandoffSettingsRpc } from "./automation-rpc.ts"
import { registerHandoffSettings } from "./automation-settings.ts"

export default Plugin.define({
  id: "computer-use.goal-docs.tui",
  setup(context) {
    const [available, setAvailable] = createSignal(false)
    const selectedSessionScope = context.options.scope === "selected-session"
    let revision = 0
    let disposed = false
    let sending = false

    const selectedScope = () => {
      const route = context.ui.router.current()
      if (route.type !== "session") return
      const session = context.data.session.get(route.sessionID)
      if (!session || session.id !== route.sessionID || !sameExactWorktree(session.location, session.location)) return
      if (!selectedSessionScope && !sameExactWorktree(context.location, session.location)) return
      return { sessionID: session.id, location: session.location as TuiLocation }
    }

    const stillSelected = (scope: NonNullable<ReturnType<typeof selectedScope>>) => {
      const current = selectedScope()
      return !disposed && current !== undefined && current.sessionID === scope.sessionID &&
        sameExactWorktree(current.location, scope.location) && current.location.workspaceID === scope.location.workspaceID
    }

    const stopSettings = registerHandoffSettings({
      dialog: context.ui.dialog, toast: context.ui.toast, keymap: context.keymap,
      selected: selectedScope,
      read: (scope, signal) => context.client.rpc(HandoffSettingsRpc).read({ sessionID: scope.sessionID }, { location: scope.location, signal }),
      update: (input, scope, signal) => context.client.rpc(HandoffSettingsRpc).update(input, { location: scope.location, signal }),
    })

    const refresh = async () => {
      const currentRevision = ++revision
      setAvailable(false)
      const scope = selectedScope()
      if (!scope || disposed) return
      await guardedHandoffCall(context.data.location.command, scope.location, async () => {}, (availability) => {
        if (currentRevision !== revision || !stillSelected(scope)) return false
        setAvailable(availability.status === "available")
      })
    }

    const execute = async () => {
      if (sending) return
      const scope = selectedScope()
      if (!scope) {
        context.ui.toast.show({ message: "Open a session in the handoff worktree first.", variant: "warning" })
        return
      }
      sending = true
      try {
        await context.data.session.sync(scope.sessionID)
        if (!stillSelected(scope)) return
        const result = await guardedHandoffCall(context.data.location.command, scope.location, async () => {
          if (!stillSelected(scope)) throw new Error("The selected session changed; no handoff request was sent.")
          // The source model, not a goal snapshot template, owns the continuation message.
          const response = await context.client.session.prompt({
            sessionID: scope.sessionID,
            text: sourceHandoffRequest(scope.sessionID, scope.location.directory),
            delivery: "steer",
            resume: true,
          })
          if (!response || response.sessionID !== scope.sessionID || !response.id) {
            throw new Error("Handoff request admission could not be verified; inspect this chat's inbox before retrying.")
          }
        })
        context.ui.toast.show({
          message: result.called ? "Asked this chat to send a new chat the handoff link and continuation prompt." : result.availability.status === "available" ? "Handoff request was not sent." : result.availability.message,
          variant: result.called ? "success" : "warning",
        })
      } catch (error) {
        context.ui.toast.show({ message: error instanceof Error ? error.message : String(error), variant: "error" })
      } finally {
        sending = false
        void refresh()
      }
    }

    context.keymap.layer(() => buildHandoffKeymapLayer(available(), execute))
    const onUpdate = (event: { location?: TuiLocation }) => {
      const scope = selectedScope()
      if (!event.location || (scope && sameExactWorktree(event.location, scope.location))) void refresh()
    }
    const stopCommands = context.data.on("command.updated", onUpdate)
    const stopPlugins = context.data.on("plugin.updated", onUpdate)
    let selectionKey: string | undefined
    createEffect(() => {
      const scope = selectedScope()
      const key = scope && JSON.stringify([scope.sessionID, scope.location])
      if (key === selectionKey) return
      selectionKey = key
      untrack(() => { void refresh() })
    })
    return () => {
      disposed = true
      revision += 1
      setAvailable(false)
      stopCommands()
      stopPlugins()
      stopSettings()
    }
  },
})
