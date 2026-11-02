import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { once } from "node:events"
import { link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import test, { type TestContext } from "node:test"

import { parseSessionGoalState } from "./model.ts"
import { acquireProcessLock, ProcessLockError } from "./process-lock.ts"
import { buildGoalDocBundle } from "./render.ts"
import { GoalDocsWriteError, writeGoalDocBundles } from "./writer.ts"

async function scratch(context: TestContext) {
  const root = await mkdtemp("/tmp/opencode/goal-docs-process-lock-test-")
  context.after(() => rm(root, { recursive: true, force: true }))
  return root
}

test("kernel lock survives helper exit and retains one inode across release and reacquisition", async (context) => {
  const root = await scratch(context)
  const file = path.join(root, "lock")
  const release = await acquireProcessLock(file)
  const before = await lstat(file)
  try {
    assert.equal(before.mode & 0o777, 0o600)
    await assert.rejects(acquireProcessLock(file), (error) => error instanceof ProcessLockError && error.code === "concurrent")
    await (await acquireProcessLock(path.join(root, "independent-lock")))()
  } finally { await release() }
  await (await acquireProcessLock(file))()
  assert.equal((await lstat(file)).ino, before.ino)
  assert.equal(await readFile(file, "utf8"), "")
})

test("kernel lock rejects links, nonregular files and existing contents without changing them", async (context) => {
  const root = await scratch(context)
  const target = path.join(root, "manual")
  await writeFile(target, "manual content")
  await assert.rejects(acquireProcessLock(target), /existing contents were preserved/)
  assert.equal(await readFile(target, "utf8"), "manual content")
  const symbolic = path.join(root, "symbolic")
  await symlink(target, symbolic)
  await assert.rejects(acquireProcessLock(symbolic))
  assert.equal((await lstat(symbolic)).isSymbolicLink(), true)
  const original = path.join(root, "empty")
  const hard = path.join(root, "hard")
  await writeFile(original, "")
  await link(original, hard)
  await assert.rejects(acquireProcessLock(hard), /singly linked/)
  assert.equal((await lstat(original)).nlink, 2)
  const directory = path.join(root, "directory")
  await mkdir(directory)
  await assert.rejects(acquireProcessLock(directory))
  assert.equal((await lstat(directory)).isDirectory(), true)
})

test("cancelled acquisition releases its descriptor and permits a fresh acquisition", async (context) => {
  const root = await scratch(context)
  const file = path.join(root, "lock")
  const controller = new AbortController()
  const pending = acquireProcessLock(file, controller.signal)
  controller.abort(new Error("cancel lock acquisition"))
  await assert.rejects(pending, /cancel lock acquisition/)
  await (await acquireProcessLock(file))()
  const aborted = new AbortController()
  aborted.abort(new Error("already cancelled"))
  const absent = path.join(root, "not-created")
  await assert.rejects(acquireProcessLock(absent, aborted.signal), /already cancelled/)
  await assert.rejects(lstat(absent), { code: "ENOENT" })
})

test("real writer refuses a different process and recovers its locks after a crash", { timeout: 10_000 }, async (context) => {
  const root = await scratch(context)
  const docs = path.join(root, "docs", "goals")
  await mkdir(docs, { recursive: true })
  const processLock = path.join(docs, ".goal-docs-process.lock")
  const ownerLock = path.join(docs, ".goal-docs.lock")
  const child = spawn(process.execPath, ["--input-type=module", "-e", `
    import { acquireProcessLock } from ${JSON.stringify(new URL("./process-lock.ts", import.meta.url).href)}
    import { writeFile } from 'node:fs/promises'
    import { randomUUID } from 'node:crypto'
    const release = await acquireProcessLock(process.argv[1])
    await writeFile(process.argv[2], process.pid + ' ' + Date.now() + ' ' + randomUUID() + '\\n')
    process.on('message', async () => { await release(); process.exit(0) })
    process.send('held')
  `, processLock, ownerLock], { stdio: ["ignore", "ignore", "ignore", "ipc"] })
  let exited = false
  const exit = once(child, "exit").then((value) => { exited = true; return value })
  context.after(async () => { if (!exited) { child.kill("SIGKILL"); await exit } })
  assert.deepEqual(await Promise.race([
    once(child, "message"),
    exit.then(() => { throw new Error("lock fixture exited before acquisition") }),
  ]), ["held", undefined])
  const before = await lstat(processLock)
  const sessionID = "ses_lock"
  const state = parseSessionGoalState({ version: 3, goals: { [sessionID]: {
    id: "goal-lock", sessionID, objective: "Verify real writer recovery", status: "active", planRevision: 0,
    plan: null, createdAt: 1_800_000_000, updatedAt: 1_800_000_000, history: [], checkpoints: [],
  } } }, sessionID)
  assert.ok(state.current)
  const bundle = buildGoalDocBundle({ sessionID, directory: root, exportedAt: "2026-10-27T00:00:00.000Z",
    repository: { kind: "not-git-repository", identity: null, worktree: null, scope: ".", gaps: [] },
  }, state.current, state.historyNotice)
  await assert.rejects(writeGoalDocBundles(root, [bundle]), (error) => error instanceof GoalDocsWriteError && error.code === "concurrent")
  await assert.rejects(lstat(path.join(docs, "goal-lock")), { code: "ENOENT" })
  child.kill("SIGKILL")
  await exit
  const recovered = await writeGoalDocBundles(root, [bundle])
  assert.ok(recovered.written.includes("goal-lock/HANDOFF.md"))
  assert.equal(await readFile(path.join(docs, "goal-lock", "HANDOFF.md"), "utf8"), bundle.files["HANDOFF.md"])
  assert.equal((await lstat(processLock)).ino, before.ino)
  await assert.rejects(lstat(ownerLock), { code: "ENOENT" })
  assert.deepEqual((await writeGoalDocBundles(root, [bundle])).written, [])
  const handoffFile = path.join(docs, "goal-lock", "HANDOFF.md")
  await writeFile(handoffFile, "Manual edit must survive a failed write")
  await assert.rejects(writeGoalDocBundles(root, [bundle]), (error) => error instanceof GoalDocsWriteError && error.code === "manual_edit")
  await (await acquireProcessLock(processLock))()
  assert.equal(await readFile(handoffFile, "utf8"), "Manual edit must survive a failed write")
})
