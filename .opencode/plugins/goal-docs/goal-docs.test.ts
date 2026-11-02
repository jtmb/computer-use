import assert from "node:assert/strict"
import { test } from "node:test"
import path from "node:path"
import { mkdtemp, rm, writeFile } from "node:fs/promises"

import { exportGoalState } from "./exporter.ts"
import { coordinateHandoff, markHandoffOpened, type HandoffDependencies, type HandoffSessionApi } from "./handoff.ts"
import { parseSessionGoalState, sanitizeText, semanticFingerprint, sha256, type GoalRecord } from "./model.ts"
import { startGoalObserver, type GoalDocsEvent } from "./observer.ts"
import { buildGoalDocBundle, handoffPrompt } from "./render.ts"
import { describeRepository } from "./repository.ts"
import { createGoalDocsRpcHandlers } from "./rpc-handlers.ts"
import { GoalDocsRpcDefinition } from "./rpc-definition.ts"
import { decodeGoalDocsRpcOutput } from "./rpc-output.ts"
import { readGoalStateForSession, resolveGoalPluginVersion, resolveGoalStatePath } from "./state.ts"
import { assertEditableSession, getOwnedSession, sessionListPage, type SessionInfo } from "./session.ts"
import {
  buildHandoffKeymapLayer,
  focusHandoffTarget,
  guardedHandoffCall,
  inspectHandoffCommandAvailability,
  sameExactWorktree,
} from "./tui-contract.ts"
import { createTargetSessionID, createTransferID, GoalDocsWriteError, OWNERSHIP_FILE, writeGoalDocBundles, type WriterFileSystem, type WriterHandle, type WriterStat } from "./writer.ts"

const SOURCE_SESSION = "ses_source"
const SOURCE_DIRECTORY = "/scratch/worktree-a"
const PACKAGE_JSON = "/scratch/package.json"
const STATE_FILE = "/scratch/goals.json"

function errorWithCode(code: string, message = code): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

interface MemoryEntry {
  kind: "file" | "directory" | "symlink"
  content: string
}

class MemoryFileSystem implements WriterFileSystem {
  readonly entries = new Map<string, MemoryEntry>()
  readonly processLocks = new Set<string>()
  failNextRename = false

  async acquireProcessLock(filePath: string, signal?: AbortSignal): Promise<() => Promise<void>> {
    if (signal?.aborted) throw signal.reason ?? new Error("operation aborted")
    if (this.processLocks.has(filePath)) throw new GoalDocsWriteError("concurrent", "process lock is held")
    this.processLocks.add(filePath)
    return async () => { this.processLocks.delete(filePath) }
  }

  constructor() {
    this.entries.set(path.parse(path.resolve("/")).root, { kind: "directory", content: "" })
    for (const directory of ["/scratch", "/scratch/worktree-a", "/scratch/worktree-b"]) {
      this.entries.set(directory, { kind: "directory", content: "" })
    }
  }

  private normalized(filePath: string): string {
    return path.resolve(filePath)
  }

  private requireDirectory(filePath: string): void {
    const entry = this.entries.get(this.normalized(filePath))
    if (!entry || entry.kind !== "directory") throw errorWithCode("ENOENT", `missing directory ${filePath}`)
  }

  async ensureDirectory(filePath: string): Promise<void> {
    const absolute = this.normalized(filePath)
    const parsed = path.parse(absolute)
    let current = parsed.root
    for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
      current = path.join(current, part)
      if (!this.entries.has(current)) this.entries.set(current, { kind: "directory", content: "" })
    }
  }

  async lstat(filePath: string): Promise<WriterStat> {
    const entry = this.entries.get(this.normalized(filePath))
    if (!entry) throw errorWithCode("ENOENT", `missing ${filePath}`)
    return {
      isDirectory: () => entry.kind === "directory",
      isFile: () => entry.kind === "file",
      isSymbolicLink: () => entry.kind === "symlink",
    }
  }

  async mkdir(filePath: string): Promise<void> {
    const absolute = this.normalized(filePath)
    if (this.entries.has(absolute)) throw errorWithCode("EEXIST")
    this.requireDirectory(path.dirname(absolute))
    this.entries.set(absolute, { kind: "directory", content: "" })
  }

  async readFile(filePath: string, _encoding?: "utf8"): Promise<string> {
    const entry = this.entries.get(this.normalized(filePath))
    if (!entry || entry.kind !== "file") throw errorWithCode("ENOENT", `missing file ${filePath}`)
    return entry.content
  }

  async readFileBounded(filePath: string, byteLimit: number, signal?: AbortSignal): Promise<string> {
    if (signal?.aborted) throw signal.reason ?? new Error("operation aborted")
    const content = await this.readFile(filePath)
    if (Buffer.byteLength(content, "utf8") > byteLimit) throw errorWithCode("EFBIG", `${filePath} exceeds the ${byteLimit}-byte read limit`)
    return content
  }

  async open(filePath: string, flags: string): Promise<WriterHandle> {
    const absolute = this.normalized(filePath)
    if (flags === "wx" && this.entries.has(absolute)) throw errorWithCode("EEXIST")
    this.requireDirectory(path.dirname(absolute))
    this.entries.set(absolute, { kind: "file", content: "" })
    let closed = false
    return {
      writeFile: async (content) => {
        if (closed) throw errorWithCode("EBADF")
        this.entries.set(absolute, { kind: "file", content })
      },
      sync: async () => {
        if (closed) throw errorWithCode("EBADF")
      },
      close: async () => {
        closed = true
      },
    }
  }

  async rename(from: string, to: string): Promise<void> {
    if (this.failNextRename) {
      this.failNextRename = false
      throw errorWithCode("EIO", "injected rename failure")
    }
    const source = this.normalized(from)
    const target = this.normalized(to)
    const entry = this.entries.get(source)
    if (!entry) throw errorWithCode("ENOENT")
    this.requireDirectory(path.dirname(target))
    this.entries.set(target, { ...entry })
    this.entries.delete(source)
  }

  async unlink(filePath: string): Promise<void> {
    const absolute = this.normalized(filePath)
    if (!this.entries.has(absolute)) throw errorWithCode("ENOENT")
    this.entries.delete(absolute)
  }

  async putFile(filePath: string, content: string): Promise<void> {
    await this.ensureDirectory(path.dirname(filePath))
    this.entries.set(this.normalized(filePath), { kind: "file", content })
  }

  async putSymlink(filePath: string): Promise<void> {
    await this.ensureDirectory(path.dirname(filePath))
    this.entries.set(this.normalized(filePath), { kind: "symlink", content: "" })
  }
}

function rawGoal(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "goal-alpha",
    sessionID: SOURCE_SESSION,
    objective: "Build a safe export; API_KEY=supersecretvalue",
    status: "active",
    planRevision: 1,
    plan: {
      summary: "Implement and verify the bounded export.",
      completionCriteria: ["Every export file validates."],
      phases: [{
        id: "phase_export",
        objective: "Finish exporter.",
        status: "in_progress",
        tasks: [{ id: "task_validate", description: "Validate source state.", status: "in_progress" }],
      }],
      decisions: ["Use allowlisted records."],
      revision: 1,
      updatedAt: 1_800_000_000,
      changes: [],
    },
    createdAt: 1_799_000_000,
    updatedAt: 1_800_000_000,
    closedAt: null,
    completionEvidence: null,
    blocker: null,
    stopReason: null,
    history: [{ type: "created", detail: "Started with Bearer verysecretbearer", timestamp: 1_799_000_000 }],
    checkpoints: [{ summary: "Checkpoint: API_KEY=checkpointsecret", timestamp: 1_799_500_000 }],
    tokensUsed: 777,
    timeUsedSeconds: 55,
    usageTrackers: { provider: { token: "not-exported" } },
    pendingAttempt: { id: "not-exported" },
    lastAssistantText: "TRANSCRIPT_SENTINEL",
    ...overrides,
  }
}

function parsedState(goal = rawGoal(), options: { version?: number; archives?: unknown[] } = {}) {
  return parseSessionGoalState({
    version: options.version ?? 3,
    goals: { [SOURCE_SESSION]: goal },
    ...(options.archives ? { archives: { [SOURCE_SESSION]: options.archives } } : {}),
  }, SOURCE_SESSION)
}

function sourceInfo(overrides: Record<string, unknown> = {}): SessionInfo {
  return {
    id: SOURCE_SESSION,
    location: { directory: SOURCE_DIRECTORY },
    projectID: "project-one",
    agent: "build",
    model: { providerID: "local", id: "test-model" },
    permissions: [{ action: "edit", resource: "**", effect: "allow" }],
    ...overrides,
  } as SessionInfo
}

function bundle(goal: GoalRecord, sourceDirectory = SOURCE_DIRECTORY) {
  return buildGoalDocBundle({
    sessionID: SOURCE_SESSION,
    directory: sourceDirectory,
    exportedAt: "2026-10-27T00:00:00.000Z",
    repository: {
      kind: "git",
      identity: "github.com/example/repository",
      worktree: "linked/topic",
      scope: "services/api",
      gaps: [],
    },
  }, goal, "Archive history is bounded.")
}

const repositoryMetadata = async () => ({
  kind: "git" as const,
  identity: "github.com/example/repository",
  worktree: "linked/topic",
  scope: "services/api",
  gaps: [],
})

function deferred<T = void>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve: (value?: T) => resolve(value as T) }
}

test("validated goal parsing redacts credentials and excludes transcript and usage fields", () => {
  const state = parsedState()
  const goal = state.current
  assert.ok(goal)
  assert.equal(goal.objective.includes("supersecretvalue"), false)
  assert.equal(goal.history[0].detail.includes("verysecretbearer"), false)
  assert.equal(goal.checkpoints[0].summary.includes("checkpointsecret"), false)
  assert.equal("lastAssistantText" in goal, false)
  assert.equal("tokensUsed" in goal, false)
  assert.equal(state.fingerprint, parsedState().fingerprint)
  assert.throws(() => parseSessionGoalState({ version: 4, goals: {} }, SOURCE_SESSION), /unsupported goal state schema/)
})

test("private local document capabilities are removed from goal exports without rewriting ordinary links", () => {
  const capability = "synthetic_local_document_capability_0123456789"
  const url = `http://127.0.0.1:41234/${capability}`
  const publicLinks = "http://127.0.0.1:8000/docs/index.md https://example.org/guide"
  assert.equal(sanitizeText(publicLinks), publicLinks)
  assert.equal(sanitizeText(`[checklist](${url}) [plan](${url}/1)`),
    "[checklist]([redacted local document URL]) [plan]([redacted local document URL])")
  const state = parsedState(rawGoal({ checkpoints: [{ summary: `Open ${url}`, timestamp: 1_799_500_000 }] }))
  assert.ok(state.current)
  const exported = Object.values(bundle(state.current).files).join("\n")
  assert.ok(exported.includes("redacted local document URL"))
  assert.equal(exported.includes(capability), false)
})

test("plan validation is bounded and archived history gaps are explicit", () => {
  const noPlan = parsedState(rawGoal({ plan: null, planRevision: 0 }), { version: 1 })
  const archived = parseSessionGoalState({
    version: 3,
    goals: {},
    archives: { [SOURCE_SESSION]: [rawGoal({ id: "goal-old", status: "cancelled" })] },
  }, SOURCE_SESSION)
  assert.match(noPlan.historyNotice, /version 1 has no archive collection/)
  assert.equal(archived.archives[0].sourceKind, "archive")
  assert.match(archived.historyNotice, /bounds archives globally/)
  assert.throws(() => parsedState(rawGoal({ plan: { ...rawGoal().plan as object, phases: new Array(65).fill({}) } })), /at most 64 entries/)
  assert.throws(() => parsedState(rawGoal({ plan: { ...rawGoal().plan as object, phases: [{ id: "phase_empty", objective: "Empty", status: "pending", tasks: [] }] } })), /tasks must not be empty/)
  assert.throws(() => parseSessionGoalState({
    version: 3,
    goals: { [SOURCE_SESSION]: rawGoal() },
    archives: { [SOURCE_SESSION]: [rawGoal()] },
  }, SOURCE_SESSION), /duplicate goal ID/)
})

test("state adapter validates the package version, schema, and state-size bound", async () => {
  const stateText = JSON.stringify({ version: 3, goals: { [SOURCE_SESSION]: rawGoal() } })
  const validPackage = JSON.stringify({ name: "@prevalentware/opencode-goal-plugin", version: "0.1.67" })
  const files = new Map([[PACKAGE_JSON, validPackage], [STATE_FILE, stateText]])
  const readFile = async (filePath: string) => {
    const value = files.get(filePath)
    if (value === undefined) throw errorWithCode("ENOENT")
    return value
  }
  const deps = {
    readFile,
    readFileBounded: async (filePath: string, byteLimit: number) => {
      const value = await readFile(filePath)
      if (Buffer.byteLength(value, "utf8") > byteLimit) throw new Error(`${filePath} exceeds the ${byteLimit}-byte read limit`)
      return value
    },
    packageJsonPath: PACKAGE_JSON,
    statePath: STATE_FILE,
  }
  assert.equal((await readGoalStateForSession(SOURCE_SESSION, deps))?.current?.id, "goal-alpha")
  files.set(PACKAGE_JSON, JSON.stringify({ name: "@prevalentware/opencode-goal-plugin", version: "0.1.66" }))
  await assert.rejects(readGoalStateForSession(SOURCE_SESSION, deps), /requires .* 0\.1\.67/)
  files.set(PACKAGE_JSON, validPackage)
  files.set(STATE_FILE, "x".repeat(8 * 1024 * 1024 + 1))
  await assert.rejects(readGoalStateForSession(SOURCE_SESSION, deps), /exceeds the .* read limit/)
  assert.equal(resolveGoalStatePath({ OPENCODE_GOAL_STATE_PATH: "/tmp/custom/goals.json" }, "/home/test"), "/tmp/custom/goals.json")
  assert.equal(resolveGoalStatePath({ XDG_DATA_HOME: "/tmp/xdg" }, "/home/test"), "/tmp/xdg/opencode-goal-plugin/goals.json")
})

test("local enhanced identity binds active inventory to real package metadata without relabeling its version", async () => {
  const root = await mkdtemp("/tmp/opencode/local-goal-identity-")
  try {
    const entry = path.join(root, "server.js")
    const metadata = path.join(root, "package.json")
    await writeFile(entry, "// local fixture entry\n")
    const manifest = { name: "@prevalentware/opencode-goal-plugin", version: "0.1.1", goalStateContract: "opencode-goal-plugin/enhanced-state-v3-1" }
    await writeFile(metadata, JSON.stringify(manifest))
    const local = { id: "local.goal-mode.server", source: { type: "local", path: entry }, state: { status: "active" } }
    const identity = await resolveGoalPluginVersion({ list: async () => ({ data: [local] }) })
    assert.equal(identity, "local-enhanced/state-v3@0.1.1")
    const deps = { packageVersion: identity, statePath: STATE_FILE, readFileBounded: undefined, readFile: async () => JSON.stringify({ version: 3, goals: { [SOURCE_SESSION]: rawGoal() } }) }
    assert.equal((await readGoalStateForSession(SOURCE_SESSION, deps))?.current?.id, "goal-alpha")
    await assert.rejects(readGoalStateForSession(SOURCE_SESSION, { ...deps, readFile: async () => JSON.stringify({ version: 2, goals: {} }) }), /requires state version 3/)
    await assert.rejects(readGoalStateForSession(SOURCE_SESSION, { ...deps, packageVersion: "0.1.1" }), /requires .* 0\.1\.67/)
    await assert.rejects(resolveGoalPluginVersion({ list: async () => ({ data: [local, local] }) }), /ambiguous/)
    await assert.rejects(resolveGoalPluginVersion({ list: async () => ({ data: [{ ...local, state: { status: "failed" } }] }) }), /not an active/)
    await writeFile(metadata, JSON.stringify({ ...manifest, goalStateContract: "unknown" }))
    await assert.rejects(resolveGoalPluginVersion({ list: async () => ({ data: [local] }) }), /no supported enhanced state contract/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("rendered snapshot and mandatory documents contain only allowlisted goal data", () => {
  const state = parsedState()
  assert.ok(state.current)
  const output = bundle(state.current)
  assert.deepEqual(Object.keys(output.files).sort(), ["HANDOFF.md", "plan.md", "snapshot.json", "work-history.md"])
  assert.match(output.files["plan.md"], /Persisted plan/)
  assert.doesNotMatch(output.files["plan.md"], /\n-\n> /)
  assert.match(output.files["work-history.md"], /Historical record coverage/)
  assert.match(output.files["work-history.md"], /bounds archives, checkpoints, lifecycle history, and plan change records/)
  assert.match(output.files["work-history.md"], /cannot prove that no earlier history entries were pruned/)
  assert.doesNotMatch(Object.values(output.files).join("\n"), /TRANSCRIPT_SENTINEL|not-exported|supersecretvalue|checkpointsecret|verysecretbearer/)
  const snapshot = JSON.parse(output.files["snapshot.json"])
  assert.equal(snapshot.source.sessionID, SOURCE_SESSION)
  assert.equal(snapshot.source.directory, SOURCE_DIRECTORY)
  assert.equal(snapshot.source.repository.identity, "github.com/example/repository")
  assert.equal(snapshot.source.repository.worktree, "linked/topic")
  assert.equal(snapshot.source.repository.scope, "services/api")
  assert.equal(snapshot.source.exportedAt, "2026-10-27T00:00:00.000Z")
  assert.equal(snapshot.goal.status, "active")
  assert.equal(snapshot.goal.planRevision, 1)
  assert.equal("lastAssistantText" in snapshot.goal, false)
})

test("repository metadata reports safe identity, exact worktree scope, and explicit gaps", async () => {
  const calls: string[][] = []
  const repository = await describeRepository("/repos/repository/services/api", {
    runGit: async (args) => {
      calls.push(args)
      const key = args.join(" ")
      if (key === "rev-parse --show-toplevel") return "/repos/repository"
      if (key === "rev-parse --absolute-git-dir") return "/repos/repository/.git/worktrees/topic"
      if (key === "rev-parse --path-format=absolute --git-common-dir") return "/repos/repository/.git"
      if (key === "remote get-url origin") return "git@github.com:example/repository.git"
      throw new Error(`unexpected git command ${key}`)
    },
  })
  assert.deepEqual(repository, {
    kind: "git",
    identity: "github.com/example/repository",
    worktree: "linked/worktrees/topic",
    scope: "services/api",
    gaps: [],
  })
  assert.equal(calls.length, 4)

  const missingOrigin = await describeRepository("/repos/repository", {
    runGit: async (args) => {
      if (args[1] === "--show-toplevel") return "/repos/repository"
      if (args[1] === "--absolute-git-dir") return "/repos/repository/.git"
      if (args[1] === "--path-format=absolute") return "/repos/repository/.git"
      throw Object.assign(new Error("fatal: no such remote 'origin'"), { stderr: "no such remote 'origin'" })
    },
  })
  assert.equal(missingOrigin.kind, "git")
  assert.equal(missingOrigin.identity, null)
  assert.equal(missingOrigin.worktree, "main")
  assert.equal(missingOrigin.scope, ".")
  assert.match(missingOrigin.gaps.join(" "), /No readable origin remote/)
})

test("rendering keeps goal-provided Markdown and HTML inert", () => {
  const unsafeGoal = parsedState(rawGoal({ objective: "# forged heading\n<script>alert(1)</script> [link](javascript:alert(1))" })).current
  assert.ok(unsafeGoal)
  const output = bundle(unsafeGoal)
  assert.doesNotMatch(output.files["plan.md"], /<script>/)
  assert.match(output.files["plan.md"], /&lt;script&gt;/)
  assert.doesNotMatch(output.files["plan.md"], /\[link\]\(javascript:/)
})

test("semantic fingerprints ignore goal usage-counter churn", () => {
  const base = parsedState()
  const moreUsage = parsedState(rawGoal({ tokensUsed: 998_001, timeUsedSeconds: 99_999 }))
  assert.equal(base.fingerprint, moreUsage.fingerprint)
  const statusChange = parsedState(rawGoal({ status: "paused" }))
  assert.notEqual(base.fingerprint, statusChange.fingerprint)
})

test("writer creates all docs atomically and is idempotent across repeated exports", async () => {
  const fs = new MemoryFileSystem()
  const state = parsedState()
  assert.ok(state.current)
  const first = await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: fs })
  assert.ok(first.written.includes("goal-alpha/plan.md"))
  assert.ok(first.written.includes("goal-alpha/HANDOFF.md"))
  assert.ok(first.written.includes("goal-alpha/work-history.md"))
  assert.ok(first.written.includes("goal-alpha/snapshot.json"))
  assert.ok(first.written.includes("README.md"))
  const second = await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: fs })
  assert.equal(second.written.length, 0)
  assert.equal(second.unchanged.length, 5)
  assert.match(await fs.readFile(path.join(first.docsDirectory, "README.md"), "utf8"), /Exported goals/)
})

test("README ownership digest covers only its managed block, not surrounding manual notes", async () => {
  const fs = new MemoryFileSystem()
  const state = parsedState()
  assert.ok(state.current)
  const result = await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: fs })
  const readmePath = path.join(result.docsDirectory, "README.md")
  const text = await fs.readFile(readmePath)
  const start = text.indexOf("<!-- goal-docs:managed:start -->")
  const end = text.indexOf("<!-- goal-docs:managed:end -->") + "<!-- goal-docs:managed:end -->".length
  assert.ok(start >= 0 && end > start)
  const manifest = JSON.parse(await fs.readFile(path.join(result.docsDirectory, OWNERSHIP_FILE)))
  assert.equal(manifest.files["README.md"], sha256(text.slice(start, end)))
  assert.notEqual(manifest.files["README.md"], sha256(text))
  await fs.putFile(readmePath, `Manual audit note.\n${text}`)
  await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: fs })
  assert.match(await fs.readFile(readmePath), /^Manual audit note\./)
})

test("interruption after file publication before manifest refuses a different generation without overwriting", async () => {
  const fs = new MemoryFileSystem()
  const state = parsedState()
  assert.ok(state.current)
  const original = bundle(state.current)
  const first = await writeGoalDocBundles(SOURCE_DIRECTORY, [original], { fileSystem: fs })
  const root = first.docsDirectory
  const oldManifest = await fs.readFile(path.join(root, OWNERSHIP_FILE))
  const changed = bundle({ ...state.current, status: "paused" })
  const rename = fs.rename.bind(fs)
  fs.rename = async (from, to) => {
    if (to.endsWith(`/${OWNERSHIP_FILE}`)) throw errorWithCode("EIO", "manifest publication interrupted")
    await rename(from, to)
  }
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [changed], { fileSystem: fs }), /atomic goal-docs write failed/)
  fs.rename = rename
  const planPath = path.join(root, "goal-alpha", "plan.md")
  assert.equal(await fs.readFile(planPath), changed.files["plan.md"])
  assert.equal(await fs.readFile(path.join(root, OWNERSHIP_FILE)), oldManifest)
  // Another clock produces different bytes; the writer cannot infer crash versus a manual edit.
  const later = buildGoalDocBundle({ ...changed.source, exportedAt: "2026-10-27T00:01:00.000Z" },
    { ...state.current, status: "paused" }, "Archive history is bounded.")
  const retained = new Map([...fs.entries].filter(([name]) => name.endsWith(".md") || name.endsWith(".json")))
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [later], { fileSystem: fs }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "manual_edit")
  assert.deepEqual(new Map([...fs.entries].filter(([name]) => name.endsWith(".md") || name.endsWith(".json"))), retained)
})

test("status-only changes refresh archive status without inventing a new plan revision", async () => {
  const fs = new MemoryFileSystem()
  const state = parsedState()
  assert.ok(state.current)
  await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: fs })
  const paused = bundle({ ...state.current, status: "paused" })
  const result = await writeGoalDocBundles(SOURCE_DIRECTORY, [paused], { fileSystem: fs })
  const snapshot = JSON.parse(await fs.readFile(path.join(result.docsDirectory, "goal-alpha", "snapshot.json")))
  assert.equal(snapshot.goal.status, "paused")
  assert.equal(snapshot.goal.planRevision, state.current.planRevision)
  assert.match(await fs.readFile(path.join(result.docsDirectory, "README.md")), /`paused`/)
  assert.ok(result.written.includes("goal-alpha/snapshot.json"))
})

test("writer preserves manual edits and manual README text", async () => {
  const fs = new MemoryFileSystem()
  const state = parsedState()
  assert.ok(state.current)
  const first = await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: fs })
  const planPath = path.join(first.docsDirectory, "goal-alpha", "plan.md")
  await fs.putFile(planPath, "manual plan edit\n")
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle({ ...state.current, status: "paused" })], { fileSystem: fs }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "manual_edit")
  assert.equal(await fs.readFile(planPath, "utf8"), "manual plan edit\n")

  const readmeFS = new MemoryFileSystem()
  const initial = await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: readmeFS })
  const readmePath = path.join(initial.docsDirectory, "README.md")
  const oldReadme = await readmeFS.readFile(readmePath, "utf8")
  await readmeFS.putFile(readmePath, `Manual notes before managed content.\n${oldReadme}`)
  const next = await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle({ ...state.current, status: "paused" })], { fileSystem: readmeFS })
  assert.match(await readmeFS.readFile(readmePath, "utf8"), /^Manual notes before managed content\./)
  assert.ok(next.written.includes("goal-alpha/plan.md"))
})

test("writer rejects symlinks, stale revisions, invalid manifests, and concurrent lock holders", async () => {
  const state = parsedState()
  assert.ok(state.current)

  const symlinkFS = new MemoryFileSystem()
  const symlinkRoot = path.join(SOURCE_DIRECTORY, "docs", "goals")
  await symlinkFS.ensureDirectory(symlinkRoot)
  await symlinkFS.putSymlink(path.join(symlinkRoot, "goal-alpha"))
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: symlinkFS }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "symlink")

  const staleFS = new MemoryFileSystem()
  await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: staleFS })
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle({ ...state.current, planRevision: 0 })], { fileSystem: staleFS }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "stale_revision")

  const manifestFS = new MemoryFileSystem()
  const root = path.join(SOURCE_DIRECTORY, "docs", "goals")
  await manifestFS.ensureDirectory(root)
  await manifestFS.putFile(path.join(root, OWNERSHIP_FILE), "not-json")
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: manifestFS }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "invalid_manifest")

  const lockedFS = new MemoryFileSystem()
  await lockedFS.ensureDirectory(root)
  await lockedFS.putFile(path.join(root, ".goal-docs.lock"), "held")
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: lockedFS }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "concurrent")

  const symlinkSourceFS = new MemoryFileSystem()
  await symlinkSourceFS.putSymlink(SOURCE_DIRECTORY)
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: symlinkSourceFS }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "io")

  const missingSourceFS = new MemoryFileSystem()
  missingSourceFS.entries.delete(SOURCE_DIRECTORY)
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: missingSourceFS }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "io")
  assert.equal(missingSourceFS.entries.has(path.join(SOURCE_DIRECTORY, "docs")), false)
})

test("writer recovers verified-dead lock owners but preserves live and unowned locks", async () => {
  const state = parsedState()
  assert.ok(state.current)
  const lockPath = path.join(SOURCE_DIRECTORY, "docs", "goals", ".goal-docs.lock")
  const deadOwnerFS = new MemoryFileSystem()
  await deadOwnerFS.ensureDirectory(path.dirname(lockPath))
  await deadOwnerFS.putFile(lockPath, "2147483647 1800000000000 123e4567-e89b-12d3-a456-426614174000\n")
  const recovered = await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], {
    fileSystem: deadOwnerFS,
    isProcessAlive: () => false,
  })
  assert.ok(recovered.written.includes("goal-alpha/plan.md"))
  assert.equal(deadOwnerFS.entries.has(lockPath), false)

  const liveOwnerFS = new MemoryFileSystem()
  await liveOwnerFS.ensureDirectory(path.dirname(lockPath))
  const liveLock = "123 1800000000000 123e4567-e89b-12d3-a456-426614174000\n"
  await liveOwnerFS.putFile(lockPath, liveLock)
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], {
    fileSystem: liveOwnerFS,
    isProcessAlive: () => true,
  }), (error: unknown) => error instanceof GoalDocsWriteError && error.code === "concurrent")
  assert.equal(await liveOwnerFS.readFile(lockPath, "utf8"), liveLock)
  assert.equal(liveOwnerFS.entries.has(path.join(SOURCE_DIRECTORY, "docs")), true)

  const unownedFS = new MemoryFileSystem()
  await unownedFS.ensureDirectory(path.dirname(lockPath))
  await unownedFS.putFile(lockPath, "owner metadata missing")
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: unownedFS }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "concurrent")
  assert.equal(await unownedFS.readFile(lockPath, "utf8"), "owner metadata missing")
})

test("parallel stale-recovery attempts cannot remove a newer recovery owner's lock", { timeout: 2_000 }, async () => {
  const fs = new MemoryFileSystem()
  const state = parsedState()
  assert.ok(state.current)
  const root = `${SOURCE_DIRECTORY}/docs/goals`
  const lockPath = `${root}/.goal-docs.lock`
  const recoveryPath = `${root}/.goal-docs.lock.recovery`
  const deadOwner = "2147483647 1800000000000 123e4567-e89b-12d3-a456-426614174000\n"
  await fs.putFile(lockPath, deadOwner)
  await fs.putFile(recoveryPath, deadOwner)
  const firstCleanup = deferred()
  const secondCleanup = deferred()
  const releaseFirst = deferred()
  const releaseSecond = deferred()
  const firstFinishedCleanup = deferred()
  const unlink = fs.unlink.bind(fs)
  let recoveryDeletes = 0
  let mainDeletes = 0
  let newerRecoveryRemoved = false
  fs.unlink = async (filePath) => {
    if (filePath === recoveryPath && ++recoveryDeletes === 1) {
      firstCleanup.resolve()
      await releaseFirst.promise
      newerRecoveryRemoved = (await fs.readFile(recoveryPath)) !== deadOwner
      firstFinishedCleanup.resolve()
    }
    if (filePath === lockPath && ++mainDeletes === 1) {
      secondCleanup.resolve()
      await releaseSecond.promise
    }
    await unlink(filePath)
  }
  const write = () => writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current!)], {
    fileSystem: fs, isProcessAlive: (pid) => pid === process.pid,
  }).then(() => "written", (error) => {
    assert.ok(error instanceof GoalDocsWriteError && error.code === "concurrent", String(error))
    return "concurrent"
  })
  const first = write()
  let second: Promise<string> | undefined
  try {
    await Promise.race([firstCleanup.promise, first.then(() => { throw new Error("first writer did not enter stale cleanup") })])
    second = write()
    const secondState = await Promise.race([
      secondCleanup.promise.then(() => "recovering"),
      second,
    ])
    releaseFirst.resolve()
    if (secondState === "recovering") {
      await firstFinishedCleanup.promise
      assert.equal(newerRecoveryRemoved, false, "a stale cleanup removed the new recovery owner's lock")
    } else assert.equal(secondState, "concurrent")
  } finally {
    releaseFirst.resolve()
    releaseSecond.resolve()
    await Promise.allSettled([first, ...(second ? [second] : [])])
  }
})

test("writer bounds generated output and actual manifest reads before document writes", async () => {
  const state = parsedState()
  assert.ok(state.current)
  const fs = new MemoryFileSystem()
  const oversized = bundle(state.current)
  oversized.files["plan.md"] = "x".repeat(512 * 1024 + 1)
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [oversized], { fileSystem: fs }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "bounds")
  assert.equal(fs.entries.has(path.join(SOURCE_DIRECTORY, "docs")), false)
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, new Array(22).fill(bundle(state.current)), { fileSystem: fs }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "bounds")
  assert.equal(fs.entries.has(path.join(SOURCE_DIRECTORY, "docs")), false)

  const manifestFS = new MemoryFileSystem()
  const root = path.join(SOURCE_DIRECTORY, "docs", "goals")
  await manifestFS.ensureDirectory(root)
  const oversizedManifest = "x".repeat(2 * 1024 * 1024 + 1)
  await manifestFS.putFile(path.join(root, OWNERSHIP_FILE), oversizedManifest)
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: manifestFS }),
    /exceeds the 2097152-byte read limit/)
  assert.equal(await manifestFS.readFile(path.join(root, OWNERSHIP_FILE), "utf8"), oversizedManifest)
})

test("atomic rename failure leaves the prior document intact and removes its temporary file", async () => {
  const fs = new MemoryFileSystem()
  const state = parsedState()
  assert.ok(state.current)
  const first = await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle(state.current)], { fileSystem: fs })
  const planPath = path.join(first.docsDirectory, "goal-alpha", "plan.md")
  const original = await fs.readFile(planPath, "utf8")
  fs.failNextRename = true
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle({ ...state.current, status: "paused" })], { fileSystem: fs }),
    (error: unknown) => error instanceof GoalDocsWriteError && error.code === "io")
  assert.equal(await fs.readFile(planPath, "utf8"), original)
  assert.equal([...fs.entries.keys()].some((name) => name.includes(".goal-docs-") && name.endsWith(".tmp")), false)
  assert.equal(fs.processLocks.size, 0)
  const retry = await writeGoalDocBundles(SOURCE_DIRECTORY, [bundle({ ...state.current, status: "paused" })], { fileSystem: fs })
  assert.ok(retry.written.includes("goal-alpha/plan.md"))
})

test("different worktree roots have independent manifests and can write concurrently", async () => {
  const fs = new MemoryFileSystem()
  const state = parsedState()
  assert.ok(state.current)
  const [left, right] = await Promise.all([
    writeGoalDocBundles("/scratch/worktree-a", [bundle(state.current, "/scratch/worktree-a")], { fileSystem: fs }),
    writeGoalDocBundles("/scratch/worktree-b", [bundle(state.current, "/scratch/worktree-b")], { fileSystem: fs }),
  ])
  assert.notEqual(left.docsDirectory, right.docsDirectory)
  assert.ok(fs.entries.has(path.join(left.docsDirectory, OWNERSHIP_FILE)))
  assert.ok(fs.entries.has(path.join(right.docsDirectory, OWNERSHIP_FILE)))
})

test("edit assertions deny Plan/read-only sessions and require the scoped permission API", async () => {
  const calls: unknown[] = []
  const permission = { assert: async (input: unknown) => { calls.push(input) } }
  await assertEditableSession(permission, sourceInfo(), SOURCE_DIRECTORY)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], {
    sessionID: SOURCE_SESSION,
    agent: "build",
    action: "edit",
    resources: [`${SOURCE_DIRECTORY}/docs/goals/**`],
  })
  await assert.rejects(assertEditableSession(permission, sourceInfo({ agent: "plan" }), SOURCE_DIRECTORY), /Plan or read-only/)
  await assert.rejects(assertEditableSession(undefined, sourceInfo(), SOURCE_DIRECTORY), /permission assertion API/)
  await assert.rejects(assertEditableSession({ assert: async () => { throw new Error("denied") } }, sourceInfo(), SOURCE_DIRECTORY), /denied/)
  await assert.rejects(getOwnedSession({ get: async () => sourceInfo({
    location: { directory: "/scratch/other-repo" },
    projectID: "project-one",
  }) }, SOURCE_SESSION, { directory: SOURCE_DIRECTORY, project: { id: "project-one" } }), /cross-repository/)
})

test("exporter writes only the explicit session worktree after permission approval", async () => {
  const fs = new MemoryFileSystem()
  const state = parsedState()
  const fake = fakeHandoffSession()
  const result = await exportGoalState({ sessionID: SOURCE_SESSION, goalID: "goal-alpha" }, {
    session: fake.session,
    permission: fake.permission,
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-one" } },
    readState: async () => state,
    repositoryMetadata,
    fileSystem: fs,
  })
  assert.equal(result.status, "exported")
  assert.equal(result.selected?.goalID, "goal-alpha")
  assert.equal(result.write?.docsDirectory, path.join(SOURCE_DIRECTORY, "docs", "goals"))
  assert.equal(fake.permissionCalls.length, 1)
  assert.ok(fs.entries.has(path.join(SOURCE_DIRECTORY, "docs", "goals", "goal-alpha", "snapshot.json")))
  await assert.rejects(exportGoalState({ sessionID: SOURCE_SESSION, goalID: "unknown" }, {
    session: fake.session,
    permission: fake.permission,
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-one" } },
    readState: async () => state,
    repositoryMetadata,
    fileSystem: fs,
  }), /not present in the selected session/)
})

test("exporter reports missing state without requesting write permission", async () => {
  const fake = fakeHandoffSession()
  const result = await exportGoalState({ sessionID: SOURCE_SESSION }, {
    session: fake.session,
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-one" } },
    repositoryMetadata,
    readState: async () => null,
  })
  assert.equal(result.status, "missing")
  assert.equal(result.bundles.length, 0)
  assert.equal(fake.permissionCalls.length, 0)
})

test("RPC handler outputs match the bounded export contract and contain no thrown errors", async () => {
  const fs = new MemoryFileSystem()
  const fake = fakeHandoffSession()
  const handlers = createGoalDocsRpcHandlers({
    session: fake.session,
    permission: fake.permission,
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-one" } },
    repositoryMetadata,
    readState: async () => parsedState(),
    fileSystem: fs,
  })
  const result = await handlers.export({ sourceSessionID: SOURCE_SESSION })
  assert.equal(result.status, "exported")
  assert.equal(result.currentGoalID, "goal-alpha")
  assert.deepEqual(result.goalIDs, ["goal-alpha"])
  const failed = await handlers.export({ sourceSessionID: "ses_outside" })
  assert.equal(failed.status, "failed")
  assert.equal(failed.sourceDirectory, "")
  assert.match(failed.message, /different session ID|cross-repository/)
})

test("RPC definition has the required events map and progress contract", () => {
  assert.equal(GoalDocsRpcDefinition.id, "computer-use.goal-docs")
  assert.deepEqual(GoalDocsRpcDefinition.events, {})
  assert.deepEqual(Object.keys(GoalDocsRpcDefinition.methods).sort(), ["export", "handoff", "opened"])
  const output = GoalDocsRpcDefinition.methods.handoff.output
  assert.ok(output.required.includes("progress"))
  assert.deepEqual(output.properties.progress.required, ["docs", "target", "seed"])
})

test("RPC output narrowing accepts actual handler results and rejects schema drift", async () => {
  const fake = fakeHandoffSession()
  const handlers = createGoalDocsRpcHandlers(handoffDependencies(fake, new MemoryFileSystem()))
  const exported = await handlers.export({ sourceSessionID: SOURCE_SESSION })
  assert.equal(decodeGoalDocsRpcOutput("export", exported), exported)
  for (const invalid of [null, [], {}, { ...exported, status: "invented" }, { ...exported, goalIDs: [123] }, { ...exported, unknown: true }]) {
    assert.throws(() => decodeGoalDocsRpcOutput("export", invalid), /Invalid goal-docs export RPC output/)
  }
  const handoff = await handlers.handoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" })
  assert.equal(decodeGoalDocsRpcOutput("handoff", handoff), handoff)
  for (const invalid of [{ ...handoff, progress: {} }, { ...handoff, progress: { ...handoff.progress, seed: "ready" } }, { ...handoff, targetSessionID: 123 }]) {
    assert.throws(() => decodeGoalDocsRpcOutput("handoff", invalid), /Invalid goal-docs handoff RPC output/)
  }
  assert.ok(handoff.targetSessionID)
  const opened = await handlers.opened({ sourceSessionID: SOURCE_SESSION, transferID: handoff.transferID, targetSessionID: handoff.targetSessionID })
  assert.equal(decodeGoalDocsRpcOutput("opened", opened), opened)
  assert.throws(() => decodeGoalDocsRpcOutput("opened", { ...opened, outcome: "pending" }), /Invalid goal-docs opened RPC output/)
})

test("RPC lifecycle cancellation reaches handoff handlers before any session or permission operation", async () => {
  const fake = fakeHandoffSession()
  const controller = new AbortController()
  controller.abort(new Error("plugin unloaded"))
  const handlers = createGoalDocsRpcHandlers(handoffDependencies(fake, new MemoryFileSystem()), { signal: controller.signal })
  const result = await handlers.handoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" })
  assert.equal(result.outcome, "failed")
  assert.equal(result.phase, "export")
  assert.deepEqual(result.progress, { docs: "not_started", target: "not_created", seed: "not_sent" })
  assert.match(result.message, /plugin unloaded/)
  assert.equal(fake.permissionCalls.length, 0)
  assert.equal(fake.creates.length, 0)
  assert.equal(fake.prompts.length, 0)
})

test("event observer ignores non-idle status and unrelated events, and deduplicates busy snapshots", async () => {
  const state = parsedState()
  const fake = fakeHandoffSession()
  const writes: string[] = []
  const reports: string[] = []
  let finishExport: (() => void) | undefined
  const exported = new Promise<void>((resolve) => { finishExport = resolve })
  const events: GoalDocsEvent[] = [
    { type: "session.status", data: { sessionID: SOURCE_SESSION, status: { type: "busy" } } },
    { type: "permission.asked", data: { sessionID: SOURCE_SESSION } },
    { type: "session.execution.succeeded", data: { sessionID: SOURCE_SESSION } },
    { type: "session.execution.succeeded", data: { sessionID: SOURCE_SESSION } },
  ]
  const stop = startGoalObserver({
    session: fake.session,
    permission: fake.permission,
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-one" } },
    repositoryMetadata,
    readState: async () => state,
    event: {
      subscribe: () => (async function* () {
        for (const event of events) yield event
      })(),
    },
    writeBundles: async (directory, bundles) => {
      writes.push(`${directory}:${bundles.length}`)
      finishExport?.()
      return { bundles: [...bundles], docsDirectory: path.join(directory, "docs", "goals"), written: [], unchanged: [], goals: bundles.map((item) => item.goalID) }
    },
    watchState: () => ({ close: () => undefined }),
    report: (message) => reports.push(message),
  })
  await exported
  await new Promise<void>((resolve) => setImmediate(resolve))
  stop()
  assert.deepEqual(writes, [`${SOURCE_DIRECTORY}:1`])
  assert.deepEqual(reports, [])
})

test("observer performs bounded startup recovery and refreshes only the changed goal-state file", async () => {
  const fake = fakeHandoffSession()
  const writes: string[] = []
  const firstWrite = deferred()
  const secondWrite = deferred()
  let changedState = parsedState()
  let watchCallback: ((filename: string | null) => void) | undefined
  const stop = startGoalObserver({
    session: fake.session,
    permission: fake.permission,
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-one" } },
    repositoryMetadata,
    listSessions: async () => [SOURCE_SESSION],
    readState: async () => changedState,
    event: { subscribe: () => (async function* () {})() },
    statePath: "/scratch/goals.json",
    watchState: (directory, callback) => {
      assert.equal(directory, "/scratch")
      watchCallback = callback
      return { close: () => undefined }
    },
    writeBundles: async (directory, bundles) => {
      writes.push(`${directory}:${bundles[0]?.status}`)
      if (writes.length === 1) firstWrite.resolve()
      if (writes.length === 2) secondWrite.resolve()
      return { bundles: [...bundles], docsDirectory: path.join(directory, "docs", "goals"), written: [], unchanged: [], goals: bundles.map((item) => item.goalID) }
    },
  })
  const keepAlive = setTimeout(() => undefined, 1_000)
  try {
    await firstWrite.promise
    assert.deepEqual(writes, [`${SOURCE_DIRECTORY}:active`])
    changedState = parsedState(rawGoal({ status: "paused" }))
    assert.ok(watchCallback)
    watchCallback("unrelated.json")
    assert.deepEqual(writes, [`${SOURCE_DIRECTORY}:active`])
    watchCallback("goals.json")
    await secondWrite.promise
    assert.deepEqual(writes, [`${SOURCE_DIRECTORY}:active`, `${SOURCE_DIRECTORY}:paused`])
  } finally {
    clearTimeout(keepAlive)
    stop()
  }
})

test("observer coalesces concurrent lifecycle changes into one trailing export", async () => {
  const fake = fakeHandoffSession()
  let currentState = parsedState()
  const writes: string[] = []
  const secondWrite = deferred()
  const releaseSecondEvent = deferred()
  const stop = startGoalObserver({
    session: fake.session,
    permission: fake.permission,
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-one" } },
    repositoryMetadata,
    listSessions: async () => [],
    readState: async () => currentState,
    event: {
      subscribe: () => (async function* () {
        yield { type: "session.execution.succeeded", data: { sessionID: SOURCE_SESSION } }
        await releaseSecondEvent.promise
        yield { type: "session.execution.succeeded", data: { sessionID: SOURCE_SESSION } }
      })(),
    },
    watchState: () => ({ close: () => undefined }),
    writeBundles: async (directory, bundles) => {
      writes.push(`${directory}:${bundles[0]?.status}`)
      if (writes.length === 1) {
        currentState = parsedState(rawGoal({ status: "paused" }))
        releaseSecondEvent.resolve()
      }
      if (writes.length === 2) secondWrite.resolve()
      return { bundles: [...bundles], docsDirectory: path.join(directory, "docs", "goals"), written: [], unchanged: [], goals: bundles.map((item) => item.goalID) }
    },
  })
  try {
    await secondWrite.promise
    assert.deepEqual(writes, [`${SOURCE_DIRECTORY}:active`, `${SOURCE_DIRECTORY}:paused`])
  } finally {
    stop()
  }
})

test("observer exports semantic lifecycle changes and retains cleared and replaced goal documents", async () => {
  const fs = new MemoryFileSystem()
  const fake = fakeHandoffSession()
  let state = parsedState()
  let nextEvent = deferred<GoalDocsEvent | undefined>()
  let writes = 0
  const reports: string[] = []
  const stop = startGoalObserver({
    ...handoffDependencies(fake, fs),
    listSessions: async () => [],
    readState: async () => state,
    event: { subscribe: () => (async function* () {
      while (true) {
        const event = await nextEvent.promise
        nextEvent = deferred()
        if (!event) return
        yield event
      }
    })() },
    writeBundles: async (directory, bundles) => {
      const result = await writeGoalDocBundles(directory, bundles, { fileSystem: fs })
      writes++
      return result
    },
    watchState: () => ({ close() {} }),
    report: (message) => reports.push(message),
  })
  const notify = async () => {
    nextEvent.resolve({ type: "session.execution.succeeded", data: { sessionID: SOURCE_SESSION } })
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  const snapshot = async (id: string) => JSON.parse(await fs.readFile(`${SOURCE_DIRECTORY}/docs/goals/${id}/snapshot.json`))
  try {
    await notify()
    assert.equal(writes, 1)
    const initial = await snapshot("goal-alpha")
    state = parsedState(rawGoal({ tokensUsed: 999_999, timeUsedSeconds: 123_456 }))
    await notify()
    assert.equal(writes, 1, "usage-only changes must not rewrite exports")

    const checkpoint = { summary: "Lifecycle acceptance checkpoint", timestamp: 1_800_000_100 }
    state = parsedState(rawGoal({ checkpoints: [checkpoint] }))
    await notify()
    assert.equal(writes, 2)
    assert.match(await fs.readFile(`${SOURCE_DIRECTORY}/docs/goals/goal-alpha/work-history.md`), /Lifecycle acceptance checkpoint/)

    for (const status of ["paused", "active", "complete"]) {
      state = parsedState(rawGoal({ status }))
      await notify()
      assert.equal((await snapshot("goal-alpha")).goal.status, status)
    }
    const alpha = rawGoal({ status: "complete" })
    const beta = rawGoal({ id: "goal-beta", objective: "Replacement goal" })
    state = parsedState(beta, { archives: [alpha] })
    await notify()
    assert.equal((await snapshot("goal-alpha")).goal.sourceKind, "archive")
    assert.equal((await snapshot("goal-beta")).goal.status, "active")
    state = parsedState({ ...beta, status: "cancelled" }, { archives: [alpha] })
    await notify()
    assert.equal((await snapshot("goal-beta")).goal.status, "cancelled")
    state = parseSessionGoalState({ version: 3, goals: {}, archives: { [SOURCE_SESSION]: [alpha, { ...beta, status: "cancelled" }] } }, SOURCE_SESSION)
    await notify()
    assert.equal((await snapshot("goal-beta")).goal.sourceKind, "archive")
    const retained = await fs.readFile(`${SOURCE_DIRECTORY}/docs/goals/goal-beta/HANDOFF.md`)
    state = parseSessionGoalState({ version: 3, goals: {}, archives: {} }, SOURCE_SESSION)
    await notify()
    assert.equal(await fs.readFile(`${SOURCE_DIRECTORY}/docs/goals/goal-beta/HANDOFF.md`), retained)
    assert.equal(writes, 8)
    assert.notDeepEqual(await snapshot("goal-alpha"), initial)
    assert.deepEqual(reports, [])
    assert.deepEqual(fake.prompts, [], "automatic export must not inject a prompt")
    assert.deepEqual(fake.creates, [], "automatic export must not create a session")
  } finally {
    stop()
    nextEvent.resolve(undefined)
  }
})

test("observer failures preserve source state and retry the same snapshot after denial or disk failure", async () => {
  for (const failure of ["permission", "disk"]) {
    const fs = new MemoryFileSystem()
    const sourceBytes = JSON.stringify({ version: 3, goals: { [SOURCE_SESSION]: rawGoal() } })
    await fs.putFile(STATE_FILE, sourceBytes)
    const fake = fakeHandoffSession()
    let deny = failure === "permission"
    fake.permission.assert = async () => { if (deny) throw new Error("edit permission denied") }
    fs.failNextRename = failure === "disk"
    let nextEvent = deferred<GoalDocsEvent | undefined>()
    const reports: string[] = []
    const stop = startGoalObserver({
      ...handoffDependencies(fake, fs),
      listSessions: async () => [],
      readState: async () => parseSessionGoalState(JSON.parse(await fs.readFile(STATE_FILE)), SOURCE_SESSION),
      event: { subscribe: () => (async function* () {
        while (true) {
          const event = await nextEvent.promise
          nextEvent = deferred()
          if (!event) return
          yield event
        }
      })() },
      watchState: () => ({ close() {} }),
      report: (message) => reports.push(message),
    })
    const notify = async () => {
      nextEvent.resolve({ type: "session.execution.succeeded", data: { sessionID: SOURCE_SESSION } })
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
    try {
      await notify()
      assert.equal(reports.length, 1, failure)
      assert.match(reports[0], /goal execution was not interrupted/)
      assert.equal(await fs.readFile(STATE_FILE), sourceBytes)
      assert.equal(fs.processLocks.size, 0)
      deny = false
      await notify()
      const snapshot = JSON.parse(await fs.readFile(`${SOURCE_DIRECTORY}/docs/goals/goal-alpha/snapshot.json`))
      assert.equal(snapshot.goal.id, "goal-alpha")
      assert.equal(snapshot.goal.status, "active")
      assert.equal(reports.length, 1, "the failed snapshot must remain retryable")
      assert.equal(await fs.readFile(STATE_FILE), sourceBytes)
      assert.deepEqual(fake.prompts, [])
      assert.deepEqual(fake.creates, [])
    } finally {
      stop()
      nextEvent.resolve(undefined)
    }
  }
})

function fakeHandoffSession(options: { failPromptOnce?: boolean } = {}) {
  const source = sourceInfo()
  const target = {
    id: "ses_target",
    agent: source.agent,
    location: source.location,
    projectID: source.projectID,
    permissions: source.permissions,
    model: source.model,
    metadata: { goalDocsHandoff: { transferID: "not-known-until-create", sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" } },
  }
  const creates: Record<string, unknown>[] = []
  const prompts: Array<{ sessionID: string; text: string; id: string; resume: false }> = []
  const permissionCalls: unknown[] = []
  const listItems: unknown[] = []
  let failPrompt = options.failPromptOnce === true
  return {
    source,
    target,
    creates,
    prompts,
    permissionCalls,
    listItems,
    session: {
      get: async ({ sessionID }: { sessionID: string }) => sessionID === SOURCE_SESSION ? source : target,
      list: async (_input?: { directory: string; limit: number; cursor?: unknown }): Promise<unknown> => listItems,
      create: async (input: Record<string, unknown>) => {
        creates.push(input)
        target.id = typeof input.id === "string" ? input.id : "ses_target"
        target.metadata = input.metadata as typeof target.metadata
        target.permissions = input.permissions as typeof target.permissions
        target.model = input.model as typeof target.model
        target.agent = input.agent as typeof target.agent
        return {
          id: target.id,
          agent: target.agent,
          location: source.location,
          projectID: source.projectID,
          permissions: target.permissions,
          model: target.model,
          metadata: target.metadata,
        }
      },
      prompt: async (input: { sessionID: string; text: string; id: string; resume: false }) => {
        prompts.push(input)
        if (failPrompt) {
          failPrompt = false
          throw new Error("injected prompt transport failure")
        }
        return { id: input.id }
      },
    },
    permission: { assert: async (input: unknown) => { permissionCalls.push(input) } },
  }
}

function handoffDependencies(fake: ReturnType<typeof fakeHandoffSession>, fs: MemoryFileSystem) {
  const state = parsedState()
  return {
    session: fake.session,
    permission: fake.permission,
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-one" } },
    repositoryMetadata,
    readState: async () => state,
    fileSystem: fs,
  }
}

function racingHandoff(hold: "create" | "seed", failLate = false) {
  const fs = new MemoryFileSystem()
  const source = sourceInfo()
  const sessions = new Map<string, SessionInfo>()
  const messages = new Map<string, { sessionID: string; text: string }>()
  const started = deferred()
  const release = deferred()
  let clock = Date.UTC(2026, 9, 27)
  let creates = 0
  let prompts = 0
  const session: HandoffSessionApi = {
    async get({ sessionID }) {
      if (sessionID === SOURCE_SESSION) return source
      const target = sessions.get(sessionID)
      if (!target) throw errorWithCode("ENOENT")
      return target
    },
    async list() { return { data: [...sessions.values()], cursor: { next: null } } },
    async create(input) {
      const call = ++creates
      if (hold === "create" && call === 1) { started.resolve(); await release.promise }
      const id = typeof input.id === "string" ? input.id : `ses_unstable_${call}`
      if (!sessions.has(id)) sessions.set(id, { ...input, id, projectID: source.projectID, location: source.location })
      return sessions.get(id)
    },
    async prompt(input) {
      const call = ++prompts
      if (hold === "seed" && call === 1) {
        started.resolve()
        await release.promise
        if (failLate) throw new Error("late prompt transport failure")
      }
      const previous = messages.get(input.id)
      if (previous) assert.deepEqual(previous, { sessionID: input.sessionID, text: input.text })
      else messages.set(input.id, { sessionID: input.sessionID, text: input.text })
      return { id: input.id }
    },
  }
  const dependencies: HandoffDependencies = {
    session,
    permission: { assert: async () => {} },
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-one" } },
    repositoryMetadata,
    readState: async () => parsedState(),
    fileSystem: fs,
    now: () => clock,
  }
  return { fs, sessions, messages, dependencies, started, release, get creates() { return creates }, expire: () => { clock += 61_000 } }
}

test("an unexpired create claim does not launch a second creation or seed", async () => {
  const race = racingHandoff("create")
  const input = { sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }
  const first = coordinateHandoff(input, race.dependencies)
  try {
    await Promise.race([race.started.promise, first.then((result) => { throw new Error(result.message) })])
    const second = await coordinateHandoff(input, race.dependencies)
    assert.equal(second.outcome, "pending")
    assert.equal(second.phase, "create")
    assert.equal(race.creates, 1)
    assert.equal(race.messages.size, 0)
  } finally { race.release.resolve(); await first }
  assert.equal(race.sessions.size, 1)
  assert.equal(race.messages.size, 1)
})

test("expired create leases still produce one destination and preserve a newer open acknowledgement", async () => {
  const race = racingHandoff("create")
  const input = { sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }
  const first = coordinateHandoff(input, race.dependencies)
  let second
  try {
    await Promise.race([race.started.promise, first.then((result) => { throw new Error(result.message) })])
    race.expire()
    second = await coordinateHandoff(input, race.dependencies)
    assert.equal(second.phase, "open", second.message)
    assert.ok(second.targetSessionID)
    await markHandoffOpened({ sourceSessionID: SOURCE_SESSION, transferID: second.transferID, targetSessionID: second.targetSessionID }, race.dependencies)
  } finally { race.release.resolve(); await first }
  assert.equal(race.sessions.size, 1)
  assert.equal(race.messages.size, 1)
  const manifest = JSON.parse(await race.fs.readFile(`${SOURCE_DIRECTORY}/docs/goals/${OWNERSHIP_FILE}`))
  assert.equal(manifest.transfers[second!.transferID].status, "complete")
})

test("a late seed failure never overwrites a newer successful transfer", async () => {
  const race = racingHandoff("seed", true)
  const input = { sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }
  const first = coordinateHandoff(input, race.dependencies)
  let second
  try {
    await Promise.race([race.started.promise, first.then((result) => { throw new Error(result.message) })])
    race.expire()
    second = await coordinateHandoff(input, race.dependencies)
    assert.ok(second.targetSessionID)
    await markHandoffOpened({ sourceSessionID: SOURCE_SESSION, transferID: second.transferID, targetSessionID: second.targetSessionID }, race.dependencies)
  } finally { race.release.resolve(); await first }
  const manifest = JSON.parse(await race.fs.readFile(`${SOURCE_DIRECTORY}/docs/goals/${OWNERSHIP_FILE}`))
  assert.equal(manifest.transfers[second!.transferID].status, "complete")
  assert.equal(race.sessions.size, 1)
  assert.equal(race.messages.size, 1)
})

test("claim acquisition never downgrades a transfer completed after the initial read", async () => {
  const race = racingHandoff("seed")
  const input = { sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }
  const first = coordinateHandoff(input, race.dependencies)
  const read = race.fs.readFileBounded.bind(race.fs)
  let interleaved = false
  try {
    await Promise.race([race.started.promise, first.then((result) => { throw new Error(result.message) })])
    race.fs.readFileBounded = async (filePath, limit, signal) => {
      const stale = await read(filePath, limit, signal)
      if (!interleaved && filePath.endsWith(OWNERSHIP_FILE) &&
        !race.fs.entries.has(`${SOURCE_DIRECTORY}/docs/goals/.goal-docs.lock`)) {
        interleaved = true
        race.release.resolve()
        const result = await first
        assert.ok(result.targetSessionID)
        const opened = await markHandoffOpened({ sourceSessionID: SOURCE_SESSION, transferID: result.transferID, targetSessionID: result.targetSessionID }, race.dependencies)
        assert.equal(opened.outcome, "complete")
      }
      return stale
    }
    const second = await coordinateHandoff(input, race.dependencies)
    assert.equal(interleaved, true)
    assert.equal(second.phase, "open", second.message)
    assert.equal(second.outcome, "pending")
    assert.equal(second.progress.target, "verified")
    assert.equal(second.progress.seed, "admitted")
    const manifest = JSON.parse(await race.fs.readFile(`${SOURCE_DIRECTORY}/docs/goals/${OWNERSHIP_FILE}`))
    assert.equal(manifest.transfers[second.transferID].status, "complete")
  } finally {
    race.fs.readFileBounded = read
    race.release.resolve()
    await first
  }
})

test("handoff uses independent same-worktree session, preserved permissions, stable message ID, and local open status", async () => {
  const fs = new MemoryFileSystem()
  const fake = fakeHandoffSession()
  fake.source.model = { providerID: "local", id: "test-model", variant: "deep" }
  fake.target.model = fake.source.model
  const sourcePermissions = JSON.parse(JSON.stringify(fake.source.permissions))
  const deps = handoffDependencies(fake, fs)
  const first = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.equal(first.phase, "open", first.message)
  assert.equal(first.outcome, "pending")
  assert.equal(first.targetSessionID, createTargetSessionID(first.transferID))
  assert.ok(first.targetSessionID)
  assert.equal(fake.creates.length, 1)
  assert.equal(fake.creates[0].location, fake.source.location)
  assert.equal("parentID" in fake.creates[0], false)
  assert.deepEqual(fake.creates[0].permissions, fake.source.permissions)
  assert.deepEqual(fake.creates[0].model, { providerID: "local", id: "test-model", variant: "deep" })
  assert.deepEqual(fake.source.permissions, sourcePermissions)
  assert.equal(fake.prompts.length, 1)
  assert.equal(fake.prompts[0].resume, false)
  assert.equal(fake.prompts[0].id, first.messageID)
  assert.deepEqual(first.progress, { docs: "complete", target: "verified", seed: "admitted" })
  assert.match(fake.prompts[0].text, /HANDOFF\.md/)
  assert.equal(fake.prompts[0].text.includes("TRANSCRIPT_SENTINEL"), false)

  const retry = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.equal(retry.transferID, first.transferID)
  assert.equal(retry.messageID, first.messageID)
  assert.equal(fake.creates.length, 1)
  assert.equal(fake.prompts.length, 1)

  const opened = await markHandoffOpened({
    sourceSessionID: SOURCE_SESSION,
    transferID: first.transferID,
    targetSessionID: first.targetSessionID,
  }, deps)
  assert.equal(opened.outcome, "complete")
  const repeatOpen = await markHandoffOpened({
    sourceSessionID: SOURCE_SESSION,
    transferID: first.transferID,
    targetSessionID: first.targetSessionID,
  }, deps)
  assert.equal(repeatOpen.outcome, "complete")
  const anotherClient = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.equal(anotherClient.outcome, "pending")
  assert.match(anotherClient.message, /focus still needs verification/)
})

test("handoff seed is context only and carries source-qualified explicit continuation gates", () => {
  for (const status of ["active", "paused", "complete"]) {
    const state = parsedState(rawGoal({ status }))
    assert.ok(state.current)
    const saved = bundle(state.current)
    const text = handoffPrompt(saved, saved.source)
    for (const required of [
      "Context-only handoff", "resume:false", "Wait for the user's explicit /handoff_resume",
      "do not substitute another command", "source session ID and goal ID both match",
      "Preserve paused/closed status", "never create, rebind, or activate a goal",
      "source session and all relevant workers inactive", "complete, untruncated coverage",
      "Active, unknown, unavailable, or conflicting source data requires asking",
      SOURCE_SESSION, SOURCE_DIRECTORY, "goal-alpha", status,
      "--- HANDOFF.md ---", "--- plan.md ---", "--- work-history.md ---",
    ]) assert.ok(text.includes(required), `Missing ${required} for ${status}`)
    assert.equal(text.startsWith("Continue from"), false)
  }
})

test("open acknowledgement cannot substitute another source session in the same worktree", async () => {
  const fs = new MemoryFileSystem()
  const fake = fakeHandoffSession()
  const get = fake.session.get
  fake.session.get = async (input) => input.sessionID === "ses_other_source"
    ? { ...fake.source, id: "ses_other_source" }
    : get(input)
  const deps = handoffDependencies(fake, fs)
  const handoff = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.ok(handoff.targetSessionID)
  const result = await markHandoffOpened({ sourceSessionID: "ses_other_source", transferID: handoff.transferID, targetSessionID: handoff.targetSessionID }, deps)
  assert.equal(result.outcome, "failed")
  const manifest = JSON.parse(await fs.readFile(`${SOURCE_DIRECTORY}/docs/goals/${OWNERSHIP_FILE}`))
  assert.equal(manifest.transfers[handoff.transferID].status, "in_progress")
  const input = { sourceSessionID: SOURCE_SESSION, transferID: handoff.transferID, targetSessionID: handoff.targetSessionID }
  assert.equal((await markHandoffOpened(input, deps)).outcome, "complete")
  assert.equal((await markHandoffOpened({ ...input, sourceSessionID: "ses_other_source" }, deps)).outcome, "failed")
})

test("cancellation after target creation retains it for a nonduplicating retry", async () => {
  const fake = fakeHandoffSession()
  const deps = handoffDependencies(fake, new MemoryFileSystem())
  const controller = new AbortController()
  const create = fake.session.create
  fake.session.create = async (input) => {
    const result = await create(input)
    controller.abort(new Error("cancelled after creation"))
    return result
  }
  const input = { sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }
  const first = await coordinateHandoff(input, deps, { signal: controller.signal })
  assert.equal(first.outcome, "failed")
  assert.equal(first.progress.target, "created")
  assert.equal(first.progress.seed, "not_sent")
  assert.equal(fake.prompts.length, 0)
  fake.session.create = create
  const retry = await coordinateHandoff(input, deps)
  assert.equal(retry.outcome, "pending", retry.message)
  assert.equal(retry.targetSessionID, first.targetSessionID)
  assert.equal(fake.creates.length, 1)
  assert.equal(fake.prompts.length, 1)
})

test("cancellation after possible prompt admission replays the same input without another message", async () => {
  const fake = fakeHandoffSession()
  const deps = handoffDependencies(fake, new MemoryFileSystem())
  const controller = new AbortController()
  const messages = new Map<string, { sessionID: string; text: string }>()
  let fail = true
  fake.session.prompt = async (input) => {
    fake.prompts.push(input)
    const value = { sessionID: input.sessionID, text: input.text }
    if (messages.has(input.id)) assert.deepEqual(messages.get(input.id), value)
    else messages.set(input.id, value)
    if (fail) {
      fail = false
      controller.abort(new Error("cancelled after possible admission"))
      throw new Error("admission response interrupted")
    }
    return { id: input.id }
  }
  const input = { sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }
  const first = await coordinateHandoff(input, deps, { signal: controller.signal })
  assert.equal(first.outcome, "failed")
  assert.equal(first.progress.seed, "unknown")
  const retry = await coordinateHandoff(input, deps)
  assert.equal(retry.outcome, "pending", retry.message)
  assert.equal(fake.creates.length, 1)
  assert.equal(messages.size, 1)
  assert.equal(fake.prompts[0].id, fake.prompts[1].id)
  assert.equal(fake.prompts[0].text, fake.prompts[1].text)
})

test("unchanged exports retain the saved timestamp and bytes across new clocks", async () => {
  const fs = new MemoryFileSystem()
  const fake = fakeHandoffSession()
  let clock = Date.UTC(2026, 9, 27)
  const deps = { ...handoffDependencies(fake, fs), now: () => clock }
  const input = { sessionID: SOURCE_SESSION, goalID: "goal-alpha" }
  const first = await exportGoalState(input, deps)
  assert.ok(first.selected)
  clock += 1_000
  const repeated = await exportGoalState(input, deps)
  assert.ok(repeated.selected)
  assert.deepEqual(repeated.write?.written, [])
  assert.deepEqual(repeated.selected.files, first.selected.files)
  assert.deepEqual(repeated.source, first.source)

  const changed = await exportGoalState(input, {
    ...deps,
    readState: async () => parsedState(rawGoal({ status: "paused" })),
  })
  assert.ok(changed.selected)
  assert.equal(changed.source.exportedAt, new Date(clock).toISOString())
  assert.notDeepEqual(changed.selected.files, first.selected.files)
})

test("bundle reuse preserves manual edits and refreshes legacy render versions", async () => {
  const state = parsedState()
  assert.ok(state.current)
  const original = bundle(state.current)
  const editedFS = new MemoryFileSystem()
  await writeGoalDocBundles(SOURCE_DIRECTORY, [original], { fileSystem: editedFS })
  await editedFS.putFile(`${SOURCE_DIRECTORY}/docs/goals/goal-alpha/HANDOFF.md`, "manual content")
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [original], { fileSystem: editedFS }), /removed or edited/)

  const legacyFS = new MemoryFileSystem()
  const legacySnapshot = JSON.parse(original.files["snapshot.json"])
  delete legacySnapshot.renderVersion
  const legacy = { ...original, files: { ...original.files, "snapshot.json": JSON.stringify(legacySnapshot) } }
  await writeGoalDocBundles(SOURCE_DIRECTORY, [legacy], { fileSystem: legacyFS })
  const refreshed = await writeGoalDocBundles(SOURCE_DIRECTORY, [original], { fileSystem: legacyFS })
  assert.ok(refreshed.written.includes("goal-alpha/snapshot.json"))
  assert.equal(JSON.parse(refreshed.bundles[0].files["snapshot.json"]).renderVersion, 1)
  const otherSession = buildGoalDocBundle(
    { ...original.source, sessionID: "ses_other" },
    { ...state.current, sessionID: "ses_other" },
    "Archive history is bounded.",
  )
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [otherSession], { fileSystem: legacyFS }), /different source session/)
})

test("bundle reuse never accepts a manifest-owned but partially written snapshot", async () => {
  const state = parsedState()
  assert.ok(state.current)
  const original = bundle(state.current)
  const fs = new MemoryFileSystem()
  await writeGoalDocBundles(SOURCE_DIRECTORY, [original], { fileSystem: fs })
  const rename = fs.rename.bind(fs)
  fs.rename = async (from, to) => {
    if (to.endsWith("/HANDOFF.md")) throw errorWithCode("EIO", "interrupted bundle update")
    await rename(from, to)
  }
  await assert.rejects(writeGoalDocBundles(SOURCE_DIRECTORY, [bundle({ ...state.current, status: "paused" })], { fileSystem: fs }), /atomic goal-docs write failed/)
  fs.rename = rename
  const repaired = await writeGoalDocBundles(SOURCE_DIRECTORY, [original], { fileSystem: fs })
  assert.deepEqual(repaired.bundles[0].files, original.files)
  assert.equal(await fs.readFile(`${SOURCE_DIRECTORY}/docs/goals/goal-alpha/plan.md`), original.files["plan.md"])
})

test("handoff seed retry reuses the target, stable message ID and exact saved text after partial failure", async () => {
  const fs = new MemoryFileSystem()
  const fake = fakeHandoffSession({ failPromptOnce: true })
  let clock = Date.UTC(2026, 9, 27)
  const deps = { ...handoffDependencies(fake, fs), now: () => clock }
  const failed = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.equal(failed.phase, "seed", failed.message)
  assert.equal(failed.outcome, "failed")
  assert.deepEqual(failed.progress, { docs: "complete", target: "verified", seed: "unknown" })
  assert.equal(fake.creates.length, 1)
  assert.equal(fake.prompts.length, 1)

  clock += 1_000
  const retry = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.equal(retry.phase, "open")
  assert.equal(retry.outcome, "pending")
  assert.deepEqual(retry.progress, { docs: "complete", target: "verified", seed: "admitted" })
  assert.equal(retry.targetSessionID, failed.targetSessionID)
  assert.equal(retry.messageID, failed.messageID)
  assert.equal(fake.creates.length, 1)
  assert.equal(fake.prompts.length, 2)
  assert.equal(fake.prompts[1].id, fake.prompts[0].id)
  assert.equal(fake.prompts[1].text, fake.prompts[0].text)
  const saved = await exportGoalState({ sessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.ok(saved.selected)
  assert.equal(fake.prompts[1].text, handoffPrompt(saved.selected, saved.source))
})

test("handoff recovers an independently created target from persisted transfer metadata", async () => {
  const fs = new MemoryFileSystem()
  const fake = fakeHandoffSession()
  const deps = handoffDependencies(fake, fs)
  const saved = await exportGoalState({ sessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.ok(saved.selected)
  const goalBundle = saved.selected
  const fingerprint = sha256(`${goalBundle.contentFingerprint}\0${SOURCE_DIRECTORY}\0${sha256(handoffPrompt(goalBundle, saved.source))}`)
  const transferID = createTransferID(SOURCE_SESSION, goalBundle.goalID, goalBundle.planRevision, fingerprint)
  fake.target.id = "ses_recovered"
  fake.target.metadata = { goalDocsHandoff: { transferID, sourceSessionID: SOURCE_SESSION, goalID: goalBundle.goalID } }
  fake.listItems.push({
    id: "ses_recovered",
    location: fake.source.location,
    projectID: fake.source.projectID,
    metadata: fake.target.metadata,
  })
  const result = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.equal(result.targetSessionID, "ses_recovered")
  assert.equal(result.outcome, "pending")
  assert.equal(fake.creates.length, 0)
  assert.equal(fake.prompts.length, 1)
})

test("handoff preserves omitted session overrides without inventing permission rules", async () => {
  const fs = new MemoryFileSystem()
  const fake = fakeHandoffSession()
  delete (fake.source as Record<string, unknown>).permissions
  delete (fake.target as Record<string, unknown>).permissions
  const result = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, handoffDependencies(fake, fs))
  assert.equal(result.outcome, "pending", result.message)
  assert.equal(result.phase, "open")
  assert.equal("permissions" in fake.creates[0], false)
  assert.equal(fake.creates[0].agent, fake.source.agent)
  assert.equal(fake.prompts.length, 1)
})

test("handoff rejects changed target agents, permissions, and any parent or fork", async () => {
  for (const override of [
    { agent: "different-agent" },
    { permissions: [{ action: "*", resource: "*", effect: "allow" }] },
    { parentID: "ses_unrelated" },
    { fork: { sessionID: "ses_unrelated" } },
  ]) {
    const fake = fakeHandoffSession()
    const get = fake.session.get
    fake.session.get = async (input) => {
      const session = await get(input)
      return input.sessionID === SOURCE_SESSION ? session : { ...session, ...override }
    }
    const result = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, handoffDependencies(fake, new MemoryFileSystem()))
    assert.equal(result.outcome, "failed", JSON.stringify(override))
    assert.equal(fake.prompts.length, 0)
  }
})

test("handoff is denied on Plan and when source permission context is malformed", async () => {
  const fs = new MemoryFileSystem()
  const planFake = fakeHandoffSession()
  planFake.source.agent = "plan"
  const planDeps = handoffDependencies(planFake, fs)
  const planResult = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, planDeps)
  assert.equal(planResult.phase, "export")
  assert.equal(planResult.outcome, "failed")
  assert.match(planResult.message, /Plan or read-only/)
  assert.equal(planFake.creates.length, 0)

  const noPermissions = fakeHandoffSession()
  noPermissions.source.permissions = null
  const noPermissionDeps = handoffDependencies(noPermissions, new MemoryFileSystem())
  const noPermissionResult = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, noPermissionDeps)
  assert.equal(noPermissionResult.phase, "create")
  assert.equal(noPermissionResult.outcome, "failed")
  assert.match(noPermissionResult.message, /permissions are not available/)
  assert.equal(noPermissions.creates.length, 0)
})

test("handoff recovery follows API data/cursor pages before creating a target", async () => {
  const fs = new MemoryFileSystem()
  const fake = fakeHandoffSession()
  const deps = handoffDependencies(fake, fs)
  const saved = await exportGoalState({ sessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.ok(saved.selected)
  const fingerprint = sha256(`${saved.selected.contentFingerprint}\0${SOURCE_DIRECTORY}\0${sha256(handoffPrompt(saved.selected, saved.source))}`)
  const transferID = createTransferID(SOURCE_SESSION, "goal-alpha", saved.selected.planRevision, fingerprint)
  fake.target.id = "ses_later_page"
  fake.target.metadata = { goalDocsHandoff: { transferID, sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" } }
  const cursors: unknown[] = []
  fake.session.list = async (input) => {
    cursors.push(input?.cursor)
    return input?.cursor
      ? { data: [fake.target], cursor: { next: null } }
      : { data: [{ id: "ses_other", location: fake.source.location }], cursor: { next: "next-page" } }
  }
  const result = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, deps)
  assert.deepEqual(cursors, [undefined, "next-page"])
  assert.equal(fake.creates.length, 0)
  assert.equal(result.targetSessionID, "ses_later_page", result.message)
  assert.equal(result.outcome, "pending")
})

test("session page decoding preserves cursors in raw and wrapped API responses", () => {
  const sessions = [{ id: "ses_fixture" }]
  const page = { data: sessions, cursor: { previous: null, next: "next-page" } }
  assert.deepEqual(sessionListPage(page), { sessions, next: "next-page" })
  assert.deepEqual(sessionListPage({ data: page }), { sessions, next: "next-page" })
  assert.deepEqual(sessionListPage(sessions), { sessions })
  assert.deepEqual(sessionListPage({ items: sessions, next: "legacy-next" }), { sessions, next: "legacy-next" })
  assert.throws(() => sessionListPage({ data: "bad data", cursor: { next: "unsafe" } }), /no bounded session page/)
})

test("handoff recovery refuses creation when a paginated lookup reaches its bound", async () => {
  const fake = fakeHandoffSession()
  let pages = 0
  fake.session.list = async () => { pages++; return { data: [], cursor: { next: "more" } } }
  const result = await coordinateHandoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }, handoffDependencies(fake, new MemoryFileSystem()))
  assert.equal(result.outcome, "failed")
  assert.match(result.message, /page bound/)
  assert.equal(pages, 10)
  assert.equal(fake.creates.length, 0)
  assert.equal(fake.prompts.length, 0)
})

test("observer startup follows API data/cursor pages to later goal sessions", async () => {
  const fake = fakeHandoffSession()
  const get = fake.session.get
  fake.session.get = async (input) => input.sessionID === "ses_empty"
    ? { ...fake.source, id: "ses_empty" }
    : get(input)
  const cursors: unknown[] = []
  const writes: string[] = []
  fake.session.list = async (input) => {
    cursors.push(input?.cursor)
    return input?.cursor
      ? { data: [{ id: SOURCE_SESSION }], cursor: { next: null } }
      : { data: [{ id: "ses_empty" }], cursor: { next: "next-page" } }
  }
  const stop = startGoalObserver({
    session: fake.session,
    permission: fake.permission,
    location: { directory: SOURCE_DIRECTORY, project: { id: "project-one" } },
    repositoryMetadata,
    readState: async (id) => id === SOURCE_SESSION ? parsedState() : null,
    event: { subscribe: () => (async function* () {})() },
    watchState: () => ({ close() {} }),
    writeBundles: async (directory, bundles) => {
      writes.push(bundles[0].source.sessionID)
      return { bundles: [...bundles], docsDirectory: path.join(directory, "docs", "goals"), written: [], unchanged: [], goals: bundles.map((item) => item.goalID) }
    },
  })
  try {
    await new Promise<void>((resolve) => setImmediate(resolve))
    assert.deepEqual(cursors, [undefined, "next-page"])
    assert.deepEqual(writes, [SOURCE_SESSION])
  } finally { stop() }
})

test("TUI focus contract navigates and focuses only the initiating UI object", () => {
  const calls: unknown[] = []
  const openedCalls: string[] = []
  const focused = focusHandoffTarget({
    router: {
      navigate: (route) => calls.push(["navigate", route]),
      current: () => ({ type: "session", sessionID: "ses_target" }),
    },
    tabs: { enabled: () => true, focus: (sessionID) => { calls.push(["focus", sessionID]); return true } },
  }, "ses_target")
  assert.equal(focused, true)
  if (focused) openedCalls.push("ses_target")
  assert.deepEqual(calls, [
    ["navigate", { type: "session", sessionID: "ses_target" }],
    ["focus", "ses_target"],
  ])
  const notFocused = focusHandoffTarget({
    router: {
      navigate: (route) => calls.push(["navigate-failed", route]),
      current: () => ({ type: "session", sessionID: SOURCE_SESSION }),
    },
    tabs: { enabled: () => false, focus: () => { calls.push(["unexpected-focus"]); return false } },
  }, "ses_target")
  assert.equal(notFocused, false)
  if (notFocused) openedCalls.push("wrong-target")
  assert.deepEqual(openedCalls, ["ses_target"])
  assert.equal(calls.some((call) => Array.isArray(call) && call[0] === "unexpected-focus"), false)

  const tabNotFocused = focusHandoffTarget({
    router: {
      navigate: () => undefined,
      current: () => ({ type: "session", sessionID: "ses_target" }),
    },
    tabs: { enabled: () => true, focus: () => false },
  }, "ses_target")
  assert.equal(tabNotFocused, false)
  if (tabNotFocused) openedCalls.push("unfocused-tab")
  assert.deepEqual(openedCalls, ["ses_target"])
})

test("TUI exposes neither palette nor slash command for legacy or unreadable inventories", async () => {
  const location = { directory: SOURCE_DIRECTORY }
  let legacy = [{ name: "handoff" }, { name: "resume" }]
  const inventory = {
    invalidate: () => undefined,
    sync: async () => undefined,
    list: () => legacy,
  }
  const legacyStatus = await inspectHandoffCommandAvailability(inventory, location)
  assert.equal(legacyStatus.status, "collision")
  assert.equal(buildHandoffKeymapLayer(false, async () => undefined).commands.length, 0)

  const unreadable = {
    invalidate: () => undefined,
    sync: async () => undefined,
    list: () => undefined,
  }
  const unavailableStatus = await inspectHandoffCommandAvailability(unreadable, location)
  assert.equal(unavailableStatus.status, "unavailable")
  assert.equal(buildHandoffKeymapLayer(false, async () => undefined).commands.length, 0)

  legacy = [{ name: "resume" }]
  assert.equal((await inspectHandoffCommandAvailability(inventory, location)).status, "available")
})

test("TUI registers one combined palette/slash entry only after sync and refuses a later collision", async () => {
  const location = { directory: SOURCE_DIRECTORY }
  let entries: Array<{ name: string }> = [{ name: "resume" }]
  let synced = 0
  let invalidated = 0
  const inventory = {
    invalidate: () => { invalidated += 1 },
    sync: async () => { synced += 1 },
    list: () => entries,
  }
  const available = await inspectHandoffCommandAvailability(inventory, location)
  assert.equal(available.status, "available")
  const commands = buildHandoffKeymapLayer(true, async () => undefined).commands
  assert.equal(commands.length, 1)
  assert.equal(commands[0].palette, true)
  assert.deepEqual(commands[0].slash, { name: "handoff" })
  assert.equal(synced, 1)
  assert.equal(invalidated, 1)

  entries = [{ name: "handoff" }, { name: "resume" }]
  let rpcCalls = 0
  const guarded = await guardedHandoffCall(inventory, location, async () => { rpcCalls += 1 })
  assert.equal(guarded.called, false)
  assert.equal(rpcCalls, 0)
  assert.equal(buildHandoffKeymapLayer(false, async () => undefined).commands.length, 0)

  entries = [{ name: "resume" }]
  const changedContext = await guardedHandoffCall(inventory, location, async () => { rpcCalls += 1 }, () => false)
  assert.equal(changedContext.availability.status, "available")
  assert.equal(changedContext.called, false)
  assert.equal(rpcCalls, 0)
})

test("TUI inventory guards are client-local and source worktrees require exact path matches", async () => {
  const location = { directory: SOURCE_DIRECTORY, workspaceID: "workspace-a" }
  const firstInventory = {
    invalidate: () => undefined,
    sync: async () => undefined,
    list: () => [{ name: "handoff" }],
  }
  const secondInventory = {
    invalidate: () => undefined,
    sync: async () => undefined,
    list: () => [{ name: "resume" }],
  }
  const firstAvailable = (await inspectHandoffCommandAvailability(firstInventory, location)).status === "available"
  const secondAvailable = (await inspectHandoffCommandAvailability(secondInventory, location)).status === "available"
  assert.equal(buildHandoffKeymapLayer(firstAvailable, async () => undefined).commands.length, 0)
  assert.equal(buildHandoffKeymapLayer(secondAvailable, async () => undefined).commands.length, 1)
  assert.equal(sameExactWorktree(location, { directory: SOURCE_DIRECTORY, workspaceID: "workspace-a" }), true)
  assert.equal(sameExactWorktree(location, { directory: "/scratch/worktree-b", workspaceID: "workspace-a" }), false)
  assert.equal(sameExactWorktree(location, { directory: SOURCE_DIRECTORY, workspaceID: "workspace-b" }), false)
})

test("RPC caller and lifecycle pre-aborts stop all three methods before dependencies", async () => {
  for (const kind of ["caller", "lifecycle", "distinct-caller", "distinct-lifecycle", "same"] as const) {
    const lifecycle = new AbortController()
    const caller = kind === "same" ? lifecycle : new AbortController()
    const reason = new Error(`pre-aborted ${kind}`)
    ;(kind === "lifecycle" || kind === "distinct-lifecycle" ? lifecycle : caller).abort(reason)
    for (const method of ["export", "handoff", "opened"] as const) {
      const fs = new MemoryFileSystem()
      const before = JSON.stringify([...fs.entries])
      const fake = fakeHandoffSession()
      const deps: HandoffDependencies = handoffDependencies(fake, fs)
      let gets = 0
      deps.session.get = async () => { gets += 1; return fake.source }
      const handlers = createGoalDocsRpcHandlers(deps, kind === "caller" ? {} : { signal: lifecycle.signal })
      const result = await handlers[method]({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha", transferID: "transfer-fixture", targetSessionID: "ses_target" },
        kind === "lifecycle" ? undefined : { signal: caller.signal })
      assert.equal("status" in result ? result.status : result.outcome, "failed")
      assert.equal(result.message.includes(reason.message), true)
      assert.equal(gets, 0)
      assert.equal(fake.permissionCalls.length, 0)
      assert.equal(fake.creates.length, 0)
      assert.equal(fake.prompts.length, 0)
      assert.equal(JSON.stringify([...fs.entries]), before)
      assert.equal(fs.processLocks.size, 0)
    }
  }
})

test("RPC signal variants preserve direct calls and reach real export dependencies", async () => {
  for (const kind of ["none", "caller", "lifecycle", "same", "distinct"] as const) {
    const lifecycle = new AbortController()
    const caller = kind === "same" ? lifecycle : new AbortController()
    const fake = fakeHandoffSession()
    const deps: HandoffDependencies = handoffDependencies(fake, new MemoryFileSystem())
    const observed: Array<AbortSignal | undefined> = []
    deps.session.get = async (_input, options) => { observed.push(options?.signal); return fake.source }
    deps.repositoryMetadata = async (_directory, options) => { observed.push(options?.signal); return repositoryMetadata() }
    deps.readState = async (_sessionID, options) => { observed.push(options?.signal); return parsedState() }
    const handlers = createGoalDocsRpcHandlers(deps, kind === "none" || kind === "caller" ? {} : { signal: lifecycle.signal })
    const result = await handlers.export({ sourceSessionID: SOURCE_SESSION },
      kind === "none" || kind === "lifecycle" ? undefined : { signal: caller.signal })
    assert.equal(result.status, "exported", result.message)
    assert.equal(observed.length, 3)
    assert.ok(observed.every((signal) => signal === observed[0]))
    if (kind === "none") assert.equal(observed[0], undefined)
    else if (kind === "distinct") {
      assert.ok(observed[0])
      assert.notEqual(observed[0], lifecycle.signal)
      assert.notEqual(observed[0], caller.signal)
      const reason = new Error("distinct caller aborted")
      caller.abort(reason)
      assert.equal(observed[0].reason, reason)
      assert.equal(lifecycle.signal.aborted, false)
    } else assert.equal(observed[0], kind === "caller" ? caller.signal : lifecycle.signal)
    assert.equal(fake.permissionCalls.length, 1)
  }
})

test("RPC concurrent calls isolate caller cancellation without cancelling the plugin", async () => {
  const lifecycle = new AbortController()
  const callers = [new AbortController(), new AbortController()]
  const entered = [deferred(), deferred()]
  const release = [deferred(), deferred()]
  const observed: AbortSignal[] = []
  const fake = fakeHandoffSession()
  const deps: HandoffDependencies = handoffDependencies(fake, new MemoryFileSystem())
  deps.readState = async (_sessionID, options) => {
    assert.ok(options?.signal)
    const index = observed.length
    observed.push(options.signal)
    entered[index].resolve()
    await release[index].promise
    return parsedState()
  }
  const handlers = createGoalDocsRpcHandlers(deps, { signal: lifecycle.signal })
  const first = handlers.export({ sourceSessionID: SOURCE_SESSION }, { signal: callers[0].signal })
  await entered[0].promise
  const second = handlers.export({ sourceSessionID: SOURCE_SESSION }, { signal: callers[1].signal })
  await entered[1].promise
  try {
    const reason = new Error("only the first caller cancelled")
    callers[0].abort(reason)
    assert.notEqual(observed[0], observed[1])
    assert.equal(observed[0].reason, reason)
    assert.equal(observed[1].aborted, false)
    assert.equal(lifecycle.signal.aborted, false)
  } finally {
    for (const gate of release) gate.resolve()
  }
  const [cancelled, completed] = await Promise.all([first, second])
  assert.equal(cancelled.status, "failed")
  assert.match(cancelled.message, /only the first caller cancelled/)
  assert.equal(completed.status, "exported", completed.message)
  assert.equal(fake.permissionCalls.length, 1)
  assert.equal(callers[1].signal.aborted, false)
})

test("RPC unload aborts both concurrent calls after their pending reads settle", async () => {
  const lifecycle = new AbortController()
  const callers = [new AbortController(), new AbortController()]
  const entered = deferred()
  const release = deferred()
  const observed: AbortSignal[] = []
  const fake = fakeHandoffSession()
  const deps: HandoffDependencies = handoffDependencies(fake, new MemoryFileSystem())
  deps.readState = async (_sessionID, options) => {
    assert.ok(options?.signal)
    observed.push(options.signal)
    if (observed.length === 2) entered.resolve()
    await release.promise
    return parsedState()
  }
  const handlers = createGoalDocsRpcHandlers(deps, { signal: lifecycle.signal })
  const pending = callers.map((caller) => handlers.export({ sourceSessionID: SOURCE_SESSION }, { signal: caller.signal }))
  await entered.promise
  const reason = new Error("plugin unloaded during reads")
  lifecycle.abort(reason)
  for (const signal of observed) assert.equal(signal.reason, reason)
  for (const caller of callers) assert.equal(caller.signal.aborted, false)
  release.resolve()
  for (const result of await Promise.all(pending)) {
    assert.equal(result.status, "failed")
    assert.match(result.message, /plugin unloaded during reads/)
  }
  assert.equal(fake.permissionCalls.length, 0)
})

test("RPC opened cancellation waits for the pending assertion and preserves the seeded transfer", async () => {
  const fs = new MemoryFileSystem()
  const fake = fakeHandoffSession()
  const deps: HandoffDependencies = handoffDependencies(fake, fs)
  const lifecycle = new AbortController()
  const handlers = createGoalDocsRpcHandlers(deps, { signal: lifecycle.signal })
  const seeded = await handlers.handoff({ sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" })
  assert.equal(seeded.outcome, "pending", seeded.message)
  assert.ok(seeded.targetSessionID)
  const before = JSON.stringify([...fs.entries])
  const entered = deferred()
  const release = deferred()
  const assertions: unknown[][] = []
  deps.permission = { assert: async (...args: unknown[]) => { assertions.push(args); entered.resolve(); await release.promise } }
  const caller = new AbortController()
  const input = { sourceSessionID: SOURCE_SESSION, transferID: seeded.transferID, targetSessionID: seeded.targetSessionID }
  let settled = false
  const pending = handlers.opened(input, { signal: caller.signal })
  void pending.then(() => { settled = true }, () => { settled = true })
  await entered.promise
  caller.abort(new Error("open caller cancelled"))
  await Promise.resolve()
  assert.equal(settled, false)
  release.resolve()
  const cancelled = await pending
  assert.equal(cancelled.outcome, "failed")
  assert.match(cancelled.message, /open caller cancelled/)
  assert.equal(assertions.length, 1)
  assert.equal(assertions[0].length, 1)
  assert.equal(JSON.stringify([...fs.entries]), before)
  assert.equal(fake.creates.length, 1)
  assert.equal(fake.prompts.length, 1)
  deps.permission = fake.permission
  const retry = await handlers.opened(input, { signal: new AbortController().signal })
  assert.equal(retry.outcome, "complete", retry.message)
  assert.equal(lifecycle.signal.aborted, false)
})

test("RPC caller cancellation after creation retains the target for a nonduplicating retry", async () => {
  const fake = fakeHandoffSession()
  const caller = new AbortController()
  const create = fake.session.create
  fake.session.create = async (input) => {
    const result = await create(input)
    caller.abort(new Error("RPC cancelled after creation"))
    return result
  }
  const handlers = createGoalDocsRpcHandlers(handoffDependencies(fake, new MemoryFileSystem()))
  const input = { sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }
  const first = await handlers.handoff(input, { signal: caller.signal })
  assert.equal(first.outcome, "failed")
  assert.equal(first.progress.target, "created")
  assert.equal(first.progress.seed, "not_sent")
  assert.match(first.message, /RPC cancelled after creation/)
  fake.session.create = create
  const retry = await handlers.handoff(input, { signal: new AbortController().signal })
  assert.equal(retry.outcome, "pending", retry.message)
  assert.equal(retry.targetSessionID, first.targetSessionID)
  assert.equal(fake.creates.length, 1)
  assert.equal(fake.prompts.length, 1)
})

test("RPC cancellation after acknowledged seed does not claim rollback or admit another message", async () => {
  const fake = fakeHandoffSession()
  const caller = new AbortController()
  const messages = new Map<string, string>()
  fake.session.prompt = async (input) => {
    fake.prompts.push(input)
    if (messages.has(input.id)) assert.equal(messages.get(input.id), input.text)
    else messages.set(input.id, input.text)
    if (fake.prompts.length === 1) caller.abort(new Error("RPC cancelled after acknowledged admission"))
    return { id: input.id }
  }
  const handlers = createGoalDocsRpcHandlers(handoffDependencies(fake, new MemoryFileSystem()))
  const input = { sourceSessionID: SOURCE_SESSION, goalID: "goal-alpha" }
  const first = await handlers.handoff(input, { signal: caller.signal })
  assert.equal(first.outcome, "failed")
  assert.equal(first.progress.seed, "admitted")
  assert.match(first.message, /RPC cancelled after acknowledged admission/)
  const retry = await handlers.handoff(input, { signal: new AbortController().signal })
  assert.equal(retry.outcome, "pending", retry.message)
  assert.equal(fake.creates.length, 1)
  assert.equal(messages.size, 1)
  assert.equal(fake.prompts.length, 2)
  assert.equal(fake.prompts[0].id, fake.prompts[1].id)
})

test("edit assertion pre-abort takes precedence and the native call receives exactly one argument", async () => {
  const controller = new AbortController()
  const reason = new Error("edit cancelled before assertion")
  controller.abort(reason)
  const calls: unknown[][] = []
  const permission = { assert: async (...args: unknown[]) => { calls.push(args) } }
  await assert.rejects(assertEditableSession(permission, sourceInfo(), SOURCE_DIRECTORY, controller.signal), (error) => error === reason)
  await assert.rejects(assertEditableSession(undefined, sourceInfo({ agent: "plan" }), SOURCE_DIRECTORY, controller.signal), (error) => error === reason)
  assert.deepEqual(calls, [])
  await assertEditableSession(permission, sourceInfo(), SOURCE_DIRECTORY)
  assert.deepEqual(calls, [[{
    sessionID: SOURCE_SESSION,
    agent: "build",
    action: "edit",
    resources: [`${SOURCE_DIRECTORY}/docs/goals/**`],
  }]])
})

test("edit assertion pending cancellation waits for settlement and preserves native denial", async () => {
  for (const outcome of ["resolve", "reject"] as const) {
    const controller = new AbortController()
    const cancelled = new Error("edit cancelled while pending")
    const denied = new Error("native edit denied")
    const entered = deferred()
    const release = deferred()
    const calls: unknown[][] = []
    const permission = { assert: async (...args: unknown[]) => {
      calls.push(args)
      entered.resolve()
      await release.promise
      if (outcome === "reject") throw denied
    } }
    let settled = false
    const pending = assertEditableSession(permission, sourceInfo(), SOURCE_DIRECTORY, controller.signal)
    void pending.then(() => { settled = true }, () => { settled = true })
    await entered.promise
    controller.abort(cancelled)
    await Promise.resolve()
    assert.equal(settled, false)
    assert.equal(calls.length, 1)
    assert.equal(calls[0].length, 1)
    release.resolve()
    await assert.rejects(pending, (error) => error === (outcome === "reject" ? denied : cancelled))
  }
})

test("RPC export rejects cancellation after an empty state lookup instead of reporting missing", async () => {
  const caller = new AbortController()
  const fake = fakeHandoffSession()
  const fs = new MemoryFileSystem()
  const before = JSON.stringify([...fs.entries])
  const deps: HandoffDependencies = handoffDependencies(fake, fs)
  deps.readState = async () => { caller.abort(new Error("cancelled at empty state boundary")); return null }
  const result = await createGoalDocsRpcHandlers(deps).export({ sourceSessionID: SOURCE_SESSION }, { signal: caller.signal })
  assert.equal(result.status, "failed")
  assert.match(result.message, /cancelled at empty state boundary/)
  assert.equal(fake.permissionCalls.length, 0)
  assert.equal(JSON.stringify([...fs.entries]), before)
})

test("RPC export truthfully reports completed document writes despite a later caller abort", async () => {
  const caller = new AbortController()
  const fake = fakeHandoffSession()
  const fs = new MemoryFileSystem()
  const deps: HandoffDependencies = handoffDependencies(fake, fs)
  deps.writeBundles = async (directory, bundles) => {
    const written = await writeGoalDocBundles(directory, bundles, { fileSystem: fs, signal: caller.signal })
    caller.abort(new Error("cancelled after document publication"))
    return written
  }
  const result = await createGoalDocsRpcHandlers(deps).export({ sourceSessionID: SOURCE_SESSION }, { signal: caller.signal })
  assert.equal(result.status, "exported", result.message)
  assert.equal(caller.signal.aborted, true)
  assert.ok(fs.entries.has(`${SOURCE_DIRECTORY}/docs/goals/goal-alpha/snapshot.json`))
  assert.equal(fs.processLocks.size, 0)
})
