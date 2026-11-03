import { Plugin } from "@opencode/plugin/tui"
import { RETIRED_FEATURE } from "./retired.ts"

export default Plugin.define({
  id: "computer-use.session-coordination.tui",
  setup() {
    throw new Error(RETIRED_FEATURE)
  },
})
