import assert from "node:assert/strict"
import test from "node:test"
import { buildDesktopArgs, registerDesktopTools } from "./desktop.ts"
import { CuaSession } from "./cua.ts"

const appId = `app:${"a".repeat(64)}`

test("appId builds an exact selector and rejects mixed or malformed identities", () => {
  assert.deepEqual(buildDesktopArgs({ verb: "tree", appId }), { args: ["tree", "--app-id", appId] })
  assert.ok("error" in buildDesktopArgs({ verb: "tree", appId: "other" }))
  assert.ok("error" in buildDesktopArgs({ verb: "tree", appId, app: "Editor" }))
  assert.ok("error" in buildDesktopArgs({ verb: "tree", appId, appIndex: 1 }))
})

test("tree permissions retain exact application identity for both ID and positional selectors", async () => {
  const tools = new Map()
  const permissions = []
  registerDesktopTools({ namespace() {}, add(tool) { tools.set(tool.name, tool) } }, {
    assertPermission: async request => { permissions.push(request) },
    executeDesktop: async () => "{}",
  })
  const context = { sessionID: "identity-test", messageID: "message", id: "call", agent: "build" }
  await tools.get("tree").execute({ appId }, context)
  await tools.get("tree").execute({ appIndex: 3 }, context)
  assert.equal(permissions[0].resources[0], `desktop/tree/${encodeURIComponent(appId)}`)
  assert.equal(permissions[1].resources[0], "desktop/tree/%233")
})

test("cancellation during permission settlement does not reach desktop backend", async () => {
  const tools = new Map()
  const controller = new AbortController()
  let calls = 0
  registerDesktopTools({ namespace() {}, add(tool) { tools.set(tool.name, tool) } }, {
    assertPermission: async () => { controller.abort(new Error("stopped")) },
    executeDesktop: async () => { calls++; return "{}" },
  })
  await assert.rejects(tools.get("tree").execute({ appId }, { sessionID: "s", messageID: "m", id: "c", agent: "build", signal: controller.signal }), /stopped/)
  assert.equal(calls, 0)
})

test("slow approval refreshes only a preview of the identical process-bound target", async () => {
  const tools = new Map()
  const calls = []
  const fingerprint = "a".repeat(64)
  const oldToken = `${BigInt(Date.now() - 40_000) * 1_000_000n}:${fingerprint}`
  const freshToken = `${BigInt(Date.now()) * 1_000_000n}:${fingerprint}`
  registerDesktopTools({ namespace() {}, add(tool) { tools.set(tool.name, tool) } }, {
    assertPermission: async () => {},
    executeDesktop: async input => { calls.push({ ...input }); return input.apply ? '{"dispatched":true}' : JSON.stringify({ dry_run: true, target_token: freshToken }) },
  })
  await tools.get("act").execute({ appId, verb: "action", name: "Save", apply: true, expectToken: oldToken }, { sessionID: "s", messageID: "m", id: "c", agent: "build" })
  assert.equal(calls.length, 2)
  assert.equal(calls[0].apply, undefined)
  assert.equal(calls[1].expectToken, freshToken)
})

test("slow approval never refreshes into a changed target", async () => {
  const tools = new Map()
  const calls = []
  const oldToken = `${BigInt(Date.now() - 40_000) * 1_000_000n}:${"a".repeat(64)}`
  registerDesktopTools({ namespace() {}, add(tool) { tools.set(tool.name, tool) } }, {
    assertPermission: async () => {},
    executeDesktop: async input => { calls.push(input); return JSON.stringify({ dry_run: true, target_token: `${BigInt(Date.now()) * 1_000_000n}:${"b".repeat(64)}` }) },
  })
  const result = await tools.get("act").execute({ appId, verb: "action", name: "Save", apply: true, expectToken: oldToken }, { sessionID: "s", messageID: "m", id: "c", agent: "build" })
  assert.match(result.content[0].text, /no action was applied/)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].apply, undefined)
})

test("persistent CUA handles bind appId rather than a shifting list index", async () => {
  const calls = []
  let current = [{ index: 1, name: "Editor", appId }]
  const session = new CuaSession({ call: async (key, input) => {
    calls.push({ key, input })
    return { content: [{ type: "text", text: JSON.stringify(key === "desktop:apps" ? current : { appId: input.appId }) }] }
  } })
  const context = { sessionID: "stable-app", agent: "build", messageID: "m", id: "c" }
  await session.execute("const app = await cua.getApp(1)", context)
  current = [{ index: 1, name: "Different app", appId: `app:${"b".repeat(64)}` }]
  await session.execute("await app.tree()", context)
  const tree = calls.find(c => c.key === "desktop:tree")
  assert.equal(tree.input.appId, appId)
  assert.equal(tree.input.appIndex, undefined)
  const after = await session.execute(`app.selector.appId = "app:${"b".repeat(64)}"; app.selector.appId`, context)
  assert.match(after.text, new RegExp(appId))
  session.dispose()
})

test("CUA refuses to remember an app without process identity", async () => {
  const session = new CuaSession({ call: async () => ({ content: [{ type: "text", text: '[{"index":1,"name":"Editor"}]' }] }) })
  const result = await session.execute("await cua.getApp(1)", { sessionID: "no-identity", agent: "build", messageID: "m", id: "c" })
  assert.match(result.text, /no verifiable persistent identity/)
  session.dispose()
})
