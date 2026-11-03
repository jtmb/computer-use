import assert from "node:assert/strict"
import { test } from "node:test"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { readFileSync } from "node:fs"
import { IMAGE, STATE_VOLUME } from "../scripts/web-on-demand.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const file = fileURLToPath(new URL("../compose.gateway.yaml", import.meta.url))

function manifest() {
  // This source has no environment values; explicitly exclude the real dotenv file.
  const output = execFileSync("docker", ["compose", "--env-file", "/dev/null", "--file", file,
    "--profile", "gateway-reviewed", "config", "--format", "json"], {
    cwd: root, encoding: "utf8", timeout: 10000, maxBuffer: 1048576, stdio: ["ignore", "pipe", "pipe"],
  })
  return JSON.parse(output)
}

test("actual Compose parser accepts exactly one gateway, with no second OpenCode/backend mounts", () => {
  const config = manifest(), gateway = config.services.gateway
  assert.equal(config.name, "tailscale-web")
  assert.deepEqual(Object.keys(config.services), ["gateway"])
  assert.deepEqual(gateway.profiles, ["gateway-reviewed"])
  assert.equal(gateway.image, IMAGE)
  assert.equal(gateway.network_mode, "host")
  assert.equal(gateway.user, "65532:65532")
  assert.equal(gateway.read_only, true)
  assert.deepEqual(gateway.cap_drop, ["ALL"])
  assert.deepEqual(gateway.security_opt, ["no-new-privileges:true"])
  for (const hostSharing of ["privileged", "pid", "ipc", "uts", "userns_mode", "group_add"]) {
    assert.equal(gateway[hostSharing], undefined, `${hostSharing} must not be configurable in this manifest`)
  }
  assert.equal(gateway.restart, "no")
  assert.equal(gateway.mem_limit, "268435456")
  assert.equal(gateway.cpus, 1)
  assert.equal(gateway.pids_limit, 128)
  assert.equal(gateway.environment, undefined)
  assert.equal(gateway.ports, undefined)
  assert.equal(gateway.devices, undefined)
  assert.equal(gateway.cap_add, undefined)
  assert.equal(gateway.build, undefined)
  assert.deepEqual(gateway.entrypoint, ["tailscaled"])
  assert.deepEqual(gateway.command, ["--tun=userspace-networking", "--port=0", "--socket=/var/run/tailscale/tailscaled.sock", "--statedir=/var/lib/tailscale", "--state=/var/lib/tailscale/tailscaled.state"])
  assert.equal(config.volumes["gateway-state"].external, true)
  assert.equal(config.volumes["gateway-state"].name, STATE_VOLUME)
  assert.equal(gateway.volumes.filter(mount => mount.type === "volume").length, 1)
  assert.ok(gateway.volumes.every(mount => mount.type === "tmpfs" || mount.type === "volume" && mount.target === "/var/lib/tailscale"))
})

test("legacy Compose remains bridge-based and contains no host-network gateway exception", () => {
  const legacy = readFileSync(new URL("../compose.yaml", import.meta.url), "utf8")
  assert.equal(legacy.includes("network_mode: host"), false)
  assert.equal(legacy.includes("opencode-data:"), true)
  assert.equal(legacy.includes("opencode-workspace:"), true)
})
