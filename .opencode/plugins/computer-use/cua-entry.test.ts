import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

async function entrypoint() {
  const location = new URL("./index.ts", import.meta.url)
  let source = await readFile(location, "utf8")
  source = source.replace('import { Plugin } from "@opencode/plugin"', "const Plugin = { define: value => value }")
  source = source.replace(/from "(\.[^\"]+)"/g, (_match, relative) => `from ${JSON.stringify(new URL(relative, location).href)}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`)).default
}

test("production entry keeps CUA bindings across tool-registry replay", async () => {
  const plugin = await entrypoint()
  const transforms: any[] = []
  let definitions = new Map<string, any>()
  const editor = () => ({
    namespace() {},
    add(tool: any) { definitions.set(`${tool.options?.namespace ?? ""}:${tool.name}`, tool) },
    list() { return [...definitions.values()].map(tool => ({ ...tool, id: `${tool.options?.namespace ?? ""}_${tool.name}` })) },
    get(id: any) { return [...definitions.values()].find(tool => `${tool.options?.namespace ?? ""}_${tool.name}` === id) },
    update(id: any, update: any) { const tool = this.get(id); if (tool) update(tool) },
  })
  const cleanup = await plugin.setup({
    options: {},
    permission: { assert: async () => {} },
    tool: { transform: async (callback: any) => { transforms.push(callback); callback(editor()); return { dispose: async () => {} } } },
  })
  try {
    const context = { sessionID: "entry-cua", agent: "build", messageID: "m1", id: "c1", signal: new AbortController().signal }
    await definitions.get("cua:js").execute({ code: "const keep = 42" }, context)
    definitions = new Map()
    for (const transform of transforms) transform(editor())
    const result = await definitions.get("cua:js").execute({ code: "keep" }, { ...context, messageID: "m2", id: "c2" })
    assert.match(JSON.stringify(result.content), /42/)
    assert.equal(definitions.has("desktop:act"), true)
    assert.equal(definitions.has("web:act"), true)
  } finally {
    await cleanup()
  }
  const unloaded = await definitions.get("cua:js").execute({ code: "1" }, { sessionID: "entry-cua", agent: "build", messageID: "m3", id: "c3" })
  assert.match(JSON.stringify(unloaded.content), /disposed on plugin unload/)
})
