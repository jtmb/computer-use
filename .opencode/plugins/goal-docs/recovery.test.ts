import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, unlink, symlink, link, rename } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test, { type TestContext } from "node:test"

import {
  applyGoalDocRecovery,
  GoalDocsRecoveryError,
  previewGoalDocRecovery,
  rollbackGoalDocRecovery,
  RECOVERY_MANIFEST,
  RECOVERY_PROCESS_LOCK,
  type RecoveryDependencies,
  type RecoveryAuthorizationRequest,
  type RecoveryAuthorizer,
  type RecoveryRequest,
} from "./recovery.ts"
import { buildGoalDocBundle, safeReadmeTitle } from "./render.ts"
import { parseSessionGoalState, type ExportSource } from "./model.ts"
import { acquireProcessLock } from "./process-lock.ts"

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
const repositoryRoot = path.resolve(moduleDirectory, "../../..")
const sourceGoals = path.join(repositoryRoot, "docs", "goals")
const incidentGoalID = "fixture-header-recovery"
const testRoot = "/tmp/opencode"

interface Fixture {
  base: string
  repositoryRoot: string
  docsDirectory: string
  backupDirectory: string
  goalID: string
  sessionID: string
  request: RecoveryRequest
  dependencies: RecoveryDependencies
  manifest: Record<string, any>
  originalFiles: Map<string, Buffer>
}

function hash(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex")
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (typeof value === "object" && value !== null) {
    const object = value as Record<string, unknown>
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stable(object[key])}`).join(",")}}`
  }
  return JSON.stringify(value) ?? "null"
}

async function makeFixture(): Promise<Fixture> {
  await mkdir(testRoot, { recursive: true })
  const base = await mkdtemp(path.join(testRoot, "goal-docs-recovery-"))
  const tempRepository = path.join(base, "worktree")
  const docsDirectory = path.join(tempRepository, "docs", "goals")
  const backupDirectory = path.join(base, "backups")
  await mkdir(docsDirectory, { recursive: true })
  await mkdir(backupDirectory)

  const { manifest, originalFiles } = await createArchiveFixture(docsDirectory)
  const snapshot = JSON.parse(await readFile(path.join(docsDirectory, incidentGoalID, "snapshot.json"), "utf8"))
  const dependencies: RecoveryDependencies = {
    repositoryMetadata: async () => snapshot.source.repository,
  }
  const request: RecoveryRequest = {
    repositoryRoot: tempRepository,
    goalID: incidentGoalID,
    sessionID: snapshot.source.sessionID,
    backupDirectory,
  }
  return {
    base,
    repositoryRoot: tempRepository,
    docsDirectory,
    backupDirectory,
    goalID: incidentGoalID,
    sessionID: snapshot.source.sessionID,
    request,
    dependencies,
    manifest,
    originalFiles,
  }
}

function readmeBlock(text: string): string {
  const startTag = "<!-- goal-docs:managed:start -->"
  const endTag = "<!-- goal-docs:managed:end -->"
  const start = text.indexOf(startTag)
  const end = text.indexOf(endTag)
  assert.ok(start >= 0 && end >= start)
  assert.equal(text.indexOf(startTag, start + 1), -1)
  assert.equal(text.indexOf(endTag, end + 1), -1)
  return text.slice(start, end + endTag.length)
}

function divergentCanonicalPlan(expected: string): string {
  const match = /^(- Exported at: `)([^`\r\n]+)(`)$/.exec(expected.split("\n").find((line) => line.startsWith("- Exported at: `")) ?? "")
  assert.ok(match, "canonical renderer must provide one export-time header")
  const shifted = new Date(Date.parse(match[2]) + 1).toISOString()
  const changed = `${match[1]}${shifted}${match[3]}`
  return expected.replace(match[0], changed)
}

async function createArchiveFixture(docsDirectory: string): Promise<{ manifest: Record<string, any>; originalFiles: Map<string, Buffer> }> {
  const sessionID = "ses_synthetic_recovery_source"
  const timestamp = 1_800_000_000
  const state = parseSessionGoalState({ version: 3, goals: {}, archives: { [sessionID]: [{
    id: incidentGoalID, sessionID, objective: "Preserve a synthetic frozen archive while repairing only its export header",
    status: "cancelled", planRevision: 5, createdAt: timestamp - 10, updatedAt: timestamp, closedAt: timestamp,
    stopReason: "Synthetic fixture closed before recovery", history: [{ type: "cancelled", detail: "Synthetic lifecycle, never a real goal", timestamp }],
    checkpoints: [{ summary: "Synthetic archived checkpoint", timestamp: timestamp - 1 }],
    plan: { summary: "Synthetic archive preservation", completionCriteria: ["Original bytes remain recoverable"],
      phases: [{ id: "preserve", objective: "Keep the frozen record", status: "pending", tasks: [
        { id: "retain", description: "Retain original fixture bytes", status: "pending" },
      ] }], revision: 5, updatedAt: timestamp, decisions: ["Do not reopen this synthetic archived goal"], changes: [] },
  }] } }, sessionID)
  const goal = state.archives[0]
  const source: ExportSource = { sessionID, directory: path.resolve(docsDirectory, "../.."),
    exportedAt: "2026-10-27T01:02:03.000Z", repository: {
      kind: "git", identity: "synthetic-repository", worktree: "synthetic-worktree", scope: ".", gaps: [],
    } }
  const bundle = buildGoalDocBundle(source, goal, state.historyNotice)
  const canonical = bundle.files
  const title = safeReadmeTitle(goal.objective)
  const managed = ["<!-- goal-docs:managed:start -->", "| Goal | Status | Revision | Source |", "| --- | --- | ---: | --- |",
    `| [${title}](./${incidentGoalID}/HANDOFF.md) | cancelled | 5 | ${sessionID} |`, "",
    "Each goal directory contains mandatory `plan.md`, `HANDOFF.md`, `work-history.md`, and `snapshot.json` files.",
    "<!-- goal-docs:managed:end -->"].join("\n")
  const files = { "README.md": hash(managed), ...Object.fromEntries(Object.entries(canonical).map(([name, bytes]) =>
    [`${incidentGoalID}/${name}`, hash(bytes)])) }
  const payload = { version: 1, owner: "goal-docs", files, goals: { [incidentGoalID]: {
    goalID: goal.id, sourceSessionID: sessionID, sourceDirectory: source.directory, status: goal.status,
    planRevision: goal.planRevision, title, contentFingerprint: bundle.contentFingerprint,
    planFingerprint: bundle.planFingerprint,
  } }, transfers: {} }
  const manifest = { ...payload, integrity: hash(JSON.stringify(payload)) }
  const originals = new Map<string, Buffer>([
    [RECOVERY_MANIFEST, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
    ["README.md", Buffer.from(`# Synthetic test archive\n\n${managed}\n`)],
    ...Object.entries(canonical).map(([name, bytes]): [string, Buffer] => [
      `${incidentGoalID}/${name}`, Buffer.from(name === "plan.md" ? divergentCanonicalPlan(bytes) : bytes),
    ]),
  ])
  // Real files preserve the production recovery/rollback boundaries, without
  // reading a mutable user's historical archive or depending on its presence.
  for (const [relative, bytes] of originals) {
    const target = path.join(docsDirectory, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, bytes, { mode: 0o600 })
  }
  return { manifest, originalFiles: originals }
}

async function cleanup(t: TestContext, fixture: Fixture): Promise<void> {
  t.after(async () => rm(fixture.base, { recursive: true, force: true }))
}

async function createProcessLock(fixture: Fixture): Promise<void> {
  await writeFile(path.join(fixture.docsDirectory, RECOVERY_PROCESS_LOCK), "", { flag: "wx", mode: 0o600 })
}

async function canonicalPlan(fixture: Fixture): Promise<string> {
  const snapshot = JSON.parse(await readFile(path.join(fixture.docsDirectory, fixture.goalID, "snapshot.json"), "utf8"))
  const suffix = ` ${snapshot.goal.historyNotice}`
  assert.ok(snapshot.historyNotice.endsWith(suffix))
  const archiveNotice = snapshot.historyNotice.slice(0, -suffix.length)
  return buildGoalDocBundle(snapshot.source, snapshot.goal, archiveNotice).files["plan.md"]
}

const authorizeApply: RecoveryAuthorizer = async (request: RecoveryAuthorizationRequest): Promise<void> => {
  assert.equal(request.action, "apply")
  assert.equal(request.operation, "restore-frozen-snapshot-header")
  assert.ok(Object.isFrozen(request))
}

async function readManifest(fixture: Fixture): Promise<Record<string, any>> {
  return JSON.parse(await readFile(path.join(fixture.docsDirectory, RECOVERY_MANIFEST), "utf8"))
}

async function runWithFilesystemBoundary(fixture: Fixture, overrides: string, operation: string): Promise<unknown> {
  const moduleUrl = new URL("./recovery.ts", import.meta.url).href
  const boundary = `export * from "node:fs/promises";
    import * as fs from "node:fs/promises";
    import { execFileSync } from "node:child_process";
    ${overrides}`
  const boundaryUrl = `data:text/javascript,${encodeURIComponent(boundary)}`
  const metadata = await fixture.dependencies.repositoryMetadata!(fixture.repositoryRoot)
  const script = `
    import { registerHooks } from "node:module";
    registerHooks({ resolve(specifier, context, next) {
      if (specifier === "node:fs/promises" && context.parentURL === ${JSON.stringify(moduleUrl)})
        return {url: ${JSON.stringify(boundaryUrl)}, shortCircuit: true};
      return next(specifier, context);
    }});
    const recovery = await import(${JSON.stringify(moduleUrl)});
    const request = ${JSON.stringify(fixture.request)};
    const dependencies = {repositoryMetadata: async () => (${JSON.stringify(metadata)})};
    ${operation}
  `
  const result = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", script], {
    cwd: repositoryRoot, encoding: "utf8", timeout: 15_000,
  })
  assert.equal(result.error, undefined, "recovery I/O must terminate without waiting for a FIFO writer")
  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test("apply accepts only the exact frozen in-process preview object", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  assert.equal(Object.isFrozen(preview), true)
  let authorizations = 0
  const authorize = async () => { authorizations += 1 }
  await assert.rejects(applyGoalDocRecovery({ ...preview }, { authorize }),
    (error: unknown) => error instanceof GoalDocsRecoveryError && error.code === "invalid_preview")
  await assert.rejects(applyGoalDocRecovery(JSON.parse(JSON.stringify(preview)), { authorize }), /invalid_preview|exact preview/)
  assert.equal(authorizations, 0)
  assert.deepEqual(await readdir(fixture.backupDirectory), [])
})

test("preview is canonical, binds the exact snapshot, and performs no writes", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  const expected = await canonicalPlan(fixture)
  assert.equal(preview.goalID, fixture.goalID)
  assert.equal(preview.sessionID, fixture.sessionID)
  assert.equal(preview.expectedPlanSha256, hash(expected))
  assert.equal(preview.originalPlanSha256, hash(fixture.originalFiles.get(`${fixture.goalID}/plan.md`)!))
  assert.equal(preview.manifestIntegrity, fixture.manifest.integrity)
  assert.equal(preview.readmeManagedBlockSha256, fixture.manifest.files["README.md"])
  assert.notEqual(preview.readmeWholeFileSha256, preview.readmeManagedBlockSha256)
  assert.equal(await readFile(path.join(fixture.docsDirectory, `${fixture.goalID}/plan.md`), "utf8"), fixture.originalFiles.get(`${fixture.goalID}/plan.md`)!.toString("utf8"))
  assert.deepEqual((await readdir(fixture.backupDirectory)).sort(), [])
  await assert.rejects(readFile(path.join(fixture.docsDirectory, RECOVERY_PROCESS_LOCK)), { code: "ENOENT" })
  for (const [relative, bytes] of fixture.originalFiles) {
    assert.deepEqual(await readFile(path.join(fixture.docsDirectory, relative)), bytes)
  }
})

test("apply requires host authorization and preserves all originals before replacing only plan.md", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await assert.rejects(applyGoalDocRecovery(preview), (error: unknown) => error instanceof GoalDocsRecoveryError && error.code === "authorization_required")
  await assert.rejects(applyGoalDocRecovery(preview, { authorize: async () => true }), /boolean values are not host authorization receipts/)
  assert.deepEqual(await readdir(fixture.backupDirectory), [])
  await createProcessLock(fixture)
  const applied = await applyGoalDocRecovery(preview, { authorize: authorizeApply })
  assert.equal(applied.status, "applied")
  assert.ok(applied.restoredPath.startsWith(`${testRoot}${path.sep}`))
  assert.ok(!applied.restoredPath.startsWith(`${sourceGoals}${path.sep}`))
  assert.equal(hash(await readFile(applied.restoredPath)), preview.expectedPlanSha256)
  assert.equal(await readFile(path.join(fixture.docsDirectory, RECOVERY_MANIFEST), "utf8"), fixture.originalFiles.get(RECOVERY_MANIFEST)!.toString("utf8"))
  for (const [relative, bytes] of fixture.originalFiles) {
    if (relative === `${fixture.goalID}/plan.md`) continue
    assert.deepEqual(await readFile(path.join(fixture.docsDirectory, relative)), bytes, `${relative} must not change`)
  }
  const transaction = path.dirname(applied.journalPath)
  const journal = JSON.parse(await readFile(applied.journalPath, "utf8"))
  assert.equal(journal.phase, "committed")
  assert.deepEqual(Object.keys(journal.files).sort(), [RECOVERY_MANIFEST, "README.md", ...["HANDOFF.md", "plan.md", "snapshot.json", "work-history.md"].map((name) => `${fixture.goalID}/${name}`)].sort())
  assert.deepEqual((await readdir(path.join(transaction, "originals"))).sort(), ["README.md", "bundle", "manifest.json"])
  assert.deepEqual(await readFile(path.join(transaction, "originals", "bundle", fixture.goalID, "plan.md")), fixture.originalFiles.get(`${fixture.goalID}/plan.md`))
  assert.deepEqual(await readFile(path.join(transaction, "originals", "README.md")), fixture.originalFiles.get("README.md"))
  assert.deepEqual(await readFile(path.join(transaction, "originals", "manifest.json")), fixture.originalFiles.get(RECOVERY_MANIFEST))
})

test("pre-aborted recovery preview refuses before inspecting the backup path", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const controller = new AbortController()
  const reason = new Error("preview cancelled before any acquisition")
  controller.abort(reason)
  await assert.rejects(previewGoalDocRecovery({ ...fixture.request,
    backupDirectory: path.join(fixture.base, "nonexistent-backup") }, fixture.dependencies,
  { signal: controller.signal }), error => error === reason)
  assert.deepEqual(await readdir(fixture.backupDirectory), [])
})

test("pre-aborted recovery apply never invokes the host authorizer", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const controller = new AbortController()
  const reason = new Error("apply cancelled before authorization")
  controller.abort(reason)
  let authorizations = 0
  await assert.rejects(applyGoalDocRecovery(preview, { signal: controller.signal,
    authorize: async () => { authorizations++ } }), error => error === reason)
  assert.equal(authorizations, 0, "a cancelled operation must not prompt or consume authorization")
  assert.deepEqual(await readdir(fixture.backupDirectory), [])
  for (const [relative, bytes] of fixture.originalFiles) {
    assert.deepEqual(await readFile(path.join(fixture.docsDirectory, relative)), bytes)
  }
})

test("pre-aborted recovery rollback refuses before journal acquisition", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const controller = new AbortController()
  const reason = new Error("rollback cancelled before journal acquisition")
  controller.abort(reason)
  let authorizations = 0
  await assert.rejects(rollbackGoalDocRecovery(path.join(fixture.backupDirectory, "absent", "journal.json"), {
    signal: controller.signal, authorize: async () => { authorizations++ },
  }), error => error === reason)
  assert.equal(authorizations, 0)
  assert.deepEqual(await readdir(fixture.backupDirectory), [])
})

test("recovery apply cancelled by authorization refuses before reading the process lock", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  const controller = new AbortController()
  const reason = new Error("apply cancelled while authorization settled")
  await assert.rejects(applyGoalDocRecovery(preview, {
    signal: controller.signal, authorize: async () => { controller.abort(reason) },
  }), error => error === reason)
  await assert.rejects(readFile(path.join(fixture.docsDirectory, RECOVERY_PROCESS_LOCK)), { code: "ENOENT" })
  assert.deepEqual(await readdir(fixture.backupDirectory), [])
})

test("recovery rollback cancelled by authorization leaves the committed journal intact", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const applied = await applyGoalDocRecovery(preview, { authorize: authorizeApply })
  const journalBefore = await readFile(applied.journalPath)
  const planBefore = await readFile(applied.restoredPath)
  await unlink(path.join(fixture.docsDirectory, RECOVERY_PROCESS_LOCK))
  const controller = new AbortController()
  const reason = new Error("rollback cancelled while authorization settled")
  await assert.rejects(rollbackGoalDocRecovery(applied.journalPath, {
    signal: controller.signal, authorize: async () => { controller.abort(reason) },
  }), error => error === reason)
  assert.deepEqual(await readFile(applied.journalPath), journalBefore)
  assert.deepEqual(await readFile(applied.restoredPath), planBefore)
})

test("apply cancelled during post-authorization backup inspection creates no transaction directory", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  await createProcessLock(fixture)
  const result = await runWithFilesystemBoundary(fixture, `
    export async function readdir(directory, ...args) {
      if (globalThis.recoveryTestArmed && directory === ${JSON.stringify(fixture.backupDirectory)})
        globalThis.recoveryTestAbort.abort(new Error("apply cancelled during backup inspection"));
      return fs.readdir(directory, ...args);
    }`, `
    globalThis.recoveryTestAbort = new AbortController();
    const preview = await recovery.previewGoalDocRecovery(request, dependencies);
    globalThis.recoveryTestArmed = true;
    let failure = null;
    try { await recovery.applyGoalDocRecovery(preview, {
      authorize: async () => undefined, signal: globalThis.recoveryTestAbort.signal
    }); } catch (error) { failure = error.message; }
    globalThis.recoveryTestArmed = false;
    const { readdir } = await import("node:fs/promises");
    process.stdout.write(JSON.stringify({failure, transactions: (await readdir(request.backupDirectory)).sort()}));
  `)
  assert.deepEqual(result, { failure: "apply cancelled during backup inspection", transactions: [] })
})

test("cancellation after transaction directory creation retains an incomplete backup and blocks preview", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  await createProcessLock(fixture)
  const result = await runWithFilesystemBoundary(fixture, `
    export async function mkdir(directory, ...args) {
      const result = await fs.mkdir(directory, ...args);
      const prefix = ${JSON.stringify(`${fixture.backupDirectory}${path.sep}recovery-`)};
      if (globalThis.recoveryTestArmed && directory.startsWith(prefix) && !directory.slice(prefix.length).includes("/"))
        globalThis.recoveryTestAbort.abort(new Error("apply cancelled after transaction directory creation"));
      return result;
    }`, `
    globalThis.recoveryTestAbort = new AbortController();
    const preview = await recovery.previewGoalDocRecovery(request, dependencies);
    globalThis.recoveryTestArmed = true;
    let failure = null;
    try { await recovery.applyGoalDocRecovery(preview, {
      authorize: async () => undefined, signal: globalThis.recoveryTestAbort.signal
    }); } catch (error) { failure = error.message; }
    globalThis.recoveryTestArmed = false;
    const { readdir } = await import("node:fs/promises");
    process.stdout.write(JSON.stringify({failure, transactions: (await readdir(request.backupDirectory)).sort()}));
  `)
  assert.equal((result as any).failure, "apply cancelled after transaction directory creation")
  assert.equal((result as any).transactions.length, 1)
  const transaction = path.join(fixture.backupDirectory, (result as any).transactions[0])
  assert.equal((await readdir(transaction)).includes("journal.json"), false)
  const files = await readdir(transaction, { recursive: true, withFileTypes: true })
  assert.deepEqual(files.filter((entry) => entry.isFile()).map((entry) => entry.name), [])
  for (const [relative, bytes] of fixture.originalFiles) {
    assert.deepEqual(await readFile(path.join(fixture.docsDirectory, relative)), bytes, `${relative} must not change`)
  }
  await assert.rejects(previewGoalDocRecovery(fixture.request, fixture.dependencies), /no journal and may be interrupted/)
  let authorizations = 0
  await assert.rejects(rollbackGoalDocRecovery(path.join(transaction, "journal.json"), {
    authorize: async () => { authorizations += 1 },
  }), /required file is missing/)
  assert.equal(authorizations, 0)
  assert.deepEqual(await readdir(fixture.backupDirectory), (result as any).transactions)
  assert.equal((await readdir(transaction)).includes("journal.json"), false)
})

test("authorization denial at apply refuses before the process lock and writes no backup", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  const denial = new Error("host denied archive recovery")
  let authorizations = 0
  await assert.rejects(applyGoalDocRecovery(preview, {
    authorize: async () => { authorizations += 1; throw denial },
  }), error => error === denial)
  assert.equal(authorizations, 1)
  await assert.rejects(readFile(path.join(fixture.docsDirectory, RECOVERY_PROCESS_LOCK)), { code: "ENOENT" })
  assert.deepEqual(await readdir(fixture.backupDirectory), [])
  for (const [relative, bytes] of fixture.originalFiles) {
    assert.deepEqual(await readFile(path.join(fixture.docsDirectory, relative)), bytes)
  }
})

test("authorization denial at rollback leaves the committed journal and repaired plan intact", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const applied = await applyGoalDocRecovery(preview, { authorize: authorizeApply })
  const journalBefore = await readFile(applied.journalPath)
  const planBefore = await readFile(applied.restoredPath)
  const denial = new Error("host denied archive rollback")
  await assert.rejects(rollbackGoalDocRecovery(applied.journalPath, {
    dependencies: fixture.dependencies,
    authorize: async () => { throw denial },
  }), error => error === denial)
  assert.deepEqual(await readFile(applied.journalPath), journalBefore)
  assert.deepEqual(await readFile(applied.restoredPath), planBefore)
  assert.equal(JSON.parse(journalBefore.toString("utf8")).phase, "committed")
})

test("recovery rollback cancelled during journal acquisition does not invoke authorization", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const applied = await applyGoalDocRecovery(preview, { authorize: authorizeApply })
  const journalBefore = await readFile(applied.journalPath)
  const result = await runWithFilesystemBoundary(fixture, `
    export async function open(file, ...args) {
      if (file === ${JSON.stringify(applied.journalPath)})
        globalThis.recoveryTestAbort.abort(new Error("cancel during journal acquisition"));
      return fs.open(file, ...args);
    }`, `
    globalThis.recoveryTestAbort = new AbortController();
    let authorizations = 0, failure = null;
    try { await recovery.rollbackGoalDocRecovery(${JSON.stringify(applied.journalPath)}, {
      signal: globalThis.recoveryTestAbort.signal, authorize: async () => { authorizations++; }
    }); } catch (error) { failure = error.message; }
    process.stdout.write(JSON.stringify({authorizations, failure}));
  `)
  assert.deepEqual(result, { authorizations: 0, failure: "cancel during journal acquisition" })
  assert.deepEqual(await readFile(applied.journalPath), journalBefore)
})

test("a valid manifest above the document limit is completely preserved on apply", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const manifest = await readManifest(fixture)
  manifest.retainedExtension = "x".repeat(600 * 1024)
  const original = Buffer.from(`${JSON.stringify(manifest)}\n`)
  await writeFile(path.join(fixture.docsDirectory, RECOVERY_MANIFEST), original)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const applied = await applyGoalDocRecovery(preview, { authorize: authorizeApply })
  assert.deepEqual(await readFile(path.join(path.dirname(applied.journalPath), "originals", "manifest.json")), original)
  assert.deepEqual(await readFile(path.join(fixture.docsDirectory, RECOVERY_MANIFEST)), original)
})

test("cancellation after preservation refuses publication and leaves a rollback-capable journal", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const controller = new AbortController()
  let checks = 0
  const dependencies: RecoveryDependencies = { repositoryMetadata: async (...args) => {
    checks += 1
    if (checks === 3) controller.abort(new Error("cancel after originals preserved"))
    return fixture.dependencies.repositoryMetadata!(...args)
  } }
  await assert.rejects(applyGoalDocRecovery(preview, {
    authorize: authorizeApply, dependencies, signal: controller.signal,
  }), /cancel after originals preserved/)
  assert.equal(checks, 3)
  const transactions = await readdir(fixture.backupDirectory)
  assert.equal(transactions.length, 1)
  const journalPath = path.join(fixture.backupDirectory, transactions[0], "journal.json")
  assert.equal(JSON.parse(await readFile(journalPath, "utf8")).phase, "prepared")
  const planPath = path.join(fixture.docsDirectory, fixture.goalID, "plan.md")
  assert.deepEqual(await readFile(planPath), fixture.originalFiles.get(`${fixture.goalID}/plan.md`))
  await assert.rejects(previewGoalDocRecovery(fixture.request, fixture.dependencies), /unfinished recovery journal/)
  const rolledBack = await rollbackGoalDocRecovery(journalPath, {
    authorize: async () => undefined, dependencies: fixture.dependencies,
  })
  assert.equal(rolledBack.status, "rolled_back")
  assert.deepEqual(await readFile(planPath), fixture.originalFiles.get(`${fixture.goalID}/plan.md`))
})

test("a real failure after publication rolls back from the retained publishing journal", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  await createProcessLock(fixture)
  const planPath = path.join(fixture.docsDirectory, fixture.goalID, "plan.md")
  const result = await runWithFilesystemBoundary(fixture, `
    export async function rename(from, to) {
      await fs.rename(from, to);
      if (to === ${JSON.stringify(planPath)}) throw new Error("injected after atomic plan publication");
    }
  `, `
    const preview = await recovery.previewGoalDocRecovery(request, dependencies);
    try {
      await recovery.applyGoalDocRecovery(preview, {authorize: async () => undefined});
      throw new Error("failure injection was not reached");
    } catch (error) { process.stdout.write(JSON.stringify({error: error.message})); }
  `)
  assert.deepEqual(result, { error: "injected after atomic plan publication" })
  assert.equal(hash(await readFile(planPath)), hash(await canonicalPlan(fixture)))
  const transactions = await readdir(fixture.backupDirectory)
  assert.equal(transactions.length, 1)
  const journalPath = path.join(fixture.backupDirectory, transactions[0], "journal.json")
  assert.equal(JSON.parse(await readFile(journalPath, "utf8")).phase, "publishing")
  const rolledBack = await rollbackGoalDocRecovery(journalPath, {
    authorize: async () => undefined, dependencies: fixture.dependencies,
  })
  assert.equal(rolledBack.status, "rolled_back")
  assert.deepEqual(await readFile(planPath), fixture.originalFiles.get(`${fixture.goalID}/plan.md`))
  assert.equal(JSON.parse(await readFile(journalPath, "utf8")).phase, "rolled_back")
})

test("an actual competing kernel lock refuses apply without backup or target mutation", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const release = await acquireProcessLock(path.join(fixture.docsDirectory, RECOVERY_PROCESS_LOCK))
  try {
    await assert.rejects(applyGoalDocRecovery(preview, { authorize: authorizeApply }), /another goal-docs process holds/)
    assert.deepEqual(await readdir(fixture.backupDirectory), [])
    assert.deepEqual(await readFile(path.join(fixture.docsDirectory, fixture.goalID, "plan.md")), fixture.originalFiles.get(`${fixture.goalID}/plan.md`))
  } finally { await release() }
})

test("a regular file replaced by a FIFO before open is refused without blocking", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const snapshotPath = path.join(fixture.docsDirectory, fixture.goalID, "snapshot.json")
  const result = await runWithFilesystemBoundary(fixture, `
    export async function open(file, flags, ...args) {
      if (file === ${JSON.stringify(snapshotPath)}) {
        await fs.unlink(file);
        execFileSync("mkfifo", [file]);
      }
      return fs.open(file, flags, ...args);
    }
  `, `
    try {
      await recovery.previewGoalDocRecovery(request, dependencies);
      process.stdout.write(JSON.stringify({code: "unexpected success"}));
    } catch (error) { process.stdout.write(JSON.stringify({code: error.code})); }
  `)
  assert.deepEqual(result, { code: "concurrent" })
  assert.deepEqual(await readdir(fixture.backupDirectory), [])
})

test("stale sibling mutation after preview fails the compare-and-swap before backup or publication", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  const handoff = path.join(fixture.docsDirectory, fixture.goalID, "HANDOFF.md")
  await writeFile(handoff, `${await readFile(handoff, "utf8")}\nconcurrent edit\n`)
  await createProcessLock(fixture)
  await assert.rejects(applyGoalDocRecovery(preview, { authorize: authorizeApply }), /manifest-owned file does not match its recorded hash/)
  assert.deepEqual(await readdir(fixture.backupDirectory), [])
  assert.notEqual(hash(await readFile(path.join(fixture.docsDirectory, `${fixture.goalID}/plan.md`))), preview.expectedPlanSha256)
})

test("body edits are rejected even when the export-time header remains the only intended repair", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const planPath = path.join(fixture.docsDirectory, fixture.goalID, "plan.md")
  const original = await readFile(planPath, "utf8")
  const altered = original.replace("## Goal objective", "## Altered goal objective")
  assert.notEqual(altered, original, "the adversarial body mutation must actually change the fixture")
  await writeFile(planPath, altered)
  await assert.rejects(previewGoalDocRecovery(fixture.request, fixture.dependencies), /manifest-owned file does not match its recorded hash|plan differs/)
})

test("session, goal, repository, and malformed path identities fail closed", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  await assert.rejects(previewGoalDocRecovery({ ...fixture.request, sessionID: "ses_other" }, fixture.dependencies), /snapshot source identity/)
  await assert.rejects(previewGoalDocRecovery({ ...fixture.request, goalID: "../outside" }, fixture.dependencies), (error: unknown) => error instanceof GoalDocsRecoveryError && error.code === "invalid_input")
  await assert.rejects(previewGoalDocRecovery({ ...fixture.request, sessionID: "bad session id" }, fixture.dependencies), (error: unknown) => error instanceof GoalDocsRecoveryError && error.code === "invalid_input")
  const wrongRepository: RecoveryDependencies = {
    repositoryMetadata: async () => ({ ...JSON.parse(JSON.stringify(fixture.manifest)), kind: "git", identity: "other.example/repo", worktree: "main", scope: ".", gaps: [] }),
  }
  await assert.rejects(previewGoalDocRecovery(fixture.request, wrongRepository), /repository\/worktree identity does not match/)
})

test("symlink, hardlink, and non-regular target plans are rejected", async (t) => {
  const symlinkFixture = await makeFixture()
  await cleanup(t, symlinkFixture)
  const symlinkPlan = path.join(symlinkFixture.docsDirectory, symlinkFixture.goalID, "plan.md")
  await unlink(symlinkPlan)
  await symlink(path.join(symlinkFixture.docsDirectory, symlinkFixture.goalID, "HANDOFF.md"), symlinkPlan)
  await assert.rejects(previewGoalDocRecovery(symlinkFixture.request, symlinkFixture.dependencies), /singly linked regular file/)

  const hardlinkFixture = await makeFixture()
  await cleanup(t, hardlinkFixture)
  const hardlinkPlan = path.join(hardlinkFixture.docsDirectory, hardlinkFixture.goalID, "plan.md")
  await link(hardlinkPlan, path.join(hardlinkFixture.base, "linked-plan"))
  await assert.rejects(previewGoalDocRecovery(hardlinkFixture.request, hardlinkFixture.dependencies), /singly linked regular file/)

  const directoryFixture = await makeFixture()
  await cleanup(t, directoryFixture)
  const directoryPlan = path.join(directoryFixture.docsDirectory, directoryFixture.goalID, "plan.md")
  await unlink(directoryPlan)
  await mkdir(directoryPlan)
  await assert.rejects(previewGoalDocRecovery(directoryFixture.request, directoryFixture.dependencies), /singly linked regular file/)
})

test("invalid integrity, traversal, stale sibling hashes, and oversized snapshots are rejected", async (t) => {
  const invalidFixture = await makeFixture()
  await cleanup(t, invalidFixture)
  const manifestPath = path.join(invalidFixture.docsDirectory, RECOVERY_MANIFEST)
  const invalid = await readManifest(invalidFixture)
  invalid.integrity = "0".repeat(64)
  await writeFile(manifestPath, `${JSON.stringify(invalid, null, 2)}\n`)
  await assert.rejects(previewGoalDocRecovery(invalidFixture.request, invalidFixture.dependencies), /integrity check failed/)

  const traversalFixture = await makeFixture()
  await cleanup(t, traversalFixture)
  const traversalPath = path.join(traversalFixture.docsDirectory, RECOVERY_MANIFEST)
  const traversal = await readManifest(traversalFixture)
  const { integrity: _ignored, ...payload } = traversal
  payload.files["../escape.md"] = "a".repeat(64)
  traversal.integrity = createHash("sha256").update(JSON.stringify(payload)).digest("hex")
  await writeFile(traversalPath, `${JSON.stringify(traversal, null, 2)}\n`)
  await assert.rejects(previewGoalDocRecovery(traversalFixture.request, traversalFixture.dependencies), /unsafe file entry/)

  const staleFixture = await makeFixture()
  await cleanup(t, staleFixture)
  const handoffPath = path.join(staleFixture.docsDirectory, staleFixture.goalID, "HANDOFF.md")
  await writeFile(handoffPath, `${await readFile(handoffPath, "utf8")}changed`)
  await assert.rejects(previewGoalDocRecovery(staleFixture.request, staleFixture.dependencies), /manifest-owned file does not match its recorded hash/)

  const oversizedFixture = await makeFixture()
  await cleanup(t, oversizedFixture)
  await writeFile(path.join(oversizedFixture.docsDirectory, oversizedFixture.goalID, "snapshot.json"), Buffer.alloc(512 * 1024 + 1, 0x20))
  await assert.rejects(previewGoalDocRecovery(oversizedFixture.request, oversizedFixture.dependencies), /exceeds its 524288-byte read limit/)
})

test("unsafe backup locations and backup entries are rejected without writes", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const linkPath = path.join(fixture.base, "backup-link")
  await symlink(fixture.backupDirectory, linkPath)
  await assert.rejects(previewGoalDocRecovery({ ...fixture.request, backupDirectory: linkPath }, fixture.dependencies), /unsafe directory component/)
  await assert.rejects(previewGoalDocRecovery({ ...fixture.request, backupDirectory: fixture.docsDirectory }, fixture.dependencies), /outside docs\/goals/)
  await writeFile(path.join(fixture.backupDirectory, "recovery-malformed"), "not a directory")
  await assert.rejects(previewGoalDocRecovery(fixture.request, fixture.dependencies), /unsafe recovery backup entry/)
})

test("tampered backup copies are rejected before they can be treated as rollback originals", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const applied = await applyGoalDocRecovery(preview, { authorize: authorizeApply })
  const backupReadme = path.join(path.dirname(applied.journalPath), "originals", "README.md")
  const moved = `${backupReadme}.preserved`
  await rename(backupReadme, moved)
  await symlink(moved, backupReadme)
  await assert.rejects(previewGoalDocRecovery(fixture.request, fixture.dependencies), /singly linked regular file/)
})

test("a rehashed journal cannot legitimize body changes in its preserved original", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const applied = await applyGoalDocRecovery(preview, { authorize: authorizeApply })
  const relative = `${fixture.goalID}/plan.md`
  const savedPlan = path.join(path.dirname(applied.journalPath), "originals", "bundle", fixture.goalID, "plan.md")
  const forged = Buffer.concat([await readFile(savedPlan), Buffer.from("\nUnapproved body replacement.\n")])
  await writeFile(savedPlan, forged)
  const journal = JSON.parse(await readFile(applied.journalPath, "utf8"))
  journal.files[relative].sha256 = hash(forged)
  journal.files[relative].ownedSha256 = hash(forged)
  journal.files[relative].signature.size = forged.length
  const { integrity: _integrity, ...payload } = journal
  journal.integrity = hash(stable(payload))
  await writeFile(applied.journalPath, `${JSON.stringify(journal, null, 2)}\n`)
  const current = await readFile(applied.restoredPath)
  await assert.rejects(rollbackGoalDocRecovery(applied.journalPath, {
    authorize: async () => undefined, dependencies: fixture.dependencies,
  }), /plan body differs|plan differs/)
  assert.deepEqual(await readFile(applied.restoredPath), current)
})

test("portable repository identity cannot substitute a different exact source directory", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const sourcePath = path.join(fixture.docsDirectory, fixture.goalID, "snapshot.json")
  const snapshot = JSON.parse(await readFile(sourcePath, "utf8"))
  const notice = snapshot.historyNotice.slice(0, -` ${snapshot.goal.historyNotice}`.length)
  const foreignSource = { ...snapshot.source, directory: repositoryRoot }
  const canonical = buildGoalDocBundle(foreignSource, snapshot.goal, notice).files
  const manifest = await readManifest(fixture)
  for (const name of ["plan.md", "HANDOFF.md", "work-history.md", "snapshot.json"] as const) {
    const relative = `${fixture.goalID}/${name}`
    manifest.files[relative] = hash(canonical[name])
    await writeFile(path.join(fixture.docsDirectory, relative), name === "plan.md" ? divergentCanonicalPlan(canonical[name]) : canonical[name])
  }
  manifest.goals[fixture.goalID].sourceDirectory = repositoryRoot
  const { integrity: _integrity, ...payload } = manifest
  manifest.integrity = hash(JSON.stringify(payload))
  await writeFile(path.join(fixture.docsDirectory, RECOVERY_MANIFEST), `${JSON.stringify(manifest)}\n`)
  await assert.rejects(previewGoalDocRecovery(fixture.request, fixture.dependencies), /exact source directory/)
})

test("unfinished journals block preview; rollback restores only unchanged interrupted targets and retains the journal", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const applied = await applyGoalDocRecovery(preview, { authorize: authorizeApply })
  const journal = JSON.parse(await readFile(applied.journalPath, "utf8"))
  journal.phase = "publishing"
  delete journal.targetPlanAfter
  const { integrity: _oldIntegrity, ...payload } = journal
  journal.integrity = hash(stable(payload))
  await writeFile(applied.journalPath, `${JSON.stringify(journal, null, 2)}\n`)
  await assert.rejects(previewGoalDocRecovery(fixture.request, fixture.dependencies), /unfinished recovery journal/)

  const rollback = await rollbackGoalDocRecovery(applied.journalPath, {
    dependencies: fixture.dependencies,
    authorize: async (request) => {
      assert.equal(request.action, "rollback")
      assert.equal(request.journalPath, applied.journalPath)
    },
  })
  assert.equal(rollback.status, "rolled_back")
  assert.deepEqual(await readFile(rollback.restoredPath), fixture.originalFiles.get(`${fixture.goalID}/plan.md`))
  assert.equal(JSON.parse(await readFile(applied.journalPath, "utf8")).phase, "rolled_back")
  assert.equal((await readdir(path.dirname(applied.journalPath))).includes("journal.json"), true)
})

test("rollback refuses concurrent sibling edits and leaves the journal and edit untouched", async (t) => {
  const fixture = await makeFixture()
  await cleanup(t, fixture)
  const preview = await previewGoalDocRecovery(fixture.request, fixture.dependencies)
  await createProcessLock(fixture)
  const applied = await applyGoalDocRecovery(preview, { authorize: authorizeApply })
  const journalBefore = await readFile(applied.journalPath)
  const readmePath = path.join(fixture.docsDirectory, "README.md")
  await writeFile(readmePath, `${await readFile(readmePath, "utf8")}external edit`)
  const editedReadme = await readFile(readmePath)
  await assert.rejects(rollbackGoalDocRecovery(applied.journalPath, {
    dependencies: fixture.dependencies,
    authorize: async () => undefined,
  }), /rollback refuses a changed sibling target/)
  assert.deepEqual(await readFile(applied.journalPath), journalBefore)
  assert.deepEqual(await readFile(readmePath), editedReadme)
})

test("CLI defaults to read-only preview help and refuses command-line apply", async () => {
  const cli = path.join(moduleDirectory, "recovery-cli.mjs")
  const run = (args: string[]) => new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", cli, ...args], { cwd: repositoryRoot })
    let stdout = ""
    let stderr = ""
    child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk })
    child.once("close", (code) => resolve({ code, stdout, stderr }))
  })
  const help = await run(["--help"])
  assert.equal(help.code, 0)
  assert.match(help.stdout, /Preview is the default and is read-only/)
  const denied = await run(["--apply"])
  assert.equal(denied.code, 1)
  assert.match(denied.stderr, /trusted host authorization callback/)
})
