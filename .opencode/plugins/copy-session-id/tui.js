import { Plugin } from "@opencode/plugin/tui"

export default Plugin.define({
  id: "computer-use.copy-session-id",
  setup(context) {
    context.keymap.layer(() => ({
      mode: "global",
      commands: [{
        id: "computer-use.copy-session-id",
        title: "Copy session ID",
        slash: { name: "copy_session_id" },
        enabled: () => context.ui.router.current().type === "session",
        run: () => context.keymap.dispatch("session.copy.id"),
      }],
    }))
  },
})
