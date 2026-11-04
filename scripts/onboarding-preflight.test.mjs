import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { inspectOnboarding } from "./onboarding-preflight.mjs"

const availableBrowser = { installed: { chrome: "/fixture/chrome" } }

async function fixture(t) {
  const base = await mkdtemp("/tmp/opencode/onboarding-preflight-")
  t.after(() => rm(base, { recursive: true, force: true }))
  const root = path.join(base, "checkout")
  const goal = path.join(base, "opencode-goal-plugin")
  for (const name of ["global", "scripts", ".opencode/skills", ".opencode/plugins/memory", "tools/browser/node_modules/@playwright/mcp", "tools/self-learning/node_modules/@opencode/client", "tools/computer-use-browser/node_modules/playwright-core"]) await mkdir(path.join(root, name), { recursive: true })
  await mkdir(path.join(goal, "dist"), { recursive: true })
  await mkdir(path.join(goal, "src"), { recursive: true })
  await writeFile(path.join(goal, "src/tui.ts"), "export default {}")
  await writeFile(path.join(goal, "dist/server.js"), "export default {}")
  await writeFile(path.join(goal, "server.js"), "export default {}")
  await writeFile(path.join(root, ".opencode/plugins/memory/index.ts"), "export default {}")
  await writeFile(path.join(root, "tools/browser/node_modules/@playwright/mcp/cli.js"), "// fixture")
  for (const [dir, pkg] of [["tools/self-learning", "@opencode/client"], ["tools/computer-use-browser", "playwright-core"]]) {
    await writeFile(path.join(root, dir, "package.json"), "{}")
    const target = path.join(root, dir, "node_modules", pkg)
    await writeFile(path.join(target, "package.json"), JSON.stringify({ name: pkg, main: "index.js" }))
    await writeFile(path.join(target, "index.js"), "// fixture")
  }
  await writeFile(path.join(root, "scripts/playwright-mcp.sh"), "#!/bin/sh\nexit 0", { mode: 0o700 })
  await writeFile(path.join(root, "global/cli.json"), "{}")
  await writeFile(path.join(root, "global/opencode.jsonc"), JSON.stringify({
    plugins: [{ package: "/home/james/repos/computer-use/.opencode/plugins/memory" }],
    skills: ["~/repos/computer-use/.opencode/skills"],
    mcp: { servers: { playwright: { type: "local", command: ["/home/james/repos/computer-use/scripts/playwright-mcp.sh"] } } },
  }))
  return { root, goal }
}

test("required paths and runtime libraries are resolved against this checkout", async t => {
  const f = await fixture(t)
  const result = inspectOnboarding(f.root, f.goal, availableBrowser)
  assert.deepEqual(result.errors, [])
  assert.ok(result.expectedPlugins.includes("local.goal-mode.server"))
  assert.ok(result.warnings.some(message => message.includes("gh login")))
})

test("missing browser and self-learning dependencies are actionable errors", async t => {
  const f = await fixture(t)
  await rm(path.join(f.root, "tools/browser/node_modules"), { recursive: true })
  await rm(path.join(f.root, "tools/self-learning/node_modules"), { recursive: true })
  const result = inspectOnboarding(f.root, f.goal, availableBrowser)
  assert.ok(result.errors.some(message => /Playwright MCP.*--with-browser/.test(message)))
  assert.ok(result.errors.some(message => /@opencode\/client.*--with-tools/.test(message)))
})

test("missing goal build and malformed config are errors, not successful deployment", async t => {
  const f = await fixture(t)
  await rm(path.join(f.goal, "dist/server.js"))
  await writeFile(path.join(f.root, "global/cli.json"), "{ invalid")
  const result = inspectOnboarding(f.root, f.goal, availableBrowser)
  assert.ok(result.errors.some(message => message.includes("Built goal plugin")))
  assert.ok(result.errors.some(message => message.startsWith("global/cli.json:")))
})

test("an ESM-only import export is available even when CommonJS require.resolve would reject it", async t => {
  const f = await fixture(t)
  await writeFile(path.join(f.root, "tools/self-learning/node_modules/@opencode/client/package.json"), JSON.stringify({
    type: "module", exports: { ".": { import: "./index.js" } },
  }))
  assert.deepEqual(inspectOnboarding(f.root, f.goal, availableBrowser).errors, [])
})

test("an installed MCP package without any launchable browser cannot pass preflight", async t => {
  const f = await fixture(t)
  const result = inspectOnboarding(f.root, f.goal, { installed: {}, bundled: {} })
  assert.ok(result.errors.some(message => message.includes("Browser launch preflight")))
})

test("a server-only goal checkout cannot silently deploy a broken CLI plugin", async t => {
  const f = await fixture(t)
  await rm(path.join(f.goal, "src/tui.ts"))
  assert.ok(inspectOnboarding(f.root, f.goal, availableBrowser).errors.some(message => message.includes("Goal TUI entrypoint")))
})
