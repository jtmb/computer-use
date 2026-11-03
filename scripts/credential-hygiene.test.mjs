// Bounded credential-hygiene audit of the MCP launchers.
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

const policy = JSON.parse(await readFile(path.join(root, "config/mcp-versions.json"), "utf8"))

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

// ---------------------------------------------------------------------------
// github-mcp.sh
// ---------------------------------------------------------------------------

test("github-mcp.sh fails closed on every inherited GitHub token variable", () => {
  const home = path.join(scratch, "gh-reject-home")
  for (const name of ["GH_TOKEN", "GITHUB_TOKEN", "GH_ENTERPRISE_TOKEN", "GITHUB_ENTERPRISE_TOKEN"]) {
    const result = runLauncher("github-mcp.sh", { home, env: { [name]: marker } })
    assert.notEqual(result.status, 0, `${name} must not be accepted`)
    assert.match(result.stderr, new RegExp(`inherited GitHub token variables are not accepted: ${name}`))
    assert.equal(result.stdout.includes(marker), false)
  }
  assert.notEqual(
    runLauncher("github-mcp.sh", { home, env: { OPENCODE_MCP_GH_BIN: "/bin/false" } }).status,
    0,
    "OPENCODE_MCP_GH_BIN override must be rejected",
  )
})

test("github-mcp.sh passes only its allowlist plus the gh-store token to the MCP", async () => {
  const home = path.join(scratch, "gh-run-home")
  const record = path.join(scratch, "gh-child.txt")
  const runtimeRoot = path.join(home, ".local/share/opencode/mcp")
  await writeExecutable(
    path.join(runtimeRoot, "github/github-mcp-server"),
    probeBody(
      record,
      `if [ "$1" = "--version" ]; then printf 'Version: ${policy.githubVersion}\\n'; exit 0; fi`,
    ),
  )
  const fakeToken = "SYNTHETIC_GH_STORE_TOKEN_DO_NOT_LOG"
  await writeExecutable(
    path.join(home, ".local/bin/gh"),
    `#!/bin/bash
if [ "$1" = "auth" ] && [ "$2" = "token" ]; then printf '%s\\n' ${JSON.stringify(fakeToken)}; exit 0; fi
exit 1
`,
  )

  // GH_TOKEN is deliberately omitted here: it is rejected (previous test), and the
  // GITHUB_PERSONAL_ACCESS_TOKEN marker must be replaced by the gh-store token.
  const { GH_TOKEN: _rejected, ...inheritable } = plantedSecrets
  const result = runLauncher("github-mcp.sh", { home, env: inheritable })
  assert.equal(result.status, 0, `launcher failed: ${result.stderr}`)

  const { env, argv, text } = await readProbe(record)
  assert.equal(env.get("GITHUB_PERSONAL_ACCESS_TOKEN"), fakeToken, "token must travel through the environment")
  assert.deepEqual(argv, [
    "stdio",
    "--toolsets=context,repos,issues,pull_requests,actions,users",
    "--lockdown-mode",
  ])
  assert.equal(argv.some((value) => value.includes(fakeToken)), false, "token must never appear on argv")
  assert.equal(env.get("PATH"), "/usr/local/bin:/usr/bin:/bin")

  const allowed = /^(HOME|PATH|LANG|LC_.*|HTTPS_PROXY|https_proxy|ALL_PROXY|all_proxy|NO_PROXY|no_proxy|SSL_CERT_FILE|SSL_CERT_DIR|GITHUB_PERSONAL_ACCESS_TOKEN|GITHUB_HOST)$/
  for (const name of env.keys()) {
    assert.ok(allowed.test(name) || bashAdded.has(name), `unexpected variable reached the child: ${name}`)
  }
  for (const [name, value] of Object.entries(plantedSecrets)) {
    if (name === "GITHUB_PERSONAL_ACCESS_TOKEN") continue
    assert.equal(text.includes(value), false, `planted secret ${name} propagated to the MCP child`)
  }
  assert.equal(env.has("GH_TOKEN"), false)
  assert.equal(env.has("XDG_DATA_HOME"), false)
})

// ---------------------------------------------------------------------------
// chatgpt-mcp.sh
// ---------------------------------------------------------------------------

test("chatgpt-mcp.sh passes only its env -i allowlist to the connector", async (t) => {
  const connectorEntry = path.join(root, "tools/chatgpt-connector/src/mcp.ts")
  try {
    await readFile(connectorEntry)
  } catch {
    return t.skip("ChatGPT connector sources are absent; skipping the env -i probe")
  }

  const home = path.join(scratch, "chatgpt-home")
  const record = path.join(scratch, "chatgpt-child.txt")
  const node = path.join(
    home,
    `.local/share/opencode/mcp/node/node-v${policy.nodeVersion}-linux-x64/bin/node`,
  )
  await writeExecutable(
    node,
    probeBody(
      record,
      `case "$1" in
  --version) printf 'v${policy.nodeVersion}\\n'; exit 0 ;;
  --experimental-strip-types) ;;
  *) exit 0 ;;
esac`,
    ),
  )

  const xdg = path.join(scratch, "xdg-cache")
  const result = runLauncher("chatgpt-mcp.sh", {
    home,
    env: { ...plantedSecrets, PATH: `/usr/bin:/bin`, XDG_CACHE_HOME: xdg },
  })
  assert.equal(result.status, 0, `launcher failed: ${result.stderr}`)

  const { env, argv, text } = await readProbe(record)
  assert.equal(env.get("HOME"), home)
  assert.equal(env.get("PATH"), `${path.dirname(node)}:/usr/bin:/bin`, "PATH must be pinned, not inherited")
  assert.equal(env.get("XDG_CACHE_HOME"), xdg, "absolute XDG paths are deliberately forwarded")

  const allowed = /^(HOME|PATH|LANG|LC_.*|XDG_CONFIG_HOME|XDG_DATA_HOME|XDG_STATE_HOME|XDG_CACHE_HOME|XDG_RUNTIME_DIR)$/
  for (const name of env.keys()) {
    assert.ok(allowed.test(name) || bashAdded.has(name), `unexpected variable reached the connector: ${name}`)
  }
  for (const [name, value] of Object.entries(plantedSecrets)) {
    assert.equal(text.includes(value), false, `planted secret ${name} propagated to the connector child`)
  }
  assert.equal(argv[0], "--experimental-strip-types")
  assert.equal(env.has("OPENAI_API_KEY"), false, "the connector must resolve OAuth from the OpenCode store")
})

// ---------------------------------------------------------------------------
// playwright launchers
// ---------------------------------------------------------------------------

test("playwright-mcp.sh fails closed when the pinned Node is unavailable", () => {
  const home = path.join(scratch, "pw-missing-home")
  const result = runLauncher("playwright-mcp.sh", { home, env: { OPENAI_API_KEY: marker } })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /Node\.js is unavailable/)
  assert.equal(result.stderr.includes(marker), false)
})

test("playwright-headless-mcp.sh fails closed when its Node is unavailable", () => {
  const home = path.join(scratch, "pwh-missing-home")
  const result = runLauncher("playwright-headless-mcp.sh", { home, env: { OPENAI_API_KEY: marker } })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /fnm default Node is unavailable/)
  assert.equal(result.stderr.includes(marker), false)
})

test("playwright-mcp.sh uses only the synthetic repository and narrows the child environment", async () => {
  const syntheticRepo = path.join(scratch, "pw-synthetic-repository")
  const launcherSource = await readFile(path.join(scripts, "playwright-mcp.sh"))
  const copiedLauncher = path.join(syntheticRepo, "scripts/playwright-mcp.sh")
  await mkdir(path.dirname(copiedLauncher), { recursive: true })
  await writeFile(copiedLauncher, launcherSource, { mode: 0o700 })
  await chmod(copiedLauncher, 0o700)
  assert.deepEqual(await readFile(copiedLauncher), launcherSource, "fixture must execute the byte-identical production launcher")

  const syntheticMcp = path.join(syntheticRepo, "tools/browser/node_modules/@playwright/mcp/cli.js")
  await mkdir(path.dirname(syntheticMcp), { recursive: true })
  await writeFile(syntheticMcp, "// Synthetic fixture marker; the fake Node probe never executes this file.\n")

  const home = path.join(scratch, "pw-run-home")
  const record = path.join(scratch, "pw-child.txt")
  await writeExecutable(path.join(home, ".opencode/bin/node"), probeBody(record))
  const outputDir = path.join(scratch, "pw-output")
  const userDataDir = path.join(scratch, "pw-profile")
  const browsersPath = path.join(scratch, "pw-browsers")
  const result = spawnSync("/bin/bash", [copiedLauncher], {
    cwd: syntheticRepo,
    encoding: "utf8",
    timeout: 60000,
    env: {
      HOME: home,
      PATH: "/usr/local/bin:/usr/bin:/bin",
      LANG: "C.UTF-8",
      ...plantedSecrets,
      PLAYWRIGHT_OUTPUT_DIR: outputDir,
      PLAYWRIGHT_USER_DATA_DIR: userDataDir,
      PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    },
  })
  assert.equal(result.status, 0, `launcher failed: ${result.stderr}`)
  const { env, argv, text } = await readProbe(record)
  assert.deepEqual(argv, [
    syntheticMcp,
    "--browser",
    "firefox",
    "--user-data-dir",
    userDataDir,
    "--viewport-size",
    "1440x900",
    "--output-dir",
    outputDir,
  ])
  assert.notEqual(argv[0], path.join(root, "tools/browser/node_modules/@playwright/mcp/cli.js"))
  assert.equal(env.get("HOME"), home)
  assert.equal(env.get("PATH"), "/usr/local/bin:/usr/bin:/bin")
  assert.equal(env.get("LANG"), "C.UTF-8")
  assert.equal(env.get("PLAYWRIGHT_BROWSERS_PATH"), browsersPath)
  const allowed = /^(HOME|PATH|LANG|PLAYWRIGHT_BROWSERS_PATH|LC_ALL|LC_CTYPE|TMPDIR|XDG_RUNTIME_DIR)$/
  for (const name of env.keys()) {
    assert.ok(allowed.test(name) || bashAdded.has(name), `unexpected variable reached the browser MCP child: ${name}`)
  }
  for (const [name, value] of Object.entries(plantedSecrets)) {
    assert.equal(text.includes(value), false, `planted secret ${name} propagated to the browser MCP child`)
  }
})

test("playwright-headless-mcp.sh narrows the child environment", async () => {
  const source = await readFile(path.join(scripts, "playwright-headless-mcp.sh"), "utf8")
  assert.match(source, /env -i|compgen -e/, "launcher must reduce the exported environment before exec")
})

// ---------------------------------------------------------------------------
// No Codex credential material in audited source
// ---------------------------------------------------------------------------

test("audited source never reads Codex credential material and never exports credentials", async () => {
  const forbidden = /(\.codex|auth\.json|auth export|keyring|secret-tool|OPENAI_API_KEY|CODEX_API_KEY)/i
  const audited = []
  for (const name of await readdir(scripts)) {
    if (name.endsWith(".sh") || (name.endsWith(".py") && !name.startsWith("test_"))) {
      audited.push(path.join(scripts, name))
    }
  }
  for (const name of await readdir(path.join(root, "tools/chatgpt-connector/src"))) {
    if (name.endsWith(".ts")) audited.push(path.join(root, "tools/chatgpt-connector/src", name))
  }
  audited.push(path.join(root, "tools/chatgpt-connector/server.ts"))
  audited.push(path.join(root, "config/mcp-versions.json"))
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

  // The ChatGPT connector must use OpenCode's own OAuth connection store.
  const server = await readFile(path.join(root, "tools/chatgpt-connector/src/server.ts"), "utf8")
  assert.match(server, /integration\.connection\.resolve/)
  assert.equal(/readFile\([^)]*auth/i.test(server), false)
})
