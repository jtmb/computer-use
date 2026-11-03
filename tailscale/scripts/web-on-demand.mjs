/**
 * On-demand lifecycle for the reviewed Docker/Tailscale gateway that fronts the
 * existing OpenCode instance at its `/web` UI route. Startup resolves the live instance
 * first, then revalidates container identity, hardening, mounts and Serve routes
 * under the gateway lock; drifted state fails closed instead of being repaired
 * in place. Each action has a 60-second deadline, and cleanup targets only the
 * immutable container ID this operation started.
 */
import { execFile } from "node:child_process"
import { fileURLToPath } from "node:url"
import { discoverExistingServer, sameServer, serverIdentity } from "./gateway-discovery.mjs"
import { withGatewayLock } from "./gateway-lock.mjs"

const ROOT = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "")
export const GATEWAY = "tailscale-web-gateway-1"
export const STATE_VOLUME = "tailscale_tailscale-state"
export const IMAGE = "ghcr.io/jtmb/tailscale@sha256:80c4a9a3b327475b330e76f9c31b52b7038e44963c58f2a90a3493f28dcac993"

export function runCommand(command, args, { signal, timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { signal, timeout, maxBuffer: 262144, encoding: "utf8" }, (error, stdout, stderr) => {
      if (error?.killed || signal?.aborted || error?.code === "ENOENT") {
        reject(new Error(signal?.aborted ? "Docker web action cancelled." : "A required command is unavailable or timed out."))
      } else resolve({ code: error ? error.code : 0, stdout, stderr })
    })
  })
}

function parse(text) {
  try { return JSON.parse(text) } catch { throw new Error("A command returned an invalid status response.") }
}

export function validateGateway(item) {
  const labels = item?.Config?.Labels ?? {}, host = item?.HostConfig ?? {}
  if (item?.Name !== `/${GATEWAY}` || !/^[0-9a-f]{64}$/.test(item.Id ?? "")
    || typeof item.State?.Running !== "boolean" || item.Config?.Image !== IMAGE
    || labels["com.docker.compose.project"] !== "tailscale-web"
    || labels["com.docker.compose.service"] !== "gateway"
    || labels["com.docker.compose.project.working_dir"] !== ROOT
    || labels["io.computer-use.tailscale-web.contract"] !== "existing-instance-v1"
    || item.Config?.User !== "65532:65532" || host.Privileged !== false || host.ReadonlyRootfs !== true
    || !host.CapDrop?.includes("ALL") || (host.CapAdd ?? []).length
    || JSON.stringify(host.SecurityOpt) !== '["no-new-privileges:true"]'
    || host.PidMode || host.UTSMode || host.UsernsMode
    || (host.IpcMode && host.IpcMode !== "private") || (host.GroupAdd ?? []).length
    || host.NetworkMode !== "host"
    || Object.keys(host.PortBindings ?? {}).length || (host.Devices ?? []).length
    || host.RestartPolicy?.Name !== "no" || !(host.Memory > 0 && host.Memory <= 268435456)
    || !(host.PidsLimit > 0 && host.PidsLimit <= 128)
    || !(host.NanoCpus > 0 && host.NanoCpus <= 1000000000)) {
    throw new Error("The approved existing-instance Docker gateway is absent or its identity/hardening differs; no legacy app was started.")
  }
  const mounts = item.Mounts ?? []
  const state = mounts.filter(mount => mount.Type === "volume" && mount.Name === STATE_VOLUME
    && mount.Destination === "/var/lib/tailscale" && mount.RW === true)
  const scratch = new Set(["/tmp", "/var/run/tailscale", "/var/cache/tailscale"])
  if (state.length !== 1 || mounts.some(mount => !state.includes(mount)
    && (mount.Type !== "tmpfs" || !scratch.has(mount.Destination)))) {
    throw new Error("Gateway mounts differ from the reviewed private state/tmpfs contract.")
  }
  if (JSON.stringify(item.Config.Entrypoint) !== '["tailscaled"]'
    || JSON.stringify(item.Config.Cmd) !== JSON.stringify([
      "--tun=userspace-networking", "--port=0", "--socket=/var/run/tailscale/tailscaled.sock",
      "--statedir=/var/lib/tailscale", "--state=/var/lib/tailscale/tailscaled.state",
    ])) throw new Error("Gateway must run only the reviewed userspace Tailscale daemon.")
}

export function foregroundServeURL(config, target, dnsName) {
  if (!config || typeof config !== "object" || Array.isArray(config)) throw new Error("Invalid Serve configuration.")
  const all = [config, ...Object.values(config.Foreground ?? {})]
  if (all.some(value => Object.values(value.AllowFunnel ?? {}).some(Boolean))) {
    throw new Error("Funnel is enabled; refusing public exposure.")
  }
  if (Object.keys(config.TCP ?? {}).length || Object.keys(config.Web ?? {}).length || Object.keys(config.Services ?? {}).length) {
    throw new Error("Persistent or unrelated Serve routes remain; the reviewed migration has not been completed.")
  }
  const foreground = Object.values(config.Foreground ?? {})
  if (!foreground.length) return undefined
  if (foreground.length !== 1) throw new Error("Additional foreground Serve routes are present; nothing was overwritten.")
  const active = foreground[0], name = dnsName.replace(/\.$/, ""), authority = `${name}:443`
  const handlers = active.Web?.[authority]?.Handlers
  if (Object.keys(active.Foreground ?? {}).length || Object.keys(active.Services ?? {}).length
    || Object.keys(active.TCP ?? {}).length !== 1 || active.TCP?.[443]?.HTTPS !== true
    || Object.keys(active.Web ?? {}).length !== 1 || !handlers || Object.keys(handlers).length !== 1
    || Object.keys(handlers["/"] ?? {}).length !== 1 || handlers["/"]?.Proxy !== target) {
    throw new Error("Foreground Serve does not match the discovered existing OpenCode endpoint.")
  }
  let url
  try { url = new URL(`https://${name}/web`) } catch { throw new Error("Invalid Tailscale HTTPS name.") }
  if (!url.hostname.endsWith(".ts.net") || url.host !== name || url.username || url.password || url.port) {
    throw new Error("Tailscale did not supply a valid private HTTPS name.")
  }
  return url.href
}

export function createDockerWeb({
  run = runCommand,
  lock = (signal, operation) => withGatewayLock(`${ROOT}/.local/web-gateway`, signal, operation),
  delay = ms => new Promise(resolve => setTimeout(resolve, ms)), now = () => performance.now(),
} = {}) {
  let active
  const controller = new AbortController()
  async function perform(action, request) {
    const deadline = now() + 60000
    const execute = async (command, args, onDispatch) => {
      if (controller.signal.aborted) throw new Error("Docker web action cancelled.")
      const remaining = deadline - now()
      if (remaining <= 0) throw new Error("Docker web action timed out.")
      onDispatch?.()
      return run(command, args, { signal: controller.signal, timeout: Math.min(10000, remaining) })
    }
    const checked = async (command, args, onDispatch) => {
      const result = await execute(command, args, onDispatch)
      if (result.code !== 0) throw new Error("Native discovery or Docker gateway command failed; no raw logs or credentials were collected.")
      return result.stdout
    }
    const discover = () => discoverExistingServer(request?.server, request?.sessionID, args => checked("opencode", args))
    // Resolve before any Docker mutation; no fixed-port or old-container fallback.
    const instance = action === "start" ? await discover() : undefined
    return lock(controller.signal, async verifyLock => {
      const inspect = async id => {
        const template = '{"Id":{{json .Id}},"Name":{{json .Name}},"Config":{"Image":{{json .Config.Image}},"User":{{json .Config.User}},"Labels":{{json .Config.Labels}},"Entrypoint":{{json .Config.Entrypoint}},"Cmd":{{json .Config.Cmd}}},"HostConfig":{"NetworkMode":{{json .HostConfig.NetworkMode}},"Privileged":{{json .HostConfig.Privileged}},"ReadonlyRootfs":{{json .HostConfig.ReadonlyRootfs}},"CapDrop":{{json .HostConfig.CapDrop}},"CapAdd":{{json .HostConfig.CapAdd}},"SecurityOpt":{{json .HostConfig.SecurityOpt}},"PidMode":{{json .HostConfig.PidMode}},"IpcMode":{{json .HostConfig.IpcMode}},"UTSMode":{{json .HostConfig.UTSMode}},"UsernsMode":{{json .HostConfig.UsernsMode}},"GroupAdd":{{json .HostConfig.GroupAdd}},"PortBindings":{{json .HostConfig.PortBindings}},"Devices":{{json .HostConfig.Devices}},"RestartPolicy":{{json .HostConfig.RestartPolicy}},"Memory":{{json .HostConfig.Memory}},"PidsLimit":{{json .HostConfig.PidsLimit}},"NanoCpus":{{json .HostConfig.NanoCpus}}},"Mounts":{{json .Mounts}},"State":{"Running":{{json .State.Running}}}}'
        const response = await execute("docker", ["inspect", "--format", template, id])
        if (response.code !== 0) throw new Error("The existing-instance Docker gateway is not provisioned; its reviewed migration/deployment is required. OpenCode was not changed.")
        const item = parse(response.stdout)
        validateGateway(item)
        return item
      }
      const item = await inspect(GATEWAY), id = item.Id
      const mutate = async (args, onDispatch) => { await verifyLock(); return checked("docker", args, onDispatch) }
      if (action === "stop") {
        if (item.State.Running) await mutate(["stop", "--time", "5", id])
        if ((await inspect(id)).State.Running) throw new Error("Gateway did not stop completely.")
        return { stopped: true }
      }
      const writers = (await checked("docker", ["ps", "--filter", `volume=${STATE_VOLUME}`, "--format", "{{.Names}}"])).trim().split("\n").filter(Boolean)
      if (writers.some(name => name !== GATEWAY)) throw new Error("Another running container uses the Tailscale state; nothing was started.")
      let startedHere = false
      try {
        if (!item.State.Running) {
          // The daemon can start the container even when the client command is
          // cancelled or fails. Arm cleanup at dispatch, after lock/cancel/deadline
          // checks, so a refused start cannot stop another operation's gateway.
          await mutate(["start", id], () => { startedHere = true })
        }
        let status
        for (let attempt = 0; attempt < 30; attempt++) {
          const response = await execute("docker", ["exec", id, "tailscale", "status", "--json"])
          if (response.code === 0) {
            status = parse(response.stdout)
            if (status.BackendState === "Running" && status.Self?.Online) break
            if (["NeedsLogin", "NeedsMachineAuth"].includes(status.BackendState)) {
              throw new Error("Docker Tailscale needs user sign-in or device approval; no account settings were changed.")
            }
          }
          status = undefined
          await delay(500)
        }
        if (!status) throw new Error("Docker Tailscale did not become ready.")
        const dnsName = status.Self?.DNSName
        if (typeof dnsName !== "string" || !dnsName.endsWith(".ts.net.")) throw new Error("Docker Tailscale has no HTTPS DNS name.")
        for (const [path, expected] of [["/api/info", 401], ["/web", 200]]) {
          let ready = false
          for (let attempt = 0; attempt < 20; attempt++) {
            const response = await execute("docker", ["exec", id, "wget", "-T", "5", "-S", "-O", "/dev/null", `${instance.target}${path}`])
            const code = /HTTP\/1\.[01] (\d{3})\b/.exec(response.stderr)?.[1]
            if (Number(code) === expected) { ready = true; break }
            if (code) break
            await delay(500)
          }
          if (!ready) throw new Error("The existing OpenCode UI/API readiness or authentication challenge failed.")
        }
        if (!sameServer(instance, await discover())) throw new Error("OpenCode instance changed during gateway startup.")
        const readServe = async () => parse(await checked("docker", ["exec", id, "tailscale", "serve", "status", "--json"]))
        let config = await readServe(), url = foregroundServeURL(config, instance.target, dnsName)
        if (!url) {
          await mutate(["exec", "--detach", id, "tailscale", "serve", "--https=443", instance.target])
          for (let attempt = 0; attempt < 20; attempt++) {
            config = await readServe()
            url = foregroundServeURL(config, instance.target, dnsName)
            if (url) break
            await delay(250)
          }
        }
        if (!url) throw new Error(startedHere
          ? "Foreground private HTTPS Serve did not become ready; the gateway was stopped."
          : "Foreground private HTTPS Serve did not become ready; run /tailscale-web stop to clear the pre-existing gateway.")
        return { url, instance, remoteVerified: false }
      } catch (error) {
        if (startedHere) {
          // Cancellation still cleans up only the immutable container ID this
          // operation attempted to start, never a pre-existing gateway or OpenCode.
          let stopped = false
          try { stopped = (await run("docker", ["stop", "--time", "5", id], { timeout: 10000 })).code === 0 } catch {}
          if (!stopped) throw new Error("Gateway startup failed and cleanup was not confirmed; use /tailscale-web stop. Existing OpenCode was not stopped.")
        }
        throw error
      }
    })
  }
  const action = (name, request) => {
    let key
    try { key = name === "start" ? JSON.stringify({ ...serverIdentity(request?.server), sessionID: request?.sessionID }) : "stop" }
    catch (error) { return Promise.reject(error) }
    if (active) return active.action === name && active.key === key ? active.promise
      : Promise.reject(new Error(`Docker web is ${active.action === "start" ? "starting" : "stopping"} for another action or instance; retry afterwards.`))
    const promise = perform(name, request).finally(() => { active = undefined })
    active = { action: name, key, promise }
    return promise
  }
  return { start: request => action("start", request), stop: () => action("stop"), dispose: () => controller.abort() }
}
