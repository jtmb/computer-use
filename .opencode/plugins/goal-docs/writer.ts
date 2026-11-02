import { randomUUID } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { open, lstat, mkdir, rename, unlink } from "node:fs/promises"
import path from "node:path"

import { GOAL_STATUSES, safeGoalDirectoryName, sha256 } from "./model.ts"
import { safeReadmeTitle, type GoalDocBundle } from "./render.ts"
import { throwIfAborted } from "./abort.ts"
import { acquireProcessLock, ProcessLockError } from "./process-lock.ts"

export const OWNERSHIP_FILE = ".goal-docs-manifest.json"
const LOCK_FILE = ".goal-docs.lock"
const RECOVERY_LOCK_FILE = ".goal-docs.lock.recovery"
const PROCESS_LOCK_FILE = ".goal-docs-process.lock"
const README_START = "<!-- goal-docs:managed:start -->"
const README_END = "<!-- goal-docs:managed:end -->"
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
const MAX_DOC_BYTES = 512 * 1024
const MAX_LOCK_BYTES = 256
const MAX_BUNDLE_COUNT = 21
const MAX_GENERATED_BYTES = 4 * 1024 * 1024
const GENERATED_FILES = new Set(["plan.md", "HANDOFF.md", "work-history.md", "snapshot.json"])

export interface WriterStat {
  isDirectory(): boolean
  isFile(): boolean
  isSymbolicLink(): boolean
}

export interface WriterHandle {
  writeFile(content: string, encoding?: "utf8"): Promise<void>
  sync(): Promise<void>
  close(): Promise<void>
}

export interface WriterFileSystem {
  acquireProcessLock(filePath: string, signal?: AbortSignal): Promise<() => Promise<void>>
  lstat(filePath: string): Promise<WriterStat>
  mkdir(filePath: string, options: { mode: number }): Promise<void>
  readFileBounded(filePath: string, byteLimit: number, signal?: AbortSignal): Promise<string>
  open(filePath: string, flags: string, mode?: number): Promise<WriterHandle>
  rename(from: string, to: string): Promise<void>
  unlink(filePath: string): Promise<void>
}

export interface HandoffTransferRecord {
  transferID: string
  sourceSessionID: string
  goalID: string
  planRevision: number
  sourceFingerprint: string
  targetSessionID: string | null
  messageID: string
  phase: "export" | "create" | "seed" | "open"
  status: "in_progress" | "complete" | "failed"
  error?: string
  leaseUntil?: number
  leaseToken?: string
  updatedAt: number
}

interface GoalIndexRecord {
  goalID: string
  sourceSessionID: string
  sourceDirectory: string
  status: string
  planRevision: number
  title: string
  contentFingerprint: string
  planFingerprint: string
}

interface ManifestPayload {
  version: 1
  owner: "goal-docs"
  files: Record<string, string>
  goals: Record<string, GoalIndexRecord>
  transfers: Record<string, HandoffTransferRecord>
}

interface Manifest extends ManifestPayload {
  integrity: string
}

export interface WriteBundleResult {
  bundles: GoalDocBundle[]
  docsDirectory: string
  written: string[]
  unchanged: string[]
  goals: string[]
}

export class GoalDocsWriteError extends Error {
  readonly code: "manual_edit" | "symlink" | "concurrent" | "stale_revision" | "invalid_manifest" | "bounds" | "io"

  constructor(code: GoalDocsWriteError["code"], message: string) {
    super(message)
    this.name = "GoalDocsWriteError"
    this.code = code
  }
}

const liveFileSystem: WriterFileSystem = {
  acquireProcessLock: async (filePath, signal) => {
    try { return await acquireProcessLock(filePath, signal) }
    catch (error) {
      if (error instanceof ProcessLockError) throw new GoalDocsWriteError(error.code, error.message)
      throw error
    }
  },
  lstat,
  mkdir: async (filePath, options) => mkdir(filePath, options),
  readFileBounded: async (filePath, byteLimit, signal) => {
    const handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW)
    try {
      const metadata = await handle.stat()
      if (!metadata.isFile()) throw new GoalDocsWriteError("io", `${filePath} is not a regular file`)
      if (metadata.size > byteLimit) throw new GoalDocsWriteError("bounds", `${filePath} exceeds its ${byteLimit}-byte read limit`)
      const buffer = Buffer.alloc(byteLimit + 1)
      let bytesRead = 0
      while (bytesRead < buffer.length) {
        throwIfAborted(signal)
        const result = await handle.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead)
        if (result.bytesRead === 0) break
        bytesRead += result.bytesRead
      }
      if (bytesRead > byteLimit) throw new GoalDocsWriteError("bounds", `${filePath} exceeds its ${byteLimit}-byte read limit`)
      return new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, bytesRead))
    } finally {
      await handle.close()
    }
  },
  open: async (filePath, flags, mode) => open(filePath, flags, mode),
  rename,
  unlink,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function missing(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT"
}

function existsError(error: unknown): boolean {
  return isRecord(error) && error.code === "EEXIST"
}

function stableJson(value: unknown): string {
  return JSON.stringify(value)
}

function manifestIntegrity(payload: ManifestPayload): string {
  return sha256(stableJson(payload))
}

function withIntegrity(payload: ManifestPayload): Manifest {
  return { ...payload, integrity: manifestIntegrity(payload) }
}

function emptyManifest(): Manifest {
  return withIntegrity({ version: 1, owner: "goal-docs", files: {}, goals: {}, transfers: {} })
}

function validTransfer(value: unknown): value is HandoffTransferRecord {
  if (!isRecord(value)) return false
  return typeof value.transferID === "string" && /^goalhandoff_[a-f0-9]{40}$/.test(value.transferID) &&
    typeof value.sourceSessionID === "string" && value.sourceSessionID.length <= 200 &&
    typeof value.goalID === "string" && value.goalID.length <= 200 &&
    typeof value.planRevision === "number" && Number.isSafeInteger(value.planRevision) && value.planRevision >= 0 &&
    typeof value.sourceFingerprint === "string" && /^[a-f0-9]{64}$/.test(value.sourceFingerprint) &&
    (value.targetSessionID === null || (typeof value.targetSessionID === "string" && value.targetSessionID.length <= 200)) &&
    typeof value.messageID === "string" && /^msg_goal_docs_[a-f0-9]{32}$/.test(value.messageID) &&
    ["export", "create", "seed", "open"].includes(String(value.phase)) &&
    ["in_progress", "complete", "failed"].includes(String(value.status)) &&
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) &&
    (value.error === undefined || (typeof value.error === "string" && value.error.length <= 2_000)) &&
    (value.leaseUntil === undefined || (typeof value.leaseUntil === "number" && Number.isFinite(value.leaseUntil))) &&
    (value.leaseToken === undefined || (typeof value.leaseToken === "string" && value.leaseToken.length <= 100))
}

function validGoalIndex(directoryName: string, value: unknown): value is GoalIndexRecord {
  if (!isRecord(value)) return false
  try {
    if (safeGoalDirectoryName(String(value.goalID)) !== directoryName) return false
  } catch {
    return false
  }
  return typeof value.goalID === "string" && value.goalID.length <= 200 &&
    typeof value.sourceSessionID === "string" && value.sourceSessionID.length <= 200 &&
    typeof value.sourceDirectory === "string" && path.isAbsolute(value.sourceDirectory) &&
    typeof value.status === "string" && GOAL_STATUSES.includes(value.status as (typeof GOAL_STATUSES)[number]) &&
    typeof value.planRevision === "number" && Number.isSafeInteger(value.planRevision) && value.planRevision >= 0 &&
    typeof value.title === "string" && value.title.length <= 200 &&
    typeof value.contentFingerprint === "string" && /^[a-f0-9]{64}$/.test(value.contentFingerprint) &&
    typeof value.planFingerprint === "string" && /^[a-f0-9]{64}$/.test(value.planFingerprint)
}

function parseManifest(text: string): Manifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new GoalDocsWriteError("invalid_manifest", "goal-docs ownership manifest is not valid JSON; refusing to overwrite")
  }
  if (!isRecord(parsed) || parsed.version !== 1 || parsed.owner !== "goal-docs" ||
    !isRecord(parsed.files) || !isRecord(parsed.goals) || !isRecord(parsed.transfers) ||
    typeof parsed.integrity !== "string") {
    throw new GoalDocsWriteError("invalid_manifest", "goal-docs ownership manifest has an unsupported shape; refusing to overwrite")
  }
  const payload: ManifestPayload = {
    version: 1,
    owner: "goal-docs",
    files: parsed.files as Record<string, string>,
    goals: parsed.goals as Record<string, GoalIndexRecord>,
    transfers: parsed.transfers as Record<string, HandoffTransferRecord>,
  }
  if (Object.keys(payload.files).length > 2_000 || Object.keys(payload.goals).length > 500 || Object.keys(payload.transfers).length > 200) {
    throw new GoalDocsWriteError("invalid_manifest", "goal-docs ownership manifest exceeds its bounds")
  }
  for (const [file, hash] of Object.entries(payload.files)) {
    const generatedFile = /^(?:[A-Za-z0-9._-]{1,200}\/(?:plan\.md|HANDOFF\.md|work-history\.md|snapshot\.json)|README\.md)$/.test(file)
    if (!isSafeRelativeFile(file) || !generatedFile || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) {
      throw new GoalDocsWriteError("invalid_manifest", "goal-docs ownership manifest contains an unsafe file entry")
    }
  }
  for (const [directoryName, goal] of Object.entries(payload.goals)) {
    if (!/^[A-Za-z0-9._-]{1,200}$/.test(directoryName) || directoryName === "." || directoryName === ".." || !validGoalIndex(directoryName, goal)) {
      throw new GoalDocsWriteError("invalid_manifest", "goal-docs ownership manifest contains an invalid goal index entry")
    }
  }
  for (const [transferID, transfer] of Object.entries(payload.transfers)) {
    if (!validTransfer(transfer) || transfer.transferID !== transferID) {
      throw new GoalDocsWriteError("invalid_manifest", "goal-docs ownership manifest contains an invalid transfer")
    }
  }
  if (parsed.integrity !== manifestIntegrity(payload)) {
    throw new GoalDocsWriteError("invalid_manifest", "goal-docs ownership manifest integrity check failed; refusing to overwrite")
  }
  return { ...payload, integrity: parsed.integrity }
}

function isSafeRelativeFile(value: string): boolean {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false
  const parts = value.split("/")
  return parts.every((part) => part !== "" && part !== "." && part !== "..")
}

async function exists(fs: WriterFileSystem, filePath: string): Promise<WriterStat | undefined> {
  try {
    return await fs.lstat(filePath)
  } catch (error) {
    if (missing(error)) return undefined
    throw error
  }
}

async function ensureSafeDirectory(fs: WriterFileSystem, directory: string): Promise<void> {
  const absolute = path.resolve(directory)
  const parsed = path.parse(absolute)
  let current = parsed.root
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    let stat = await exists(fs, current)
    if (!stat) {
      try {
        await fs.mkdir(current, { mode: 0o700 })
      } catch (error) {
        if (!existsError(error)) throw error
      }
      stat = await exists(fs, current)
    }
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new GoalDocsWriteError("symlink", `unsafe goal-docs path component: ${current}`)
    }
  }
}

async function ensureExistingSafeDirectory(fs: WriterFileSystem, directory: string): Promise<void> {
  const absolute = path.resolve(directory)
  const parsed = path.parse(absolute)
  let current = parsed.root
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    const stat = await exists(fs, current)
    if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new GoalDocsWriteError("io", `source worktree must already exist as a real directory: ${current}`)
    }
  }
}

async function assertSafeTarget(fs: WriterFileSystem, filePath: string): Promise<WriterStat | undefined> {
  const absolute = path.resolve(filePath)
  await ensureSafeDirectory(fs, path.dirname(absolute))
  const stat = await exists(fs, absolute)
  if (stat && (stat.isSymbolicLink() || !stat.isFile())) {
    throw new GoalDocsWriteError("symlink", `goal-docs target is not a regular file: ${absolute}`)
  }
  return stat
}

async function atomicWrite(fs: WriterFileSystem, filePath: string, content: string, signal?: AbortSignal): Promise<void> {
  const limit = filePath.endsWith(OWNERSHIP_FILE) ? MAX_MANIFEST_BYTES : MAX_DOC_BYTES
  if (Buffer.byteLength(content, "utf8") > limit) {
    throw new GoalDocsWriteError("bounds", `goal-docs output exceeds its ${limit}-byte write limit`)
  }
  throwIfAborted(signal)
  const directory = path.dirname(filePath)
  const temporary = path.join(directory, `.${path.basename(filePath)}.goal-docs-${randomUUID()}.tmp`)
  let handle: WriterHandle | undefined
  try {
    handle = await fs.open(temporary, "wx", 0o600)
    throwIfAborted(signal)
    await handle.writeFile(content, "utf8")
    await handle.sync()
    await handle.close()
    handle = undefined
    throwIfAborted(signal)
    await fs.rename(temporary, filePath)
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined)
    await fs.unlink(temporary).catch(() => undefined)
    if (signal?.aborted) throwIfAborted(signal)
    throw new GoalDocsWriteError("io", `atomic goal-docs write failed for ${filePath}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function readOptional(fs: WriterFileSystem, filePath: string, signal?: AbortSignal): Promise<string | undefined> {
  try {
    throwIfAborted(signal)
    const limit = filePath.endsWith(OWNERSHIP_FILE) ? MAX_MANIFEST_BYTES : MAX_DOC_BYTES
    const content = await fs.readFileBounded(filePath, limit, signal)
    if (Buffer.byteLength(content, "utf8") > limit) throw new GoalDocsWriteError("bounds", `goal-docs file exceeds its ${limit}-byte read limit`)
    return content
  } catch (error) {
    if (missing(error)) return undefined
    throw error
  }
}

async function readManifest(fs: WriterFileSystem, root: string, signal?: AbortSignal): Promise<Manifest> {
  const manifestPath = path.join(root, OWNERSHIP_FILE)
  const stat = await assertSafeTarget(fs, manifestPath)
  if (!stat) return emptyManifest()
  const text = await readOptional(fs, manifestPath, signal)
  if (text === undefined) return emptyManifest()
  return parseManifest(text)
}

async function persistManifest(fs: WriterFileSystem, root: string, manifest: Manifest, signal?: AbortSignal): Promise<void> {
  const manifestPath = path.join(root, OWNERSHIP_FILE)
  await assertSafeTarget(fs, manifestPath)
  const payload: ManifestPayload = {
    version: manifest.version,
    owner: manifest.owner,
    files: manifest.files,
    goals: manifest.goals,
    transfers: manifest.transfers,
  }
  if (Object.keys(payload.files).length > 2_000 || Object.keys(payload.goals).length > 500 || Object.keys(payload.transfers).length > 200) {
    throw new GoalDocsWriteError("bounds", "goal-docs ownership manifest exceeds its entry-count limit")
  }
  const content = `${JSON.stringify(withIntegrity(payload), null, 2)}\n`
  if (Buffer.byteLength(content, "utf8") > MAX_MANIFEST_BYTES) {
    throw new GoalDocsWriteError("bounds", "goal-docs ownership manifest exceeds its write limit")
  }
  await atomicWrite(fs, manifestPath, content, signal)
}

function lockOwnerText(pid: number, token: string): string {
  return `${pid} ${Date.now()} ${token}\n`
}

function parseLockOwner(text: string): { pid: number; text: string } | undefined {
  const match = /^(\d{1,10}) (\d{1,16}) ([a-f0-9-]{36})\n?$/.exec(text)
  if (!match) return undefined
  const pid = Number(match[1])
  return Number.isSafeInteger(pid) && pid > 0 ? { pid, text } : undefined
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return !isRecord(error) || error.code !== "ESRCH"
  }
}

async function readLockOwner(fs: WriterFileSystem, lockPath: string): Promise<{ pid: number; text: string } | undefined> {
  const stat = await assertSafeTarget(fs, lockPath)
  if (!stat) return undefined
  return parseLockOwner(await fs.readFileBounded(lockPath, MAX_LOCK_BYTES))
}

async function recoverDeadLock(
  fs: WriterFileSystem,
  lockPath: string,
  isAlive: (pid: number) => boolean,
): Promise<boolean> {
  const owner = await readLockOwner(fs, lockPath)
  if (!owner || isAlive(owner.pid)) return false
  const confirmed = await readLockOwner(fs, lockPath)
  if (!confirmed || confirmed.text !== owner.text || isAlive(confirmed.pid)) return false
  await fs.unlink(lockPath)
  return true
}

async function acquireRecoveryLock(
  fs: WriterFileSystem,
  lockPath: string,
  isAlive: (pid: number) => boolean,
  signal?: AbortSignal,
): Promise<WriterHandle | undefined> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    throwIfAborted(signal)
    try {
      const handle = await fs.open(lockPath, "wx", 0o600)
      try {
        await handle.writeFile(lockOwnerText(process.pid, randomUUID()), "utf8")
        await handle.sync()
        return handle
      } catch (error) {
        await handle.close().catch(() => undefined)
        await fs.unlink(lockPath).catch(() => undefined)
        throw error
      }
    } catch (error) {
      if (!existsError(error)) throw error
      if (attempt > 0 || !(await recoverDeadLock(fs, lockPath, isAlive))) return undefined
    }
  }
  return undefined
}

async function withRootLock<T>(
  fs: WriterFileSystem,
  root: string,
  operation: () => Promise<T>,
  options: { signal?: AbortSignal; isProcessAlive?: (pid: number) => boolean } = {},
): Promise<T> {
  await ensureExistingSafeDirectory(fs, path.resolve(root, "..", ".."))
  await ensureSafeDirectory(fs, root)
  const processLockPath = path.join(root, PROCESS_LOCK_FILE)
  await assertSafeTarget(fs, processLockPath)
  const release = await fs.acquireProcessLock(processLockPath, options.signal)
  try {
    return await withOwnedRootLock(fs, root, operation, options)
  } finally {
    await release()
  }
}

async function withOwnedRootLock<T>(
  fs: WriterFileSystem,
  root: string,
  operation: () => Promise<T>,
  options: { signal?: AbortSignal; isProcessAlive?: (pid: number) => boolean },
): Promise<T> {
  // Keep conservative owner-file recovery, but hold the kernel guard across
  // cleanup and writing so a stale cleanup cannot delete a new owner's file.
  const { signal } = options
  const isAlive = options.isProcessAlive ?? processIsAlive
  await ensureExistingSafeDirectory(fs, path.resolve(root, "..", ".."))
  await ensureSafeDirectory(fs, root)
  const lockPath = path.join(root, LOCK_FILE)
  const recoveryPath = path.join(root, RECOVERY_LOCK_FILE)
  await assertSafeTarget(fs, lockPath)
  await assertSafeTarget(fs, recoveryPath)
  throwIfAborted(signal)
  let lock: WriterHandle | undefined
  let recovery: WriterHandle | undefined
  let recovered = false
  try {
    lock = await fs.open(lockPath, "wx", 0o600)
  } catch (error) {
    if (!existsError(error)) throw error
    recovery = await acquireRecoveryLock(fs, recoveryPath, isAlive, signal)
    if (!recovery) throw new GoalDocsWriteError("concurrent", "another goal-docs writer holds or is recovering the documentation lock")
    try {
      recovered = await recoverDeadLock(fs, lockPath, isAlive)
    } finally {
      await recovery.close().catch(() => undefined)
      recovery = undefined
      await fs.unlink(recoveryPath).catch(() => undefined)
    }
    if (!recovered) {
      throw new GoalDocsWriteError("concurrent", "another goal-docs writer holds an unowned or live documentation lock")
    }
    throwIfAborted(signal)
    try {
      lock = await fs.open(lockPath, "wx", 0o600)
    } catch (retryError) {
      if (existsError(retryError)) throw new GoalDocsWriteError("concurrent", "another goal-docs writer acquired the recovered documentation lock")
      throw retryError
    }
  }
  try {
    throwIfAborted(signal)
    await lock.writeFile(lockOwnerText(process.pid, randomUUID()), "utf8")
    await lock.sync()
    throwIfAborted(signal)
    return await operation()
  } finally {
    await lock?.close().catch(() => undefined)
    await fs.unlink(lockPath).catch(() => undefined)
    if (recovery) {
      await recovery.close().catch(() => undefined)
      await fs.unlink(recoveryPath).catch(() => undefined)
    }
  }
}

function extractManagedReadme(content: string): { block: string; prefix: string; suffix: string } | undefined {
  const start = content.indexOf(README_START)
  const end = content.indexOf(README_END)
  if (start < 0 || end < start || content.indexOf(README_START, start + 1) >= 0 || content.indexOf(README_END, end + 1) >= 0) {
    return undefined
  }
  const blockEnd = end + README_END.length
  return { block: content.slice(start, blockEnd), prefix: content.slice(0, start), suffix: content.slice(blockEnd) }
}

function markdownCell(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replace(/[\r\n]+/g, " ")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;")
    .replaceAll("(", "&#40;")
    .replaceAll(")", "&#41;")
}

function renderIndexSection(goals: Record<string, GoalIndexRecord>): string {
  const lines = [
    README_START,
    "## Exported goals",
    "",
    "These are bounded exports from the shared goal-plugin state file. They are not session transcripts.",
    "",
    "| Goal | Status | Plan revision | Source session |",
    "| --- | --- | ---: | --- |",
  ]
  for (const [directoryName, item] of Object.entries(goals).sort(([left], [right]) => left.localeCompare(right))) {
    const title = markdownCell(item.title || item.goalID)
    lines.push(`| [${title}](./${directoryName}/HANDOFF.md) | \`${markdownCell(item.status)}\` | ${item.planRevision} | \`${markdownCell(item.sourceSessionID)}\` |`)
  }
  lines.push("", "Each goal directory contains mandatory `plan.md`, `HANDOFF.md`, `work-history.md`, and `snapshot.json` files.", README_END)
  return lines.join("\n")
}

function mergeReadme(existing: string | undefined, expectedHash: string | undefined, desiredBlock: string): { content: string; ownedHash: string } {
  if (existing === undefined) {
    const content = `# Goal documentation\n\n${desiredBlock}\n`
    return { content, ownedHash: sha256(desiredBlock) }
  }
  const prior = extractManagedReadme(existing)
  if (!prior) {
    throw new GoalDocsWriteError("manual_edit", "docs/goals/README.md exists without a valid goal-docs managed section; preserving it")
  }
  if (!expectedHash) {
    throw new GoalDocsWriteError("manual_edit", "docs/goals/README.md has an unowned managed section; preserving it")
  }
  const actualHash = sha256(prior.block)
  if (actualHash !== expectedHash && prior.block !== desiredBlock) {
    throw new GoalDocsWriteError("manual_edit", "the managed section in docs/goals/README.md was edited manually; preserving it")
  }
  const content = `${prior.prefix}${desiredBlock}${prior.suffix}`
  return { content, ownedHash: sha256(desiredBlock) }
}

function normalizeRoot(directory: string): string {
  if (!path.isAbsolute(directory)) throw new GoalDocsWriteError("io", "source session directory must be an absolute path")
  return path.join(path.resolve(directory), "docs", "goals")
}

function cloneManifest(manifest: Manifest): ManifestPayload {
  return JSON.parse(JSON.stringify({
    version: manifest.version,
    owner: manifest.owner,
    files: manifest.files,
    goals: manifest.goals,
    transfers: manifest.transfers,
  })) as ManifestPayload
}

function isExistingContentSame(current: string | undefined, desired: string): boolean {
  return current === desired
}

async function reuseVerifiedBundle(
  fs: WriterFileSystem,
  root: string,
  manifest: Manifest,
  incoming: GoalDocBundle,
  signal?: AbortSignal,
): Promise<GoalDocBundle> {
  const indexed = manifest.goals[incoming.directoryName]
  if (!indexed) return incoming
  if (indexed.sourceSessionID !== incoming.source.sessionID || indexed.sourceDirectory !== incoming.source.directory) {
    throw new GoalDocsWriteError("manual_edit", "the retained goal belongs to a different source session or directory")
  }
  if (indexed.contentFingerprint !== incoming.contentFingerprint) return incoming

  const files: Record<string, string> = {}
  for (const name of GENERATED_FILES) {
    const relative = `${incoming.directoryName}/${name}`
    const absolute = path.join(root, relative)
    await assertSafeTarget(fs, absolute)
    const content = await readOptional(fs, absolute, signal)
    if (content === undefined || sha256(content) !== manifest.files[relative]) {
      throw new GoalDocsWriteError("manual_edit", `retained file ${relative} was removed or edited; refusing reuse`)
    }
    files[name] = content
  }
  let snapshot: unknown
  try { snapshot = JSON.parse(files["snapshot.json"]) }
  catch { throw new GoalDocsWriteError("invalid_manifest", "retained snapshot is not valid JSON") }
  if (!isRecord(snapshot) || snapshot.schemaVersion !== 1 || snapshot.renderVersion !== 1) return incoming
  const source = snapshot.source
  if (!isRecord(source) || source.sessionID !== incoming.source.sessionID || source.directory !== incoming.source.directory ||
    snapshot.contentFingerprint !== incoming.contentFingerprint || typeof source.exportedAt !== "string" ||
    !Number.isFinite(Date.parse(source.exportedAt))) {
    throw new GoalDocsWriteError("invalid_manifest", "retained snapshot identity or export time is invalid")
  }
  if (JSON.stringify(source.repository) !== JSON.stringify(incoming.source.repository)) return incoming
  const generatedFiles = snapshot.generatedFiles
  if (!isRecord(generatedFiles) || [...GENERATED_FILES].some((name) =>
    name !== "snapshot.json" && generatedFiles[name] !== sha256(files[name]))) return incoming
  // Reuse all verified bytes, including metadata, so one transfer ID has one seed.
  return { ...incoming, source: { ...incoming.source, exportedAt: source.exportedAt }, files }
}

export async function writeGoalDocBundles(
  sourceDirectory: string,
  bundles: readonly GoalDocBundle[],
  options: { fileSystem?: WriterFileSystem; signal?: AbortSignal; isProcessAlive?: (pid: number) => boolean } = {},
): Promise<WriteBundleResult> {
  const fs = options.fileSystem ?? liveFileSystem
  throwIfAborted(options.signal)
  if (bundles.length > MAX_BUNDLE_COUNT) {
    throw new GoalDocsWriteError("bounds", `goal-docs accepts at most ${MAX_BUNDLE_COUNT} goal bundles per export`)
  }
  let generatedBytes = 0
  for (const bundle of bundles) {
    throwIfAborted(options.signal)
    if (safeGoalDirectoryName(bundle.goalID) !== bundle.directoryName) {
      throw new GoalDocsWriteError("io", "goal bundle directory does not match its goal ID")
    }
    const files = Object.entries(bundle.files)
    if (files.length !== GENERATED_FILES.size || files.some(([name]) => !GENERATED_FILES.has(name))) {
      throw new GoalDocsWriteError("io", "goal bundle must contain exactly the four managed export files")
    }
    for (const [name, content] of files) {
      if (typeof content !== "string") throw new GoalDocsWriteError("io", `generated ${name} is not text`)
      const size = Buffer.byteLength(content, "utf8")
      if (size > MAX_DOC_BYTES) throw new GoalDocsWriteError("bounds", `generated ${name} exceeds its ${MAX_DOC_BYTES}-byte write limit`)
      generatedBytes += size
      if (generatedBytes > MAX_GENERATED_BYTES) {
        throw new GoalDocsWriteError("bounds", `generated goal export exceeds its ${MAX_GENERATED_BYTES}-byte total write limit`)
      }
    }
  }
  const root = normalizeRoot(sourceDirectory)
  await ensureExistingSafeDirectory(fs, path.resolve(sourceDirectory))
  return withRootLock(fs, root, async () => {
    throwIfAborted(options.signal)
    const manifest = await readManifest(fs, root, options.signal)
    const payload = cloneManifest(manifest)
    const updates = new Map<string, { content: string; ownerHash?: string }>()
    const newRecords: Record<string, GoalIndexRecord> = { ...payload.goals }
    const directories = new Map<string, string>()
    const savedBundles: GoalDocBundle[] = []

    for (const incoming of bundles) {
      throwIfAborted(options.signal)
      const bundle = await reuseVerifiedBundle(fs, root, manifest, incoming, options.signal)
      savedBundles.push(bundle)
      const directoryName = safeGoalDirectoryName(bundle.goalID)
      const collision = newRecords[directoryName]
      if (collision && collision.goalID !== bundle.goalID) {
        throw new GoalDocsWriteError("manual_edit", `goal ID directory collision at ${directoryName}; preserving existing export`)
      }
      directories.set(directoryName, bundle.goalID)
      const existing = newRecords[directoryName]
      if (existing && bundle.planRevision < existing.planRevision) {
        throw new GoalDocsWriteError("stale_revision", `goal ${bundle.goalID} revision ${bundle.planRevision} is older than the exported revision ${existing.planRevision}`)
      }
      if (existing && bundle.planRevision === existing.planRevision && existing.planFingerprint !== bundle.planFingerprint) {
        throw new GoalDocsWriteError("stale_revision", `goal ${bundle.goalID} changed its plan without advancing planRevision`)
      }
      newRecords[directoryName] = {
        goalID: bundle.goalID,
        sourceSessionID: sourceSessionIDFromFiles(bundle.files["snapshot.json"]),
        sourceDirectory,
        status: bundle.status,
        planRevision: bundle.planRevision,
        title: safeReadmeTitle(bundle.objective),
        contentFingerprint: bundle.contentFingerprint,
        planFingerprint: bundle.planFingerprint,
      }

      for (const [name, content] of Object.entries(bundle.files)) {
        const relative = `${directoryName}/${name}`
        if (!isSafeRelativeFile(relative)) throw new GoalDocsWriteError("io", `unsafe generated path: ${relative}`)
        updates.set(relative, { content })
      }
    }

    const desiredBlock = renderIndexSection(newRecords)
    if (Buffer.byteLength(desiredBlock, "utf8") > MAX_DOC_BYTES) {
      throw new GoalDocsWriteError("bounds", "generated goal index exceeds its write limit")
    }
    const readmePath = path.join(root, "README.md")
    await assertSafeTarget(fs, readmePath)
    const currentReadme = await readOptional(fs, readmePath, options.signal)
    const readme = mergeReadme(currentReadme, payload.files["README.md"], desiredBlock)
    if (Buffer.byteLength(readme.content, "utf8") > MAX_DOC_BYTES) {
      throw new GoalDocsWriteError("bounds", "goal docs README exceeds its write limit")
    }
    updates.set("README.md", { content: readme.content, ownerHash: readme.ownedHash })

    const preflight = new Map<string, { absolutePath: string; current?: string; desired: string; ownerHash: string }>()
    for (const [relative, desired] of updates) {
      throwIfAborted(options.signal)
      const absolutePath = path.join(root, relative)
      const stat = await assertSafeTarget(fs, absolutePath)
      const current = stat ? await readOptional(fs, absolutePath, options.signal) : undefined
      const hash = relative === "README.md" ? (desired.ownerHash as string) : sha256(desired.content)
      const expected = payload.files[relative]
      if (!stat && expected) throw new GoalDocsWriteError("manual_edit", `managed file ${relative} was removed; preserving the remaining export`)
      if (stat && !expected && current !== desired.content) {
        throw new GoalDocsWriteError("manual_edit", `unowned file ${relative} already exists; preserving it`)
      }
      if (stat && expected) {
        const currentHash = relative === "README.md"
          ? (extractManagedReadme(current ?? "") ? sha256(extractManagedReadme(current ?? "")!.block) : "")
          : sha256(current ?? "")
        if (currentHash !== expected && current !== desired.content) {
          throw new GoalDocsWriteError("manual_edit", `managed file ${relative} was edited manually; preserving it`)
        }
      }
      preflight.set(relative, { absolutePath, current, desired: desired.content, ownerHash: hash })
    }

    const written: string[] = []
    const unchanged: string[] = []
    for (const [relative, item] of preflight) {
      throwIfAborted(options.signal)
      if (isExistingContentSame(item.current, item.desired)) {
        unchanged.push(relative)
      } else {
        await ensureSafeDirectory(fs, path.dirname(item.absolutePath))
        await atomicWrite(fs, item.absolutePath, item.desired, options.signal)
        written.push(relative)
      }
      payload.files[relative] = item.ownerHash
      await persistManifest(fs, root, withIntegrity(payload), options.signal)
    }
    payload.goals = newRecords
    await persistManifest(fs, root, withIntegrity(payload), options.signal)
    return {
      bundles: savedBundles,
      docsDirectory: root,
      written,
      unchanged,
      goals: [...directories.values()],
    }
  }, options)
}

function sourceSessionIDFromFiles(snapshot: string): string {
  try {
    const parsed = JSON.parse(snapshot) as { source?: { sessionID?: unknown } }
    return typeof parsed.source?.sessionID === "string" ? parsed.source.sessionID : "unknown"
  } catch {
    return "unknown"
  }
}

export async function getTransferRecord(
  sourceDirectory: string,
  transferID: string,
  options: { fileSystem?: WriterFileSystem; signal?: AbortSignal; isProcessAlive?: (pid: number) => boolean } = {},
): Promise<HandoffTransferRecord | undefined> {
  const fs = options.fileSystem ?? liveFileSystem
  const root = normalizeRoot(sourceDirectory)
  await ensureExistingSafeDirectory(fs, path.resolve(sourceDirectory))
  const rootStat = await exists(fs, root)
  if (!rootStat) return undefined
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
    throw new GoalDocsWriteError("symlink", `unsafe goal-docs directory: ${root}`)
  }
  throwIfAborted(options.signal)
  const manifest = await readManifest(fs, root, options.signal)
  return manifest.transfers[transferID]
}

export async function updateTransferRecord(
  sourceDirectory: string,
  transferID: string,
  update: (previous: HandoffTransferRecord | undefined) => HandoffTransferRecord,
  options: { fileSystem?: WriterFileSystem; signal?: AbortSignal; isProcessAlive?: (pid: number) => boolean } = {},
): Promise<HandoffTransferRecord> {
  const fs = options.fileSystem ?? liveFileSystem
  const root = normalizeRoot(sourceDirectory)
  return withRootLock(fs, root, async () => {
    throwIfAborted(options.signal)
    const manifest = await readManifest(fs, root, options.signal)
    const payload = cloneManifest(manifest)
    const next = update(payload.transfers[transferID])
    if (next.transferID !== transferID || !validTransfer(next)) {
      throw new GoalDocsWriteError("invalid_manifest", "invalid handoff transfer update")
    }
    payload.transfers[transferID] = next
    await persistManifest(fs, root, withIntegrity(payload), options.signal)
    return next
  }, options)
}

export function createTransferID(sourceSessionID: string, goalID: string, planRevision: number, fingerprint: string): string {
  return `goalhandoff_${sha256(`${sourceSessionID}\0${goalID}\0${planRevision}\0${fingerprint}`).slice(0, 40)}`
}

export function createMessageID(transferID: string): string {
  return `msg_goal_docs_${sha256(transferID).slice(0, 32)}`
}

export function createTargetSessionID(transferID: string): string {
  return `ses_goal_docs_${sha256(transferID).slice(0, 32)}`
}
