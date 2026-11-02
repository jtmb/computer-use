#!/usr/bin/env node

import { previewGoalDocRecovery } from "./recovery.ts"

const usage = `Usage: node --experimental-strip-types recovery-cli.mjs [preview] --root PATH --goal ID --session ID --backup-dir PATH

Preview is the default and is read-only. This CLI intentionally has no apply or rollback command;
those operations require a host-wired authorization callback through the recovery API.`

function parseArguments(args) {
  const values = { command: "preview" }
  const remaining = [...args]
  if (remaining[0] && !remaining[0].startsWith("-")) {
    values.command = remaining.shift()
  }
  while (remaining.length) {
    const flag = remaining.shift()
    if (["--root", "--goal", "--session", "--backup-dir"].includes(flag)) {
      const value = remaining.shift()
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`)
      const key = flag.slice(2).replaceAll("-", "")
      values[key] = value
      continue
    }
    if (flag === "--help" || flag === "-h") {
      values.help = true
      continue
    }
    if (flag === "--apply" || flag === "apply" || flag === "rollback") {
      throw new Error("apply and rollback are API-only and require a trusted host authorization callback")
    }
    throw new Error(`unsupported argument: ${flag}`)
  }
  return values
}

try {
  const input = parseArguments(process.argv.slice(2))
  if (input.help) {
    process.stdout.write(`${usage}\n`)
    process.exitCode = 0
  } else {
    if (input.command !== "preview") throw new Error(`unsupported command: ${input.command}`)
    if (!input.root || !input.goal || !input.session || !input.backupdir) throw new Error(usage)
    const preview = await previewGoalDocRecovery({
      repositoryRoot: input.root,
      goalID: input.goal,
      sessionID: input.session,
      backupDirectory: input.backupdir,
    })
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`)
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  process.stderr.write(`goal-docs recovery preview failed: ${message}\n`)
  process.exitCode = 1
}
