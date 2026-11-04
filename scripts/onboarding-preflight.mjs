#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chooseBrowser, findBundled, findInstalled, readDefaultDesktop } from "./playwright-browser-select.mjs"

export const CORE_PLUGINS = [
  "local.goal-mode.server", "computer-use.personality", "computer-use.desktop",
  "computer-use.goal-docs", "computer-use.memory", "computer-use.self-learning", "chatgpt.direct",
]

export function inspectOnboarding(root, goalRoot = path.join(path.dirname(root), "opencode-goal-plugin"), browserFacts) {
  const errors = []
  const warnings = []
  const [major, minor] = process.versions.node.split(".").map(Number)
  if (major < 22 || (major === 22 && minor < 18)) errors.push("Node 22.18+ is required by the browser worker")
  if (!path.isAbsolute(goalRoot)) errors.push("OPENCODE_GOAL_PLUGIN_DIR must be an absolute path")
  const remap = value => {
    for (const [prefix, replacement] of [
      ["/home/james/repos/computer-use", root], ["~/repos/computer-use", root],
      ["/home/james/repos/opencode-goal-plugin", goalRoot],
    ]) if (value === prefix || value.startsWith(`${prefix}/`)) return replacement + value.slice(prefix.length)
    return value
  }
  const required = (filename, label) => {
    if (!existsSync(filename)) errors.push(`${label} is missing: ${filename}`)
  }
  const configurations = ["global/opencode.jsonc", "global/cli.json"].map(relative => {
    try { return JSON.parse(readFileSync(path.join(root, relative), "utf8")) }
    catch (error) { errors.push(`${relative}: ${error.message}`); return {} }
  })
  for (const config of configurations) {
    for (const entry of config.plugins ?? []) {
      const pkg = typeof entry === "string" ? entry : entry.package
      if (typeof pkg !== "string" || pkg.startsWith("-") || !pkg.startsWith("/")) continue
      const directory = remap(pkg)
      required(directory, "Plugin directory")
      if (existsSync(directory) && !["index.ts", "server.ts", "server.js", "tui.ts", "tui.js", "package.json"].some(name => existsSync(path.join(directory, name)))) {
        errors.push(`Plugin has no entrypoint: ${directory}`)
      }
    }
    for (const directory of config.skills ?? []) required(remap(directory), "Skill directory")
    for (const [name, server] of Object.entries(config.mcp?.servers ?? {})) {
      if (server.disabled || server.type !== "local") continue
      const executable = remap(server.command[0])
      required(executable, `MCP launcher (${name})`)
      if (existsSync(executable) && !(statSync(executable).mode & 0o111)) errors.push(`MCP launcher is not executable: ${executable}`)
    }
  }
  required(path.join(goalRoot, "dist/server.js"), "Built goal plugin (set OPENCODE_GOAL_PLUGIN_DIR to its checkout)")
  required(path.join(goalRoot, "src/tui.ts"), "Goal TUI entrypoint (the complete goal-plugin checkout is required)")
  for (const [directory, dependency] of [["tools/computer-use-browser", "playwright-core"], ["tools/self-learning", "@opencode/client"]]) {
    try {
      const installed = path.join(root, directory, "node_modules", dependency)
      const manifest = JSON.parse(readFileSync(path.join(installed, "package.json"), "utf8"))
      const exported = manifest.exports?.["."]
      const entry = typeof exported === "string" ? exported : exported?.import ?? exported?.default ?? manifest.main ?? "index.js"
      if (!existsSync(path.join(installed, entry))) throw new Error("missing runtime entry")
    }
    catch { errors.push(`Missing ${dependency} in ${directory}; rerun onboarding with --with-tools`) }
  }
  const playwright = path.join(root, "tools/browser/node_modules/@playwright/mcp/cli.js")
  if (!existsSync(playwright)) errors.push("Playwright MCP dependency missing; rerun onboarding with --with-browser")
  try {
    chooseBrowser(browserFacts ?? {
      defaultEntry: readDefaultDesktop(), installed: findInstalled(),
      bundled: findBundled(process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(process.env.HOME, ".cache/ms-playwright")),
      override: process.env.PLAYWRIGHT_MCP_BROWSER,
    })
  } catch (error) { errors.push(`Browser launch preflight: ${error.message}; --with-browser provisions fallback Chromium when no browser is installed`) }
  warnings.push("GitHub MCP requires a checksum-pinned local runtime and the user's own gh login; check scripts/github-mcp.sh --verify-only separately")
  warnings.push("Desktop compositor control and voice audio/models need their separate platform setup; loading tools does not activate them")
  return { root, goalRoot, errors, warnings, expectedPlugins: CORE_PLUGINS }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2)
  const rootIndex = args.indexOf("--root")
  const root = rootIndex === -1 ? path.join(path.dirname(fileURLToPath(import.meta.url)), "..") : path.resolve(args[rootIndex + 1])
  const result = inspectOnboarding(root, process.env.OPENCODE_GOAL_PLUGIN_DIR)
  console.log(JSON.stringify(result, null, 2))
  if (args.includes("--required") && result.errors.length) process.exitCode = 1
}
