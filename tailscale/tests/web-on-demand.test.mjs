import assert from "node:assert/strict"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import { createDockerWeb, GATEWAY, STATE_VOLUME, IMAGE } from "../scripts/web-on-demand.mjs"
import { registerDockerWeb } from "../../.opencode/plugins/tailscale-web/controller.mjs"

const root = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "")
const server = () => ({ pid: 23456, version: "2.1.1", urls: ["http://127.0.0.1:51947"] })
const request = () => ({ server: server(), sessionID: "ses_existing_chat" })
const route = target => ({ TCP: { 443: { HTTPS: true } }, Web: { "docker.example.ts.net:443": { Handlers: { "/": { Proxy: target } } } } })
const serve = (target = server().urls[0]) => ({ Foreground: { session: route(target) } })

function fixture(options = {}) {
  const calls = []
  const item = {
    Id: "a".repeat(64), Name: `/${GATEWAY}`,
    Config: { Image: IMAGE, User: "65532:65532", Entrypoint: ["tailscaled"],
      Cmd: ["--tun=userspace-networking", "--port=0", "--socket=/var/run/tailscale/tailscaled.sock", "--statedir=/var/lib/tailscale", "--state=/var/lib/tailscale/tailscaled.state"],
      Labels: { "com.docker.compose.project": "tailscale-web", "com.docker.compose.service": "gateway",
        "com.docker.compose.project.working_dir": root, "io.computer-use.tailscale-web.contract": "existing-instance-v1" } },
    HostConfig: { NetworkMode: "host", Privileged: false, ReadonlyRootfs: true, CapDrop: ["ALL"], CapAdd: [],
      SecurityOpt: ["no-new-privileges:true"], PidMode: "", IpcMode: "private", UTSMode: "", UsernsMode: "", GroupAdd: [],
      PortBindings: {}, Devices: [], RestartPolicy: { Name: "no" },
      Memory: 268435456, PidsLimit: 128, NanoCpus: 1000000000 },
    Mounts: [{ Type: "volume", Name: STATE_VOLUME, Destination: "/var/lib/tailscale", RW: true }],
    State: { Running: options.running ?? false },
  }
  options.mutate?.(item)
  let config = options.config ?? serve(), infoCalls = 0
  const run = async (command, args, execution) => {
    calls.push({ command, args })
    assert.ok(execution.timeout > 0 && execution.timeout <= 10000)
    if (options.run) { const override = await options.run(command, args, execution); if (override) return override }
    let stdout = "", stderr = "", code = 0
    if (command === "opencode") {
      if (args[0] === "service") stdout = server().urls[0]
      else if (args.at(-1) === "/api/info") { infoCalls++; stdout = JSON.stringify(options.changed && infoCalls > 1 ? { ...server(), pid: 999 } : server()) }
      else stdout = JSON.stringify({ data: { id: request().sessionID } })
    } else if (args[0] === "inspect") stdout = JSON.stringify(item)
    else if (args[0] === "ps") stdout = options.writer ?? (item.State.Running ? GATEWAY : "")
    else if (args[0] === "start" || args[0] === "stop") { assert.equal(args.at(-1), item.Id); item.State.Running = args[0] === "start" }
    else if (args.includes("--detach")) config = serve()
    else if (args[2] === "wget") {
      code = 1
      stderr = `  HTTP/1.1 ${args.at(-1).endsWith("/api/info") ? options.authStatus ?? 401 : options.uiStatus ?? 200} response\n`
    } else if (args[3] === "status") stdout = JSON.stringify({ BackendState: options.backend ?? "Running", Self: { Online: true, DNSName: "docker.example.ts.net." } })
    else if (args[3] === "serve") stdout = JSON.stringify(config)
    else throw new Error(`Unexpected boundary: ${command} ${args.join(" ")}`)
    return { code, stdout, stderr }
  }
  return { calls, item, web: createDockerWeb({ run, lock: options.lock ?? (async (_signal, operation) => operation(async () => {})), delay: async () => {}, ...(options.now ? { now: options.now } : {}) }) }
}
const docker = f => f.calls.filter(call => call.command === "docker").map(call => call.args)

function nativeUI(ui) {
  return { client: { server: { info: async () => server(), pair: async () => ({ code: "synthetic_pairing_code", expires_in: 300 }) } },
    ui: { ...ui, router: { current: () => ({ type: "session", sessionID: request().sessionID }) } } }
}

test("cold /tailscale-web starts only the approved gateway and discovers the existing non-default port", async () => {
  const f = fixture()
  const result = await f.web.start(request())
  assert.equal(result.url, "https://docker.example.ts.net/web")
  assert.equal(result.instance.sessionID, request().sessionID)
  assert.equal(result.instance.target, server().urls[0])
  assert.equal(result.remoteVerified, false)
  assert.deepEqual(docker(f).filter(args => args[0] === "start"), [["start", f.item.Id]])
  assert.equal(docker(f).filter(args => args[2] === "wget").length, 2)
  assert.equal(docker(f).some(args => args.includes("--bg") || args.includes("logs") || args.includes("up") || args.includes("funnel")), false)
  assert.equal(docker(f)[0][2].includes("Config.Env"), false)
  assert.equal(JSON.stringify(f.calls).includes("tailscale-opencode-1"), false)
})

test("warm /tailscale-web does not restart or rewrite an already private foreground route", async () => {
  const f = fixture({ running: true })
  await f.web.start(request())
  assert.equal(docker(f).some(args => args[0] === "start" || args.includes("--detach")), false)
})

test("missing Serve config creates a nonpersistent in-container process and verifies it", async () => {
  const f = fixture({ config: {} })
  await f.web.start(request())
  assert.deepEqual(docker(f).find(args => args.includes("--detach")), ["exec", "--detach", f.item.Id, "tailscale", "serve", "--https=443", server().urls[0]])
  assert.equal(docker(f).filter(args => args.includes("serve") && args.includes("--json")).length, 2)
})

test("/tailscale-web stop stops only the gateway, without discovering or stopping OpenCode", async () => {
  const f = fixture({ running: true })
  assert.deepEqual(await f.web.stop(), { stopped: true })
  assert.deepEqual(docker(f).filter(args => args[0] === "stop"), [["stop", "--time", "5", f.item.Id]])
  assert.equal(f.item.State.Running, false)
  assert.equal(f.calls.some(call => call.command === "opencode"), false)
  assert.equal(docker(f).some(args => args.includes("rm") || args.includes("down")), false)
})

test("repeated startup requests share one operation; conflicting stop is refused", async () => {
  let release, first = true
  const gate = new Promise(resolve => { release = resolve })
  const f = fixture({ run: async (_command, args) => { if (args[0] === "inspect" && first) { first = false; await gate } } })
  const one = f.web.start(request()), two = f.web.start(request())
  assert.equal(one, two)
  await assert.rejects(f.web.stop(), /starting/)
  await assert.rejects(f.web.start({ ...request(), server: { ...server(), pid: 777 } }), /another action or instance/)
  release(); await one
  assert.equal(docker(f).filter(args => args[0] === "start").length, 1)
})

for (const [name, mutate] of [
  ["foreign project", item => { item.Config.Labels["com.docker.compose.project"] = "other" }],
  ["foreign working directory", item => { item.Config.Labels["com.docker.compose.project.working_dir"] = "/other" }],
  ["old isolated topology", item => { item.HostConfig.NetworkMode = "bridge" }],
  ["published port", item => { item.HostConfig.PortBindings = { "443/tcp": [] } }],
  ["root user", item => { item.Config.User = "0" }],
  ["privileges", item => { item.HostConfig.Privileged = true }],
  ["added capability", item => { item.HostConfig.CapAdd = ["NET_ADMIN"] }],
  ["relaxed security options", item => { item.HostConfig.SecurityOpt.push("seccomp=unconfined") }],
  ["host PID namespace", item => { item.HostConfig.PidMode = "host" }],
  ["shared IPC namespace", item => { item.HostConfig.IpcMode = "container:other" }],
  ["host UTS namespace", item => { item.HostConfig.UTSMode = "host" }],
  ["host user namespace", item => { item.HostConfig.UsernsMode = "host" }],
  ["additional groups", item => { item.HostConfig.GroupAdd = ["0"] }],
  ["unreviewed image", item => { item.Config.Image = "image:latest" }],
  ["automatic restart", item => { item.HostConfig.RestartPolicy.Name = "always" }],
  ["unbounded resources", item => { item.HostConfig.Memory = 0 }],
  ["host data mount", item => { item.Mounts.push({ Type: "bind", Source: "/home/example", Destination: "/data" }) }],
  ["wrong state", item => { item.Mounts[0].Name = "other" }],
  ["other daemon command", item => { item.Config.Cmd = [] }],
]) test(`rejects ${name} before container mutation`, async () => {
  const f = fixture({ mutate })
  await assert.rejects(f.web.start(request()), /hardening|mounts|daemon/)
  assert.equal(docker(f).length, 1)
})

test("missing connected identity and concurrent state writers cannot start a container", async () => {
  const f = fixture()
  await assert.rejects(f.web.start(), /identity/)
  assert.equal(f.calls.length, 0)
  const g = fixture({ writer: "tailscale-tailscale-1" })
  await assert.rejects(g.web.start(request()), /state/)
  assert.equal(docker(g).some(args => args[0] === "start"), false)
})

test("authentication/UI failure and pending device approval clean up only a newly started gateway", async () => {
  for (const options of [{ authStatus: 200 }, { uiStatus: 500 }, { backend: "NeedsMachineAuth" }, { backend: "NeedsLogin" }]) {
    const f = fixture(options)
    await assert.rejects(f.web.start(request()), /authentication|approval/)
    assert.equal(docker(f).some(args => args.includes("--detach")), false)
    assert.deepEqual(docker(f).filter(args => args[0] === "stop"), [["stop", "--time", "5", f.item.Id]])
  }
})

test("Funnel, persistent routes, extra routes and wrong endpoints are refused without overwriting", async () => {
  for (const config of [{ ...serve(), AllowFunnel: { "docker.example.ts.net:443": true } },
    route(server().urls[0]), { ...serve(), Foreground: { one: route(server().urls[0]), two: route(server().urls[0]) } },
    serve("http://127.0.0.1:4096")]) {
    const f = fixture({ config })
    await assert.rejects(f.web.start(request()), /Funnel|migration|Additional|does not match/)
    assert.equal(docker(f).some(args => args.includes("--detach")), false)
  }
})

test("slow readiness is retried; permanent failures are bounded", async () => {
  let pending = 2
  const f = fixture({ run: async (_command, args) => args[2] === "wget" && pending-- > 0
    ? { code: 1, stdout: "", stderr: "connection refused" } : undefined })
  await f.web.start(request())
  assert.equal(docker(f).filter(args => args[2] === "wget").length, 4)
  const g = fixture({ backend: "Starting" })
  await assert.rejects(g.web.start(request()), /did not become ready/)
  assert.equal(docker(g).filter(args => args[3] === "status").length, 30)
  const h = fixture({ run: async (_command, args) => args[2] === "wget"
    ? { code: 1, stdout: "", stderr: "connection refused" } : undefined })
  await assert.rejects(h.web.start(request()), /readiness/)
  assert.equal(docker(h).filter(args => args[2] === "wget").length, 20)
  assert.equal(h.item.State.Running, false)
})

test("instance changes during startup fail closed before publishing", async () => {
  const f = fixture({ changed: true, config: {} })
  await assert.rejects(f.web.start(request()), /does not match|instance changed/)
  assert.equal(docker(f).some(args => args.includes("--detach")), false)
  assert.equal(f.item.State.Running, false)
})

test("cancellation during cold startup stops only the gateway this operation started", async () => {
  let web
  const f = fixture({ run: async (_command, args) => { if (args[3] === "status") web.dispose() } })
  web = f.web
  await assert.rejects(web.start(request()), /cancelled/)
  assert.equal(f.item.State.Running, false)
  assert.equal(docker(f).filter(args => args[0] === "stop").length, 1)
})

test("a failed start after the daemon launched the container still stops only the gateway", async () => {
  const f = fixture({ run: async (_command, args) => {
    if (args[0] === "start") { f.item.State.Running = true; return { code: 1, stdout: "", stderr: "synthetic-private" } }
  } })
  await assert.rejects(f.web.start(request()), error => !error.message.includes("synthetic-private"))
  assert.equal(f.item.State.Running, false)
  assert.deepEqual(docker(f).filter(args => args[0] === "stop"), [["stop", "--time", "5", f.item.Id]])
})

test("cancellation during container start still stops the gateway this operation started", async () => {
  let web
  const f = fixture({ run: async (_command, args) => {
    if (args[0] === "start") { f.item.State.Running = true; web.dispose(); throw new Error("Docker web action cancelled.") }
  } })
  web = f.web
  await assert.rejects(web.start(request()), /cancelled/)
  assert.equal(f.item.State.Running, false)
  assert.deepEqual(docker(f).filter(args => args[0] === "stop"), [["stop", "--time", "5", f.item.Id]])
})

test("unverified foreground Serve fails closed and reports whether a pre-existing gateway remains", async () => {
  const publishWithoutRoute = async (_command, args) => args.includes("--detach") ? { code: 0, stdout: "", stderr: "" } : undefined
  const cold = fixture({ config: {}, run: publishWithoutRoute })
  await assert.rejects(cold.web.start(request()), /did not become ready; the gateway was stopped/)
  assert.equal(cold.item.State.Running, false)
  assert.equal(docker(cold).filter(args => args[0] === "stop").length, 1)
  const warm = fixture({ running: true, config: {}, run: publishWithoutRoute })
  await assert.rejects(warm.web.start(request()), /run \/tailscale-web stop/)
  assert.equal(warm.item.State.Running, true)
  assert.equal(docker(warm).filter(args => args[0] === "stop").length, 0)
})

test("failure does not stop a pre-existing gateway; cleanup failure is explicit", async () => {
  const f = fixture({ running: true, authStatus: 200 })
  await assert.rejects(f.web.start(request()), /authentication/)
  assert.equal(docker(f).some(args => args[0] === "stop"), false)
  const g = fixture({ authStatus: 200, run: async (_command, args) => args[0] === "stop" ? { code: 1, stdout: "", stderr: "synthetic-private" } : undefined })
  await assert.rejects(g.web.start(request()), /cleanup was not confirmed/)
})

test("lock identity failure prevents start and an exhausted monotonic deadline prevents commands", async () => {
  const f = fixture({ lock: async (_signal, operation) => operation(async () => { throw new Error("lock identity changed") }) })
  await assert.rejects(f.web.start(request()), /lock identity/)
  assert.equal(docker(f).some(args => ["start", "stop", "exec"].includes(args[0])), false)
  let clock = 0
  const g = fixture({ now: () => clock++ ? 60001 : 0 })
  await assert.rejects(g.web.start(request()), /timed out/)
  assert.equal(g.calls.length, 0)
})

test("cancellation after lock verification cannot arm cleanup without dispatching start", async () => {
  const f = fixture({ lock: async (_signal, operation) => operation(async () => { f.web.dispose() }) })
  await assert.rejects(f.web.start(request()), /cancelled/)
  assert.equal(docker(f).some(args => ["start", "stop", "exec"].includes(args[0])), false)
})

test("deadline exhaustion after lock verification cannot arm cleanup without dispatching start", async () => {
  let clock = 0
  const f = fixture({ now: () => clock, lock: async (_signal, operation) => operation(async () => { clock = 60001 }) })
  await assert.rejects(f.web.start(request()), /timed out/)
  assert.equal(docker(f).some(args => ["start", "stop", "exec"].includes(args[0])), false)
})

test("raw diagnostics stay out of UI errors and disposal prevents new actions", async () => {
  const f = fixture({ run: async () => ({ code: 1, stdout: "synthetic-private-output", stderr: "synthetic-private-output" }) })
  await assert.rejects(f.web.start(request()), error => !error.message.includes("synthetic-private-output"))
  const g = fixture(); g.web.dispose()
  await assert.rejects(g.web.start(request()), /cancelled/)
  assert.equal(g.calls.length, 0)
})

test("plugin registration is passive and preserves explicit stop/unload behavior", async () => {
  let layer, started = 0, stopped = 0, disposed = 0
  const messages = [], alerts = []
  const cleanup = registerDockerWeb({ keymap: { layer: factory => { layer = factory() } }, ...nativeUI({
    toast: { show: message => messages.push(message) }, dialog: { alert: async message => alerts.push(message) },
  }) }, { start: async input => { assert.deepEqual(input, request()); started++; return { url: "https://docker.example.ts.net/web", instance: { pid: server().pid, version: server().version, target: server().urls[0] } } }, stop: async () => { stopped++ }, dispose: () => { disposed++ } })
  assert.equal(started + stopped, 0)
  const command = layer.commands[0]
  assert.equal(command.id, "computer-use.tailscale-web.open")
  assert.deepEqual(command.slash, { name: "tailscale-web", arguments: true })
  await command.run(); assert.equal(started, 1); assert.match(alerts[0].message, /https:\/\/docker\.example\.ts\.net\/web/)
  await command.run("stop"); assert.equal(stopped, 1)
  await command.run("; unsafe"); assert.equal(started + stopped, 2); assert.match(messages.at(-1).message, /Use \/tailscale-web/)
  cleanup(); assert.equal(disposed, 1)
  await command.run(); assert.equal(started, 1)
})

test("unloading during startup suppresses stale dialogs", async () => {
  let command, finish, started
  const pending = new Promise(resolve => { finish = resolve }), alerts = []
  const entered = new Promise(resolve => { started = resolve })
  const cleanup = registerDockerWeb({ keymap: { layer: factory => { command = factory().commands[0] } }, ...nativeUI({
    toast: { show() {} }, dialog: { alert: async message => alerts.push(message) },
  }) }, { start: () => { started(); return pending }, dispose() {} })
  const invocation = command.run(); await entered; cleanup(); finish({ url: "https://docker.example.ts.net/web" }); await invocation
  assert.equal(alerts.length, 0)
})
