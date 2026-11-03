import { Plugin } from "@opencode/plugin/tui"
import { registerDockerWeb } from "./controller.mjs"

export default Plugin.define({
  id: "computer-use.tailscale-web",
  setup: registerDockerWeb,
})
