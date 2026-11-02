#!/usr/bin/env node
/**
 * Runs both OpenCode plugin test suites from a fixed, explicit directory list.
 *
 * The plugin directories have no package.json, so their tests are discovered by
 * filename. Doing the discovery here keeps offline CI free of shell globbing and
 * makes the exact file list visible in one place.
 */
import { readdirSync } from "node:fs"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const suites = [
  { directory: ".opencode/plugins/computer-use", extension: ".test.ts" },
  { directory: ".opencode/plugins/goal-docs", extension: ".test.ts" },
  { directory: ".opencode/plugins/memory", extension: ".test.ts" },
  // Personality's native-host and model-fixture suites need real hosts, so only
  // the offline unit suites run here.
  { directory: "tools/personality", extension: ".test.mjs", only: ["core.test.mjs", "entry.test.mjs", "wiring.test.mjs"] },
  { directory: "tools/self-learning", extension: ".test.mjs" },
  { directory: "tools/computer-use-browser/test", extension: ".test.ts" },
  { directory: "tools/computer-use-runtime/test", extension: ".test.ts" },
  { directory: "tools/computer-use-runtime", extension: ".test.mjs" },
  { directory: "tools/computer-use-browser", extension: ".test.mjs" },
  { directory: "tools/gnome-window-control", extension: ".test.mjs" },
  { directory: "tools/chatgpt-direct/test", extension: ".test.mjs" },
  { directory: "voice-assistant/test", extension: ".test.ts" },
]
let failed = 0

for (const { directory, extension, only } of suites) {
  const files = readdirSync(path.join(root, directory))
    .filter((name) => name.endsWith(extension) && (!only || only.includes(name)))
    .sort()
    .map((name) => path.join(directory, name))
  if (files.length === 0) {
    console.error(`no test files found in ${directory}`)
    failed = 1
    continue
  }
  const result = spawnSync(process.execPath, ["--test", "--test-reporter=spec", ...files], {
    cwd: root,
    stdio: "inherit",
  })
  if (result.status !== 0) failed = 1
}

process.exitCode = failed
