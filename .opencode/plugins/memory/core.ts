import { randomUUID } from "node:crypto"
import path from "node:path"

import { BoundedReadError, inspectSafePath, liveFileSystem, removeUnderLock, UnsafePathError, writeAtomically, type MemoryFileSystem } from "./filesystem.ts"
import { MAX_NOTE_BYTES, noteContainsObviousSecret, notePath, NoteFormatError, parseNote, serializeNote, sha256, validId, validTag, validateSpec, type MemoryScope, type NoteSpec, type ParsedNote } from "./format.ts"
import { isWithin, resolveGitRoot, resolveOpenCodeDataDirectory, type CommandRunner } from "./paths.ts"
import { rankNotes, tokenize, type SearchableNote } from "./retrieval.ts"

export const MAX_QUERY_CHARS = 500
export const MAX_SCAN_FILES = 64
export const MAX_SCAN_BYTES = 512 * 1024
export const MAX_DIRECTORY_ENTRIES = 256
export const MAX_RESPONSE_BYTES = 32 * 1024
const PREVIEW_TTL_MS = 5 * 60_000
const MAX_PREVIEWS = 128

type ReadScope = MemoryScope | "both"
type Operation = "list" | "search" | "read" | "remember" | "forget"
type PermissionAction = "read" | "edit" | "external_directory"

type ReadInput =
  | { op: "list"; limit: number }
  | { op: "read"; id: string }
  | { op: "search"; query: string; tags: string[]; kind?: string; limit: number; repoFirst: boolean }

export interface MemorySessionApi {
  get(input: { sessionID: string }, options?: { signal?: AbortSignal }): Promise<unknown>
}

export interface PermissionApi {
  assert(input: {
    sessionID: string
    agent?: string
    source: { type: "tool"; messageID: string; id: string }
    action: "read" | "edit" | "external_directory"
    resources: string[]
  }): Promise<unknown>
}

export interface ToolCallContext {
  sessionID: string
  messageID: string
  id: string
  agent?: string
  signal?: AbortSignal
}

export interface MemoryDependencies {
  session: MemorySessionApi
  permission: PermissionApi
  resolveRepo?: (sessionDirectory: string, signal?: AbortSignal) => Promise<string>
  resolveDataDirectory?: (sessionDirectory: string, signal?: AbortSignal) => Promise<string>
  runCommand?: CommandRunner
  fs?: MemoryFileSystem
  now?: () => Date
}

interface ScopeRoot {
  scope: MemoryScope
  base: string
  notesDirectory: string
  storeDirectory: string
}

interface ScanState {
  files: number
  bytes: number
  chargedBytes: number
  failedReadChargeBytes: number
  warnings: string[]
  truncated: boolean
  skipped: number
}

interface ScanBudget {
  candidates: number
  files: number
  bytes: number
}

interface PreviewRecord {
  token: string
  sessionID: string
  scope: MemoryScope
  operation: "remember" | "forget"
  id: string
  target: string
  currentRevision: string
  specFingerprint: string
  content?: string
  noteRevision?: string
  expiresAt: number
}

const previewRecords = new Map<string, PreviewRecord>()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function unwrapData(value: unknown): unknown {
  if (isRecord(value) && "data" in value) return value.data
  return value
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw signal.reason instanceof Error ? signal.reason : new Error("memory operation cancelled")
}

function validateContext(context: ToolCallContext): void {
  if (!context.sessionID || context.sessionID.length > 200 || !context.id || !context.messageID) {
    throw new Error("memory requires the current OpenCode tool and session identity")
  }
}

function exactKeys(record: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(record).every((key) => allowed.includes(key))
}

function validateScope(value: unknown, allowedBoth: boolean): ReadScope {
  if (value === undefined) return "repo"
  if (value === "repo" || value === "global" || (allowedBoth && value === "both")) return value
  throw new Error(allowedBoth ? "scope must be repo, global, or both" : "write scope must be repo or global")
}

function validateOperationInput(input: unknown): Record<string, unknown> & { op: Operation; scope: ReadScope } {
  if (!isRecord(input) || typeof input.op !== "string") throw new Error("memory expects an operation object")
  if (Object.keys(input).length > 16) throw new Error("memory input has too many fields")
  const op = input.op as Operation
  if (!["list", "search", "read", "remember", "forget"].includes(op)) throw new Error("op must be list, search, read, remember, or forget")
  const allowed: Record<Operation, string[]> = {
    list: ["op", "scope", "limit"],
    search: ["op", "scope", "query", "tags", "kind", "limit", "repoFirst"],
    read: ["op", "scope", "id"],
    remember: ["op", "scope", "id", "title", "tags", "kind", "body", "sources", "verified", "apply", "expectRevision"],
    forget: ["op", "scope", "id", "apply", "expectRevision"],
  }
  if (!exactKeys(input, allowed[op])) throw new Error(`unknown field for memory ${op} operation`)
  const scope = validateScope(input.scope, op === "list" || op === "search" || op === "read")
  if ((op === "remember" || op === "forget") && scope === "both") throw new Error("both is read-only; writes require one explicit scope")
  return { ...input, op, scope }
}

function boundedLimit(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`limit must be an integer from 1 to ${maximum}`)
  }
  return value
}

function validateReadInput(input: Record<string, unknown> & { op: Operation }): ReadInput | undefined {
  if (input.op === "list") return { op: "list", limit: boundedLimit(input.limit, 10, 20) }
  if (input.op === "read") {
    if (!validId(input.id)) throw new Error("read requires a safe lowercase note id")
    return { op: "read", id: input.id }
  }
  if (input.op !== "search") return
  if (typeof input.query !== "string" || input.query.length > MAX_QUERY_CHARS || input.query.trim().length === 0) {
    throw new Error(`query must contain 1–${MAX_QUERY_CHARS} characters`)
  }
  if (tokenize(input.query).length === 0) throw new Error("query must include at least one letter or number")
  if (input.tags !== undefined && (!Array.isArray(input.tags) || input.tags.length > 12 || !input.tags.every(validTag))) {
    throw new Error("tags must be up to 12 lowercase tag slugs")
  }
  if (input.kind !== undefined && (typeof input.kind !== "string" || !["fact", "preference", "decision", "workflow"].includes(input.kind))) {
    throw new Error("kind filter must be fact, preference, decision, or workflow")
  }
  if (input.repoFirst !== undefined && typeof input.repoFirst !== "boolean") throw new Error("repoFirst must be a boolean")
  return {
    op: "search",
    query: input.query,
    tags: [...((input.tags as string[] | undefined) ?? [])],
    ...(typeof input.kind === "string" ? { kind: input.kind } : {}),
    limit: boundedLimit(input.limit, 5, 10),
    repoFirst: input.repoFirst !== false,
  }
}

function displayPath(root: ScopeRoot, file: string): string {
  return path.relative(root.base, file).split(path.sep).join("/")
}

function response(value: unknown, limit = MAX_RESPONSE_BYTES): { content: string } {
  const serialized = JSON.stringify(value)
  if (Buffer.byteLength(serialized, "utf8") <= limit) return { content: serialized }
  const fallback = JSON.stringify({ error: "response exceeded its byte limit; narrow the query or request fewer results" })
  return { content: fallback }
}

function addWarning(state: ScanState, warning: string): void {
  if (!state.warnings.includes(warning)) state.warnings.push(warning)
}

function validFileName(name: string): string | undefined {
  if (!name.endsWith(".md")) return undefined
  const id = name.slice(0, -3)
  return validId(id) ? id : undefined
}

class PermissionGate {
  private readonly asserted = new Set<string>()
  private readonly external = new Set<string>()
  private readonly dependencies: MemoryDependencies
  private readonly context: ToolCallContext

  constructor(dependencies: MemoryDependencies, context: ToolCallContext) {
    this.dependencies = dependencies
    this.context = context
  }

  private async assert(action: PermissionAction, resource: string): Promise<void> {
    abortIfNeeded(this.context.signal)
    const key = `${action}\0${resource}`
    if (this.asserted.has(key)) return
    // The pinned Promise assertion has no per-call signal parameter.
    await this.dependencies.permission.assert({
      sessionID: this.context.sessionID,
      ...(this.context.agent ? { agent: this.context.agent } : {}),
      source: { type: "tool", messageID: this.context.messageID, id: this.context.id },
      action,
      resources: [resource],
    })
    abortIfNeeded(this.context.signal)
    this.asserted.add(key)
  }

  async authorizeExternal(storeDirectory: string): Promise<void> {
    abortIfNeeded(this.context.signal)
    const boundary = `${storeDirectory}/*`
    if (this.external.has(boundary)) return
    await this.assert("external_directory", boundary)
    abortIfNeeded(this.context.signal)
    this.external.add(boundary)
  }

  read(resource: string): Promise<void> { return this.assert("read", resource) }
  edit(resource: string): Promise<void> { return this.assert("edit", resource) }
}

function sessionDirectory(raw: unknown, sessionID: string): string {
  const session = unwrapData(raw)
  if (!isRecord(session) || session.id !== sessionID || !isRecord(session.location) || typeof session.location.directory !== "string" ||
    !path.isAbsolute(session.location.directory) || session.location.directory.length > 4_096 ||
    /\0/.test(session.location.directory) || path.normalize(session.location.directory) !== session.location.directory) {
    throw new Error("session.get did not return this session's absolute current location")
  }
  return session.location.directory
}

async function resolveRoots(
  operation: Record<string, unknown> & { op: Operation; scope: ReadScope },
  context: ToolCallContext,
  dependencies: MemoryDependencies,
  gate: PermissionGate,
  fs: MemoryFileSystem,
): Promise<ScopeRoot[]> {
  const rawSession = await dependencies.session.get({ sessionID: context.sessionID }, { signal: context.signal })
  const currentDirectory = sessionDirectory(rawSession, context.sessionID)
  await gate.read(currentDirectory)
  const sessionPath = await inspectSafePath(currentDirectory, (resource) => gate.read(resource), fs)
  if (!sessionPath.stat?.isDirectory()) throw new UnsafePathError("the session location is not a regular directory")
  const resolveRepo = dependencies.resolveRepo ?? ((directory, signal) => resolveGitRoot(directory, { signal, run: dependencies.runCommand }))
  const rawRepoRoot = await resolveRepo(currentDirectory, context.signal)
  if (!path.isAbsolute(rawRepoRoot) || rawRepoRoot.length > 4_096 || /\0/.test(rawRepoRoot)) throw new Error("Git worktree resolver did not return a bounded absolute path")
  const repoRoot = path.normalize(rawRepoRoot)
  if (!isWithin(repoRoot, currentDirectory)) throw new Error("session location is not contained by its resolved Git worktree")
  const requestedScopes: MemoryScope[] = operation.scope === "both" ? ["repo", "global"] : [operation.scope]
  const roots: ScopeRoot[] = []
  if (requestedScopes.includes("repo")) {
    roots.push({
      scope: "repo",
      base: repoRoot,
      notesDirectory: path.join(repoRoot, "docs", "memory"),
      storeDirectory: repoRoot,
    })
  }
  if (requestedScopes.includes("global")) {
    const resolveData = dependencies.resolveDataDirectory ?? ((directory, signal) => resolveOpenCodeDataDirectory(directory, { signal, run: dependencies.runCommand }))
    const rawDataDirectory = await resolveData(currentDirectory, context.signal)
    if (!path.isAbsolute(rawDataDirectory) || rawDataDirectory.length > 4_096 || /\0/.test(rawDataDirectory)) throw new Error("OpenCode data directory must be a bounded absolute path")
    const dataDirectory = path.normalize(rawDataDirectory)
    const storeDirectory = path.join(dataDirectory, "memory")
    await gate.authorizeExternal(storeDirectory)
    roots.push({
      scope: "global",
      base: dataDirectory,
      notesDirectory: path.join(storeDirectory, "docs", "memory"),
      storeDirectory,
    })
  }
  return roots
}

function scopeState(root: ScopeRoot, state: ScanState): Record<string, unknown> {
  return {
    scope: root.scope,
    scanned: state.files,
    bytes: state.bytes,
    chargedBytes: state.chargedBytes,
    failedReadChargeBytes: state.failedReadChargeBytes,
    skipped: state.skipped,
    truncated: state.truncated,
    warnings: state.warnings,
  }
}

async function scanRoot(
  root: ScopeRoot,
  gate: PermissionGate,
  fs: MemoryFileSystem,
  budget: ScanBudget,
  signal?: AbortSignal,
): Promise<{ notes: SearchableNote[]; state: ScanState }> {
  const state: ScanState = { files: 0, bytes: 0, chargedBytes: 0, failedReadChargeBytes: 0, warnings: [], truncated: false, skipped: 0 }
  const notes: SearchableNote[] = []
  const directory = await inspectSafePath(root.notesDirectory, (resource) => gate.read(resource), fs)
  if (!directory.stat) return { notes, state }
  if (!directory.stat.isDirectory()) throw new UnsafePathError(`${root.notesDirectory} is not a directory`)
  abortIfNeeded(signal)
  let handle
  try {
    handle = await fs.openDirectory(root.notesDirectory)
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return { notes, state }
    throw error
  }
  const names: string[] = []
  try {
    for (let index = 0; index < MAX_DIRECTORY_ENTRIES; index += 1) {
      abortIfNeeded(signal)
      const entry = await handle.read()
      if (!entry) break
      if ((entry.isFile() || entry.isSymbolicLink()) && validFileName(entry.name)) names.push(entry.name)
      if (index === MAX_DIRECTORY_ENTRIES - 1) {
        state.truncated = true
        addWarning(state, `Directory entry scan stopped at ${MAX_DIRECTORY_ENTRIES} entries.`)
      }
    }
  } finally {
    await handle.close()
  }
  names.sort((left, right) => left.localeCompare(right))
  if (budget.candidates >= MAX_SCAN_FILES || MAX_SCAN_BYTES - budget.bytes <= 1) {
    state.truncated ||= names.length > 0
    if (state.truncated) addWarning(state, "Shared read budget was exhausted before this scope could be scanned.")
    return { notes, state }
  }
  const candidateLimit = MAX_SCAN_FILES - budget.candidates
  if (names.length > candidateLimit) {
    state.truncated = true
    addWarning(state, `Only the first ${candidateLimit} candidate notes are within the shared file limit.`)
  }
  for (const name of names.slice(0, candidateLimit)) {
    abortIfNeeded(signal)
    if (MAX_SCAN_BYTES - budget.bytes <= 1) {
      state.truncated = true
      addWarning(state, "The shared note-byte allowance, including its growth probe, was exhausted.")
      break
    }
    budget.candidates += 1
    const id = validFileName(name)
    if (!id) continue
    const file = path.join(root.notesDirectory, name)
    await gate.read(file)
    let inspected: Awaited<ReturnType<typeof inspectSafePath>>
    try {
      inspected = await inspectSafePath(file, (resource) => gate.read(resource), fs)
    } catch (error) {
      if (error instanceof UnsafePathError) {
        state.skipped += 1
        addWarning(state, "A candidate note has a symlink or unsafe path and was skipped.")
        continue
      }
      throw error
    }
    if (!inspected.stat || !inspected.stat.isFile() || inspected.stat.isSymbolicLink() || inspected.stat.nlink !== 1) {
      state.skipped += 1
      addWarning(state, "A candidate note is missing, nonregular, or multiply linked and was skipped.")
      continue
    }
    const remainingBytes = MAX_SCAN_BYTES - budget.bytes
    const readLimit = Math.min(MAX_NOTE_BYTES, remainingBytes - 1)
    if (inspected.stat.size > readLimit) {
      state.skipped += 1
      state.truncated = true
      addWarning(state, "A note exceeded its note/shared allowance including the growth probe and was skipped before allocation.")
      continue
    }
    // The reader can consume limit + 1 bytes before rejecting growth or decoding.
    // Reserve that allowance before dispatch; a failed read cannot refund unknown IO.
    const readAllowance = readLimit + 1
    budget.bytes += readAllowance
    state.chargedBytes += readAllowance
    let read: { text: string; bytes: number }
    try {
      read = await fs.readBounded(file, readLimit, signal)
      abortIfNeeded(signal)
      if (!Number.isSafeInteger(read.bytes) || read.bytes < 0 || read.bytes > readLimit) {
        throw new BoundedReadError("The note reader returned an invalid byte count.")
      }
    } catch (error) {
      state.failedReadChargeBytes += readAllowance
      abortIfNeeded(signal)
      if (error instanceof UnsafePathError || error instanceof BoundedReadError || error instanceof TypeError || (isRecord(error) && error.code === "ENOENT")) {
        state.skipped += 1
        state.truncated ||= error instanceof BoundedReadError
        addWarning(state, error instanceof BoundedReadError ? "A note changed or exceeded its read budget and was skipped." : "An unsafe or changing note was skipped.")
        continue
      }
      throw error
    }
    const unusedBytes = readAllowance - read.bytes
    budget.bytes -= unusedBytes
    state.chargedBytes -= unusedBytes
    budget.files += 1
    state.files += 1
    state.bytes += read.bytes
    try {
      const parsed = parseNote(read.text, { id, scope: root.scope })
      if (noteContainsObviousSecret(parsed)) {
        state.skipped += 1
        addWarning(state, "A note with an obvious credential pattern in its metadata or body was skipped.")
        continue
      }
      notes.push({ ...parsed, scope: root.scope, file })
    } catch (error) {
      if (error instanceof NoteFormatError) {
        state.skipped += 1
        addWarning(state, "A malformed, unmanaged, or path-mismatched note was skipped.")
        continue
      }
      throw error
    }
  }
  if (names.length > candidateLimit && budget.candidates >= MAX_SCAN_FILES) {
    state.truncated = true
    addWarning(state, "The shared note-file scan limit was reached.")
  }
  return { notes, state }
}

async function readExact(
  root: ScopeRoot,
  id: string,
  gate: PermissionGate,
  fs: MemoryFileSystem,
  signal?: AbortSignal,
): Promise<{ parsed?: ParsedNote; file: string; revision: string }> {
  const file = notePath(root.notesDirectory, id)
  await gate.read(file)
  const inspected = await inspectSafePath(file, (resource) => gate.read(resource), fs)
  abortIfNeeded(signal)
  if (!inspected.stat) return { file, revision: "absent" }
  if (!inspected.stat.isFile() || inspected.stat.isSymbolicLink() || inspected.stat.nlink !== 1) {
    throw new UnsafePathError(`${file} is not a single-link regular note`)
  }
  const { text } = await fs.readBounded(file, MAX_NOTE_BYTES, signal)
  abortIfNeeded(signal)
  const parsed = parseNote(text, { id, scope: root.scope })
  if (noteContainsObviousSecret(parsed)) throw new Error("note metadata or body matches an obvious credential pattern; refusing to return it")
  return { parsed, file, revision: parsed.revision }
}

function serializeMetadata(note: SearchableNote | ParsedNote, scope: MemoryScope, file: string): Record<string, unknown> {
  return {
    id: note.metadata.id,
    scope,
    title: note.metadata.title,
    tags: note.metadata.tags,
    kind: note.metadata.kind,
    updated: note.metadata.updated,
    verified: note.metadata.verified,
    sourceCount: note.metadata.sources.length,
    citation: { file, line: note.metadataLines.title },
  }
}

function canonicalSpec(spec: NoteSpec): string {
  return JSON.stringify({
    id: spec.id,
    title: spec.title.trim(),
    tags: [...new Set(spec.tags)].sort(),
    kind: spec.kind,
    body: spec.body.trim(),
    sources: spec.sources.map((source) => source.trim()),
    verified: spec.verified ?? null,
  })
}

function prunePreviews(now: number): void {
  for (const [token, record] of previewRecords) if (record.expiresAt <= now) previewRecords.delete(token)
  while (previewRecords.size >= MAX_PREVIEWS) {
    const oldest = previewRecords.keys().next().value
    if (oldest === undefined) break
    previewRecords.delete(oldest)
  }
}

function savePreview(record: Omit<PreviewRecord, "token" | "expiresAt">, now: number): string {
  prunePreviews(now)
  const token = randomUUID()
  previewRecords.set(token, { ...record, token, expiresAt: now + PREVIEW_TTL_MS })
  return token
}

async function ensureDirectories(
  root: ScopeRoot,
  gate: PermissionGate,
  fs: MemoryFileSystem,
  signal?: AbortSignal,
): Promise<void> {
  const relative = path.relative(root.base, root.notesDirectory)
  if (path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`)) throw new UnsafePathError("memory notes directory escapes its selected scope")
  const parts = relative.split(path.sep).filter(Boolean)
  let current = root.base
  const base = await inspectSafePath(current, (resource) => gate.read(resource), fs)
  if (!base.stat?.isDirectory()) throw new UnsafePathError("selected memory base directory does not exist as a directory")
  for (const part of parts) {
    abortIfNeeded(signal)
    current = path.join(current, part)
    await gate.read(current)
    let stat
    try {
      stat = await fs.lstat(current)
    } catch (error) {
      if (!isRecord(error) || error.code !== "ENOENT") throw error
      await gate.edit(current)
      await fs.mkdir(current, 0o700).catch(async (mkdirError) => {
        if (!isRecord(mkdirError) || mkdirError.code !== "EEXIST") throw mkdirError
      })
      stat = await fs.lstat(current)
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new UnsafePathError(`${current} is not a safe directory`)
  }
}

async function authorizeWritePaths(
  root: ScopeRoot,
  file: string,
  lock: string,
  temporary: string | undefined,
  gate: PermissionGate,
): Promise<void> {
  const paths = [root.notesDirectory, file, lock, ...(temporary ? [temporary] : [])]
  for (const resource of paths) await gate.edit(resource)
  for (const resource of [lock, ...(temporary ? [temporary] : [])]) await gate.read(resource)
}

async function manageWrite(
  op: "remember" | "forget",
  input: Record<string, unknown>,
  root: ScopeRoot,
  context: ToolCallContext,
  gate: PermissionGate,
  fs: MemoryFileSystem,
  now: Date,
): Promise<{ content: string }> {
  const id = input.id
  if (!validId(id)) throw new Error("id must be a safe lowercase topic id")
  const spec = op === "remember" ? validateSpec(input) : undefined
  const apply = input.apply === true
  if (input.apply !== undefined && typeof input.apply !== "boolean") throw new Error("apply must be a boolean")
  const expectRevision = input.expectRevision
  if (!apply && expectRevision !== undefined) throw new Error("expectRevision is valid only after a preview")
  if (apply && (typeof expectRevision !== "string" || expectRevision.length > 80)) throw new Error("apply requires the exact expectRevision returned by preview")
  const target = notePath(root.notesDirectory, id)
  const lock = path.join(root.notesDirectory, `.${id}.memory-lock`)
  const temporary = path.join(root.notesDirectory, `.${id}.${randomUUID()}.tmp`)
  if (root.scope === "global") await gate.authorizeExternal(root.storeDirectory)
  await gate.read(target)
  if (apply) await authorizeWritePaths(root, target, lock, op === "remember" ? temporary : undefined, gate)
  const current = await readExact(root, id, gate, fs, context.signal)
  abortIfNeeded(context.signal)
  if (op === "forget" && current.revision === "absent") throw new Error("the exact managed note does not exist")
  if (current.parsed && current.parsed.metadata.owner !== "opencode-memory") throw new Error("target is not a memory-tool-managed note; refusing to overwrite")
  if (current.revision !== "absent" && !current.parsed) throw new Error("existing target is not a managed note; refusing to overwrite")
  const fingerprint = op === "remember" ? sha256(canonicalSpec(spec!)) : sha256(JSON.stringify({ op, id }))
  if (!apply) {
    const content = op === "remember" ? serializeNote(spec!, root.scope, now.toISOString().slice(0, 10)) : undefined
    if (content && Buffer.byteLength(content, "utf8") > MAX_NOTE_BYTES) throw new Error(`note exceeds ${MAX_NOTE_BYTES} bytes`)
    const token = savePreview({
      sessionID: context.sessionID,
      scope: root.scope,
      operation: op,
      id,
      target,
      currentRevision: current.revision,
      specFingerprint: fingerprint,
      ...(content ? { content, noteRevision: sha256(content) } : {}),
    }, now.valueOf())
    return response({
      status: "preview",
      operation: op,
      scope: root.scope,
      id,
      target,
      currentRevision: current.revision,
      proposedRevision: content ? sha256(content) : null,
      expectRevision: token,
      expiresInSeconds: PREVIEW_TTL_MS / 1000,
      notesAreUntrustedData: true,
      diff: op === "remember"
        ? {
            action: current.parsed ? "replace" : "create",
            before: current.parsed ? { title: current.parsed.metadata.title, kind: current.parsed.metadata.kind, tags: current.parsed.metadata.tags } : null,
            after: { title: spec!.title.trim(), kind: spec!.kind, tags: spec!.tags, bodyPreview: spec!.body.trim().slice(0, 180) },
            bytes: Buffer.byteLength(content!, "utf8"),
          }
        : "Delete exactly this one managed topic note.",
      note: content ? { title: spec!.title.trim(), tags: spec!.tags, kind: spec!.kind, sourceCount: spec!.sources.length } : undefined,
    })
  }

  const preview = previewRecords.get(expectRevision as string)
  if (!preview || preview.expiresAt <= now.valueOf()) throw new Error("preview is missing, expired, or already used")
  if (preview.sessionID !== context.sessionID || preview.scope !== root.scope || preview.operation !== op || preview.id !== id ||
    preview.target !== target || preview.currentRevision !== current.revision || preview.specFingerprint !== fingerprint) {
    throw new Error("preview does not match this exact scope, target, content, or current file revision")
  }
  previewRecords.delete(preview.token)
  if (op === "remember") {
    await ensureDirectories(root, gate, fs, context.signal)
    const expectedRevision = preview.noteRevision
    const content = preview.content
    if (!expectedRevision || !content) throw new Error("remember preview has no proposed note")
    await writeAtomically(target, lock, temporary, content, fs, context.signal, async () => {
      const revalidated = await readExact(root, id, gate, fs, context.signal)
      if (revalidated.revision !== preview.currentRevision) throw new Error("target changed after preview; make a new preview")
      if (sha256(content) !== expectedRevision) throw new Error("preview content fingerprint changed")
    })
    previewRecords.delete(preview.token)
    return response({ status: "written", scope: root.scope, id, target, revision: expectedRevision })
  }
  await removeUnderLock(target, lock, fs, context.signal, async () => {
    const revalidated = await readExact(root, id, gate, fs, context.signal)
    if (revalidated.revision !== preview.currentRevision || !revalidated.parsed) throw new Error("target changed after preview; make a new preview")
  })
  previewRecords.delete(preview.token)
  return response({ status: "forgotten", scope: root.scope, id, target, removed: true })
}

export async function executeMemory(
  rawInput: unknown,
  context: ToolCallContext,
  dependencies: MemoryDependencies,
): Promise<{ content: string }> {
  validateContext(context)
  abortIfNeeded(context.signal)
  const input = validateOperationInput(rawInput)
  const readInput = validateReadInput(input)
  const fs = dependencies.fs ?? liveFileSystem
  const gate = new PermissionGate(dependencies, context)
  const roots = await resolveRoots(input, context, dependencies, gate, fs)
  abortIfNeeded(context.signal)
  const now = (dependencies.now ?? (() => new Date()))()

  if (input.op === "remember" || input.op === "forget") {
    return manageWrite(input.op, input, roots[0], context, gate, fs, now)
  }

  const budget: ScanBudget = { candidates: 0, files: 0, bytes: 0 }
  const scanned: Array<{ root: ScopeRoot; notes: SearchableNote[]; state: ScanState }> = []
  if (readInput?.op === "read") {
    const id = readInput.id
    const entries: Array<Record<string, unknown>> = []
    for (const root of roots) {
      const result = await readExact(root, id, gate, fs, context.signal)
      abortIfNeeded(context.signal)
      if (result.parsed) {
        entries.push({
          ...serializeMetadata(result.parsed, root.scope, displayPath(root, result.file)),
          revision: result.revision,
          sources: result.parsed.metadata.sources,
          body: result.parsed.body,
        })
      }
    }
    return response({ operation: "read", results: entries, missingScopes: roots.filter((root) => !entries.some((entry) => entry.scope === root.scope)).map((root) => root.scope), notesAreUntrustedData: true })
  }

  for (const root of roots) {
    const result = await scanRoot(root, gate, fs, budget, context.signal)
    abortIfNeeded(context.signal)
    scanned.push({ root, ...result })
  }
  const notes = scanned.flatMap((entry) => entry.notes)
  const coverage = scanned.map((entry) => scopeState(entry.root, entry.state))

  if (readInput?.op === "list") {
    const results = notes
      .sort((left, right) => Number(right.scope === "repo") - Number(left.scope === "repo") || left.metadata.id.localeCompare(right.metadata.id))
      .slice(0, readInput.limit)
      .map((note) => serializeMetadata(note, note.scope, displayPath(scanned.find((entry) => entry.root.scope === note.scope)!.root, note.file)))
    return response({ operation: "list", results, coverage, notesAreUntrustedData: true })
  }

  if (readInput?.op === "search") {
    const filtered = notes.filter((note) => readInput.tags.every((tag) => note.metadata.tags.includes(tag)) &&
      (readInput.kind === undefined || note.metadata.kind === readInput.kind))
    const ranked = rankNotes(filtered, readInput.query, { limit: readInput.limit, repoFirst: readInput.repoFirst })
    const results = ranked.map(({ note, score, snippets, citationLine }) => ({
      id: note.metadata.id,
      scope: note.scope,
      score,
      title: note.metadata.title,
      tags: note.metadata.tags,
      kind: note.metadata.kind,
      updated: note.metadata.updated,
      verified: note.metadata.verified,
      sourceCount: note.metadata.sources.length,
      citation: { file: displayPath(scanned.find((entry) => entry.root.scope === note.scope)!.root, note.file), line: citationLine },
      snippets,
    }))
    return response({ operation: "search", results, coverage, notesAreUntrustedData: true })
  }

  throw new Error("unsupported memory operation")
}

export function clearPreviewStateForTests(): void {
  previewRecords.clear()
}

export function previewCountForTests(): number {
  return previewRecords.size
}
