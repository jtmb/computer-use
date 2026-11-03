import { expect, test } from "bun:test"
import { dirname, join } from "node:path"

// Staged plugin/client resolution proof. This checks module identity and source files; it is not a
// typecheck and does not compile the typed call chain.
const staged = process.env.CAS_STAGED
if (!staged) throw new Error("CAS_STAGED is required")

const core = join(staged, "packages/core")
const plugin = join(staged, "packages/plugin")
const client = join(staged, "packages/client")

test("staged core resolves the staged plugin instead of the pin", () => {
  const resolved = Bun.resolveSync("@opencode/plugin", core)
  expect(resolved.startsWith(plugin)).toBe(true)
  const effect = Bun.resolveSync("@opencode/plugin/effect", core)
  expect(effect.startsWith(plugin)).toBe(true)
  const pkg = JSON.parse(require("node:fs").readFileSync(join(plugin, "package.json"), "utf8"))
  expect(pkg.version).toBe("2.1.1")
})

test("staged plugin resolves the staged regenerated client", () => {
  const resolved = Bun.resolveSync("@opencode/client", plugin)
  expect(resolved.startsWith(client)).toBe(true)
  const api = Bun.resolveSync("@opencode/client/promise/api", plugin)
  expect(api).toBe(join(client, "src/promise/api.ts"))
  expect(dirname(api).startsWith(client)).toBe(true)
})

test("the resolved staged client owns the regenerated expectedTitle types", async () => {
  const api = Bun.resolveSync("@opencode/client/promise/api", plugin)
  const types = await Bun.file(join(dirname(api), "generated/types.ts")).text()
  expect(types).toContain("readonly expectedTitle?: string | undefined")
  const pluginSource = await Bun.file(join(plugin, "src/promise/session.ts")).text()
  expect(pluginSource).toContain('from "@opencode/client/promise/api"')
})
