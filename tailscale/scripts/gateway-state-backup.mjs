/**
 * Offline model of the gateway state backup/restore contract. The reviewed
 * gateway mounts the external volume `tailscale_tailscale-state` at
 * /var/lib/tailscale (compose.gateway.yaml:20-23,50-53) and keeps the daemon
 * state at tailscaled.state (compose.gateway.yaml:17). A live backup or restore
 * must stop every volume writer first; this module only sees directories and
 * never invokes Docker, so a real operation is decided by the procedure in
 * docs/existing-instance-gateway.md:95-97,119-124.
 *
 * The manifest is the commit marker: an archive without a valid manifest is an
 * incomplete backup and is refused. Verification compares the archive digest
 * and member set to that manifest; restore additionally re-hashes every
 * extracted file. Nothing here prints or logs state contents.
 */
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { pathToFileURL, fileURLToPath } from "node:url"
import { chmod, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises"
import { join, relative, sep } from "node:path"
import { withGatewayLock } from "./gateway-lock.mjs"

const ROOT = fileURLToPath(new URL("../", import.meta.url)).replace(/\/$/, "")
export const BACKUP_SCHEMA = "computer-use.gateway-state-backup/v1"
export const STATE_VOLUME = "tailscale_tailscale-state"
const CONTRACT = "existing-instance-v1"
const ARCHIVE = "state.tar.gz"
const MANIFEST = "manifest.json"
const BUFFER = 262144

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function tar(args) {
  return new Promise((resolve, reject) => {
    execFile("tar", args, { timeout: 10000, maxBuffer: BUFFER, encoding: "utf8" }, (error, stdout) => {
      if (error) reject(new Error("The gateway state archive command failed."))
      else resolve(stdout)
    })
  })
}

async function exists(path) {
  try { await lstat(path); return true } catch (error) { if (error.code === "ENOENT") return false; throw error }
}

function modeOf(info) {
  return (info.mode & 0o777).toString(8).padStart(4, "0")
}

async function privateDirectory(path, label) {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`${label} must be a real directory.`)
  if (info.uid !== process.getuid() || info.mode & 0o077) throw new Error(`${label} must be private and owned by the current user.`)
  return info
}

async function privateFile(path, label) {
  const info = await lstat(path)
  if (info.isSymbolicLink() || !info.isFile()) throw new Error(`${label} must be a regular file.`)
  if (info.uid !== process.getuid() || info.mode & 0o077) throw new Error(`${label} must be private and owned by the current user.`)
  return info
}

function safePath(path) {
  if (typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\")) {
    throw new Error("The backup contains an unsafe path; refusing to use it.")
  }
  if (path.split("/").some(part => part === "" || part === "." || part === "..")) {
    throw new Error("The backup contains an unsafe path; refusing to use it.")
  }
  return path
}

async function walk(root) {
  const entries = []
  async function visit(directory) {
    const names = (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))
    for (const name of names) {
      const full = join(directory, name.name), info = await lstat(full)
      if (info.isSymbolicLink()) throw new Error("Gateway state contains a symlink; refusing to back it up.")
      if (info.isDirectory()) { await visit(full); continue }
      if (!info.isFile()) throw new Error("Gateway state contains an unsupported file type; refusing to back it up.")
      if (info.nlink !== 1) throw new Error("Gateway state contains a hard-linked file; refusing to back it up.")
      if (info.mode & 0o7000) throw new Error("Gateway state contains a special-mode file; refusing to back it up.")
      const bytes = await readFile(full)
      entries.push({
        path: relative(root, full).split(sep).join("/"),
        mode: modeOf(info),
        uid: info.uid,
        gid: info.gid,
        bytes: bytes.length,
        sha256: hash(bytes),
      })
    }
  }
  await visit(root)
  return entries
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)
    || manifest.schema !== BACKUP_SCHEMA || manifest.contract !== CONTRACT || manifest.volume !== STATE_VOLUME
    || typeof manifest.createdAt !== "string") throw new Error("The backup manifest is not this gateway contract.")
  if (!manifest.archive || manifest.archive.name !== ARCHIVE
    || !/^[0-9a-f]{64}$/.test(manifest.archive.sha256 ?? "") || !(Number.isSafeInteger(manifest.archive.bytes) && manifest.archive.bytes >= 0)) {
    throw new Error("The backup manifest has no usable archive digest.")
  }
  if (!Array.isArray(manifest.files) || !manifest.files.length) throw new Error("The backup manifest lists no state files.")
  const seen = new Set()
  for (const file of manifest.files) {
    safePath(file?.path)
    if (seen.has(file.path)) throw new Error("The backup manifest lists a duplicate state file.")
    seen.add(file.path)
    if (!/^[0-9a-f]{64}$/.test(file.sha256 ?? "") || !/^[0-7]{3,4}$/.test(file.mode ?? "")
      || !(Number.isSafeInteger(file.bytes) && file.bytes >= 0)
      || !(Number.isSafeInteger(file.uid) && file.uid >= 0) || !(Number.isSafeInteger(file.gid) && file.gid >= 0)) {
      throw new Error("The backup manifest has an unusable file entry.")
    }
  }
  return manifest
}

async function members(archive) {
  const output = await tar(["-tzf", archive]), listed = new Map()
  for (const line of output.split("\n")) {
    if (!line) continue
    const directory = line.endsWith("/")
    const name = line.replace(/\/+$/, "").replace(/^\.\//, "")
    if (name === ".") continue
    listed.set(safePath(name), directory ? "d" : "f")
  }
  return listed
}

async function readVerified(destination) {
  await privateDirectory(destination, "Backup directory")
  await privateFile(join(destination, MANIFEST), "Backup manifest")
  let manifest
  try { manifest = JSON.parse(await readFile(join(destination, MANIFEST), "utf8")) }
  catch { throw new Error("The backup manifest is unreadable.") }
  validateManifest(manifest)
  await privateFile(join(destination, ARCHIVE), "Backup archive")
  const bytes = await readFile(join(destination, ARCHIVE))
  if (bytes.length !== manifest.archive.bytes || hash(bytes) !== manifest.archive.sha256) {
    throw new Error("The backup archive does not match its manifest; the backup is corrupt or incomplete.")
  }
  const listed = await members(join(destination, ARCHIVE))
  for (const type of listed.values()) {
    if (type !== "d" && type !== "f") throw new Error("The backup contains an unsafe member type.")
  }
  const archived = [...listed].filter(([, type]) => type === "f").map(([name]) => name).sort()
  const declared = manifest.files.map(file => file.path).sort()
  if (JSON.stringify(archived) !== JSON.stringify(declared)) {
    throw new Error("The backup archive members do not match its manifest; the backup is incomplete.")
  }
  return manifest
}

async function vacant(staging) {
  if (!await exists(staging)) {
    await mkdir(staging, { mode: 0o700 })
    return true
  }
  await privateDirectory(staging, "Restore staging directory")
  if ((await readdir(staging)).length) throw new Error("The restore staging target is not empty; refusing to overwrite it.")
  return false
}

/**
 * Create one private backup from a stopped state directory. The destination
 * must not already exist, so an earlier backup can never be replaced by a
 * partial one. Returns the manifest and the digest a receipt may record.
 */
export async function backupVolume({ source, destination, volume = STATE_VOLUME, lockDir = join(ROOT, ".local/web-gateway"), signal }) {
  if (volume !== STATE_VOLUME) throw new Error("Only the reviewed gateway state volume can be backed up.")
  return withGatewayLock(lockDir, signal, async verify => {
    const info = await lstat(source)
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error("Gateway state source must be a real directory.")
    await privateDirectory(source, "Gateway state source")
    const files = await walk(source)
    if (!files.length) throw new Error("Gateway state is empty; refusing an empty backup.")
    if (await exists(destination)) throw new Error("Backup destination already exists; refusing to overwrite a previous backup.")
    await verify()
    let created = false
    try {
      await mkdir(destination, { mode: 0o700 })
      created = true
      const temporary = join(destination, `${ARCHIVE}.partial`)
      await tar(["-czf", temporary, "--sort=name", "--mtime=@0", "--numeric-owner", "-C", source, "."])
      await chmod(temporary, 0o600)
      const archive = await readFile(temporary)
      await verify()
      await rename(temporary, join(destination, ARCHIVE))
      const manifest = {
        schema: BACKUP_SCHEMA, contract: CONTRACT, volume, createdAt: new Date().toISOString(),
        archive: { name: ARCHIVE, sha256: hash(archive), bytes: archive.length }, files,
      }
      const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
      await writeFile(join(destination, `${MANIFEST}.partial`), manifestBytes, { mode: 0o600 })
      await verify()
      await rename(join(destination, `${MANIFEST}.partial`), join(destination, MANIFEST))
      return { destination, manifest, manifestSha256: hash(manifestBytes) }
    } catch (error) {
      if (created) await rm(destination, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  })
}

/**
 * Verify a backup without extracting it. Refuses a missing commit manifest, a
 * digest/member mismatch, unsafe member names and non-private artifacts.
 */
export async function verifyBackup({ destination }) {
  return readVerified(destination)
}

/**
 * Verify and extract one backup into an empty private staging directory, then
 * re-hash every file. The caller decides whether the staging tree may replace
 * the live volume; this function never touches the live state. A failure
 * removes only a staging directory this call created.
 */
export async function restoreBackup({ destination, staging, lockDir = join(ROOT, ".local/web-gateway"), signal }) {
  return withGatewayLock(lockDir, signal, async verify => {
    const manifest = await readVerified(destination)
    await verify()
    const created = await vacant(staging)
    try {
      await tar(["-xzf", join(destination, ARCHIVE), "-C", staging, "-p", "--same-owner"])
      await verify()
      const restored = await walk(staging)
      if (JSON.stringify(restored) !== JSON.stringify(manifest.files)) {
        throw new Error("Restored gateway state does not match the backup manifest; the staging copy was discarded.")
      }
      return { staging, manifest }
    } catch (error) {
      if (created) await rm(staging, { recursive: true, force: true }).catch(() => {})
      throw error
    }
  })
}

function options(argv) {
  const parsed = {}
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (!key?.startsWith("--") || !argv[index + 1] || key.length < 3) {
      throw new Error("Expected --name value pairs.")
    }
    parsed[key.slice(2)] = argv[index + 1]
  }
  return parsed
}

async function main(argv) {
  const [command, ...rest] = argv, flags = options(rest)
  const lockDir = flags.lock ?? join(ROOT, ".local/web-gateway")
  if (command === "backup") {
    if (!flags.source || !flags.destination) throw new Error("backup needs --source and --destination.")
    const result = await backupVolume({ source: flags.source, destination: flags.destination, lockDir })
    return { ok: true, volume: result.manifest.volume, files: result.manifest.files.length,
      archiveBytes: result.manifest.archive.bytes, manifestSha256: result.manifestSha256 }
  }
  if (command === "verify") {
    if (!flags.destination) throw new Error("verify needs --destination.")
    const manifest = await verifyBackup({ destination: flags.destination })
    return { ok: true, volume: manifest.volume, files: manifest.files.length, archiveSha256: manifest.archive.sha256 }
  }
  if (command === "restore") {
    if (!flags.destination || !flags.staging) throw new Error("restore needs --destination and --staging.")
    const result = await restoreBackup({ destination: flags.destination, staging: flags.staging, lockDir })
    return { ok: true, staging: result.staging, files: result.manifest.files.length }
  }
  throw new Error("Usage: gateway-state-backup.mjs backup|verify|restore [--source|--destination|--staging|--lock PATH]")
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Report only digests and counts: state bytes and credentials never reach logs.
  main(process.argv.slice(2)).then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
}
