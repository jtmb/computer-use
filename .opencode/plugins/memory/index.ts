import { Plugin } from "@opencode/plugin"

import { registerMemoryTool } from "./tool.ts"
import type { MemoryDependencies } from "./core.ts"

export default Plugin.define({
  id: "computer-use.memory",
  async setup(ctx) {
    const dependencies: MemoryDependencies = {
      session: ctx.session,
      permission: ctx.permission,
    }
    await registerMemoryTool(ctx, dependencies)
  },
})
