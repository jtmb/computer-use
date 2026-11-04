import assert from "node:assert/strict"
import test from "node:test"
import { CORE_PLUGINS } from "./onboarding-preflight.mjs"
import { REQUIRED_TOOLS, awaitMcpConnection, isolatedConfig, verifyInventory } from "./verify-onboarding.mjs"

const plugins = CORE_PLUGINS.map(id => ({ id, state: { status: "active" } }))
test("the isolated profile cannot start the GitHub credential wrapper or alter the source config", () => {
  const source = { plugins: ["real-plugin"], mcp: { servers: { github: { disabled: false }, playwright: { disabled: false } } }, permissions: [{ effect: "deny" }] }
  const result = isolatedConfig(source, "/scratch/observer")
  assert.equal(result.mcp.servers.github.disabled, true)
  assert.equal(source.mcp.servers.github.disabled, false)
  assert.equal(result.mcp.servers.playwright.disabled, false)
  assert.deepEqual(result.plugins, ["real-plugin", "/scratch/observer"])
  assert.deepEqual(source.plugins, ["real-plugin"])
  assert.deepEqual(result.permissions, source.permissions)
})
test("isolated acceptance requires every real plugin and registered tool", () => {
  assert.doesNotThrow(() => verifyInventory(plugins, REQUIRED_TOOLS))
  assert.throws(() => verifyInventory(plugins.slice(1), REQUIRED_TOOLS), /missing or duplicate plugin/)
  assert.throws(() => verifyInventory([...plugins, plugins[0]], REQUIRED_TOOLS), /missing or duplicate plugin/)
  assert.throws(() => verifyInventory(plugins.map((entry, index) => index === 0 ? { ...entry, state: { status: "failed" } } : entry), REQUIRED_TOOLS), /inactive plugin/)
  assert.throws(() => verifyInventory(plugins, REQUIRED_TOOLS.slice(1)), /registered tool missing/)
})

test("startup pending is not failure or acceptance; failed and stuck connections cannot pass", async () => {
  let calls = 0
  const read = () => [{ name: "playwright", status: { status: ++calls === 1 ? "pending" : "connected" } }]
  assert.equal((await awaitMcpConnection(read, { interval: 0 }))[0].status.status, "connected")
  assert.equal(calls, 2)
  await assert.rejects(awaitMcpConnection(() => [{ name: "playwright", status: { status: "failed", error: "missing runtime" } }]), /missing runtime/)
  await assert.rejects(awaitMcpConnection(() => [], { timeout: 2, interval: 2 }), /startup deadline/)
})
