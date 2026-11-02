import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)

test("canonical configuration no longer loads the custom inbox package", async () => {
  const config = JSON.parse(await readFile(new URL("opencode.json", root), "utf8"))
  for (const plugin of config.plugins) {
    const name = typeof plugin === "string" ? plugin : plugin.package
    assert.equal(name.includes("session-coordination"), false, "retired inbox must not load")
  }
  assert.deepEqual(config.plugins, [
    {
      package: "/home/james/repos/opencode-goal-plugin",
      options: {
        goal_engine: "enhanced",
        engine_config_path: "/home/james/repos/computer-use/opencode.json",
        engine_package: "/home/james/repos/opencode-goal-plugin",
      },
    },
    "-opencode.goal",
    "./tools/self-learning",
  ], "inbox removal must preserve the existing goal engine selection and the separately approved self-learning plugin")
  assert.deepEqual(config.skills, ["./.opencode/skills"])
  assert.equal(config.$schema, "https://opencode.ai/config.json")
  assert.deepEqual(config.mcp, {
    servers: {
      github: { type: "local", command: ["./scripts/github-mcp.sh"], disabled: false, timeout: { startup: 30000 } },
      playwright: { type: "local", command: ["./scripts/playwright-mcp.sh"], disabled: false, timeout: { startup: 90000 } },
    },
  }, "unrelated MCP configuration must not change")
})
