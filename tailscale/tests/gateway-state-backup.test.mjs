import assert from "node:assert/strict"
import { test } from "node:test"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, mkdir, readFile, writeFile, chmod, symlink, link, rm, lstat, readdir } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { backupVolume, verifyBackup, restoreBackup, BACKUP_SCHEMA, STATE_VOLUME } from "../scripts/gateway-state-backup.mjs"
import { withGatewayLock } from "../scripts/gateway-lock.mjs"

const exec = promisify(execFile)
const sha = bytes => createHash("sha256").update(bytes).digest("hex")

async function scratch(t) {
  const directory = await mkdtemp("/tmp/opencode/gateway-state-backup-test-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function exists(path) {
  try { await lstat(path); return true } catch (error) { if (error.code === "ENOENT") return false; throw error }
}

async function seed(source) {
  await mkdir(join(source, "sub"), { recursive: true, mode: 0o700 })
  await writeFile(join(source, "tailscaled.state"), Buffer.from([0, 1, 2, 3, 0xff, 0xfe]), { mode: 0o600 })
  await writeFile(join(source, "sub", "profile.json"), '{"synthetic":true}\n', { mode: 0o600 })
  await writeFile(join(source, ".identity"), "synthetic-node-identity\n", { mode: 0o600 })
}

async function tree(root) {
  const entries = []
  async function visit(directory) {
    for (const name of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(directory, name.name), info = await lstat(full)
      assert.equal(info.isSymbolicLink(), false)
      if (info.isDirectory()) { await visit(full); continue }
      assert.equal(info.isFile(), true)
      entries.push({
        path: full.slice(root.length + 1),
        mode: (info.mode & 0o777).toString(8).padStart(4, "0"),
        uid: info.uid,
        gid: info.gid,
        sha256: sha(await readFile(full)),
      })
    }
  }
  await visit(root)
  return entries
}

async function goodBackup(t, root) {
  const source = join(root, "state")
  await seed(source)
  const destination = join(root, "backup")
  const result = await backupVolume({ source, destination, lockDir: join(root, "lock") })
  return { source, destination, result }
}

test("backup records every regular file, an archive digest and leaves the source unchanged", async t => {
  const root = await scratch(t), { source, destination, result } = await goodBackup(t, root)
  const files = await tree(source)
  assert.equal(result.manifest.schema, BACKUP_SCHEMA)
  assert.equal(result.manifest.contract, "existing-instance-v1")
  assert.equal(result.manifest.volume, STATE_VOLUME)
  assert.deepEqual(result.manifest.files.map(file => file.path), [".identity", "sub/profile.json", "tailscaled.state"])
  for (const file of result.manifest.files) {
    const onDisk = files.find(candidate => candidate.path === file.path)
    assert.equal(file.sha256, onDisk.sha256)
    assert.equal(file.mode, onDisk.mode)
  }
  assert.equal(result.manifest.archive.sha256, sha(await readFile(join(destination, "state.tar.gz"))))
  assert.match(result.manifestSha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(await tree(source), files)
})

test("an empty state volume is refused instead of producing a misleading backup", async t => {
  const root = await scratch(t), source = join(root, "state")
  await mkdir(source, { mode: 0o700 })
  await assert.rejects(backupVolume({ source, destination: join(root, "backup"), lockDir: join(root, "lock") }), /empty/i)
  assert.equal(await exists(join(root, "backup")), false)
})

test("a symlinked state entry is refused before any archive is written", async t => {
  const root = await scratch(t), source = join(root, "state")
  await seed(source)
  await symlink(join(source, "tailscaled.state"), join(source, "alias"))
  const destination = join(root, "backup")
  await assert.rejects(backupVolume({ source, destination, lockDir: join(root, "lock") }), /symlink/i)
  assert.equal(await exists(destination), false)
})

test("a hard-linked state entry is refused before any archive is written", async t => {
  const root = await scratch(t), source = join(root, "state")
  await seed(source)
  await link(join(source, "tailscaled.state"), join(source, "alias"))
  const destination = join(root, "backup")
  await assert.rejects(backupVolume({ source, destination, lockDir: join(root, "lock") }), /hard-linked/i)
  assert.equal(await exists(destination), false)
})

test("an existing backup is never overwritten and keeps its original bytes", async t => {
  const root = await scratch(t), { source, destination } = await goodBackup(t, root)
  const manifest = await readFile(join(destination, "manifest.json"))
  await writeFile(join(source, "tailscaled.state"), "changed\n", { mode: 0o600 })
  await assert.rejects(backupVolume({ source, destination, lockDir: join(root, "lock") }), /already exists|overwrite/i)
  assert.deepEqual(await readFile(join(destination, "manifest.json")), manifest)
})

test("backup artifacts are private files inside a private directory", async t => {
  const root = await scratch(t), { destination } = await goodBackup(t, root)
  for (const [path, mode] of [[destination, 0o700], [join(destination, "state.tar.gz"), 0o600], [join(destination, "manifest.json"), 0o600]]) {
    const info = await lstat(path)
    assert.equal(info.mode & 0o777, mode, `${path} must be ${mode.toString(8)}`)
    assert.equal(info.uid, process.getuid())
  }
})

test("verify accepts an intact backup and refuses a corrupted archive", async t => {
  const root = await scratch(t), { destination } = await goodBackup(t, root)
  await verifyBackup({ destination })
  const archive = join(destination, "state.tar.gz"), bytes = await readFile(archive)
  bytes[bytes.length - 10] ^= 0xff
  await writeFile(archive, bytes, { mode: 0o600 })
  await assert.rejects(verifyBackup({ destination }), /does not match|corrupt|unreadable/i)
})

test("verify refuses an archive swapped in from a different state volume", async t => {
  const root = await scratch(t), { source, destination } = await goodBackup(t, root)
  const other = join(root, "other")
  await writeFile(join(source, "tailscaled.state"), "different state\n", { mode: 0o600 })
  await backupVolume({ source, destination: other, lockDir: join(root, "lock-two") })
  await rm(join(destination, "state.tar.gz"))
  await writeFile(join(destination, "state.tar.gz"), await readFile(join(other, "state.tar.gz")), { mode: 0o600 })
  await assert.rejects(verifyBackup({ destination }), /does not match/i)
})

test("verify refuses an incomplete backup with no manifest commit marker", async t => {
  const root = await scratch(t), { destination } = await goodBackup(t, root)
  await rm(join(destination, "manifest.json"))
  await assert.rejects(verifyBackup({ destination }), /incomplete|manifest/i)
})

test("restore stages an exact byte-and-mode copy and leaves live state untouched", async t => {
  const root = await scratch(t), { source, destination } = await goodBackup(t, root)
  const before = await tree(source), staging = join(root, "staging")
  const restored = await restoreBackup({ destination, staging, lockDir: join(root, "restore-lock") })
  assert.equal(restored.manifest.archive.sha256, (await verifyBackup({ destination })).archive.sha256)
  assert.deepEqual(await tree(staging), before)
  assert.deepEqual(await tree(source), before)
})

test("restore refuses a non-empty staging target and preserves its existing bytes", async t => {
  const root = await scratch(t), { destination } = await goodBackup(t, root)
  const staging = join(root, "staging")
  await mkdir(staging, { mode: 0o700 })
  await writeFile(join(staging, "keep.txt"), "preserved\n", { mode: 0o600 })
  await assert.rejects(restoreBackup({ destination, staging, lockDir: join(root, "restore-lock") }), /not empty|non-empty/i)
  assert.equal(await readFile(join(staging, "keep.txt"), "utf8"), "preserved\n")
})

test("a path-traversal archive is refused before extraction can write outside staging", async t => {
  const root = await scratch(t), destination = join(root, "backup")
  await mkdir(destination, { mode: 0o700 })
  const archive = join(destination, "state.tar.gz")
  await exec("python3", ["-c", `
import io, sys, tarfile
with tarfile.open(sys.argv[1], "w:gz") as bundle:
    member = tarfile.TarInfo("../escape")
    data = b"owned"
    member.size = len(data)
    member.mode = 0o600
    bundle.addfile(member, io.BytesIO(data))
`, archive])
  const bytes = await readFile(archive)
  await writeFile(join(destination, "manifest.json"), JSON.stringify({
    schema: BACKUP_SCHEMA, contract: "existing-instance-v1", volume: STATE_VOLUME,
    createdAt: new Date(0).toISOString(),
    archive: { name: "state.tar.gz", sha256: sha(bytes), bytes: bytes.length },
    files: [{ path: "../escape", sha256: sha(Buffer.from("owned")), bytes: 5, mode: "0600" }],
  }), { mode: 0o600 })
  await assert.rejects(verifyBackup({ destination }), /unsafe|path/i)
  const staging = join(root, "staging")
  await assert.rejects(restoreBackup({ destination, staging, lockDir: join(root, "restore-lock") }), /unsafe|path/i)
  assert.equal(await exists(join(root, "escape")), false)
  assert.equal(await exists(staging), false)
})

test("rollback: a failed restore discards nothing live and retains the good backup for retry", async t => {
  const root = await scratch(t), { source, destination } = await goodBackup(t, root)
  const before = await tree(source), corrupt = join(root, "corrupt")
  await mkdir(corrupt, { mode: 0o700 })
  await writeFile(join(corrupt, "manifest.json"), await readFile(join(destination, "manifest.json")), { mode: 0o600 })
  const bytes = await readFile(join(destination, "state.tar.gz"))
  bytes.fill(0, 0, 8)
  await writeFile(join(corrupt, "state.tar.gz"), bytes, { mode: 0o600 })

  await assert.rejects(restoreBackup({ destination: corrupt, staging: join(root, "failed"), lockDir: join(root, "rollback-lock") }))
  assert.deepEqual(await tree(source), before)
  assert.equal(await exists(join(root, "failed")), false)
  assert.equal(await exists(join(destination, "manifest.json")), true)

  const retry = join(root, "retry")
  await restoreBackup({ destination, staging: retry, lockDir: join(root, "rollback-lock") })
  assert.deepEqual(await tree(retry), before)
  assert.deepEqual(await tree(source), before)
})

test("backup and restore respect the real gateway lock held by a lifecycle action", async t => {
  const root = await scratch(t), { source, destination } = await goodBackup(t, root)
  const lockDir = join(root, "shared-lock")
  await mkdir(lockDir, { mode: 0o700 })
  await withGatewayLock(lockDir, undefined, async () => {
    await assert.rejects(backupVolume({ source, destination: join(root, "second"), lockDir }), /Another Docker/)
    await assert.rejects(restoreBackup({ destination, staging: join(root, "staging"), lockDir }), /Another Docker/)
  })
  const second = join(root, "second")
  await backupVolume({ source, destination: second, lockDir })
  await restoreBackup({ destination: second, staging: join(root, "staging"), lockDir })
  assert.deepEqual(await tree(join(root, "staging")), await tree(source))
})

test("the command line reports only digests and counts, never state contents", async t => {
  const root = await scratch(t), { destination } = await goodBackup(t, root)
  const script = fileURLToPath(new URL("../scripts/gateway-state-backup.mjs", import.meta.url))
  const { stdout } = await exec(process.execPath, [script, "verify", "--destination", destination])
  const result = JSON.parse(stdout)
  assert.equal(result.ok, true)
  assert.equal(result.files, 3)
  assert.equal(result.archiveSha256, (await verifyBackup({ destination })).archive.sha256)
  assert.equal(stdout.includes("synthetic-node-identity"), false)
  await assert.rejects(exec(process.execPath, [script, "verify", "--destination", join(root, "absent")]), /real directory|ENOENT/)
})
