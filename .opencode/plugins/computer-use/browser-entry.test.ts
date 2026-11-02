import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

test("production registry replay preserves browser manager, refs and owner; unload closes it", async t => {
  const location = new URL("./index.ts", import.meta.url)
  const ioKey = `__browserEntryFactory_${Date.now()}_${Math.random()}`
  let factoryCalls = 0
  let applied = 0
  const cancelled: string[] = []
  const tab = { id: "fixture-tab", ownership: "ephemeral", url: "http://127.0.0.1:1234/", title: "Fixture" }
  globalThis[ioKey] = () => {
    factoryCalls++
    const sessions = new Map()
    return {
      listSessions: () => [...sessions.values()],
      start: async ({ sessionId }) => { const info = { sessionId, status: "running" }; sessions.set(sessionId, info); return info },
      execute: async (_session, operation) => {
        if (operation.method === "tabs.new" || operation.method === "navigate") return tab
        if (operation.method === "tabs.list") return [tab]
        if (operation.method === "snapshot") return { tabId: tab.id, generation: 1, snapshot: '- textbox "Note" [ref=e1]' }
        if (operation.method === "fill") { applied++; return {} }
        return {}
      },
      cancel: async sessionId => { cancelled.push(sessionId); return sessions.delete(sessionId) },
    }
  }
  t.after(() => { delete globalThis[ioKey] })
  // Only browser I/O is replaced. The real entry, registrations, native request
  // validators and serialization wrappers execute through every replay.
  const wrapper = `import {registerBrowserTools as original} from ${JSON.stringify(new URL("./browser-tools.ts", location).href)};
    export function registerBrowserTools(editor, deps) {return original(editor,{...deps,createManager:globalThis[${JSON.stringify(ioKey)}]})}`
  let source = await readFile(location, "utf8")
  source = source.replace('import { Plugin } from "@opencode/plugin"', "const Plugin = { define: value => value }")
  source = source.replace('from "./browser-tools.ts"', `from ${JSON.stringify(`data:text/javascript;base64,${Buffer.from(wrapper).toString("base64")}`)}`)
  source = source.replace(/from "(\.[^"]+)"/g, (_match, relative) => `from ${JSON.stringify(new URL(relative, location).href)}`)
  const plugin = (await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`)).default
  let definitions = new Map()
  const transforms = []
  const editor = () => ({
    namespace() {},
    add(tool) { definitions.set(`${tool.options?.namespace}:${tool.name}`, tool) },
    list() { return [...definitions.values()].map(tool => ({ ...tool, id: `${tool.options?.namespace}_${tool.name}` })) },
    get(id) { return this.list().find(tool => tool.id === id) },
    update(id, update) { const tool = [...definitions.values()].find(tool => `${tool.options?.namespace}_${tool.name}` === id); if (tool) update(tool) },
  })
  const cleanup = await plugin.setup({ options: {}, permission: { assert: async () => {} }, tool: { transform: async callback => { transforms.push(callback); callback(editor()); return { dispose: async () => {} } } } })
  const context = { sessionID: "browser-entry", agent: "build", messageID: "m", id: "c" }
  try {
    const open = await definitions.get("web:open").execute({ url: tab.url }, context)
    assert.match(JSON.stringify(open.content), /fixture-tab/)
    await definitions.get("web:snapshot").execute({ tabId: tab.id }, context)
    definitions = new Map()
    for (const transform of transforms) transform(editor())
    const result = await definitions.get("web:act").execute({ tabId: tab.id, generation: 1, ref: "e1", action: "fill", value: "sample" }, context)
    assert.match(JSON.stringify(result.content), /generation/)
    assert.equal(applied, 1)
    assert.equal(factoryCalls, 1)
  } finally { await cleanup() }
  assert.deepEqual(cancelled, [context.sessionID])
  const after = await definitions.get("web:open").execute({ url: tab.url }, context)
  assert.match(JSON.stringify(after.content), /unloaded/)
})
