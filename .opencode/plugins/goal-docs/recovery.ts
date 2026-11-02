import { constants as fsConstants, type Stats } from "node:fs"
import { lstat, mkdir, open, readdir, rename, unlink } from "node:fs/promises"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"

import { acquireProcessLock } from "./process-lock.ts"
import { throwIfAborted } from "./abort.ts"
import { buildGoalDocBundle, safeReadmeTitle } from "./render.ts"
import {
  GOAL_STATUSES,
  parseSessionGoalState,
  safeGoalDirectoryName,
  semanticFingerprint,
  sha256,
  type ExportSource,
  type GoalRecord,
  type RepositoryMetadata,
} from "./model.ts"
import { describeRepository } from "./repository.ts"

export const RECOVERY_MANIFEST = ".goal-docs-manifest.json"
export const RECOVERY_PROCESS_LOCK = ".goal-docs-process.lock"

const MANAGED_START = "<!-- goal-docs:managed:start -->"
const MANAGED_END = "<!-- goal-docs:managed:end -->"
const GENERATED_NAMES = ["plan.md", "HANDOFF.md", "work-history.md", "snapshot.json"] as const
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
const MAX_DOCUMENT_BYTES = 512 * 1024
const MAX_ARCHIVE_BYTES = 32 * 1024 * 1024
const MAX_MANIFEST_FILES = 2_000
const MAX_GOALS = 500
const MAX_TRANSFERS = 200
const SESSION_ID = /^ses_[A-Za-z0-9_-]{1,196}$/
const SHA256 = /^[a-f0-9]{64}$/
const ARCHIVE_NOTICES = new Set([
  "Goal state version 1 has no archive collection. Cleared/replaced goal history cannot be reconstructed from this source.",
  "The source retains the maximum per-session archive count; earlier cleared/replaced goals may have been pruned.",
  "Only retained archived goals are available. The plugin also bounds archives globally, so full historical completeness cannot be proven.",
])

type RecoveryCode = "invalid_input" | "invalid_snapshot" | "invalid_manifest" | "mismatch" | "unsafe_path" |
  "bounds" | "concurrent" | "authorization_required" | "invalid_preview" | "invalid_journal" | "io"

export class GoalDocsRecoveryError extends Error {
  readonly code: RecoveryCode

  constructor(code: RecoveryCode, message: string) {
    super(message)
    this.name = "GoalDocsRecoveryError"
    this.code = code
  }
}

export interface RecoveryRequest {
  repositoryRoot: string
  goalID: string
  sessionID: string
  backupDirectory: string
}

export interface RecoveryPreview {
  readonly previewID: string
  readonly operation: "restore-frozen-snapshot-header"
  readonly repositoryRoot: string
  readonly docsDirectory: string
  readonly goalID: string
  readonly sessionID: string
  readonly repositoryIdentity: string
  readonly worktreeIdentity: string
  readonly snapshotSha256: string
  readonly manifestIntegrity: string
  readonly manifestSha256: string
  readonly originalPlanSha256: string
  readonly expectedPlanSha256: string
  readonly readmeManagedBlockSha256: string
  readonly readmeWholeFileSha256: string
  readonly otherOwnedFiles: Readonly<Record<string, string>>
  readonly backupDirectory: string
}

export interface RecoveryAuthorizationRequest {
  action: "apply" | "rollback"
  operation: "restore-frozen-snapshot-header"
  repositoryRoot: string
  docsDirectory: string
  backupDirectory: string
  goalID: string
  sessionID: string
  repositoryIdentity: string
  worktreeIdentity: string
  snapshotSha256: string
  manifestIntegrity: string
  originalPlanSha256: string
  expectedPlanSha256: string
  journalPath?: string
}

export type RecoveryAuthorizer = (request: RecoveryAuthorizationRequest) => Promise<unknown>

export interface RecoveryDependencies {
  repositoryMetadata?(directory: string, signal?: AbortSignal): Promise<RepositoryMetadata>
}

export interface RecoveryApplyResult {
  status: "applied"
  journalPath: string
  backupDirectory: string
  restoredPath: string
  originalPlanSha256: string
  restoredPlanSha256: string
}

export interface RecoveryRollbackResult {
  status: "rolled_back" | "already_rolled_back"
  journalPath: string
  restoredPath: string
}

interface FileSignature {
  dev: number
  ino: number
  mode: number
  nlink: number
  size: number
  mtimeMs: number
  ctimeMs: number
}

interface SafeFile {
  bytes: Buffer
  text: string
  signature: FileSignature
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

interface TransferRecord {
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

interface ManifestPayload {
  version: 1
  owner: "goal-docs"
  files: Record<string, string>
  goals: Record<string, GoalIndexRecord>
  transfers: Record<string, TransferRecord>
}

interface Manifest extends ManifestPayload {
  integrity: string
}

interface TargetObservation {
  relative: string
  wholeSha256: string
  ownedSha256: string
  signature: FileSignature
  bytes: Buffer
}

interface Inspection {
  request: RecoveryRequest
  repositoryRoot: string
  docsDirectory: string
  planRelative: string
  planPath: string
  source: ExportSource
  goal: GoalRecord
  planExpected: Buffer
  planOriginal: Buffer
  planExpectedSha256: string
  planOriginalSha256: string
  snapshotSha256: string
  manifest: Manifest
  manifestSha256: string
  readmeWholeSha256: string
  readmeOwnedSha256: string
  observations: Map<string, TargetObservation>
  fingerprint: string
  repository: RepositoryMetadata
}

interface InternalPreview {
  inspection: Inspection
  preview: RecoveryPreview
  dependencies: RecoveryDependencies
}

interface JournalFile {
  sha256: string
  ownedSha256: string
  signature: FileSignature
}

type JournalPhase = "prepared" | "publishing" | "committed" | "rolled_back"

interface JournalPayload {
  version: 1
  owner: "goal-docs-recovery"
  transactionID: string
  phase: JournalPhase
  repositoryRoot: string
  docsDirectory: string
  backupDirectory: string
  goalID: string
  sessionID: string
  repositoryIdentity: string
  worktreeIdentity: string
  snapshotSha256: string
  manifestIntegrity: string
  expectedPlanSha256: string
  planRelative: string
  files: Record<string, JournalFile>
  targetPlanAfter?: FileSignature
  rollbackPlanAfter?: FileSignature
  createdAt: string
}

interface Journal extends JournalPayload {
  integrity: string
}

interface ParsedSnapshot {
  source: ExportSource
  goal: GoalRecord
  historyNotice: string
  generatedFiles: Record<string, string>
}

const previews = new WeakMap<object, InternalPreview>()

function fail(code: RecoveryCode, message: string): never {
  throw new GoalDocsRecoveryError(code, message)
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (record(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

function signature(stat: Stats): FileSignature {
  return {
    dev: stat.dev,
    ino: stat.ino,
    mode: stat.mode,
    nlink: stat.nlink,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
    ctimeMs: stat.ctimeMs,
  }
}

function sameSignature(left: FileSignature, right: FileSignature): boolean {
  return stable(left) === stable(right)
}

function isMissing(error: unknown): boolean {
  return record(error) && error.code === "ENOENT"
}

function normalizedAbsolute(value: unknown, label: string): string {
  if (typeof value !== "string" || !path.isAbsolute(value) || value.includes("\0") || value.length > 4_096) {
    fail("invalid_input", `${label} must be a bounded absolute path`)
  }
  return path.resolve(value)
}

function validateGoalID(value: unknown): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 200 || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    fail("invalid_input", "goal ID is malformed")
  }
  try {
    safeGoalDirectoryName(value)
  } catch {
    fail("invalid_input", "goal ID is not safe to use as a documentation directory")
  }
  return value
}

function validateSessionID(value: unknown): string {
  if (typeof value !== "string" || !SESSION_ID.test(value)) fail("invalid_input", "source session ID is malformed")
  return value
}

function sha256Buffer(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex")
}

function utf8Hash(value: string): string {
  return sha256(value)
}

async function assertRealDirectory(directory: string): Promise<void> {
  const absolute = path.resolve(directory)
  const parsed = path.parse(absolute)
  let current = parsed.root
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part)
    let stat
    try {
      stat = await lstat(current)
    } catch (error) {
      if (isMissing(error)) fail("unsafe_path", `required directory does not exist: ${current}`)
      throw error
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("unsafe_path", `unsafe directory component: ${current}`)
  }
}

async function readSafeFile(filePath: string, limit: number): Promise<SafeFile> {
  await assertRealDirectory(path.dirname(filePath))
  let before
  try {
    before = await lstat(filePath)
  } catch (error) {
    if (isMissing(error)) fail("unsafe_path", `required file is missing: ${filePath}`)
    throw error
  }
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1) {
    fail("unsafe_path", `target must be a singly linked regular file: ${filePath}`)
  }
  if (before.size > limit) fail("bounds", `${filePath} exceeds its ${limit}-byte read limit`)

  // The path can become a FIFO after lstat; never wait for an untrusted writer.
  const handle = await open(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK)
  try {
    const opened = await handle.stat()
    if (!opened.isFile() || opened.nlink !== 1 || !sameSignature(signature(before), signature(opened))) {
      fail("concurrent", `file changed while it was opened: ${filePath}`)
    }
    const buffer = Buffer.alloc(limit + 1)
    let read = 0
    while (read < buffer.length) {
      const result = await handle.read(buffer, read, buffer.length - read, null)
      if (result.bytesRead === 0) break
      read += result.bytesRead
    }
    if (read > limit) fail("bounds", `${filePath} exceeds its ${limit}-byte read limit`)
    const after = await handle.stat()
    const current = await lstat(filePath)
    if (!sameSignature(signature(opened), signature(after)) || !sameSignature(signature(opened), signature(current))) {
      fail("concurrent", `file changed while it was read: ${filePath}`)
    }
    const bytes = buffer.subarray(0, read)
    let text: string
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    } catch {
      fail("invalid_snapshot", `${filePath} is not valid UTF-8`)
    }
    return { bytes: Buffer.from(bytes), text, signature: signature(current) }
  } finally {
    await handle.close()
  }
}

async function readOptionalSafeFile(filePath: string, limit: number): Promise<SafeFile | undefined> {
  try {
    return await readSafeFile(filePath, limit)
  } catch (error) {
    if (error instanceof GoalDocsRecoveryError && error.code === "unsafe_path" && error.message.startsWith("required file is missing:")) {
      return undefined
    }
    throw error
  }
}

function validSafeRelativeFile(value: string): boolean {
  if (!value || value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false
  return value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
}

function generatedRelative(value: string): boolean {
  return value === "README.md" || /^(?:[A-Za-z0-9._-]{1,200}\/(?:plan\.md|HANDOFF\.md|work-history\.md|snapshot\.json))$/.test(value)
}

function manifestIntegrity(payload: ManifestPayload): string {
  return sha256(JSON.stringify(payload))
}

function validGoalIndex(directoryName: string, value: unknown): value is GoalIndexRecord {
  if (!record(value)) return false
  try {
    if (safeGoalDirectoryName(String(value.goalID)) !== directoryName) return false
  } catch {
    return false
  }
  return typeof value.goalID === "string" && value.goalID.length <= 200 &&
    typeof value.sourceSessionID === "string" && value.sourceSessionID.length <= 200 &&
    typeof value.sourceDirectory === "string" && path.isAbsolute(value.sourceDirectory) && value.sourceDirectory.length <= 4_096 &&
    typeof value.status === "string" && GOAL_STATUSES.includes(value.status as (typeof GOAL_STATUSES)[number]) &&
    typeof value.planRevision === "number" && Number.isSafeInteger(value.planRevision) && value.planRevision >= 0 &&
    typeof value.title === "string" && value.title.length <= 200 &&
    typeof value.contentFingerprint === "string" && SHA256.test(value.contentFingerprint) &&
    typeof value.planFingerprint === "string" && SHA256.test(value.planFingerprint)
}

function validTransfer(value: unknown): value is TransferRecord {
  if (!record(value)) return false
  return typeof value.transferID === "string" && /^goalhandoff_[a-f0-9]{40}$/.test(value.transferID) &&
    typeof value.sourceSessionID === "string" && value.sourceSessionID.length <= 200 &&
    typeof value.goalID === "string" && value.goalID.length <= 200 &&
    typeof value.planRevision === "number" && Number.isSafeInteger(value.planRevision) && value.planRevision >= 0 &&
    typeof value.sourceFingerprint === "string" && SHA256.test(value.sourceFingerprint) &&
    (value.targetSessionID === null || (typeof value.targetSessionID === "string" && value.targetSessionID.length <= 200)) &&
    typeof value.messageID === "string" && /^msg_goal_docs_[a-f0-9]{32}$/.test(value.messageID) &&
    ["export", "create", "seed", "open"].includes(String(value.phase)) &&
    ["in_progress", "complete", "failed"].includes(String(value.status)) &&
    typeof value.updatedAt === "number" && Number.isFinite(value.updatedAt) &&
    (value.error === undefined || (typeof value.error === "string" && value.error.length <= 2_000)) &&
    (value.leaseUntil === undefined || (typeof value.leaseUntil === "number" && Number.isFinite(value.leaseUntil))) &&
    (value.leaseToken === undefined || (typeof value.leaseToken === "string" && value.leaseToken.length <= 100))
}

function parseManifest(text: string): Manifest {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail("invalid_manifest", "goal-docs ownership manifest is not valid JSON")
  }
  if (!record(parsed) || parsed.version !== 1 || parsed.owner !== "goal-docs" ||
    !record(parsed.files) || !record(parsed.goals) || !record(parsed.transfers) || typeof parsed.integrity !== "string") {
    fail("invalid_manifest", "goal-docs ownership manifest has an unsupported shape")
  }
  const payload: ManifestPayload = {
    version: 1,
    owner: "goal-docs",
    files: parsed.files as Record<string, string>,
    goals: parsed.goals as Record<string, GoalIndexRecord>,
    transfers: parsed.transfers as Record<string, TransferRecord>,
  }
  if (Object.keys(payload.files).length > MAX_MANIFEST_FILES || Object.keys(payload.goals).length > MAX_GOALS ||
    Object.keys(payload.transfers).length > MAX_TRANSFERS) {
    fail("bounds", "goal-docs manifest exceeds its entry-count limit")
  }
  for (const [relative, digest] of Object.entries(payload.files)) {
    if (!validSafeRelativeFile(relative) || !generatedRelative(relative) || typeof digest !== "string" || !SHA256.test(digest)) {
      fail("invalid_manifest", "goal-docs ownership manifest contains an unsafe file entry")
    }
  }
  for (const [directoryName, item] of Object.entries(payload.goals)) {
    if (!/^[A-Za-z0-9._-]{1,200}$/.test(directoryName) || directoryName === "." || directoryName === ".." ||
      !validGoalIndex(directoryName, item)) {
      fail("invalid_manifest", "goal-docs ownership manifest contains an invalid goal index entry")
    }
  }
  for (const [transferID, transfer] of Object.entries(payload.transfers)) {
    if (!validTransfer(transfer) || transfer.transferID !== transferID) {
      fail("invalid_manifest", "goal-docs ownership manifest contains an invalid transfer")
    }
  }
  if (!SHA256.test(parsed.integrity) || parsed.integrity !== manifestIntegrity(payload)) {
    fail("invalid_manifest", "goal-docs ownership manifest integrity check failed")
  }
  return { ...payload, integrity: parsed.integrity }
}

function managedReadmeBlock(text: string): string {
  const start = text.indexOf(MANAGED_START)
  const end = text.indexOf(MANAGED_END)
  if (start < 0 || end < start || text.indexOf(MANAGED_START, start + 1) >= 0 || text.indexOf(MANAGED_END, end + 1) >= 0) {
    fail("invalid_manifest", "README managed section is missing or ambiguous")
  }
  return text.slice(start, end + MANAGED_END.length)
}

function validateRepositoryMetadata(value: unknown): RepositoryMetadata {
  if (!record(value) || value.kind !== "git" || typeof value.identity !== "string" || !value.identity ||
    typeof value.worktree !== "string" || !value.worktree || typeof value.scope !== "string" || !value.scope ||
    !Array.isArray(value.gaps) || value.gaps.length !== 0) {
    fail("invalid_snapshot", "snapshot does not contain a complete repository and worktree identity")
  }
  if (value.identity.length > 2_048 || value.worktree.length > 2_048 || value.scope.length > 4_096) {
    fail("bounds", "snapshot repository identity exceeds its bounds")
  }
  return {
    kind: "git",
    identity: value.identity,
    worktree: value.worktree,
    scope: value.scope,
    gaps: [],
  }
}

function validateSnapshot(snapshotText: string, goalID: string, sessionID: string): { parsed: ParsedSnapshot; bundle: ReturnType<typeof buildGoalDocBundle> } {
  let raw: unknown
  try {
    raw = JSON.parse(snapshotText)
  } catch {
    fail("invalid_snapshot", "snapshot.json is not valid JSON")
  }
  if (!record(raw) || raw.schemaVersion !== 1 || raw.renderVersion !== 1 || !record(raw.source) || !record(raw.goal) ||
    typeof raw.historyNotice !== "string" || raw.historyNotice.length > 4_096 || !record(raw.generatedFiles)) {
    fail("invalid_snapshot", "snapshot has an unsupported shape")
  }
  const sourceRaw = raw.source
  if (typeof sourceRaw.sessionID !== "string" || sourceRaw.sessionID !== sessionID || !SESSION_ID.test(sourceRaw.sessionID) ||
    typeof sourceRaw.directory !== "string" || !path.isAbsolute(sourceRaw.directory) || path.resolve(sourceRaw.directory) !== sourceRaw.directory || sourceRaw.directory.length > 4_096 ||
    typeof sourceRaw.exportedAt !== "string" || Number.isNaN(Date.parse(sourceRaw.exportedAt)) ||
    new Date(sourceRaw.exportedAt).toISOString() !== sourceRaw.exportedAt) {
    fail("invalid_snapshot", "snapshot source identity or export time is malformed")
  }
  const repository = validateRepositoryMetadata(sourceRaw.repository)
  const source: ExportSource = {
    sessionID: sourceRaw.sessionID,
    directory: sourceRaw.directory,
    exportedAt: sourceRaw.exportedAt,
    repository,
  }

  const rawGoal = raw.goal
  if (rawGoal.id !== goalID || rawGoal.sessionID !== sessionID || (rawGoal.sourceKind !== "current" && rawGoal.sourceKind !== "archive")) {
    fail("invalid_snapshot", "snapshot goal/session identity does not match the requested target")
  }
  const state = parseSessionGoalState({
    version: 3,
    goals: rawGoal.sourceKind === "current" ? { [sessionID]: rawGoal } : {},
    archives: rawGoal.sourceKind === "archive" ? { [sessionID]: [rawGoal] } : {},
  }, sessionID)
  const parsedGoal = rawGoal.sourceKind === "current" ? state.current : state.archives[0]
  if (!parsedGoal || parsedGoal.id !== goalID || parsedGoal.sessionID !== sessionID ||
    stable(parsedGoal) !== stable(rawGoal) || raw.contentFingerprint !== semanticFingerprint([parsedGoal])) {
    fail("invalid_snapshot", "snapshot goal content or fingerprint is not canonical")
  }
  const goalNotice = parsedGoal.historyNotice
  const suffix = ` ${goalNotice}`
  if (!raw.historyNotice.endsWith(suffix)) fail("invalid_snapshot", "snapshot history notice is not canonical")
  const archiveNotice = raw.historyNotice.slice(0, -suffix.length)
  if (!ARCHIVE_NOTICES.has(archiveNotice)) fail("invalid_snapshot", "snapshot archive notice is not a supported frozen notice")

  const expectedGeneratedNames = ["plan.md", "HANDOFF.md", "work-history.md"]
  const generatedFiles: Record<string, string> = {}
  for (const name of expectedGeneratedNames) {
    const digest = raw.generatedFiles[name]
    if (typeof digest !== "string" || !SHA256.test(digest)) fail("invalid_snapshot", `snapshot hash for ${name} is malformed`)
    generatedFiles[name] = digest
  }
  if (Object.keys(raw.generatedFiles).length !== expectedGeneratedNames.length) {
    fail("invalid_snapshot", "snapshot generated-file map has unexpected entries")
  }
  const bundle = buildGoalDocBundle(source, parsedGoal, archiveNotice)
  if (bundle.files["snapshot.json"] !== snapshotText) {
    fail("invalid_snapshot", "snapshot bytes do not match canonical snapshot rendering")
  }
  for (const name of expectedGeneratedNames) {
    if (sha256(bundle.files[name]) !== generatedFiles[name]) {
      fail("invalid_snapshot", `canonical renderer disagrees with snapshot.generatedFiles for ${name}`)
    }
  }
  return {
    parsed: { source, goal: parsedGoal, historyNotice: archiveNotice, generatedFiles },
    bundle,
  }
}

function validateHeaderOnlyDifference(actual: string, expected: string): void {
  const actualLines = actual.split("\n")
  const expectedLines = expected.split("\n")
  if (actualLines.length !== expectedLines.length) fail("mismatch", "plan body differs from the frozen snapshot rendering")
  const differences: number[] = []
  for (let index = 0; index < actualLines.length; index += 1) {
    if (actualLines[index] !== expectedLines[index]) differences.push(index)
  }
  if (differences.length !== 1) fail("mismatch", "plan differs beyond one export-time header line")
  const index = differences[0]
  if (!expectedLines[index].startsWith("- Exported at: `") || !expectedLines[index].endsWith("`")) {
    fail("mismatch", "the only differing plan line is not the canonical export-time header")
  }
  const actualMatch = /^- Exported at: `([^`\r\n]+)`$/.exec(actualLines[index])
  const expectedMatch = /^- Exported at: `([^`\r\n]+)`$/.exec(expectedLines[index])
  if (!actualMatch || !expectedMatch || actualMatch[1] === expectedMatch[1] ||
    Number.isNaN(Date.parse(actualMatch[1])) || new Date(actualMatch[1]).toISOString() !== actualMatch[1]) {
    fail("mismatch", "the allowed export-time header transformation is malformed")
  }
  actualLines[index] = expectedLines[index]
  if (actualLines.join("\n") !== expected) fail("mismatch", "plan is not byte-identical after the one allowed header restoration")
}

function verifyManifestBundleShape(manifest: Manifest): void {
  if (!manifest.files["README.md"]) fail("invalid_manifest", "manifest does not own the README managed block")
  if (Object.keys(manifest.files).length !== 1 + Object.keys(manifest.goals).length * GENERATED_NAMES.length) {
    fail("invalid_manifest", "manifest file and goal counts are inconsistent")
  }
  for (const directoryName of Object.keys(manifest.goals)) {
    for (const name of GENERATED_NAMES) {
      if (!manifest.files[`${directoryName}/${name}`]) fail("invalid_manifest", `manifest is missing ${directoryName}/${name}`)
    }
  }
}

function targetPaths(docsDirectory: string, goalID: string): { directory: string; relative: string; plan: string; snapshot: string } {
  const directoryName = safeGoalDirectoryName(goalID)
  const directory = path.join(docsDirectory, directoryName)
  return {
    directory,
    relative: `${directoryName}/plan.md`,
    plan: path.join(directory, "plan.md"),
    snapshot: path.join(directory, "snapshot.json"),
  }
}

async function repositoryMetadata(directory: string, dependencies: RecoveryDependencies, signal?: AbortSignal): Promise<RepositoryMetadata> {
  throwIfAborted(signal)
  const result = await (dependencies.repositoryMetadata ?? ((target, currentSignal) => describeRepository(target, { signal: currentSignal })))(directory, signal)
  throwIfAborted(signal)
  return result
}

function assertMetadataEqual(expected: RepositoryMetadata, actual: RepositoryMetadata, label: string): void {
  if (stable(expected) !== stable(actual)) fail("invalid_snapshot", `${label} repository/worktree identity does not match the frozen snapshot`)
}

function observationFingerprint(observations: Map<string, TargetObservation>): Record<string, unknown> {
  return Object.fromEntries([...observations].sort(([left], [right]) => left.localeCompare(right)).map(([relative, item]) => [relative, {
    wholeSha256: item.wholeSha256,
    ownedSha256: item.ownedSha256,
    signature: item.signature,
  }]))
}

async function inspect(requestInput: RecoveryRequest, dependencies: RecoveryDependencies, signal?: AbortSignal): Promise<Inspection> {
  throwIfAborted(signal)
  const repositoryRoot = normalizedAbsolute(requestInput.repositoryRoot, "repository root")
  const goalID = validateGoalID(requestInput.goalID)
  const sessionID = validateSessionID(requestInput.sessionID)
  const backupDirectory = normalizedAbsolute(requestInput.backupDirectory, "backup directory")
  const docsDirectory = path.join(repositoryRoot, "docs", "goals")
  const paths = targetPaths(docsDirectory, goalID)

  await assertRealDirectory(repositoryRoot)
  await assertRealDirectory(docsDirectory)
  await assertRealDirectory(paths.directory)
  await assertRealDirectory(backupDirectory)
  const targetEntries = await readdir(paths.directory)
  if (targetEntries.some((name) => name.startsWith(".plan.md.goal-docs-recovery-") && name.endsWith(".tmp"))) {
    fail("invalid_journal", "an interrupted recovery publication temporary exists beside the target plan")
  }
  const backupFromDocs = path.relative(docsDirectory, backupDirectory)
  if (backupFromDocs === "" || (!path.isAbsolute(backupFromDocs) && backupFromDocs !== ".." && !backupFromDocs.startsWith(`..${path.sep}`))) {
    fail("unsafe_path", "backup directory must be outside docs/goals")
  }

  const metadata = validateRepositoryMetadata(await repositoryMetadata(repositoryRoot, dependencies, signal))
  const snapshotFile = await readSafeFile(paths.snapshot, MAX_DOCUMENT_BYTES)
  const snapshotValidation = validateSnapshot(snapshotFile.text, goalID, sessionID)
  if (snapshotValidation.parsed.source.directory !== repositoryRoot) {
    fail("invalid_snapshot", "snapshot exact source directory does not match the selected repository root")
  }
  await assertRealDirectory(snapshotValidation.parsed.source.directory)
  assertMetadataEqual(snapshotValidation.parsed.source.repository, metadata, "target worktree")
  const sourceMetadata = validateRepositoryMetadata(await repositoryMetadata(snapshotValidation.parsed.source.directory, dependencies, signal))
  assertMetadataEqual(snapshotValidation.parsed.source.repository, sourceMetadata, "snapshot source")

  const manifestPath = path.join(docsDirectory, RECOVERY_MANIFEST)
  const manifestFile = await readSafeFile(manifestPath, MAX_MANIFEST_BYTES)
  const manifest = parseManifest(manifestFile.text)
  verifyManifestBundleShape(manifest)
  const directoryName = safeGoalDirectoryName(goalID)
  const goalRecord = manifest.goals[directoryName]
  if (!goalRecord || goalRecord.goalID !== goalID || goalRecord.sourceSessionID !== sessionID ||
    goalRecord.sourceDirectory !== snapshotValidation.parsed.source.directory || goalRecord.status !== snapshotValidation.parsed.goal.status ||
    goalRecord.planRevision !== snapshotValidation.parsed.goal.planRevision ||
    goalRecord.contentFingerprint !== semanticFingerprint([snapshotValidation.parsed.goal])) {
    fail("invalid_manifest", "manifest goal index does not match the frozen snapshot identity")
  }
  const expectedPlanHash = sha256(snapshotValidation.bundle.files["plan.md"])
  if (goalRecord.planFingerprint !== sha256(JSON.stringify(snapshotValidation.parsed.goal.plan))) {
    fail("invalid_manifest", "manifest plan fingerprint does not match the frozen snapshot")
  }
  if (manifest.files[paths.relative] !== expectedPlanHash || snapshotValidation.parsed.generatedFiles["plan.md"] !== expectedPlanHash) {
    fail("invalid_manifest", "manifest and snapshot do not own the canonical frozen plan bytes")
  }

  const observations = new Map<string, TargetObservation>()
  let totalBytes = manifestFile.bytes.length
  const manifestDigest = sha256Buffer(manifestFile.bytes)
  observations.set(RECOVERY_MANIFEST, {
    relative: RECOVERY_MANIFEST,
    wholeSha256: manifestDigest,
    ownedSha256: manifestDigest,
    signature: manifestFile.signature,
    bytes: manifestFile.bytes,
  })
  for (const [relative, expectedOwnedHash] of Object.entries(manifest.files).sort(([left], [right]) => left.localeCompare(right))) {
    throwIfAborted(signal)
    const absolute = path.join(docsDirectory, relative)
    if (path.relative(docsDirectory, absolute).startsWith(`..${path.sep}`) || !validSafeRelativeFile(relative)) {
      fail("unsafe_path", `manifest path escapes docs/goals: ${relative}`)
    }
    const file = await readSafeFile(absolute, relative === RECOVERY_MANIFEST ? MAX_MANIFEST_BYTES : MAX_DOCUMENT_BYTES)
    totalBytes += file.bytes.length
    if (totalBytes > MAX_ARCHIVE_BYTES) fail("bounds", "manifest-owned archive exceeds the recovery read budget")
    const wholeSha256 = sha256Buffer(file.bytes)
    const ownedSha256 = relative === "README.md" ? utf8Hash(managedReadmeBlock(file.text)) : wholeSha256
    const isAllowedTargetMismatch = relative === paths.relative && wholeSha256 !== expectedOwnedHash
    if (!isAllowedTargetMismatch && ownedSha256 !== expectedOwnedHash) {
      fail("mismatch", `manifest-owned file does not match its recorded hash: ${relative}`)
    }
    observations.set(relative, { relative, wholeSha256, ownedSha256, signature: file.signature, bytes: file.bytes })
  }

  const bundleFiles: Record<string, string> = {}
  for (const name of GENERATED_NAMES) {
    const relative = `${directoryName}/${name}`
    const observed = observations.get(relative)
    if (!observed) fail("invalid_manifest", `manifest omits target bundle file ${relative}`)
    bundleFiles[name] = observed.bytes.toString("utf8")
    if (name !== "plan.md" && sha256(bundleFiles[name]) !== manifest.files[relative]) {
      fail("mismatch", `target sibling does not match its owned hash: ${relative}`)
    }
  }
  for (const name of ["HANDOFF.md", "work-history.md"] as const) {
    if (snapshotValidation.parsed.generatedFiles[name] !== manifest.files[`${directoryName}/${name}`]) {
      fail("invalid_manifest", `snapshot and manifest disagree about ${name}`)
    }
  }
  if (bundleFiles["snapshot.json"] !== snapshotFile.text) fail("concurrent", "snapshot changed during recovery inspection")
  if (bundleFiles["plan.md"] === snapshotValidation.bundle.files["plan.md"]) {
    fail("mismatch", "the frozen plan already matches; no recovery is required")
  }
  validateHeaderOnlyDifference(bundleFiles["plan.md"], snapshotValidation.bundle.files["plan.md"])

  const index = manifest.goals[directoryName]
  if (index.title !== safeReadmeTitle(snapshotValidation.parsed.goal.objective)) {
    fail("invalid_manifest", "manifest goal title does not match the frozen snapshot")
  }
  const readme = observations.get("README.md")
  if (!readme || readme.ownedSha256 !== manifest.files["README.md"]) fail("invalid_manifest", "README managed-block hash is invalid")

  const snapshotSha256 = sha256Buffer(snapshotFile.bytes)
  const manifestSha256 = sha256Buffer(manifestFile.bytes)
  const fingerprint = sha256(stable({
    repositoryRoot,
    docsDirectory,
    backupDirectory,
    goalID,
    sessionID,
    repository: metadata,
    snapshotSha256,
    manifestSha256,
    manifestIntegrity: manifest.integrity,
    observations: observationFingerprint(observations),
  }))
  return {
    request: { repositoryRoot, goalID, sessionID, backupDirectory },
    repositoryRoot,
    docsDirectory,
    planRelative: paths.relative,
    planPath: paths.plan,
    source: snapshotValidation.parsed.source,
    goal: snapshotValidation.parsed.goal,
    planExpected: Buffer.from(snapshotValidation.bundle.files["plan.md"], "utf8"),
    planOriginal: Buffer.from(bundleFiles["plan.md"], "utf8"),
    planExpectedSha256: expectedPlanHash,
    planOriginalSha256: sha256Buffer(Buffer.from(bundleFiles["plan.md"], "utf8")),
    snapshotSha256,
    manifest,
    manifestSha256,
    readmeWholeSha256: readme.wholeSha256,
    readmeOwnedSha256: readme.ownedSha256,
    observations,
    fingerprint,
    repository: metadata,
  }
}

function recoveryAuthorization(inspection: Inspection, action: "apply" | "rollback", journalPath?: string): RecoveryAuthorizationRequest {
  const request: RecoveryAuthorizationRequest = {
    action,
    operation: "restore-frozen-snapshot-header",
    repositoryRoot: inspection.repositoryRoot,
    docsDirectory: inspection.docsDirectory,
    backupDirectory: inspection.request.backupDirectory,
    goalID: inspection.goal.id,
    sessionID: inspection.source.sessionID,
    repositoryIdentity: inspection.repository.identity as string,
    worktreeIdentity: inspection.repository.worktree as string,
    snapshotSha256: inspection.snapshotSha256,
    manifestIntegrity: inspection.manifest.integrity,
    originalPlanSha256: inspection.planOriginalSha256,
    expectedPlanSha256: inspection.planExpectedSha256,
    ...(journalPath ? { journalPath } : {}),
  }
  return Object.freeze(request)
}

function requireAuthorization(authorizer: RecoveryAuthorizer | undefined): RecoveryAuthorizer {
  if (typeof authorizer !== "function") fail("authorization_required", "a trusted host authorization callback is required")
  return authorizer
}

async function authorizeHost(authorizer: RecoveryAuthorizer, request: RecoveryAuthorizationRequest, signal?: AbortSignal): Promise<void> {
  throwIfAborted(signal)
  const result = await authorizer(request)
  throwIfAborted(signal)
  if (typeof result === "boolean") fail("authorization_required", "boolean values are not host authorization receipts")
}

function journalPayload(journal: JournalPayload): JournalPayload {
  return {
    version: 1,
    owner: "goal-docs-recovery",
    transactionID: journal.transactionID,
    phase: journal.phase,
    repositoryRoot: journal.repositoryRoot,
    docsDirectory: journal.docsDirectory,
    backupDirectory: journal.backupDirectory,
    goalID: journal.goalID,
    sessionID: journal.sessionID,
    repositoryIdentity: journal.repositoryIdentity,
    worktreeIdentity: journal.worktreeIdentity,
    snapshotSha256: journal.snapshotSha256,
    manifestIntegrity: journal.manifestIntegrity,
    expectedPlanSha256: journal.expectedPlanSha256,
    planRelative: journal.planRelative,
    files: journal.files,
    ...(journal.targetPlanAfter ? { targetPlanAfter: journal.targetPlanAfter } : {}),
    ...(journal.rollbackPlanAfter ? { rollbackPlanAfter: journal.rollbackPlanAfter } : {}),
    createdAt: journal.createdAt,
  }
}

function withJournalIntegrity(payload: JournalPayload): Journal {
  const value = journalPayload(payload)
  return { ...value, integrity: sha256(stable(value)) }
}

function validFileSignature(value: unknown): value is FileSignature {
  return record(value) && ["dev", "ino", "mode", "nlink", "size", "mtimeMs", "ctimeMs"].every((key) =>
    typeof value[key] === "number" && Number.isFinite(value[key])) && value.nlink === 1
}

function parseJournal(text: string, directory: string, backupDirectory: string): Journal {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    fail("invalid_journal", `recovery journal is malformed: ${directory}`)
  }
  if (!record(raw) || raw.version !== 1 || raw.owner !== "goal-docs-recovery" ||
    !["prepared", "publishing", "committed", "rolled_back"].includes(String(raw.phase)) ||
    typeof raw.transactionID !== "string" || !/^[a-f0-9-]{36}$/.test(raw.transactionID) ||
    typeof raw.repositoryRoot !== "string" || !path.isAbsolute(raw.repositoryRoot) ||
    typeof raw.docsDirectory !== "string" || !path.isAbsolute(raw.docsDirectory) ||
    raw.backupDirectory !== backupDirectory || typeof raw.goalID !== "string" || typeof raw.sessionID !== "string" ||
    !SESSION_ID.test(raw.sessionID) || typeof raw.repositoryIdentity !== "string" || typeof raw.worktreeIdentity !== "string" ||
    typeof raw.snapshotSha256 !== "string" || !SHA256.test(raw.snapshotSha256) ||
    typeof raw.manifestIntegrity !== "string" || !SHA256.test(raw.manifestIntegrity) ||
    typeof raw.expectedPlanSha256 !== "string" || !SHA256.test(raw.expectedPlanSha256) ||
    typeof raw.planRelative !== "string" || !validSafeRelativeFile(raw.planRelative) || !record(raw.files) ||
    typeof raw.createdAt !== "string" || Number.isNaN(Date.parse(raw.createdAt)) ||
    typeof raw.integrity !== "string" || !SHA256.test(raw.integrity)) {
    fail("invalid_journal", `recovery journal has an unsupported shape: ${directory}`)
  }
  let goalID: string
  try { goalID = validateGoalID(raw.goalID) }
  catch { fail("invalid_journal", "recovery journal goal ID is malformed") }
  const expectedNames = [".goal-docs-manifest.json", "README.md", ...GENERATED_NAMES.map((name) => `${safeGoalDirectoryName(goalID)}/${name}`)].sort()
  if (Object.keys(raw.files).sort().join("\0") !== expectedNames.join("\0")) {
    fail("invalid_journal", "recovery journal does not preserve the complete original bundle, README, and manifest")
  }
  const files: Record<string, JournalFile> = {}
  for (const [relative, item] of Object.entries(raw.files)) {
    if (!record(item) || typeof item.sha256 !== "string" || !SHA256.test(item.sha256) ||
      typeof item.ownedSha256 !== "string" || !SHA256.test(item.ownedSha256) || !validFileSignature(item.signature)) {
      fail("invalid_journal", `recovery journal contains an invalid original-file record: ${relative}`)
    }
    files[relative] = { sha256: item.sha256, ownedSha256: item.ownedSha256, signature: item.signature }
  }
  const payload: JournalPayload = {
    version: 1,
    owner: "goal-docs-recovery",
    transactionID: raw.transactionID,
    phase: raw.phase as JournalPhase,
    repositoryRoot: raw.repositoryRoot,
    docsDirectory: raw.docsDirectory,
    backupDirectory: raw.backupDirectory,
    goalID: raw.goalID,
    sessionID: raw.sessionID,
    repositoryIdentity: raw.repositoryIdentity,
    worktreeIdentity: raw.worktreeIdentity,
    snapshotSha256: raw.snapshotSha256,
    manifestIntegrity: raw.manifestIntegrity,
    expectedPlanSha256: raw.expectedPlanSha256,
    planRelative: raw.planRelative,
    files,
    ...(validFileSignature(raw.targetPlanAfter) ? { targetPlanAfter: raw.targetPlanAfter } : {}),
    ...(validFileSignature(raw.rollbackPlanAfter) ? { rollbackPlanAfter: raw.rollbackPlanAfter } : {}),
    createdAt: raw.createdAt,
  }
  const journal = withJournalIntegrity(payload)
  if (journal.integrity !== raw.integrity || stable(journal) !== stable(raw)) {
    fail("invalid_journal", "recovery journal integrity check failed")
  }
  if (path.basename(directory) !== `recovery-${journal.transactionID}` || journal.docsDirectory !== path.join(journal.repositoryRoot, "docs", "goals") ||
    path.resolve(journal.repositoryRoot) !== journal.repositoryRoot || path.resolve(journal.backupDirectory) !== journal.backupDirectory ||
    journal.planRelative !== `${safeGoalDirectoryName(journal.goalID)}/plan.md` ||
    (journal.phase === "committed" && !journal.targetPlanAfter)) {
    fail("invalid_journal", "recovery journal path identity is inconsistent")
  }
  return journal
}

function backupPath(directory: string, relative: string): string {
  const safe = relative === RECOVERY_MANIFEST ? "manifest.json" : relative === "README.md" ? "README.md" : `bundle/${relative}`
  return path.join(directory, "originals", safe)
}

async function ensureBackupCopies(directory: string, journal: Journal): Promise<void> {
  await assertRealDirectory(directory)
  await assertRealDirectory(path.join(directory, "originals"))
  const originals = new Map<string, SafeFile>()
  for (const [relative, item] of Object.entries(journal.files)) {
    const copy = await readSafeFile(backupPath(directory, relative), relative === RECOVERY_MANIFEST ? MAX_MANIFEST_BYTES : MAX_DOCUMENT_BYTES)
    originals.set(relative, copy)
    if (sha256Buffer(copy.bytes) !== item.sha256 || copy.bytes.length !== item.signature.size) {
      fail("invalid_journal", `preserved original failed hash verification: ${relative}`)
    }
    if (relative !== "README.md" && item.ownedSha256 !== item.sha256) {
      fail("invalid_journal", `preserved generated-file hash scope is invalid: ${relative}`)
    }
    if (relative === "README.md" && utf8Hash(managedReadmeBlock(copy.text)) !== item.ownedSha256) {
      fail("invalid_journal", "preserved README managed-block hash failed verification")
    }
    if (relative === RECOVERY_MANIFEST) await verifyManifestBytes(copy.bytes)
  }
  const snapshot = originals.get(`${safeGoalDirectoryName(journal.goalID)}/snapshot.json`)
  const savedManifest = originals.get(RECOVERY_MANIFEST)
  const savedPlan = originals.get(journal.planRelative)
  if (!snapshot || !savedManifest || !savedPlan || sha256Buffer(snapshot.bytes) !== journal.snapshotSha256) {
    fail("invalid_journal", "preserved snapshot does not match the journal identity")
  }
  const canonical = validateSnapshot(snapshot.text, journal.goalID, journal.sessionID)
  if (canonical.parsed.source.directory !== journal.repositoryRoot ||
    canonical.parsed.source.repository.identity !== journal.repositoryIdentity ||
    canonical.parsed.source.repository.worktree !== journal.worktreeIdentity) {
    fail("invalid_journal", "preserved snapshot repository/worktree identity differs from the journal")
  }
  const manifest = parseManifest(savedManifest.text)
  verifyManifestBundleShape(manifest)
  const index = manifest.goals[safeGoalDirectoryName(journal.goalID)]
  if (manifest.integrity !== journal.manifestIntegrity || !index ||
    index.goalID !== journal.goalID || index.sourceSessionID !== journal.sessionID ||
    index.sourceDirectory !== journal.repositoryRoot ||
    index.contentFingerprint !== semanticFingerprint([canonical.parsed.goal]) ||
    index.planFingerprint !== sha256(JSON.stringify(canonical.parsed.goal.plan)) ||
    index.status !== canonical.parsed.goal.status || index.planRevision !== canonical.parsed.goal.planRevision ||
    journal.expectedPlanSha256 !== sha256(canonical.bundle.files["plan.md"]) ||
    manifest.files[journal.planRelative] !== journal.expectedPlanSha256) {
    fail("invalid_journal", "preserved manifest and canonical snapshot disagree with the journal")
  }
  for (const [relative, copy] of originals) {
    if (relative === RECOVERY_MANIFEST || relative === journal.planRelative) continue
    const digest = relative === "README.md" ? utf8Hash(managedReadmeBlock(copy.text)) : sha256Buffer(copy.bytes)
    if (manifest.files[relative] !== digest) fail("invalid_journal", "preserved sibling differs from its manifest ownership")
  }
  validateHeaderOnlyDifference(savedPlan.text, canonical.bundle.files["plan.md"])
}

async function scanBackupDirectory(backupDirectory: string): Promise<void> {
  await assertRealDirectory(backupDirectory)
  const entries = await readdir(backupDirectory, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.name.startsWith("recovery-")) continue
    const transaction = path.join(backupDirectory, entry.name)
    if (!entry.isDirectory()) fail("unsafe_path", `unsafe recovery backup entry: ${transaction}`)
    await assertRealDirectory(transaction)
    const transactionEntries = await readdir(transaction)
    if (transactionEntries.some((name) => name.startsWith(".journal-") && name.endsWith(".goal-docs-recovery.tmp"))) {
      fail("invalid_journal", `recovery journal publication was interrupted: ${transaction}`)
    }
    const journalFile = await readOptionalSafeFile(path.join(transaction, "journal.json"), 128 * 1024)
    if (!journalFile) fail("invalid_journal", `recovery backup has no journal and may be interrupted: ${transaction}`)
    const journal = parseJournal(journalFile.text, transaction, backupDirectory)
    await ensureBackupCopies(transaction, journal)
    if (journal.phase === "prepared" || journal.phase === "publishing") {
      fail("invalid_journal", `unfinished recovery journal requires rollback or inspection: ${transaction}`)
    }
  }
}

export async function previewGoalDocRecovery(
  request: RecoveryRequest,
  dependencies: RecoveryDependencies = {},
  options: { signal?: AbortSignal } = {},
): Promise<RecoveryPreview> {
  throwIfAborted(options.signal)
  const backupDirectory = normalizedAbsolute(request.backupDirectory, "backup directory")
  await assertRealDirectory(backupDirectory)
  await scanBackupDirectory(backupDirectory)
  const inspection = await inspect(request, dependencies, options.signal)
  const directoryName = safeGoalDirectoryName(inspection.goal.id)
  const otherOwnedFiles = Object.fromEntries([...inspection.observations]
    .filter(([relative]) => relative !== inspection.planRelative)
    .map(([relative, item]) => [relative, item.ownedSha256]))
  const preview: RecoveryPreview = Object.freeze({
    previewID: randomUUID(),
    operation: "restore-frozen-snapshot-header",
    repositoryRoot: inspection.repositoryRoot,
    docsDirectory: inspection.docsDirectory,
    goalID: inspection.goal.id,
    sessionID: inspection.source.sessionID,
    repositoryIdentity: inspection.repository.identity as string,
    worktreeIdentity: inspection.repository.worktree as string,
    snapshotSha256: inspection.snapshotSha256,
    manifestIntegrity: inspection.manifest.integrity,
    manifestSha256: inspection.manifestSha256,
    originalPlanSha256: inspection.planOriginalSha256,
    expectedPlanSha256: inspection.planExpectedSha256,
    readmeManagedBlockSha256: inspection.readmeOwnedSha256,
    readmeWholeFileSha256: inspection.readmeWholeSha256,
    otherOwnedFiles: Object.freeze(otherOwnedFiles),
    backupDirectory: inspection.request.backupDirectory,
  })
  if (directoryName !== safeGoalDirectoryName(preview.goalID)) fail("invalid_preview", "preview target identity is inconsistent")
  previews.set(preview, { inspection, preview, dependencies })
  return preview
}

async function withExistingProcessLock<T>(target: { docsDirectory: string }, operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  throwIfAborted(signal)
  const lockPath = path.join(target.docsDirectory, RECOVERY_PROCESS_LOCK)
  const before = await readSafeFile(lockPath, 0)
  if (before.bytes.length !== 0 || before.signature.size !== 0 || before.signature.nlink !== 1) {
    fail("unsafe_path", "existing goal-docs kernel process lock is not an empty singly linked regular file")
  }
  const release = await acquireProcessLock(lockPath, signal)
  try {
    const after = await readSafeFile(lockPath, 0)
    if (!sameSignature(before.signature, after.signature)) fail("concurrent", "goal-docs process lock inode changed during acquisition")
    return await operation()
  } finally {
    await release()
  }
}

async function createDirectory(directory: string): Promise<void> {
  await mkdir(directory, { mode: 0o700 })
  await assertRealDirectory(directory)
}

async function syncDirectory(directory: string): Promise<void> {
  const handle = await open(directory, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0) | fsConstants.O_NOFOLLOW)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
}

async function createExclusiveFile(filePath: string, bytes: Buffer, limit = MAX_DOCUMENT_BYTES): Promise<void> {
  await assertRealDirectory(path.dirname(filePath))
  if (bytes.length > limit) fail("bounds", `backup file exceeds ${limit} bytes`)
  const handle = await open(filePath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } finally {
    await handle.close()
  }
  await syncDirectory(path.dirname(filePath))
}

async function writeJournal(directory: string, journalInput: JournalPayload, previousBytes?: Buffer): Promise<Buffer> {
  await assertRealDirectory(directory)
  const target = path.join(directory, "journal.json")
  const existing = await readOptionalSafeFile(target, 128 * 1024)
  if (previousBytes === undefined) {
    if (existing) fail("invalid_journal", "new recovery transaction unexpectedly already has a journal")
  } else if (!existing || !existing.bytes.equals(previousBytes)) {
    fail("concurrent", "recovery journal changed during the operation")
  }
  const journal = withJournalIntegrity(journalInput)
  const bytes = Buffer.from(`${JSON.stringify(journal, null, 2)}\n`, "utf8")
  if (bytes.length > 128 * 1024) fail("bounds", "recovery journal exceeds its write limit")
  const temporary = path.join(directory, `.journal-${randomUUID()}.goal-docs-recovery.tmp`)
  const handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }
  await handle.close()
  if (previousBytes !== undefined) {
    const current = await readSafeFile(target, 128 * 1024)
    if (!current.bytes.equals(previousBytes)) {
      await unlink(temporary).catch(() => undefined)
      fail("concurrent", "recovery journal changed before atomic publication")
    }
  }
  await rename(temporary, target)
  await syncDirectory(directory)
  return bytes
}

async function copyOriginals(transaction: string, inspection: Inspection, signal?: AbortSignal): Promise<Record<string, JournalFile>> {
  const originals = path.join(transaction, "originals")
  await createDirectory(originals)
  const bundleBackup = path.join(originals, "bundle")
  await createDirectory(bundleBackup)
  await createDirectory(path.join(bundleBackup, safeGoalDirectoryName(inspection.goal.id)))
  const files: Record<string, JournalFile> = {}
  for (const relative of [RECOVERY_MANIFEST, "README.md", ...GENERATED_NAMES.map((name) => `${safeGoalDirectoryName(inspection.goal.id)}/${name}`)]) {
    throwIfAborted(signal)
    const observation = inspection.observations.get(relative)
    if (!observation) fail("invalid_manifest", `cannot preserve missing original ${relative}`)
    const target = backupPath(transaction, relative)
    const directory = path.dirname(target)
    if (directory !== originals && directory !== bundleBackup) await assertRealDirectory(directory)
    await createExclusiveFile(target, observation.bytes, relative === RECOVERY_MANIFEST ? MAX_MANIFEST_BYTES : MAX_DOCUMENT_BYTES)
    const verified = await readSafeFile(target, relative === RECOVERY_MANIFEST ? MAX_MANIFEST_BYTES : MAX_DOCUMENT_BYTES)
    if (!verified.bytes.equals(observation.bytes) || sha256Buffer(verified.bytes) !== observation.wholeSha256) {
      fail("io", `backup copy verification failed for ${relative}`)
    }
    files[relative] = {
      sha256: observation.wholeSha256,
      ownedSha256: observation.ownedSha256,
      signature: observation.signature,
    }
  }
  return files
}

async function assertCas(inspection: Inspection, dependencies: RecoveryDependencies, signal?: AbortSignal): Promise<void> {
  const fresh = await inspect(inspection.request, dependencies, signal)
  if (fresh.fingerprint !== inspection.fingerprint) fail("concurrent", "archive or manifest changed after preview; no recovery was published")
}

async function recheckOriginalTargets(inspection: Inspection): Promise<void> {
  for (const [relative, expected] of inspection.observations) {
    const current = await readSafeFile(path.join(inspection.docsDirectory, relative), relative === RECOVERY_MANIFEST ? MAX_MANIFEST_BYTES : MAX_DOCUMENT_BYTES)
    if (!current.bytes.equals(expected.bytes) || !sameSignature(current.signature, expected.signature)) {
      fail("concurrent", `target changed during recovery: ${relative}`)
    }
  }
}

async function atomicReplace(filePath: string, bytes: Buffer, expectedBytes: Buffer, expectedSignature: FileSignature, signal?: AbortSignal): Promise<FileSignature> {
  throwIfAborted(signal)
  const directory = path.dirname(filePath)
  await assertRealDirectory(directory)
  const temporary = path.join(directory, `.${path.basename(filePath)}.goal-docs-recovery-${randomUUID()}.tmp`)
  const handle = await open(temporary, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600)
  try {
    await handle.writeFile(bytes)
    await handle.sync()
  } catch (error) {
    await handle.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }
  await handle.close()
  const target = await readSafeFile(filePath, MAX_DOCUMENT_BYTES)
  if (!target.bytes.equals(expectedBytes) || !sameSignature(target.signature, expectedSignature)) {
    await unlink(temporary).catch(() => undefined)
    fail("concurrent", `target changed before atomic publication: ${filePath}`)
  }
  throwIfAborted(signal)
  await rename(temporary, filePath)
  await syncDirectory(directory)
  const published = await readSafeFile(filePath, MAX_DOCUMENT_BYTES)
  if (!published.bytes.equals(bytes)) fail("io", `atomic publication did not preserve expected bytes: ${filePath}`)
  return published.signature
}

export async function applyGoalDocRecovery(
  preview: RecoveryPreview,
  options: {
    authorize?: RecoveryAuthorizer
    dependencies?: RecoveryDependencies
    signal?: AbortSignal
  } = {},
): Promise<RecoveryApplyResult> {
  throwIfAborted(options.signal)
  const privateState = previews.get(preview)
  if (!privateState || privateState.preview !== preview) fail("invalid_preview", "apply requires the exact preview object created in this process")
  const inspection = privateState.inspection
  const authorize = requireAuthorization(options.authorize)
  await authorizeHost(authorize, recoveryAuthorization(inspection, "apply"), options.signal)

  return withExistingProcessLock(inspection, async () => {
    const dependencies = options.dependencies ?? privateState.dependencies
    await assertCas(inspection, dependencies, options.signal)
    await scanBackupDirectory(inspection.request.backupDirectory)
    await recheckOriginalTargets(inspection)

    // Check cancellation before backup preparation; a later abort can still leave an incomplete backup for explicit inspection.
    throwIfAborted(options.signal)
    const transactionID = randomUUID()
    const transaction = path.join(inspection.request.backupDirectory, `recovery-${transactionID}`)
    await createDirectory(transaction)
    const files = await copyOriginals(transaction, inspection, options.signal)
    const createdAt = new Date().toISOString()
    const initialJournal: JournalPayload = {
      version: 1,
      owner: "goal-docs-recovery",
      transactionID,
      phase: "prepared",
      repositoryRoot: inspection.repositoryRoot,
      docsDirectory: inspection.docsDirectory,
      backupDirectory: inspection.request.backupDirectory,
      goalID: inspection.goal.id,
      sessionID: inspection.source.sessionID,
      repositoryIdentity: inspection.repository.identity as string,
      worktreeIdentity: inspection.repository.worktree as string,
      snapshotSha256: inspection.snapshotSha256,
      manifestIntegrity: inspection.manifest.integrity,
      expectedPlanSha256: inspection.planExpectedSha256,
      planRelative: inspection.planRelative,
      files,
      createdAt,
    }
    await ensureBackupCopies(transaction, withJournalIntegrity(initialJournal))
    let journal: JournalPayload = initialJournal
    // Preserve a usable rollback record before another cancellable CAS check.
    let journalBytes = await writeJournal(transaction, journal)
    await assertCas(inspection, dependencies, options.signal)
    await recheckOriginalTargets(inspection)
    throwIfAborted(options.signal)
    journal = { ...journal, phase: "publishing" }
    journalBytes = await writeJournal(transaction, journal, journalBytes)

    const planObservation = inspection.observations.get(inspection.planRelative)
    if (!planObservation) fail("invalid_manifest", "original plan observation is missing")
    const publishedSignature = await atomicReplace(inspection.planPath, inspection.planExpected, inspection.planOriginal, planObservation.signature, options.signal)
    const resultingPlan = await readSafeFile(inspection.planPath, MAX_DOCUMENT_BYTES)
    if (sha256Buffer(resultingPlan.bytes) !== inspection.planExpectedSha256) fail("io", "recovered plan hash does not match the frozen snapshot")
    await recheckUnchangedExceptPlan(inspection)
    journal = { ...journal, phase: "committed", targetPlanAfter: publishedSignature }
    journalBytes = await writeJournal(transaction, journal, journalBytes)
    const finalJournal = parseJournal(journalBytes.toString("utf8"), transaction, inspection.request.backupDirectory)
    await ensureBackupCopies(transaction, finalJournal)
    return {
      status: "applied",
      journalPath: path.join(transaction, "journal.json"),
      backupDirectory: transaction,
      restoredPath: inspection.planPath,
      originalPlanSha256: inspection.planOriginalSha256,
      restoredPlanSha256: inspection.planExpectedSha256,
    }
  }, options.signal)
}

async function recheckUnchangedExceptPlan(inspection: Inspection): Promise<void> {
  for (const [relative, expected] of inspection.observations) {
    if (relative === inspection.planRelative) continue
    const current = await readSafeFile(path.join(inspection.docsDirectory, relative), relative === RECOVERY_MANIFEST ? MAX_MANIFEST_BYTES : MAX_DOCUMENT_BYTES)
    if (!current.bytes.equals(expected.bytes) || !sameSignature(current.signature, expected.signature)) {
      fail("concurrent", `sibling target changed during recovery: ${relative}`)
    }
  }
}

async function readJournalAt(journalPathInput: string): Promise<{ path: string; directory: string; backupDirectory: string; journal: Journal; bytes: Buffer }> {
  const journalPath = normalizedAbsolute(journalPathInput, "journal path")
  const directory = path.dirname(journalPath)
  const backupDirectory = path.dirname(directory)
  await assertRealDirectory(backupDirectory)
  await assertRealDirectory(directory)
  const file = await readSafeFile(journalPath, 128 * 1024)
  const journal = parseJournal(file.text, directory, backupDirectory)
  const backupFromDocs = path.relative(journal.docsDirectory, journal.backupDirectory)
  if (backupFromDocs === "" || (!path.isAbsolute(backupFromDocs) && backupFromDocs !== ".." && !backupFromDocs.startsWith(`..${path.sep}`))) {
    fail("invalid_journal", "recovery journal backup directory is inside docs/goals")
  }
  await ensureBackupCopies(directory, journal)
  return { path: journalPath, directory, backupDirectory, journal, bytes: file.bytes }
}

async function currentJournalBytes(journalPath: string, expected: Buffer): Promise<void> {
  const current = await readSafeFile(journalPath, 128 * 1024)
  if (!current.bytes.equals(expected)) fail("concurrent", "recovery journal changed while rollback was being authorized")
}

async function loadCurrentOriginalSet(journal: Journal): Promise<Map<string, SafeFile>> {
  const current = new Map<string, SafeFile>()
  for (const relative of Object.keys(journal.files)) {
    current.set(relative, await readSafeFile(path.join(journal.docsDirectory, relative), relative === RECOVERY_MANIFEST ? MAX_MANIFEST_BYTES : MAX_DOCUMENT_BYTES))
  }
  return current
}

async function verifyManifestBytes(bytes: Buffer): Promise<void> {
  let text: string
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes) }
  catch { fail("invalid_manifest", "preserved manifest is not valid UTF-8") }
  parseManifest(text)
}

export async function rollbackGoalDocRecovery(
  journalPath: string,
  options: {
    authorize?: RecoveryAuthorizer
    dependencies?: RecoveryDependencies
    signal?: AbortSignal
  } = {},
): Promise<RecoveryRollbackResult> {
  throwIfAborted(options.signal)
  const initial = await readJournalAt(journalPath)
  const authorize = requireAuthorization(options.authorize)
  const authorization: RecoveryAuthorizationRequest = Object.freeze({
    action: "rollback",
    operation: "restore-frozen-snapshot-header",
    repositoryRoot: initial.journal.repositoryRoot,
    docsDirectory: initial.journal.docsDirectory,
    backupDirectory: initial.journal.backupDirectory,
    goalID: initial.journal.goalID,
    sessionID: initial.journal.sessionID,
    repositoryIdentity: initial.journal.repositoryIdentity,
    worktreeIdentity: initial.journal.worktreeIdentity,
    snapshotSha256: initial.journal.snapshotSha256,
    manifestIntegrity: initial.journal.manifestIntegrity,
    originalPlanSha256: initial.journal.files[initial.journal.planRelative].sha256,
    expectedPlanSha256: initial.journal.expectedPlanSha256,
    journalPath: initial.path,
  })
  await authorizeHost(authorize, authorization, options.signal)

  return withExistingProcessLock({ docsDirectory: initial.journal.docsDirectory }, async () => {
    const currentRepository = validateRepositoryMetadata(await repositoryMetadata(initial.journal.repositoryRoot, options.dependencies ?? {}, options.signal))
    if (currentRepository.identity !== initial.journal.repositoryIdentity || currentRepository.worktree !== initial.journal.worktreeIdentity) {
      fail("concurrent", "repository/worktree identity changed since recovery")
    }
    await currentJournalBytes(initial.path, initial.bytes)
    const reread = await readJournalAt(initial.path)
    if (!reread.bytes.equals(initial.bytes)) fail("concurrent", "recovery journal changed before rollback")
    const journal = reread.journal
    const current = await loadCurrentOriginalSet(journal)
    const plan = current.get(journal.planRelative)
    if (!plan) fail("invalid_journal", "recovery plan target is missing")
    const targetMustBeOriginal = journal.phase === "prepared" || (journal.phase === "publishing" &&
      plan.bytes.equals(await readSafeFile(backupPath(reread.directory, journal.planRelative), MAX_DOCUMENT_BYTES).then((file) => file.bytes)))

    for (const [relative, saved] of Object.entries(journal.files)) {
      const file = current.get(relative)
      if (!file) fail("invalid_journal", `rollback target is missing: ${relative}`)
      if (relative === journal.planRelative) continue
      if (!file.bytes.equals(await readSafeFile(backupPath(reread.directory, relative), relative === RECOVERY_MANIFEST ? MAX_MANIFEST_BYTES : MAX_DOCUMENT_BYTES).then((copy) => copy.bytes)) ||
        !sameSignature(file.signature, saved.signature)) {
        fail("concurrent", `rollback refuses a changed sibling target: ${relative}`)
      }
    }

    const originalPlan = await readSafeFile(backupPath(reread.directory, journal.planRelative), MAX_DOCUMENT_BYTES)
    if (journal.phase === "rolled_back") {
      if (!plan.bytes.equals(originalPlan.bytes) || (journal.rollbackPlanAfter && !sameSignature(plan.signature, journal.rollbackPlanAfter))) {
        fail("concurrent", "rolled-back target changed after rollback")
      }
      return { status: "already_rolled_back", journalPath: initial.path, restoredPath: path.join(journal.docsDirectory, journal.planRelative) }
    }

    if (targetMustBeOriginal) {
      if (!plan.bytes.equals(originalPlan.bytes) || !sameSignature(plan.signature, journal.files[journal.planRelative].signature)) {
        fail("concurrent", "rollback refuses a changed original plan")
      }
    } else {
      if (journal.phase === "committed" && (!journal.targetPlanAfter || !sameSignature(plan.signature, journal.targetPlanAfter))) {
        fail("concurrent", "committed plan target changed after recovery")
      }
      if (sha256Buffer(plan.bytes) !== journal.expectedPlanSha256) {
        fail("concurrent", "rollback refuses a changed recovery target")
      }
      if (journal.phase === "publishing" && sameSignature(plan.signature, journal.files[journal.planRelative].signature)) {
        fail("concurrent", "interrupted publication target has an unexpected original inode")
      }
      const restoredSignature = await atomicReplace(path.join(journal.docsDirectory, journal.planRelative), originalPlan.bytes, plan.bytes, plan.signature, options.signal)
      journal.rollbackPlanAfter = restoredSignature
    }

    const after = await loadCurrentOriginalSet(journal)
    for (const [relative, saved] of Object.entries(journal.files)) {
      const file = after.get(relative)
      if (!file || sha256Buffer(file.bytes) !== saved.sha256) fail("io", `rollback verification failed for ${relative}`)
    }
    const manifest = after.get(RECOVERY_MANIFEST)
    if (!manifest) fail("invalid_manifest", "manifest is missing after rollback")
    await verifyManifestBytes(manifest.bytes)
    const nextPayload: JournalPayload = { ...journal, phase: "rolled_back" }
    const nextJournalBytes = await writeJournal(reread.directory, nextPayload, reread.bytes)
    const nextJournal = parseJournal(nextJournalBytes.toString("utf8"), reread.directory, reread.backupDirectory)
    await ensureBackupCopies(reread.directory, nextJournal)
    return { status: "rolled_back", journalPath: initial.path, restoredPath: path.join(journal.docsDirectory, journal.planRelative) }
  }, options.signal)
}
