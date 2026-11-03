import assert from "node:assert/strict"
import { spawn, type ChildProcess } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { Store } from "../store.ts"

const storeURL = new URL("../store.ts", import.meta.url).href

const holderScript = `
  import { open, constants } from 'node:fs/promises';
  import { spawn } from 'node:child_process';
  const file = await open(process.argv[1], constants.O_RDWR | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  const helper = spawn('/usr/bin/flock', ['--exclusive', '--nonblock', '3'], { stdio: ['ignore', 'ignore', 'ignore', file.fd], timeout: 2000, killSignal: 'SIGKILL' });
  await new Promise((resolve, reject) => { helper.once('error', reject); helper.once('close', code => code === 0 ? resolve() : reject(new Error('fixture lock failed: ' + code))); });
  process.send('locked');
  setInterval(() => {}, 1000);
`
const mutatorScript = `
  const { Store } = await import(process.argv[1]);
  const [stateDirectory, root, id] = process.argv.slice(2);
  await new Promise(resolve => process.send('ready', () => resolve()));
  await new Promise(resolve => process.once('message', message => { if (message === 'go') resolve(); }));
  try {
    const store = new Store(stateDirectory, { projectID: 'fixture', directory: root });
    await store.mutate(state => {
      state.claims.push({ id, owner: 'ses_owner', paths: [id], createdAt: 1 });
      const until = Date.now() + 500;
      while (Date.now() < until) {}
    });
    await new Promise(resolve => process.send('done', () => resolve()));
  } catch (error) {
    await new Promise(resolve => process.send('error:' + String(error), () => resolve()));
    process.exitCode = 1;
  }
`

function fixtureProcess(t: test.TestContext, script: string, args: string[]) {
  const child: ChildProcess = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script, ...args], {
    stdio: ["ignore", "ignore", "ignore", "ipc"], env: { PATH: "/usr/bin:/bin" },
  })
  const messages: unknown[] = []
  const waiters: Array<(message: unknown) => void> = []
  child.on("message", message => { const waiter = waiters.shift(); if (waiter) waiter(message); else messages.push(message) })
  const closed = new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", () => resolve()) })
  t.after(async () => { await stop(child); await closed.catch(() => {}) })
  return {
    child,
    next(ms = 3000): Promise<unknown> {
      return new Promise((resolve, reject) => {
        if (messages.length) { resolve(messages.shift()); return }
        const timer = setTimeout(() => { cleanup(); reject(new Error("fixture message timeout")) }, ms)
        const waiter = (message: unknown) => { cleanup(); resolve(message) }
        const onError = (error: Error) => { cleanup(); reject(error) }
        const onClose = () => { cleanup(); reject(new Error("fixture exited before its expected message")) }
        const cleanup = () => {
          clearTimeout(timer)
          const index = waiters.indexOf(waiter); if (index >= 0) waiters.splice(index, 1)
          child.off("error", onError); child.off("close", onClose)
        }
        waiters.push(waiter); child.once("error", onError); child.once("close", onClose)
      })
    },
  }
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()))
  child.kill("SIGKILL")
  await closed
}

async function directFlockChildren(): Promise<number[]> {
  const raw = await readFile(`/proc/${process.pid}/task/${process.pid}/children`, "utf8")
  const pids = raw.trim() ? raw.trim().split(/\s+/).map(Number) : []
  const found: number[] = []
  for (const pid of pids) {
    try { if ((await readFile(`/proc/${pid}/comm`, "utf8")).trim() === "flock") found.push(pid) } catch {}
  }
  return found
}

async function waitForFlockChild(ms = 1000): Promise<number> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const [pid] = await directFlockChildren()
    if (pid !== undefined) return pid
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error("flock helper did not appear")
}

async function storeFixture(t: test.TestContext) {
  const directory = await mkdtemp("/tmp/opencode/coordination-lock-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const stateDirectory = path.join(directory, "state")
  await mkdir(stateDirectory, { mode: 0o700 })
  const store = new Store(stateDirectory, { projectID: "fixture", directory })
  const lockPath = path.join(stateDirectory, "room.lock")
  await store.mutate(state => { state.claims.push({ id: "seed", owner: "ses_owner", paths: ["seed"], createdAt: 0 }) })
  return { directory, stateDirectory, store, lockPath, inode: (await stat(lockPath)).ino }
}

test("simultaneous cross-process mutations serialize and preserve both effects", async t => {
  const f = await storeFixture(t)
  const left = fixtureProcess(t, mutatorScript, [storeURL, f.stateDirectory, f.directory, "left"])
  const right = fixtureProcess(t, mutatorScript, [storeURL, f.stateDirectory, f.directory, "right"])
  assert.equal(await left.next(), "ready")
  assert.equal(await right.next(), "ready")
  left.child.send("go"); right.child.send("go")
  assert.equal(await left.next(), "done")
  assert.equal(await right.next(), "done")
  assert.deepEqual((await f.store.read()).claims.map(claim => claim.id).sort(), ["left", "right", "seed"])
  assert.equal((await stat(f.lockPath)).ino, f.inode, "serialized writers retain the same lock inode")
})

test("long-held lock fails bounded without changing state or replacing the lock inode", async t => {
  const f = await storeFixture(t)
  const holder = fixtureProcess(t, holderScript, [f.lockPath])
  assert.equal(await holder.next(), "locked")
  const started = Date.now()
  await assert.rejects(f.store.mutate(state => { state.claims.push({ id: "blocked", owner: "ses_owner", paths: ["blocked"], createdAt: 1 }) }), /store busy/)
  const elapsed = Date.now() - started
  assert.ok(elapsed >= 1000, `contended writer must wait for the bounded window, took ${elapsed}ms`)
  assert.ok(elapsed < 4000, `contended writer must remain bounded, took ${elapsed}ms`)
  await stop(holder.child)
  assert.deepEqual((await f.store.read()).claims.map(claim => claim.id), ["seed"])
  const after = await stat(f.lockPath)
  assert.equal(after.ino, f.inode, "timeout never deletes or replaces room.lock")
  assert.equal(after.nlink, 1); assert.equal(after.size, 0)
  await f.store.mutate(state => { state.claims.push({ id: "after-stop", owner: "ses_owner", paths: ["after-stop"], createdAt: 2 }) })
  assert.deepEqual((await f.store.read()).claims.map(claim => claim.id), ["seed", "after-stop"])
  assert.equal((await stat(f.lockPath)).ino, f.inode)
})

test("abort while waiting rejects promptly without mutation or a leaked helper", async t => {
  const f = await storeFixture(t)
  const holder = fixtureProcess(t, holderScript, [f.lockPath])
  assert.equal(await holder.next(), "locked")
  const controller = new AbortController()
  const pending = f.store.mutate(state => { state.claims.push({ id: "aborted", owner: "ses_owner", paths: ["aborted"], createdAt: 1 }) }, controller.signal)
    .then(() => ({ ok: true as const }), (error: unknown) => ({ error }))
  const helperPid = await waitForFlockChild()
  const started = Date.now()
  controller.abort(new Error("operator stopped waiting"))
  const outcome = await pending
  assert.ok("error" in outcome, "waiting mutation must reject after abort")
  assert.match(String(outcome.error), /operator stopped waiting/)
  assert.ok(Date.now() - started < 1000, "abort must not wait for the full lock window")
  assert.throws(() => process.kill(helperPid, 0), (error: unknown) => (error as NodeJS.ErrnoException).code === "ESRCH")
  assert.deepEqual((await f.store.read()).claims.map(claim => claim.id), ["seed"])
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.deepEqual((await f.store.read()).claims.map(claim => claim.id), ["seed"], "cancelled change never runs later")
  assert.deepEqual(await directFlockChildren(), [], "cancelled lock wait leaves no owned helper")
  await stop(holder.child)
  await f.store.mutate(state => { state.claims.push({ id: "after-abort", owner: "ses_owner", paths: ["after-abort"], createdAt: 2 }) })
  assert.deepEqual((await f.store.read()).claims.map(claim => claim.id), ["seed", "after-abort"])
  assert.equal((await stat(f.lockPath)).ino, f.inode)
})

test("owned helper failure is reported distinctly from contention", async t => {
  const f = await storeFixture(t)
  const holder = fixtureProcess(t, holderScript, [f.lockPath])
  assert.equal(await holder.next(), "locked")
  const pending = f.store.mutate(state => { state.claims.push({ id: "helper-failure", owner: "ses_owner", paths: ["helper-failure"], createdAt: 1 }) })
    .then(() => ({ ok: true as const }), (error: unknown) => ({ error }))
  const helperPid = await waitForFlockChild()
  process.kill(helperPid, "SIGKILL")
  const outcome = await pending
  assert.ok("error" in outcome, "helper failure must reject")
  assert.match(String(outcome.error), /coordination lock helper failed/)
  assert.doesNotMatch(String(outcome.error), /store busy/)
  assert.deepEqual((await f.store.read()).claims.map(claim => claim.id), ["seed"])
  await stop(holder.child)
  assert.equal((await stat(f.lockPath)).ino, f.inode)
  await f.store.mutate(state => { state.claims.push({ id: "after-helper-failure", owner: "ses_owner", paths: ["after-helper-failure"], createdAt: 2 }) })
  assert.deepEqual((await f.store.read()).claims.map(claim => claim.id), ["seed", "after-helper-failure"])
})
