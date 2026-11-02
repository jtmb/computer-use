/**
 * Entry-level regression for the documented Code Mode rollback.
 *
 * `codemode.test.ts` covers the pure transform with a fake editor. This test
 * drives the real plugin entry — registrations, serialization wrappers, scoping
 * set and transform — with only the SDK identity and browser I/O replaced, so a
 * change that leaves one owned tool in Code Mode under `directTools: true` is
 * caught at the surface the model actually sees.
 */

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { stripTypeScriptTypes } from "node:module"
import test from "node:test"

const ROOT = process.env.ISOLATION_SOURCE_ROOT ?? "/home/james/repos/computer-use"
const ENTRY = new URL(`${ROOT}/.opencode/plugins/computer-use/index.ts`, "file://")

interface EntryOptions {
  readonly directTools?: boolean
}

async function loadEntry(options: EntryOptions) {
  const ioKey = `__codemodeExposure_${Date.now()}_${Math.random()}`
  ;(globalThis as Record<string, unknown>)[ioKey] = () => {
    const sessions = new Map<string, { sessionId: string; status: string }>()
    return {
      listSessions: () => [...sessions.values()],
      start: async ({ sessionId }: { sessionId: string }) => {
        const info = { sessionId, status: "running" }
        sessions.set(sessionId, info)
        return info
      },
      execute: async () => ({ method: "noop" }),
      cancel: async (sessionId: string) => sessions.delete(sessionId),
    }
  }
  const wrapper = `import {registerBrowserTools as original} from ${JSON.stringify(new URL("./browser-tools.ts", ENTRY).href)};
    export function registerBrowserTools(editor, deps) {return original(editor,{...deps,createManager:globalThis[${JSON.stringify(ioKey)}]})}`
  let source = await readFile(ENTRY, "utf8")
  source = source.replace('import { Plugin } from "@opencode/plugin"', "const Plugin = { define: value => value }")
  source = source.replace(
    'from "./browser-tools.ts"',
    `from ${JSON.stringify(`data:text/javascript;base64,${Buffer.from(wrapper).toString("base64")}`)}`,
  )
  source = source.replace(/from "(\.[^"]+)"/g, (_match, relative) => `from ${JSON.stringify(new URL(relative, ENTRY).href)}`)
  source = source.replace(
    /from "(\.\.\/\.\.\/\.\.\/tools\/[^"]+)"/g,
    (_match, relative) => `from ${JSON.stringify(new URL(relative, ENTRY).href)}`,
  )

  let definitions = new Map<string, any>()
  const transforms: Array<(editor: unknown) => unknown> = []
  const idOf = (tool: any) => `${tool.options?.namespace}_${tool.name}`
  const editor = () => ({
    namespace() {},
    add(tool: any) {
      definitions.set(idOf(tool), tool)
    },
    list() {
      return [...definitions.values()].map((tool) => ({ ...tool, id: idOf(tool) }))
    },
    get(id: string) {
      return this.list().find((tool: any) => tool.id === id)
    },
    update(id: string, update: (tool: any) => void) {
      const tool = [...definitions.values()].find((candidate) => idOf(candidate) === id)
      if (tool) update(tool)
    },
    remove(id: string) {
      for (const [key, tool] of definitions) if (idOf(tool) === id) definitions.delete(key)
    },
  })
  const plugin = (await import(
    `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString("base64")}`
  )).default
  const cleanup = await plugin.setup({
    options,
    permission: { assert: async () => {} },
    tool: {
      transform: async (callback: (editor: unknown) => unknown) => {
        transforms.push(callback)
        callback(editor())
        return { dispose: async () => {} }
      },
    },
  })
  const replay = () => {
    definitions = new Map()
    for (const transform of transforms) transform(editor())
  }
  const state = () =>
    [...definitions.values()].map((tool) => ({
      id: idOf(tool),
      namespace: tool.options?.namespace as string | undefined,
      codemode: tool.options?.codemode === true,
    }))
  const dispose = async () => {
    await cleanup()
    delete (globalThis as Record<string, unknown>)[ioKey]
  }
  return { replay, state, dispose }
}

const owned = (tools: Array<{ id: string; namespace?: string; codemode: boolean }>) =>
  tools.filter((tool) => tool.id.startsWith("desktop_") || tool.id.startsWith("web_"))

test("default exposure puts all 19 owned desktop and web tools in Code Mode", async (t) => {
  const entry = await loadEntry({})
  t.after(() => entry.dispose())
  const tools = owned(entry.state())
  assert.equal(tools.filter((tool) => tool.namespace === "desktop").length, 11)
  assert.equal(tools.filter((tool) => tool.namespace === "web").length, 8)
  assert.equal(tools.length, 19)
  assert.deepEqual(tools.filter((tool) => !tool.codemode), [])
})

test("directTools rollback leaves zero owned tools in Code Mode, before and after a registry replay", async (t) => {
  const entry = await loadEntry({ directTools: true })
  t.after(() => entry.dispose())
  const before = owned(entry.state())
  assert.equal(before.length, 19)
  assert.deepEqual(before.filter((tool) => tool.codemode), [])
  entry.replay()
  const after = owned(entry.state())
  assert.equal(after.length, 19)
  assert.deepEqual(after.filter((tool) => tool.codemode), [])
})
