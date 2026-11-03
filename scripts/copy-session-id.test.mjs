import { readFile } from "node:fs/promises"
import { test } from "node:test"
import assert from "node:assert/strict"

const source = await readFile(new URL("../.opencode/plugins/copy-session-id/tui.js", import.meta.url), "utf8")
const moduleSource = source.replace('import { Plugin } from "@opencode/plugin/tui"', 'const Plugin = { define: (plugin) => plugin }')
const plugin = (await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`)).default

test("slash command dispatches the built-in copy action only in a session", () => {
  let route = { type: "session", sessionID: "ses_example" }
  let layer
  const dispatched = []
  plugin.setup({
    keymap: {
      layer: (factory) => { layer = factory() },
      dispatch: (id) => { dispatched.push(id) },
    },
    ui: { router: { current: () => route } },
  })

  const command = layer.commands[0]
  assert.equal(command.slash.name, "copy_session_id")
  assert.equal(command.enabled(), true)
  command.run()
  assert.deepEqual(dispatched, ["session.copy.id"])
  route = { type: "home" }
  assert.equal(command.enabled(), false)
})
