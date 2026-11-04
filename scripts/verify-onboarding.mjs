#!/usr/bin/env node
// Operational test, not part of offline CI: owns a private service and never copies credentials.
import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { mkdir, mkdtemp, open, readFile, readdir, symlink, writeFile } from "node:fs/promises"
import http from "node:http"
import net from "node:net"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { CORE_PLUGINS } from "./onboarding-preflight.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
export const REQUIRED_TOOLS = ["get_goal", "create_goal", "update_goal_plan", "memory", "personality", "self_learning", "desktop_apps", "web_navigate", "cua_js"]

export function verifyInventory(plugins, tools) {
  for (const id of CORE_PLUGINS) {
    const matches = plugins.filter(plugin => plugin.id === id)
    assert.equal(matches.length, 1, `missing or duplicate plugin: ${id}`)
    assert.equal(matches[0].state?.status, "active", `inactive plugin: ${id}`)
  }
  for (const id of REQUIRED_TOOLS) assert.ok(tools.includes(id), `registered tool missing: ${id}`)
}

export function isolatedConfig(config, observerDirectory) {
  const result = structuredClone(config)
  // Private HOME/XDG paths do not isolate the same user's OS keyring.
  result.mcp.servers.github.disabled = true
  result.plugins.push(observerDirectory)
  return result
}

export async function awaitMcpConnection(read, { timeout = 45000, interval = 200 } = {}) {
  const deadline = Date.now() + timeout
  do {
    const servers = await read()
    const state = servers.find(server => server.name === "playwright")?.status
    if (state?.status === "connected") return servers
    if (state?.status === "failed") throw new Error(`Playwright MCP failed: ${state.error}`)
    await new Promise(resolve => setTimeout(resolve, interval))
  } while (Date.now() < deadline)
  throw new Error("Playwright MCP did not connect within its startup deadline")
}

async function unusedPort() {
  const server = net.createServer()
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function browserProbe(env, directory) {
  const page = http.createServer((_request, response) => response.end("<!doctype html><title>Isolated onboarding probe</title><h1>Browser works</h1>"))
  await new Promise(resolve => page.listen(0, "127.0.0.1", resolve))
  const child = spawn("bash", [path.join(root, "scripts/playwright-mcp.sh")], {
    env: { ...env, PLAYWRIGHT_USER_DATA_DIR: path.join(directory, "browser-profile"), PLAYWRIGHT_OUTPUT_DIR: path.join(directory, "browser-output") },
    cwd: directory, stdio: ["pipe", "pipe", "pipe"],
  })
  const exited = new Promise(resolve => child.once("exit", resolve))
  let buffer = "", stderr = "", nextID = 0
  const pending = new Map()
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-16000) })
  child.on("error", error => { for (const entry of pending.values()) entry.reject(error) })
  child.stdout.on("data", chunk => {
    buffer += chunk
    if (buffer.length > 1024 * 1024) { child.kill(); return }
    let newline
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      try {
        const message = JSON.parse(line)
        const entry = pending.get(message.id)
        if (entry) { pending.delete(message.id); clearTimeout(entry.timer); entry.resolve(message) }
      } catch { /* MCP stdout must be JSON; timeout reports failure if no valid response arrives. */ }
    }
  })
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextID
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out: ${stderr}`)) }, 45000)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`)
  })
  try {
    const init = await rpc("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "isolated-onboarding-test", version: "1" } })
    assert.ok(init.result, JSON.stringify(init))
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`)
    const result = await rpc("tools/call", { name: "browser_navigate", arguments: { url: `http://127.0.0.1:${page.address().port}/` } })
    assert.ok(!result.error && !result.result?.isError, JSON.stringify(result))
    assert.match(JSON.stringify(result.result), /Isolated onboarding probe/)
    await rpc("tools/call", { name: "browser_close", arguments: {} })
    return { navigation: "passed", pageTitle: "Isolated onboarding probe", launcher: stderr.trim() }
  } finally {
    for (const entry of pending.values()) clearTimeout(entry.timer)
    child.stdin.end()
    child.kill("SIGTERM")
    await Promise.race([exited, new Promise(resolve => { const timer = setTimeout(() => { child.kill("SIGKILL"); resolve() }, 3000); timer.unref() })])
    await new Promise(resolve => page.close(resolve))
  }
}

async function prepareTuiProbe(directory) {
  const observation = path.join(directory, "tui-inventory.json")
  const filename = path.join(directory, "inventory-plugin/tui.ts")
  await writeFile(filename, `import { Plugin } from "@opencode/plugin/tui";
import { writeFileSync } from "node:fs";
export default Plugin.define({id:"onboarding.test.tui",setup(ctx){
let count=0;
const timer=setInterval(()=>{
const ids=ctx.keymap.commands().map(command=>command.id);
if(ids.includes("goal.show")||++count>=150){
writeFileSync(${JSON.stringify(observation)},JSON.stringify({version:ctx.app.version,runtime:{bun:process.versions.bun??null,node:process.versions.node},commands:ids}));
clearInterval(timer);
}
},100);
return ()=>clearInterval(timer);
}});`)
}

async function tuiProbe(binary, directory, run) {
  const observation = path.join(directory, "tui-inventory.json")
  const session = JSON.parse(run(binary, ["api", "post", "/api/session", "--data", JSON.stringify({ title: "Isolated onboarding TUI", location: { directory: path.join(directory, "project") } })])).data
  assert.ok(session?.id, "private TUI session was not created")
  const result = JSON.parse(run("python3", [path.join(root, "scripts/onboarding-tui-probe.py"), "--binary", binary,
    "--session", session.id, "--observation", observation, "--output", path.join(directory, "tui-terminal.log")]))
  const inventory = JSON.parse(await readFile(observation, "utf8"))
  for (const id of ["goal.show", "goal.engine.settings", "goal.yolo.settings"]) assert.ok(inventory.commands.includes(id), `TUI command missing: ${id}`)
  assert.ok(!inventory.commands.some(id => id.startsWith("voice.")), "voice was enabled without opt-in")
  return { ...result, version: inventory.version, runtime: inventory.runtime, goalCommands: inventory.commands.filter(id => id.startsWith("goal.")), voice: "default-off; guarded opt-in requires separate dependencies/models" }
}

export async function verifyOnboarding(binary, { withGithub = false } = {}) {
  const file = await open(binary, "r")
  const magic = Buffer.alloc(4)
  try { await file.read(magic, 0, 4, 0) } finally { await file.close() }
  assert.equal(magic.toString(), "\u007fELF", "Use the actual OpenCode Linux executable, not a profile shim")
  await mkdir("/tmp/opencode", { recursive: true })
  const directory = await mkdtemp("/tmp/opencode/onboarding-isolated-")
  for (const name of ["config", "home", "data", "cache", "state", "project", "bin", "inventory-plugin"]) await mkdir(path.join(directory, name))
  await symlink(binary, path.join(directory, "bin/opencode"))
  await symlink(process.execPath, path.join(directory, "bin/node"))
  const env = {
    HOME: path.join(directory, "home"), PATH: `${directory}/bin:/usr/local/bin:/usr/bin:/bin`, LANG: "C.UTF-8",
    XDG_CONFIG_HOME: path.join(directory, "home/.config"), XDG_DATA_HOME: path.join(directory, "data"),
    XDG_CACHE_HOME: path.join(directory, "cache"), XDG_STATE_HOME: path.join(directory, "state"),
    OPENCODE_CONFIG_DIR: path.join(directory, "config"), OPENCODE_DISABLE_AUTOUPDATE: "1",
    ...(process.env.OPENCODE_GOAL_PLUGIN_DIR ? { OPENCODE_GOAL_PLUGIN_DIR: process.env.OPENCODE_GOAL_PLUGIN_DIR } : {}),
  }
  const run = (command, args) => {
    const result = spawnSync(command, args, { env, cwd: path.join(directory, "project"), encoding: "utf8", timeout: 90000, maxBuffer: 8 * 1024 * 1024 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, `${command} ${args.join(" ")}: ${result.stderr}\n${result.stdout}`)
    return result.stdout
  }
  const cli = args => run(binary, args)
  const location = `location%5Bdirectory%5D=${encodeURIComponent(path.join(directory, "project"))}`
  const api = route => JSON.parse(cli(["api", "get", `${route}?${location}`]))
  let started = false
  const receipt = { directory, binary, sourceRoot: root, testedAt: new Date().toISOString() }
  try {
    receipt.onboarding = run("bash", [path.join(root, "scripts/onboard.sh"), "--apply", "--no-search", "--no-auth-check", "--config-dir", env.OPENCODE_CONFIG_DIR, ...(withGithub ? ["--with-github"] : [])])
    if (withGithub) receipt.githubRuntime = run("python3", [path.join(root, "scripts/mcp_runtime.py"), "github-runtime", "--profile", "native"]).trim()
    receipt.paths = cli(["debug", "paths"])
    for (const key of ["data", "cache", "state", "config", "db", "home"]) {
      const line = receipt.paths.split("\n").find(line => line.startsWith(`${key} `))
      assert.ok(line?.includes(directory), `${key} escaped isolation: ${line}`)
    }
    // Observe the host's real registry without injecting any substitute tool definitions.
    await writeFile(path.join(directory, "inventory-plugin/index.ts"), `import { Plugin } from "@opencode/plugin";
import { Rpc } from "@opencode/plugin/rpc";
const list={type:"array",items:{type:"string"}};
const rpc=Rpc.define({id:"onboarding.test.inventory",methods:{read:{input:{type:"object",additionalProperties:false},output:{type:"object",properties:{tools:list,skills:list,commands:list},required:["tools","skills","commands"],additionalProperties:false}}},events:{}});
export default Plugin.define({id:"onboarding.test.inventory",async setup(ctx){
const rows=value=>Array.isArray(value)?value:value.data;
await ctx.rpc.register(rpc,{read:async()=>({
tools:(await ctx.tool.list()).map(t=>t.id),
skills:rows(await ctx.skill.list()).map(s=>s.id),
commands:rows(await ctx.command.list()).map(c=>c.name)
})});
}});`)
    const configFile = path.join(directory, "config/opencode.jsonc")
    const config = isolatedConfig(JSON.parse(await readFile(configFile, "utf8")), path.join(directory, "inventory-plugin"))
    await writeFile(configFile, JSON.stringify(config, null, 2) + "\n")
    await prepareTuiProbe(directory)
    cli(["service", "set", "port", String(await unusedPort())])
    cli(["service", "start"])
    started = true
    receipt.configSources = api("/api/config").map(source => source.path).filter(Boolean)
    assert.ok(receipt.configSources.every(source => source.startsWith(directory)), "loaded a non-isolated config document")
    let plugins = []
    const readyBy = Date.now() + 45000
    while (Date.now() < readyBy) {
      plugins = api("/api/plugin").data
      if (plugins.some(plugin => plugin.id === "onboarding.test.inventory" && plugin.state?.status === "active")) break
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    assert.ok(plugins.some(plugin => plugin.id === "onboarding.test.inventory" && plugin.state?.status === "active"), "registry observer did not load")
    const inventory = JSON.parse(cli(["api", "post", `/api/rpc/onboarding.test.inventory/read?${location}`, "--data", '{"input":{}}'])).output
    const tools = inventory.tools
    verifyInventory(plugins, tools)
    receipt.plugins = plugins.filter(plugin => CORE_PLUGINS.includes(plugin.id)).map(plugin => ({ id: plugin.id, state: plugin.state.status, source: plugin.source }))
    receipt.tools = tools
    const expectedSkills = (await readdir(path.join(root, ".opencode/skills"), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name)
    for (const id of expectedSkills) assert.ok(inventory.skills.includes(id), `skill missing: ${id}`)
    receipt.skillCount = expectedSkills.length
    for (const name of ["goal", "document-code", "checkout", "handoff_resume"]) assert.ok(inventory.commands.includes(name), `command missing: ${name}`)
    receipt.commandNames = inventory.commands
    receipt.mcp = await awaitMcpConnection(() => api("/api/mcp").data)
    receipt.browser = await browserProbe(env, directory)
    receipt.tui = await tuiProbe(binary, directory, run)
    receipt.limits = ["No model request, authentication checks or account sign-in", "No TUI rendering, microphone/audio or GNOME extension activation", "GitHub wrapper intentionally disabled in the test profile to avoid access to the user's OS keyring; optional runtime provisioning remains tested", "Runtime inventory observed using a test-only plugin, not a model/tool dispatch"]
    receipt.result = "passed"
    return receipt
  } finally {
    let cleanupError
    receipt.serviceStopped = false
    if (started) {
      try {
        cli(["service", "stop"])
        assert.equal(cli(["service", "status"]).trim(), "stopped", "owned service is still running")
        receipt.serviceStopped = true
      } catch (error) {
        cleanupError = error
        receipt.cleanupError = error.message
        receipt.result = "failed"
      }
    }
    await writeFile(path.join(directory, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n")
    console.error(`Isolated evidence: ${directory}/receipt.json`)
    if (cleanupError) throw cleanupError
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const index = process.argv.indexOf("--opencode")
  if (index === -1 || !process.argv[index + 1]) throw new Error("Usage: node scripts/verify-onboarding.mjs --opencode /absolute/path/to/raw/opencode [--with-github]")
  const receipt = await verifyOnboarding(path.resolve(process.argv[index + 1]), { withGithub: process.argv.includes("--with-github") })
  console.log(JSON.stringify({ result: receipt.result, plugins: receipt.plugins, skills: receipt.skillCount, browser: receipt.browser, tui: receipt.tui, serviceStopped: receipt.serviceStopped }, null, 2))
}
