import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, stat } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { bounded, Store } from "../store.ts"

test("real process-held kernel lock excludes a writer and recovers after only the owned fixture dies", async t => {
  const directory = await mkdtemp("/tmp/opencode/coordination-process-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const stateDirectory = path.join(directory, "state")
  await mkdir(stateDirectory, { mode: 0o700 })
  const lockPath = path.join(stateDirectory, "room.lock")
  const store = new Store(stateDirectory, { projectID: "fixture", directory })
  await store.mutate(state => { state.claims.push({ id: "committed-before-crash", owner: "ses_owner", paths: ["existing"], createdAt: 1000 }) })
  const partialPath = path.join(stateDirectory, "write-owned-crash-fixture.tmp")
  const script = `
    import {open,constants,writeFile} from 'node:fs/promises';
    import {spawn} from 'node:child_process';
    const file=await open(process.argv[1],constants.O_RDWR|constants.O_CREAT|constants.O_NOFOLLOW,0o600);
    const helper=spawn('/usr/bin/flock',['--exclusive','--nonblock','3'],{stdio:['ignore','ignore','ignore',file.fd],timeout:1000,killSignal:'SIGKILL'});
    await new Promise((resolve,reject)=>{helper.once('error',reject);helper.once('close',code=>code===0?resolve():reject(new Error('fixture lock failed')))});
    await writeFile(process.argv[2],'{"state":',{mode:0o600,flag:'wx'});
    process.send('locked');
    const deadline=setTimeout(async()=>{await file.close();process.disconnect();process.exitCode=3},3000);
    process.on('disconnect',()=>clearTimeout(deadline));
  `
  const child = spawn(process.execPath, ["--input-type=module", "-e", script, lockPath, partialPath], { stdio: ["ignore", "ignore", "ignore", "ipc"], env: { PATH: "/usr/bin:/bin" } })
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL") })
  const closed = new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("close", () => resolve()) })
  await bounded(() => new Promise<void>((resolve, reject) => {
    child.once("message", message => message === "locked" ? resolve() : reject(new Error("unexpected fixture message")))
    child.once("error", reject)
    child.once("exit", code => { if (code !== null) reject(new Error(`fixture exited before lock: ${code}`)) })
  }), undefined, 2500)
  const before = await stat(lockPath)
  await assert.rejects(store.mutate(state => { state.claims.push({ id: "blocked", owner: "ses_owner", paths: ["source"], createdAt: 1000 }) }), /busy|flock/)
  assert.equal((await store.read()).claims[0].id, "committed-before-crash", "reader ignores partial staging file even while writer owns lock")
  child.kill("SIGKILL")
  await bounded(() => closed, undefined, 2500)
  await store.mutate(state => { state.claims.push({ id: "after-stop", owner: "ses_owner", paths: ["source"], createdAt: 1000 }) })
  assert.deepEqual((await store.read()).claims.map(claim => claim.id), ["committed-before-crash", "after-stop"])
  assert.equal(await readFile(partialPath, "utf8"), '{"state":', "orphan staging bytes are retained, never mistaken for committed room state")
  assert.equal((await stat(lockPath)).ino, before.ino, "recovery reuses kernel-guard inode, never deletes a live/stale lock path")
})
