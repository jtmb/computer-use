import assert from "node:assert/strict"
import { readFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (name) => readFile(path.join(root, name), "utf8")

async function sourceFiles(directory, ignoredDirectories = new Set()) {
  const found = []
  async function visit(relative = "") {
    const absolute = path.join(root, directory, relative)
    for (const entry of await readdir(absolute, { withFileTypes: true })) {
      const child = path.join(relative, entry.name)
      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) await visit(child)
      } else if (entry.isFile()) {
        found.push(path.posix.join(directory, child.split(path.sep).join("/")))
      }
    }
  }
  await visit()
  return found.sort()
}

function toolFileCovered(file, text, packageDirectories) {
  if (text.includes(`../${file}`)) return true
  return packageDirectories.some((directory) => file.startsWith(`${directory}/`) &&
    text.includes(`](../${directory}/)`) && text.includes(`](../${directory}/README.md)`))
}

test("features inventory accounts for every current skill and plugin source", async () => {
  const text = await read("docs/features.md")
  const entries = await readdir(path.join(root, ".opencode/skills"), { withFileTypes: true })
  const skills = []
  for (const entry of entries) {
    if (entry.isDirectory()) {
      try { await stat(path.join(root, ".opencode/skills", entry.name, "SKILL.md")); skills.push(entry.name) }
      catch (error) { if (error.code !== "ENOENT") throw error }
    }
  }
  assert.match(text, new RegExp(`## All ${skills.length} shared skills`))
  const readmeCount = (await read("README.md")).match(/\[Browse all (\d+) skills[^\]\n]*\]\(\.opencode\/skills\/README\.md\)/)
  assert.ok(readmeCount, "README has an explicit skill-count catalog link")
  assert.equal(Number(readmeCount[1]), skills.length, "README count agrees with actual bundles, not a historical checkpoint")
  for (const skill of skills) assert.ok(text.includes(`../.opencode/skills/${skill}/README.md`), skill)
  for (const entry of await readdir(path.join(root, ".opencode/plugins"), { withFileTypes: true })) {
    if (entry.isDirectory()) assert.ok(text.includes(`../.opencode/plugins/${entry.name}/`), entry.name)
  }
})

test("inventory names all current scripts, demo Python sources, tools, and commands", async () => {
  const text = await read("docs/features.md")
  const scripts = await sourceFiles("scripts", new Set(["__pycache__", "node_modules"]))
  for (const file of scripts) assert.ok(text.includes(`../${file}`), file)
  const demoSources = (await sourceFiles("docs/demo", new Set(["__pycache__", "node_modules"])))
    .filter((file) => file.endsWith(".py"))
  for (const file of demoSources) assert.ok(text.includes(`${file.slice("docs/".length)}`), file)

  const tools = await sourceFiles("tools", new Set(["node_modules", "__pycache__"]))
  const packages = tools.filter((file) => file.endsWith("/package.json")).map((file) => path.posix.dirname(file))
  for (const file of tools) assert.ok(toolFileCovered(file, text, packages), file)
  for (const directory of packages.filter((directory) => text.includes(`](../${directory}/)`))) {
    await stat(path.join(root, directory, "README.md"))
  }

  for (const file of [
    "opencode.json",
    "global/opencode.jsonc",
    "global/cli.json",
    "config/mcp-versions.json",
    ...(await sourceFiles("global/commands")),
  ]) assert.ok(text.includes(`../${file}`), file)
})

test("package coverage requires an exact package boundary and an owning guide", () => {
  const packageRoot = "tools/plugins/monitor"
  const file = `${packageRoot}/src/sample.ts`
  const inventory = `[package](../${packageRoot}/) [guide](../${packageRoot}/README.md)`
  assert.equal(toolFileCovered(file, inventory, [packageRoot]), true)
  assert.equal(toolFileCovered(file, `[package](../${packageRoot}/)`, [packageRoot]), false)
  assert.equal(toolFileCovered("tools/plugins/monitor-extra/src/sample.ts", inventory, [packageRoot]), false)
  assert.equal(toolFileCovered(file, "[all tools](../tools/)", [packageRoot]), false)
  assert.equal(toolFileCovered("tools/helper.py", "[helper](../tools/helper.py)", []), true)
})

test("comparison attributes OpenCode v2 capabilities upstream and local integrations to this checkout", async () => {
  const text = await read("docs/features.md")
  const start = text.indexOf("## What this repository adds beyond base OpenCode v2\n")
  const end = text.indexOf("\n## Reading the status labels", start)
  assert.ok(start >= 0 && end > start, "comparison section is present")
  const section = text.slice(start, end)
  const rows = section.split("\n").filter((line) => line.startsWith("|"))
  const cells = new Map(rows.slice(2).map((line) => {
    const [area, base, repository] = line.split("|").slice(1, -1).map((cell) => cell.trim())
    return [area, { base, repository }]
  }))

  const agent = cells.get("Agent and coding workflow")
  assert.ok(agent)
  for (const capability of ["Sessions", "agents", "model and reasoning-effort/variant selection", "coding tools", "permission rules"]) {
    assert.ok(agent.base.includes(capability), capability)
  }
  assert.match(agent.repository, /no replacement agent, model selector, or permission engine/)

  const extensibility = cells.get("Extensibility and instructions")
  assert.ok(extensibility)
  for (const capability of ["MCP servers", "skill discovery/loading", "commands", "plugin loading"]) {
    assert.ok(extensibility.base.includes(capability), capability)
  }
  assert.match(extensibility.repository, /curated set of local skill bundles/)
  assert.match(extensibility.repository, /not new loader mechanisms/)

  const mcp = cells.get("MCP integrations")
  assert.ok(mcp)
  assert.match(mcp.repository, /pinned versions, and launch wrappers/)
  assert.match(mcp.repository, /external dependencies, not implementations authored here/)

  const desktop = cells.get("Desktop and windows")
  assert.ok(desktop)
  assert.match(desktop.repository, /GNOME AT-SPI/)
  assert.match(desktop.repository, /optional .*window bridge/)
  assert.match(desktop.repository, /not a claim that no other OpenCode extension can do computer use/)

  const goal = cells.get("Goal/session conveniences")
  assert.ok(goal)
  assert.match(goal.base, /plan agent.*experimental todo tool/)
  assert.match(goal.repository, /goal-docs companion/)
  assert.match(goal.repository, /does not replace the goal substrate/)

  const operations = cells.get("Setup and operations")
  assert.ok(operations)
  assert.match(operations.repository, /onboarding\/config deployment, health, backup\/maintenance, and demo helpers/)
  for (const match of section.matchAll(/\]\((https?:[^)]+)\)/g)) {
    assert.match(match[1], /^https:\/\/opencode\.ai\/v2\/docs\//, match[1])
  }
  assert.match(section, /absence of a capability from a docs page is not proof/)
})

test("inventory links resolve and source/runtime/unfinished states stay explicit", async () => {
  const text = await read("docs/features.md")
  for (const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (/^(?:https?:|#)/.test(match[1])) continue
    await stat(path.resolve(root, "docs", match[1].split("#")[0]))
  }
  for (const word of ["current working tree", "not proof of deployment", "Held / blocked", "do not invoke", "quarantined", "Unverified"]) {
    assert.ok(text.includes(word), word)
  }
  assert.match(text, /copy_session_id/)
  assert.match(text, /explicit continuation\/model invocation remains unapproved and unverified/)
  assert.match(text, /wsl-interop.*source directory/s)
  assert.ok(text.includes("../scripts/setup-opencode-jsonc.py"))
  assert.ok(text.includes("../scripts/mcp_config_transaction.py"))
  assert.ok(text.includes("No real config apply or runtime activation"))
  for (const tool of [
    "desktop_apps",
    "desktop_tree",
    "desktop_find",
    "desktop_act",
    "desktop_screenshot",
    "desktop_windows",
    "desktop_window_act",
    "desktop_layout",
  ]) assert.ok(text.includes(`\`${tool}\``), tool)
  for (const command of [
    "/deploy",
    "/handoff",
    "/handoff_resume",
    "/promote-skills",
    "/copy_session_id",
    "/session-context",
  ]) assert.ok(text.includes(command), command)
  assert.doesNotMatch(text, /ses_[A-Za-z0-9]+|53eacb15/)
  assert.match(await read("README.md"), /docs\/features\.md/)
  assert.ok((await read("README.md")).split("\n").length <= 170)
})

test("documentation guidance maintains human-readable feature inventories generically", async () => {
  const text = await read(".opencode/skills/development-conventions/references/write-docs/guide.md")
  assert.match(text, /docs\/features\.md/)
  assert.match(text, /human-readable feature inventory/i)
  assert.match(text, /source presence.*runtime/s)
  assert.doesNotMatch(text, /computer-use|\/home\/(?:james|shak)|~\/repos/)
})

test("shared documentation entry points do not impose the source repo's product rules", async () => {
  for (const name of ["readme-maintenance", "skill-maintenance", "development-conventions"]) {
    const text = await read(`.opencode/skills/${name}/SKILL.md`)
    assert.match(text, /consumer project/)
    assert.doesNotMatch(text, /Maintain the computer-use root README|~\/repos\/computer-use\/|under 170 physical lines/)
  }
})
