import assert from "node:assert/strict"
import { test } from "node:test"
import { mkdtemp, mkdir, readFile, writeFile, chmod, symlink, link, rm } from "node:fs/promises"
import { join } from "node:path"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { withGatewayLock } from "../scripts/gateway-lock.mjs"

async function scratch(t) {
  const directory = await mkdtemp("/tmp/opencode/tailscale-gateway-lock-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test("real cross-process flock excludes a second writer and releases after exit", async t => {
  const root = await scratch(t), directory = join(root, "lock")
  await mkdir(directory, { mode: 0o700 })
  const module = new URL("../scripts/gateway-lock.mjs", import.meta.url).href
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { withGatewayLock } from ${JSON.stringify(module)};
    await withGatewayLock(process.argv[1], undefined, async () => {
      process.stdout.write('locked');
      process.stdin.resume();
      await new Promise(resolve => process.stdin.once('end', resolve));
    });`, directory], { stdio: ["pipe", "pipe", "pipe"] })
  t.after(() => child.kill("SIGKILL"))
  const watchdog = setTimeout(() => child.kill("SIGKILL"), 5000)
  t.after(() => clearTimeout(watchdog))
  assert.equal(String((await once(child.stdout, "data"))[0]), "locked")
  await assert.rejects(withGatewayLock(directory, undefined, async () => assert.fail("must not enter")), /Another Docker/)
  const exit = once(child, "exit")
  child.stdin.end()
  await exit
  assert.equal(await withGatewayLock(directory, undefined, async verify => { await verify(); return "released" }), "released")
})

test("symlink/public/hardlinked lock files are refused without overwriting their bytes", async t => {
  const root = await scratch(t)
  for (const kind of ["symlink", "public", "hardlink"]) {
    const directory = join(root, kind)
    await mkdir(directory, { mode: 0o700 })
    const target = join(directory, "target"), lock = join(directory, "operation.lock")
    await writeFile(target, "preserved", { mode: 0o600 })
    if (kind === "symlink") await symlink(target, lock)
    if (kind === "hardlink") await link(target, lock)
    if (kind === "public") { await writeFile(lock, "preserved", { mode: 0o600 }); await chmod(lock, 0o644) }
    await assert.rejects(withGatewayLock(directory, undefined, async () => assert.fail("must not enter")))
    assert.equal(await readFile(target, "utf8"), "preserved")
  }
})

test("an already-cancelled signal never enters the operation and leaves the lock acquirable", async t => {
  const root = await scratch(t), directory = join(root, "lock")
  await mkdir(directory, { mode: 0o700 })
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(withGatewayLock(directory, controller.signal, async () => assert.fail("must not enter")), /cancelled/)
  assert.equal(await withGatewayLock(directory, undefined, async () => "ok"), "ok")
})

test("lock replacement is detected before another mutation and private directory mode is enforced", async t => {
  const root = await scratch(t), directory = join(root, "lock")
  await mkdir(directory, { mode: 0o700 })
  await withGatewayLock(directory, undefined, async verify => {
    await rm(join(directory, "operation.lock"))
    await writeFile(join(directory, "operation.lock"), "replacement", { mode: 0o600 })
    await assert.rejects(verify(), /identity changed/)
  })
  await chmod(directory, 0o755)
  await assert.rejects(withGatewayLock(directory, undefined, async () => assert.fail("must not enter")), /private/)
})
