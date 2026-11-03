import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { readdir } from "node:fs/promises"
import { promisify } from "node:util"
import test from "node:test"

const exec = promisify(execFile)
const ROOT = resolve(import.meta.dirname, "..")
const quote = value => `'${value.replaceAll("'", "'\\''")}'`

async function fixture(t, script) {
  const root = await mkdtemp("/tmp/opencode/review-launcher-")
  t.after(() => rm(root, { recursive: true, force: true }))
  const bin = join(root, "bin"), scripts = join(root, "scripts"), home = join(root, "home")
  await Promise.all([bin, scripts, home].map(path => mkdir(path)))
  await copyFile(join(ROOT, "scripts", script), join(scripts, script))
  return { root, bin, home, script: join(scripts, script), env: { HOME: home, PATH: `${bin}:/usr/bin:/bin`, LANG: "C.UTF-8", TMPDIR: root } }
}

async function command(bin, name, text) {
  const path = join(bin, name)
  await writeFile(path, `#!/bin/sh\n${text}\n`, { mode: 0o700 })
  return path
}

async function run(f, args = [], env = {}) {
  try { return { code: 0, ...await exec("/bin/bash", [f.script, ...args], { env: { ...f.env, ...env }, timeout: 8000, maxBuffer: 64 * 1024 }) } }
  catch (error) { if (typeof error.code !== "number") throw error; return { code: error.code, stdout: error.stdout, stderr: error.stderr } }
}

test("visible Playwright launcher retains display context without unrelated provider variables", async t => {
  const f = await fixture(t, "playwright-mcp.sh")
  const cli = join(f.root, "tools/browser/node_modules/@playwright/mcp")
  await mkdir(cli, { recursive: true })
  await writeFile(join(cli, "cli.js"), "// Fake MCP entry; never executed.\n")
  const node = join(f.bin, "node-probe")
  await writeFile(node, `#!${process.execPath}\nconsole.log(JSON.stringify({display:process.env.DISPLAY,wayland:process.env.WAYLAND_DISPLAY,authority:process.env.XAUTHORITY,runtime:process.env.XDG_RUNTIME_DIR,providerLeaked:Object.hasOwn(process.env,'OPENAI_API_KEY')}))\n`, { mode: 0o700 })
  const expected = { display: ":91", wayland: "wayland-fixture", authority: join(f.root, "xauth"), runtime: join(f.root, "runtime"), providerLeaked: false }
  const result = await run(f, [], { OPENCODE_NODE_BIN: node, PLAYWRIGHT_OUTPUT_DIR: join(f.root, "output"), DISPLAY: expected.display,
    WAYLAND_DISPLAY: expected.wayland, XAUTHORITY: expected.authority, XDG_RUNTIME_DIR: expected.runtime, OPENAI_API_KEY: "synthetic-unrelated" })
  assert.equal(result.code, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), expected)
  const invalid = await run(f, [], { OPENCODE_NODE_BIN: node, PLAYWRIGHT_OUTPUT_DIR: join(f.root, "output"), DISPLAY: "bad\ndisplay", XAUTHORITY: "bad\nauthority" })
  assert.equal(invalid.code, 0, invalid.stderr)
  assert.equal(Object.hasOwn(JSON.parse(invalid.stdout), "display"), false)
  assert.equal(Object.hasOwn(JSON.parse(invalid.stdout), "authority"), false)
})

test("GitHub launcher uses an explicitly selected gh config directory without reading real credentials", async t => {
  const f = await fixture(t, "github-mcp.sh")
  const config = join(f.root, "selected-gh")
  await mkdir(config, { mode: 0o700 })
  const gh = await command(f.bin, "gh-probe", `[ "$GH_CONFIG_DIR" = ${quote(config)} ] || exit 29\n[ -z "\${OPENAI_API_KEY:-}" ] || exit 30\nprintf '%s\\n' synthetic-fixture-token`)
  const mcp = await command(f.bin, "mcp-probe", "exit 99")
  await command(f.bin, "python3", `case "$2" in\n github-runtime) printf '%s\\n' ${quote(mcp)} ;;\n runner) printf '%s\\n' ${quote(gh)} ;;\n *) exit 98 ;;\nesac`)
  const result = await run(f, ["--verify-only"], { GH_CONFIG_DIR: config, OPENAI_API_KEY: "synthetic-unrelated" })
  assert.equal(result.code, 0, result.stderr)
  assert.match(result.stdout, /host=github\.com/u)
  assert.equal(result.stdout.includes("synthetic-fixture-token"), false)
  for (const invalid of ["relative-gh", join(f.root, "missing"), `${config}\n`]) {
    const refused = await run(f, ["--verify-only"], { GH_CONFIG_DIR: invalid })
    assert.notEqual(refused.code, 0)
    assert.match(refused.stderr, /GH_CONFIG_DIR must be an existing absolute directory/u)
    assert.equal(refused.stdout.includes("host="), false)
  }
})

async function reloginFixture(t, failingCommand, existingEntry = true) {
  const f = await fixture(t, "session-relogin.sh")
  const runner = join(f.root, "scripts/post-login-acceptance.sh")
  await writeFile(runner, "#!/bin/sh\nexit 0\n", { mode: 0o700 })
  const entry = join(f.home, ".config/autostart/opencode-post-login-acceptance.desktop")
  if (existingEntry) {
    await mkdir(join(f.home, ".config/autostart"), { recursive: true })
    await writeFile(entry, "previous-complete-entry\n")
  }
  const logout = join(f.root, "logout-called")
  await command(f.bin, "gnome-session-quit", `printf '%s\\n' called > ${quote(logout)}`)
  await command(f.bin, "gnome-extensions", "printf 'State: ACTIVE\\n'")
  await command(f.bin, "pgrep", "printf '0\\n'")
  await command(f.bin, "find", "exit 0")
  await command(f.bin, "sleep", "exit 0")
  if (failingCommand) await command(f.bin, failingCommand, "exit 74")
  return { ...f, entry, logout }
}

for (const failingCommand of ["cat", "mv"]) {
  test(`relogin refuses logout and preserves the prior entry when ${failingCommand} fails`, async t => {
    const f = await reloginFixture(t, failingCommand)
    const result = await run(f, ["--now", "--force"])
    assert.notEqual(result.code, 0, result.stdout)
    await assert.rejects(stat(f.logout), { code: "ENOENT" })
    assert.equal(await readFile(f.entry, "utf8"), "previous-complete-entry\n")
    assert.doesNotMatch(result.stdout, /^armed:/mu)
    assert.deepEqual(await readdir(dirname(f.entry)), ["opencode-post-login-acceptance.desktop"])
  })
}

test("relogin reports armed only after a complete private entry is published, using a fake logout", async t => {
  const f = await reloginFixture(t)
  const result = await run(f, ["--now", "--force"])
  assert.equal(result.code, 0, result.stderr)
  assert.match(await readFile(f.entry, "utf8"), /^\[Desktop Entry\]\n[\s\S]*X-GNOME-Autostart-enabled=true\n$/u)
  assert.equal((await stat(f.entry)).mode & 0o777, 0o600)
  assert.equal(await readFile(f.logout, "utf8"), "called\n")
  assert.match(result.stdout, /armed:/u)
})

test("relogin check creates no autostart directory or logout side effect", async t => {
  const f = await reloginFixture(t, undefined, false)
  const result = await run(f, ["--check"])
  assert.equal(result.code, 0, result.stderr)
  await assert.rejects(stat(dirname(f.entry)), { code: "ENOENT" })
  await assert.rejects(stat(f.logout), { code: "ENOENT" })
})
