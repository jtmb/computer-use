import assert from "node:assert/strict"
import { test } from "node:test"

import { registerWindowTools, windowRequest } from "./windows.ts"
import type { DesktopPermissionRequest, DesktopToolContext } from "./desktop.ts"

const context: DesktopToolContext = { sessionID: "demo", messageID: "message", agent: "build", id: "desktop_window_act" }
type Tool = {
  name: string
  options: { namespace: string; codemode: boolean }
  input: { additionalProperties: boolean; required?: string[] }
  execute(input: Record<string, unknown>, context: DesktopToolContext): Promise<unknown>
}

function register(deny?: string) {
  const tools = new Map<string, Tool>()
  const permissions: DesktopPermissionRequest[] = []
  const calls: unknown[] = []
  registerWindowTools<Tool>({ namespace() {}, add(tool) { tools.set(tool.name, tool) } }, {
    async assertPermission(request) {
      permissions.push(request)
      if (request.action === deny) throw new Error(`denied ${deny}`)
    },
    async call(request, token) { calls.push({ request, token }); return '{"verified":true}' },
  })
  return { tools, permissions, calls }
}

test("three window tools have bounded strict schemas and disable Code Mode", () => {
  const registered = register()
  assert.deepEqual([...registered.tools.keys()], ["windows", "window_act", "layout"])
  for (const tool of registered.tools.values()) {
    assert.deepEqual(tool.options, { namespace: "desktop", codemode: false })
    assert.equal(tool.input.additionalProperties, false)
  }
  assert.deepEqual(registered.tools.get("layout")!.input.required, ["placements"])
})

test("inventory and preview require read authority but never mutation authority", async () => {
  const registered = register()
  await registered.tools.get("windows")!.execute({}, context)
  await registered.tools.get("window_act")!.execute({ action: "focus", windowId: "epoch:1" }, context)
  assert.deepEqual(registered.permissions.map(item => item.action), ["read", "read"])
  assert.deepEqual(registered.calls, [
    { request: null, token: undefined },
    { request: { action: "focus", windowId: "epoch:1" }, token: undefined },
  ])
})

test("both mutation gates are independently enforced before compositor access", async () => {
  for (const denied of ["read", "desktop_mutate", "edit"]) {
    const registered = register(denied)
    await assert.rejects(registered.tools.get("window_act")!.execute({
      action: "focus", windowId: "epoch:1", apply: true, expectToken: "valid-looking-token",
    }, { ...context, agent: "plan" }), new RegExp(`denied ${denied}`))
    assert.deepEqual(registered.calls, [])
  }
})

test("layout permissions cover every exact target and preserve original request/token binding", async () => {
  const registered = register()
  const placements = [{ windowId: "epoch:*", slot: "left" }, { windowId: "epoch:2", slot: "right" }]
  await registered.tools.get("layout")!.execute({ placements, focusWindowId: "epoch:2", apply: true, expectToken: "opaque-single-use-token" }, context)
  assert.deepEqual(registered.permissions.map(item => item.action), ["read", "desktop_mutate", "edit"])
  for (const permission of registered.permissions) {
    assert.deepEqual(permission.resources, ["desktop/windows/layout/epoch%3A%2A", "desktop/windows/layout/epoch%3A2"])
    assert.deepEqual(permission.save, permission.resources)
    assert.equal(permission.sessionID, context.sessionID)
    assert.equal(permission.source.id, context.id)
  }
  assert.deepEqual(registered.calls, [{ request: { placements, focusWindowId: "epoch:2", action: "layout" }, token: "opaque-single-use-token" }])
})

test("invalid or tokenless operations never reach permission or backend layers", async () => {
  for (const input of [
    { action: "focus", windowId: "one", apply: true },
    { action: "focus", windowId: "one", expectToken: "valid-looking-token" },
    { action: "focus", windowId: "one", apply: "true" },
    { action: "close", windowId: "one" },
    { action: "focus", windowId: "one", command: "anything" },
    { action: "tile", windowId: "one", slot: "arbitrary" },
    { action: "place", windowId: "one", rect: { x: 0, y: 0, width: 1, height: 300 } },
  ]) {
    const registered = register()
    const result = await registered.tools.get("window_act")!.execute(input, context)
    assert.match(JSON.stringify(result), /Invalid window request/)
    assert.deepEqual(registered.permissions, [])
    assert.deepEqual(registered.calls, [])
  }
})

test("request normalization refuses duplicate layout IDs, malformed rectangles, and unknown fields", () => {
  const same = [{ windowId: "one", slot: "left" }, { windowId: "one", slot: "right" }]
  assert.throws(() => windowRequest({ placements: same }, true), /unique/)
  assert.throws(() => windowRequest({ action: "place", windowId: "one", rect: null }, false))
  assert.throws(() => windowRequest({ action: "focus", windowId: "one", monitor: 0 }, false), /Unsupported/)
  assert.throws(() => windowRequest({ placements: [{ windowId: "one", slot: "left" }] }, true), /two to four/)
  const placed = windowRequest({ action: "place", windowId: "one", rect: { x: -800, y: 10, width: 400, height: 300 }, monitor: 1 }, false)
  assert.equal(placed.apply, false)
  assert.deepEqual(placed.ids, ["one"])
})
