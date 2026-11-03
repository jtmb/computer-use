import { Plugin } from "@opencode/plugin"
import { RETIRED_FEATURE } from "./retired.ts"

export { RETIRED_FEATURE }

export default Plugin.define({
  id: "computer-use.session-coordination",
  setup() {
    throw new Error(RETIRED_FEATURE)
  },
})
