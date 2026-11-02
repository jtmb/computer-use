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
const suites = [".opencode/plugins/computer-use", ".opencode/plugins/goal-docs"]
let failed = 0

for (const directory of suites) {
  const files = readdirSync(path.join(root, directory))
    .filter((name) => name.endsWith(".test.ts"))
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
