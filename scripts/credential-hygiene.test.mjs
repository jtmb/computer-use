// Bounded credential-hygiene audit of this repository's own scripts and config.
// The MCP launcher probes moved with the launchers on 2026-11-19.
//
// Every probe runs offline against synthetic executables in a scratch HOME under
// /tmp/opencode: no real gh login, no real MCP server, no browser, no network.
// A planted marker ("SYNTHETIC_SECRET_DO_NOT_LOG") stands in for a credential so
// a real secret value is never read or printed.
import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises"
import { rmSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { after, test } from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const scripts = path.join(root, "scripts")
const scratchBase = "/tmp/opencode"
const marker = "SYNTHETIC_SECRET_DO_NOT_LOG"
const scratch = await mkdtemp(path.join(scratchBase, "credential-hygiene-"))

// Clean up even when the runner is torn down early (for example by a closed pipe).
after(async () => {
  await rm(scratch, { recursive: true, force: true })
})
process.on("exit", () => {
  try {
    rmSync(scratch, { recursive: true, force: true })
  } catch {
    // Nothing to reclaim.
  }
})


async function writeExecutable(file, body) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(file, body, { mode: 0o700 })
  await chmod(file, 0o700)
  return file
}

// A probe executable records its own environment and argv, then exits 0.
function probeBody(record, extra = "") {
  return `#!/bin/bash
${extra}
{
  printf '===ENV===\\n'
  env
  printf '===ARGV===\\n'
  printf '%s\\n' "$@"
} > ${JSON.stringify(record)}
exit 0
`
}

async function readProbe(record) {
  const text = await readFile(record, "utf8")
  const [envPart, argvPart = ""] = text.split("===ARGV===\n")
  const env = new Map()
  for (const line of envPart.replace("===ENV===\n", "").split("\n")) {
    if (!line.includes("=")) continue
    const index = line.indexOf("=")
    env.set(line.slice(0, index), line.slice(index + 1))
  }
  const argv = argvPart.split("\n").filter((line) => line.length > 0)
  return { env, argv, text }
}

const bashAdded = new Set(["PWD", "SHLVL", "OLDPWD", "_"])

const plantedSecrets = {
  OPENAI_API_KEY: marker,
  CODEX_API_KEY: "SYNTHETIC_SECRET_B_DO_NOT_LOG",
  AWS_SECRET_ACCESS_KEY: "SYNTHETIC_SECRET_C_DO_NOT_LOG",
  CLOUDFLARE_API_TOKEN: "SYNTHETIC_SECRET_D_DO_NOT_LOG",
  SSH_AUTH_SOCK: "/tmp/SYNTHETIC_AGENT_E_DO_NOT_LOG",
  GITHUB_PERSONAL_ACCESS_TOKEN: "SYNTHETIC_SECRET_F_DO_NOT_LOG",
  GH_TOKEN: "SYNTHETIC_SECRET_G_DO_NOT_LOG",
}

function runLauncher(script, { home, env = {}, args = [] }) {
  return spawnSync("/bin/bash", [path.join(scripts, script), ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 60000,
    env: { HOME: home, PATH: "/usr/local/bin:/usr/bin:/bin", LANG: "C.UTF-8", ...env },
  })
}

test("audited source never reads Codex credential material and never exports credentials", async () => {
  const forbidden = /(\.codex|auth\.json|auth export|keyring|secret-tool|OPENAI_API_KEY|CODEX_API_KEY)/i
  const audited = []
  for (const name of await readdir(scripts)) {
    if (name.endsWith(".sh") || (name.endsWith(".py") && !name.startsWith("test_"))) {
      audited.push(path.join(scripts, name))
    }
  }
  audited.push(path.join(root, "global/opencode.jsonc"))
  audited.push(path.join(root, "opencode.json"))
  assert.ok(audited.length > 10, "audited scope discovery found too few files")

  const offenders = []
  for (const file of audited) {
    const text = await readFile(file, "utf8")
    for (const line of text.split("\n")) {
      if (forbidden.test(line)) offenders.push(`${path.relative(root, file)}: ${line.trim()}`)
    }
  }
  assert.deepEqual(offenders, [], "audited source references credential material")
})
