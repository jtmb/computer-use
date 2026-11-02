import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import { appendFile, mkdir, mkdtemp, open, readFile, rename, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"
import { auditArchive, auditConsolidatedCrosswalk, auditCoverage, auditRepository, readAuditFile, reviewedPaths, sha256, sourceGroups, table } from "./request-coverage-audit.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = name => readFile(path.join(root, name))

function syntheticSources() {
  const counts = { O: 28, C: 11, T: 5, P: 10, S: 6 }
  // These are structural test inputs, never historical evidence or CLI fallback.
  return new Map(Object.entries(sourceGroups).map(([prefix, id]) => {
    const sessionID = `fixture-${prefix}`
    return [id, { source: { sessionID }, goal: { id, sessionID,
      plan: { completionCriteria: Array(counts[prefix]).fill("synthetic audit fixture") } } }]
  }))
}

async function coverageFixture() {
  const text = (await read("docs/request-coverage.md")).toString()
  const sources = syntheticSources()
  const files = new Map()
  for (const name of reviewedPaths) files.set(name, await read(name))
  for (const row of [...table(text, "Current 68-row mapping"), ...table(text, "Findings mapping")]) {
    const target = row[6].match(/^\[[^\]]+\]\(([^)]+)\)$/)[1]
    const name = path.posix.normalize(path.posix.join("docs", target))
    files.set(name, await read(name))
  }
  return { text, sources, files }
}

// Rule-focused cases pin the reviewed table to their own fixture bytes so a
// pending reconciliation of docs/request-coverage.md cannot mask the rule under
// test. The first coverage case keeps the live table as the real-source drift
// gate; the coordination case separately exercises omission and tamper detection.
function withPinnedReviewed(fixture) {
  const lines = fixture.text.split("\n")
  const start = lines.indexOf("## Reviewed combined-tree bytes")
  assert.notEqual(start, -1, "coverage document retains one reviewed-bytes section")
  const next = lines.findIndex((line, index) => index > start && line.startsWith("## "))
  const end = next === -1 ? lines.length : next
  const rows = lines.slice(start + 1, end).map(line => {
    const match = line.match(/^\| (.*) \| [0-9a-f]{64} \|$/)
    if (!match) return line
    const name = match[1].trim()
    const bytes = fixture.files.get(name)
    assert.ok(bytes, `fixture supplies reviewed bytes for ${name}`)
    return `| ${name} | ${sha256(bytes)} |`
  })
  return { ...fixture, text: [...lines.slice(0, start + 1), ...rows, ...lines.slice(end)].join("\n") }
}

function mutateRow(text, id, change) {
  const line = text.split("\n").find(line => line.startsWith(`| ${id} |`))
  assert.ok(line, `mutation target ${id} exists`)
  const cells = line.slice(1, -1).split("|").map(item => item.trim())
  change(cells)
  const result = text.replace(line, `| ${cells.join(" | ")} |`)
  assert.notEqual(result, text)
  return result
}

test("approved mapping retains all68 outcomes,7findings and actual reviewed bytes using synthetic source records", async () => {
  const result = auditCoverage(await coverageFixture())
  assert.deepEqual(result, { requirements: 68, findings: 7, errors: [] })
})

test("omission and named-deliverable loss fail independently of row count", async () => {
  const fixture = await coverageFixture()
  const removed = fixture.text.split("\n").filter(line => !line.startsWith("| C10 |")).join("\n")
  assert.ok(auditCoverage({ ...fixture, text: removed }).errors.includes("omitted requirement: C10"))
  const files = new Map(fixture.files)
  files.delete("docs/codex-parity/private-entry-status.md")
  assert.ok(auditCoverage({ ...fixture, files }).errors.includes("missing named deliverable: P05"))
})

test("missing untracked implementation, cloud-only review and source drift cannot pass", async () => {
  const fixture = await coverageFixture()
  const files = new Map(fixture.files)
  files.delete("tools/gnome-window-control/input.mjs")
  assert.ok(auditCoverage({ ...fixture, files }).errors.some(error => error.startsWith("missing combined-tree implementation:")))
  assert.ok(auditCoverage({ ...fixture, reviewView: "cloud-main" }).errors.some(error => error.startsWith("cloud/HEAD-only")))
  files.set("tools/gnome-window-control/input.mjs", Buffer.from("different implementation"))
  assert.ok(auditCoverage({ ...fixture, files }).errors.includes("review bytes changed: tools/gnome-window-control/input.mjs"))
})

test("coordination source omissions and drift cannot disappear behind a green coverage map", async () => {
  const coordination = [".gitignore", "index.ts", "tui.ts", "tui-host.ts", "rpc.ts", "rpc-contract.ts",
    "service.ts", "tool.ts", "store.ts", "policy.ts", "result.ts", "watchdog.ts", "native-observation.ts",
    "rpc-compatible.ts", "model.ts", "settings.ts", "inbox-ui.ts", "inbox-discovery.ts", "retired.ts"].map(name => `tools/session-coordination/${name}`)
  for (const name of coordination) assert.ok(reviewedPaths.includes(name), `mandatory reviewed coordination source: ${name}`)
  const text = (await read("docs/request-coverage.md")).toString()
  const sources = syntheticSources()
  const files = new Map()
  for (const name of reviewedPaths) files.set(name, await read(name))
  for (const row of [...table(text, "Current 68-row mapping"), ...table(text, "Findings mapping")]) {
    const target = row[6].match(/^\[[^\]]+\]\(([^)]+)\)$/)[1]
    const name = path.posix.normalize(path.posix.join("docs", target))
    files.set(name, await read(name))
  }
  const fixture = withPinnedReviewed({ text, sources, files })
  assert.deepEqual(auditCoverage(fixture).errors, [])
  for (const name of coordination) {
    const omitted = new Map(files); omitted.delete(name)
    assert.ok(auditCoverage({ ...fixture, files: omitted }).errors.includes(`missing combined-tree implementation: ${name}`))
    const drifted = new Map(files); drifted.set(name, Buffer.from("unreviewed observation implementation"))
    assert.ok(auditCoverage({ ...fixture, files: drifted }).errors.includes(`review bytes changed: ${name}`))
    const unreviewed = fixture.text.split("\n").filter(line => !line.startsWith(`| ${name} |`)).join("\n")
    assert.ok(auditCoverage({ ...fixture, text: unreviewed }).errors.includes(`missing combined-tree implementation: ${name}`))
  }
})

test("reviewed optional-import scope guards cannot be omitted or drift behind green package counts", async () => {
  const names = ["tools/opencode-plugins/resource-monitor/src/proc.ts", "tools/chatgpt-connector/verify-dependencies.mjs"]
  for (const name of names) assert.ok(reviewedPaths.includes(name), `mandatory reviewed scope guard: ${name}`)
  const fixture = withPinnedReviewed(await coverageFixture())
  assert.deepEqual(auditCoverage(fixture).errors, [])
  for (const name of names) {
    const omitted = new Map(fixture.files); omitted.delete(name)
    assert.ok(auditCoverage({ ...fixture, files: omitted }).errors.includes(`missing combined-tree implementation: ${name}`))
    const drifted = new Map(fixture.files); drifted.set(name, Buffer.from("unreviewed scope guard"))
    assert.ok(auditCoverage({ ...fixture, files: drifted }).errors.includes(`review bytes changed: ${name}`))
    const text = fixture.text.split("\n").filter(line => !line.startsWith(`| ${name} |`)).join("\n")
    assert.ok(auditCoverage({ ...fixture, text }).errors.includes(`missing combined-tree implementation: ${name}`))
  }
})

test("source completion cannot replace live/model acceptance or erase its required layer", async () => {
  const fixture = await coverageFixture()
  const complete = mutateRow(fixture.text, "S02", cells => { cells[5] = "complete" })
  assert.ok(auditCoverage({ ...fixture, text: complete }).errors.includes("false completion layer: S02"))
  const downgraded = mutateRow(complete, "S02", cells => { cells[3] = "source" })
  assert.ok(auditCoverage({ ...fixture, text: downgraded }).errors.includes("acceptance layer downgraded: S02"))
  const fabricated = mutateRow(complete, "S02", cells => { cells[4] = "model" })
  assert.ok(auditCoverage({ ...fixture, text: fabricated }).errors.includes("external observation required: S02"))
})

test("lost supersession, wrong source identity, duplicates and missing blocker rationale fail", async () => {
  const fixture = await coverageFixture()
  const lost = fixture.text.split("\n").filter(line => !line.startsWith("| D-reviewer |")).join("\n")
  assert.ok(auditCoverage({ ...fixture, text: lost }).errors.includes("lost decision: D-reviewer"))
  const unlinked = mutateRow(fixture.text, "S01", cells => { cells[8] = "-" })
  assert.ok(auditCoverage({ ...fixture, text: unlinked }).errors.includes("missing supersession link: S01"))
  const unexplained = mutateRow(fixture.text, "P05", cells => { cells[7] = "-" })
  assert.ok(auditCoverage({ ...fixture, text: unexplained }).errors.includes("unmapped requirement: P05"))
  const sources = structuredClone(fixture.sources)
  sources.get(sourceGroups.O).goal.sessionID = "unrelated-source"
  assert.ok(auditCoverage({ ...fixture, sources }).errors.some(error => error.startsWith("source identity/criteria invalid:")))
  const line = fixture.text.split("\n").find(line => line.startsWith("| O01 |"))
  const duplicate = fixture.text.replace(line, `${line}\n${line}`)
  assert.ok(auditCoverage({ ...fixture, text: duplicate }).errors.includes("invalid/duplicate requirement: O01"))
})

test("the no-PR correction stays explicitly linked while O16 and local preservation remain retained", async () => {
  const fixture = await coverageFixture()
  const row = table(fixture.text, "Current 68-row mapping").find(value => value[0] === "O16")
  assert.ok(row[8].split(",").map(value => value.trim()).includes("D-no-pr"), "historical PR scope needs its current supersession link")
  assert.ok(row[1].includes("local combined-tree/index preservation"))
  assert.equal(row[3], "live", "the original source layer is not silently downgraded")
  assert.ok(fixture.text.includes("### No-PR supersession crosswalk"))
  const unlinked = mutateRow(fixture.text, "O16", cells => { cells[8] = "-" })
  assert.ok(auditCoverage({ ...fixture, text: unlinked }).errors.includes("missing supersession link: O16"))
  const missing = fixture.text.split("\n").filter(line => !line.startsWith("| D-no-pr |")).join("\n")
  assert.ok(auditCoverage({ ...fixture, text: missing }).errors.includes("lost decision: D-no-pr"))
})

test("valid harmless rationale rewording passes and malformed/oversize tables refuse", async () => {
  const fixture = withPinnedReviewed(await coverageFixture())
  const text = mutateRow(fixture.text, "P05", cells => { cells[7] = "Await human participation and independently authorized, verified consumer readiness" })
  assert.deepEqual(auditCoverage({ ...fixture, text }).errors, [])
  assert.throws(() => table(`${fixture.text}\n## Decision lineage\n`, "Decision lineage"), /expected one/)
  assert.throws(() => table("x".repeat(2_000_001), "Decision lineage"), /budget/)
})

async function crosswalkFixture() {
  return {
    coverageText: (await read("docs/request-coverage.md")).toString(),
    planText: (await read("docs/codex-parity/consolidated-delivery-plan.md")).toString(),
  }
}

test("approved consolidated plan assigns all75 source-qualified IDs exactly once", async () => {
  const result = auditConsolidatedCrosswalk(await crosswalkFixture())
  assert.equal(result.identifiers, 75)
  assert.ok(result.lanes > 0 && result.lanes <= 64)
  assert.deepEqual(result.errors, [])
})

test("same-count lane duplication cannot hide a missing requirement", async () => {
  const fixture = await crosswalkFixture()
  const planText = fixture.planText.replace("O07, O08", "O07, O07")
  assert.notEqual(planText, fixture.planText)
  const result = auditConsolidatedCrosswalk({ ...fixture, planText })
  assert.equal(result.identifiers, 75)
  assert.ok(result.errors.includes("duplicate crosswalk identifier: O07"))
  assert.ok(result.errors.includes("omitted crosswalk identifier: O08"))
})

test("crosswalk omission and unknown IDs fail without changing source acceptance", async () => {
  const fixture = await crosswalkFixture()
  const omitted = fixture.planText.replace("O20, O23, O24, O28, N03", "O20, O23, O24, N03")
  assert.notEqual(omitted, fixture.planText)
  assert.ok(auditConsolidatedCrosswalk({ ...fixture, planText: omitted }).errors.includes("omitted crosswalk identifier: O28"))
  const unknown = fixture.planText.replace("O07, O08", "F99, O08")
  assert.notEqual(unknown, fixture.planText)
  assert.ok(auditConsolidatedCrosswalk({ ...fixture, planText: unknown }).errors.includes("unknown crosswalk identifier: F99"))
})

test("crosswalk accepts harmless lane naming but refuses duplicate or empty lanes", async () => {
  const fixture = await crosswalkFixture()
  const ids = [...table(fixture.coverageText, "Current 68-row mapping"), ...table(fixture.coverageText, "Findings mapping")].map(row => row[0])
  const regrouped = "## Requirement ownership crosswalk\n\n| Lane | IDs |\n| --- | --- |\n" +
    `| First owner | ${ids.slice(0, 30).join(", ")} |\n| Second owner | ${ids.slice(30).join(", ")} |\n`
  assert.deepEqual(auditConsolidatedCrosswalk({ ...fixture, planText: regrouped }), { identifiers: 75, lanes: 2, errors: [] })
  const renamed = fixture.planText.replace("| Real model efficiency |", "| Measured model comparison |")
  assert.notEqual(renamed, fixture.planText)
  assert.deepEqual(auditConsolidatedCrosswalk({ ...fixture, planText: renamed }).errors, [])
  const duplicate = fixture.planText.replace("| Real model efficiency |", "| Authority/native permissions |")
  assert.ok(auditConsolidatedCrosswalk({ ...fixture, planText: duplicate }).errors.includes("crosswalk lane must have a unique name and one nonempty ID list"))
  const empty = fixture.planText.replace("| Real model efficiency |", "|  |")
  assert.ok(auditConsolidatedCrosswalk({ ...fixture, planText: empty }).errors.includes("crosswalk lane must have a unique name and one nonempty ID list"))
})

test("crosswalk structural and input budgets fail closed", async () => {
  const fixture = await crosswalkFixture()
  assert.throws(() => auditConsolidatedCrosswalk({ ...fixture, planText: "" }))
  assert.throws(() => auditConsolidatedCrosswalk({ ...fixture, planText: fixture.planText + "\n## Requirement ownership crosswalk\n" }))
  assert.throws(() => auditConsolidatedCrosswalk({ ...fixture, planText: "x".repeat(2_000_001) }))
  const prefix = "## Requirement ownership crosswalk\n\n| Lane | IDs |\n| --- | --- |\n"
  const lanes = prefix + Array.from({ length: 65 }, (_, i) => `| Lane ${i} | O07 |`).join("\n")
  assert.ok(auditConsolidatedCrosswalk({ ...fixture, planText: lanes }).errors.includes("crosswalk exceeds lane budget"))
  const ids = prefix + `| One lane | ${Array(129).fill("O07").join(", ")} |\n`
  assert.ok(auditConsolidatedCrosswalk({ ...fixture, planText: ids }).errors.includes("crosswalk exceeds identifier budget"))
})

function archiveFixture() {
  const id = "source-goal"
  const checkpoint = { id, status: "active", planRevision: 5, sessionID: "source-session", directory: "/repos/example" }
  const record = { goalID: id, status: checkpoint.status, planRevision: checkpoint.planRevision, sourceSessionID: checkpoint.sessionID, sourceDirectory: checkpoint.directory }
  const snapshot = { source: { sessionID: checkpoint.sessionID, directory: checkpoint.directory }, goal: { id, sessionID: checkpoint.sessionID, status: checkpoint.status, planRevision: checkpoint.planRevision } }
  const block = "<!-- goal-docs:managed:start -->\nindex\n<!-- goal-docs:managed:end -->"
  const files = new Map([["README.md", Buffer.from(`Manual header\n${block}\nManual footer`)]])
  for (const name of ["plan.md", "HANDOFF.md", "work-history.md"]) files.set(`${id}/${name}`, Buffer.from(`Saved ${name}`))
  files.set(`${id}/snapshot.json`, Buffer.from(JSON.stringify(snapshot)))
  const owned = Object.fromEntries([...files].map(([name, data]) => [name, sha256(name === "README.md" ? block : data)]))
  const manifest = { version: 1, owner: "goal-docs", files: owned, goals: { [id]: record }, transfers: {} }
  manifest.integrity = sha256(JSON.stringify(manifest))
  return { manifest, files, checkpoints: [checkpoint] }
}

test("valid archive verifies actual bytes with README managed-block semantics", () => {
  const fixture = archiveFixture()
  assert.deepEqual(auditArchive(fixture).errors, [])
  fixture.files.set("README.md", Buffer.from(`Another manual note\n${fixture.files.get("README.md")}`))
  assert.deepEqual(auditArchive(fixture).errors, [])
  assert.match(auditArchive({ ...fixture, checkpoints: [] }).freshness, /unverified/)
})

test("manifest integrity includes transfer records in the writer's actual payload order", () => {
  const fixture = archiveFixture()
  fixture.manifest.transfers = { retained: { sourceSessionID: "source-session", phase: "export" } }
  const { integrity, ...payload } = fixture.manifest
  fixture.manifest.integrity = sha256(JSON.stringify(payload))
  assert.deepEqual(auditArchive(fixture).errors, [])
  delete fixture.manifest.transfers.retained
  assert.ok(auditArchive(fixture).errors.includes("archive manifest integrity mismatch"))
})

test("stale same-revision status and missing successor export fail lifecycle checkpoint", () => {
  const fixture = archiveFixture()
  fixture.checkpoints[0].status = "cancelled"
  assert.ok(auditArchive(fixture).errors.includes("stale/missing selected archive: source-goal"))
  fixture.checkpoints.push({ ...fixture.checkpoints[0], id: "replacement-goal" })
  assert.ok(auditArchive(fixture).errors.includes("stale/missing selected archive: replacement-goal"))
})

test("corrupt/mixed bundle, manifest tamper, wrong identity and lost history fail distinctly", () => {
  const corrupt = archiveFixture()
  corrupt.files.set("source-goal/plan.md", Buffer.from("later generation without manifest"))
  assert.ok(auditArchive(corrupt).errors.includes("archive hash mismatch: source-goal/plan.md"))
  const tampered = archiveFixture()
  tampered.manifest.goals["source-goal"].sourceSessionID = "different-session"
  const errors = auditArchive(tampered).errors
  assert.ok(errors.includes("archive manifest integrity mismatch"))
  assert.ok(errors.includes("archive source identity mismatch: source-goal"))
  const omitted = archiveFixture()
  omitted.files.delete("source-goal/work-history.md")
  assert.ok(auditArchive(omitted).errors.includes("missing mandatory archive file: source-goal/work-history.md"))
})

test("actual audit reader bounds files and refuses traversal, links and nonregular inputs", async t => {
  const directory = await mkdtemp("/tmp/opencode/coverage-audit-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  await writeFile(path.join(directory, "regular.md"), "verified source bytes")
  assert.equal((await readAuditFile(directory, "regular.md")).toString(), "verified source bytes")
  assert.ok((await readAuditFile(directory, "regular.md")).buffer.byteLength <= 8192, "a tiny input must not retain its entire 2 MB acquisition buffer")
  await assert.rejects(readAuditFile(directory, "../regular.md"), /unsafe/)
  await symlink(path.join(directory, "regular.md"), path.join(directory, "linked.md"))
  await assert.rejects(readAuditFile(directory, "linked.md"), /symlink/)
  await mkdir(path.join(directory, "folder"))
  await assert.rejects(readAuditFile(directory, "folder"), /nonregular/)
  execFileSync("mkfifo", [path.join(directory, "pipe")])
  await assert.rejects(readAuditFile(directory, "pipe"), /nonregular/)
  await writeFile(path.join(directory, "oversize.md"), Buffer.alloc(2_000_001))
  await assert.rejects(readAuditFile(directory, "oversize.md"), /oversize/)
})

async function writeLineage(directory, { empty = false, sourceDirectory = directory } = {}) {
  const goalRoot = path.join(directory, "docs/goals")
  await mkdir(goalRoot, { recursive: true })
  const block = "<!-- goal-docs:managed:start -->\nSynthetic CLI fixture\n<!-- goal-docs:managed:end -->"
  const files = { "README.md": sha256(block) }, goals = {}
  await writeFile(path.join(goalRoot, "README.md"), block)
  if (!empty) for (const [id, value] of syntheticSources()) {
    const snapshot = structuredClone(value)
    snapshot.source.directory = sourceDirectory
    snapshot.goal.status = "unmet"
    snapshot.goal.planRevision = 1
    goals[id] = { goalID: id, sourceSessionID: snapshot.goal.sessionID, sourceDirectory, status: "unmet", planRevision: 1 }
    await mkdir(path.join(goalRoot, id))
    for (const name of ["snapshot.json", "plan.md", "HANDOFF.md", "work-history.md"]) {
      const bytes = name === "snapshot.json" ? JSON.stringify(snapshot) : `Synthetic ${name}`
      await writeFile(path.join(goalRoot, id, name), bytes)
      files[`${id}/${name}`] = sha256(bytes)
    }
  }
  const payload = { version: 1, owner: "goal-docs", files, goals, transfers: {} }
  await writeFile(path.join(goalRoot, ".goal-docs-manifest.json"), JSON.stringify({ ...payload, integrity: sha256(JSON.stringify(payload)) }))
}

async function cliFixture(t, { empty = false } = {}) {
  const directory = await mkdtemp("/tmp/opencode/coverage-cli-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const fixture = withPinnedReviewed(await coverageFixture())
  const files = new Map(fixture.files)
  files.set("docs/request-coverage.md", Buffer.from(fixture.text))
  files.set("docs/codex-parity/consolidated-delivery-plan.md", await read("docs/codex-parity/consolidated-delivery-plan.md"))
  files.set("scripts/request-coverage-audit.mjs", await read("scripts/request-coverage-audit.mjs"))
  for (const [name, bytes] of files) {
    await mkdir(path.dirname(path.join(directory, name)), { recursive: true })
    await writeFile(path.join(directory, name), bytes)
  }
  await writeLineage(directory, { empty })
  return directory
}

function runCli(directory, args = []) {
  const result = spawnSync(process.execPath, [path.join(directory, "scripts/request-coverage-audit.mjs"), ...args], { encoding: "utf8", timeout: 10000, maxBuffer: 1024 * 1024 })
  assert.equal(result.error, undefined)
  let report
  assert.doesNotThrow(() => { report = JSON.parse(result.stdout) }, "the CLI must emit a structured report, not abort at the first absent historical snapshot")
  return { result, report }
}

async function mockFileRead(t, file, wrap) {
  const handle = await open(file, "r")
  const prototype = Object.getPrototypeOf(handle)
  await handle.close()
  const read = prototype.read
  t.mock.method(prototype, "read", function (...args) { return wrap.call(this, read.bind(this), args) })
}

test("shared audit budget refuses a non-fitting input before acquiring any file bytes", async t => {
  const directory = await cliFixture(t)
  let calls = 0
  await mockFileRead(t, path.join(directory, "docs/request-coverage.md"), (read, args) => {
    calls++
    return read(...args)
  })
  const report = await auditRepository(directory, { maxTotalBytes: 1 })
  assert.equal(calls, 0, "metadata-sized inputs must fit before a payload read")
  assert.equal(report.acquisition.chargedBytes, 0)
  assert.equal(report.acquisition.observedBytes, 0)
  assert.equal(report.acquisition.limitBytes, 1)
  assert.equal(report.exitCode, 1)
  assert.ok(report.inputErrors.some(value => value.code === "AUDIT_BYTE_BUDGET"))
})

test("shared audit budget charges multiple complete files before refusing the next input", async t => {
  const directory = await cliFixture(t)
  const manifest = path.join(directory, "docs/goals/.goal-docs-manifest.json")
  const limit = (await readFile(manifest)).length + (await readFile(path.join(directory, "docs/goals/README.md"))).length
  let observed = 0
  await mockFileRead(t, manifest, async (read, args) => {
    const result = await read(...args)
    observed += result.bytesRead
    return result
  })
  const report = await auditRepository(directory, { maxTotalBytes: limit })
  assert.equal(observed, limit, "the aggregate cap must apply before the next file, not afterward")
  assert.equal(report.acquisition.observedBytes, observed)
  assert.equal(report.acquisition.chargedBytes, limit)
  assert.equal(report.acquisition.remainingBytes, 0)
  assert.equal(report.exitCode, 1)
})

test("shared audit budget spans distinct delivery and lineage roots without a second allowance", async t => {
  const directory = await cliFixture(t, { empty: true })
  const reference = await mkdtemp("/tmp/opencode/audit-budget-reference-")
  t.after(() => rm(reference, { recursive: true, force: true }))
  await writeLineage(reference)
  const manifest = path.join(directory, "docs/goals/.goal-docs-manifest.json")
  const limit = (await readFile(manifest)).length + (await readFile(path.join(directory, "docs/goals/README.md"))).length
  let observed = 0
  await mockFileRead(t, manifest, async (read, args) => {
    const result = await read(...args)
    observed += result.bytesRead
    return result
  })
  const report = await auditRepository(directory, { lineageRoot: reference, maxTotalBytes: limit })
  assert.equal(observed, limit)
  assert.equal(report.acquisition.chargedBytes, limit)
  assert.ok(report.inputErrors.some(value => value.root === reference && value.code === "AUDIT_BYTE_BUDGET"))
  assert.equal(report.coverage.status, "blocked")
})

test("shared audit budget retains partial bytes and conservatively charges a failed read request", async t => {
  const directory = await cliFixture(t)
  const manifest = path.join(directory, "docs/goals/.goal-docs-manifest.json")
  const limit = (await readFile(manifest)).length + 100
  let calls = 0, observed = 0, failedRequest = 0
  await mockFileRead(t, manifest, async (read, args) => {
    calls++
    if (calls === 1) {
      const result = await read(args[0], args[1], 7, args[3])
      observed += result.bytesRead
      return result
    }
    if (calls === 2) {
      failedRequest = args[2]
      throw new Error("fixture-private-error-body-must-not-be-exported")
    }
    const result = await read(...args)
    observed += result.bytesRead
    return result
  })
  const report = await auditRepository(directory, { maxTotalBytes: limit })
  assert.ok(observed + failedRequest <= limit, "failed acquisition must not buy another allowance")
  assert.equal(report.acquisition.observedBytes, observed)
  assert.equal(report.acquisition.failedReadChargeBytes, failedRequest)
  assert.equal(report.acquisition.chargedBytes, observed + failedRequest)
  assert.equal(JSON.stringify(report).includes("fixture-private-error-body"), false)
  assert.equal(report.exitCode, 1)
})

test("audit growth refusal never reads past the initially held size or shared allowance", async t => {
  const directory = await cliFixture(t)
  const manifest = path.join(directory, "docs/goals/.goal-docs-manifest.json")
  const limit = (await readFile(manifest)).length
  let changed = false, observed = 0
  await mockFileRead(t, manifest, async (read, args) => {
    const result = await read(...args)
    observed += result.bytesRead
    if (!changed) { changed = true; await appendFile(manifest, " ") }
    return result
  })
  const report = await auditRepository(directory, { maxTotalBytes: limit })
  assert.equal(changed, true)
  assert.equal(observed, limit)
  assert.equal(report.acquisition.chargedBytes, limit)
  assert.ok(report.inputErrors.some(value => value.path.endsWith(".goal-docs-manifest.json") && value.code === "AUDIT_INPUT_CHANGED"))
  assert.equal(report.exitCode, 1)
})

test("audit reader accepts the exact per-file ceiling without a payload read beyond held metadata", async t => {
  const directory = await mkdtemp("/tmp/opencode/audit-exact-size-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const target = path.join(directory, "exact.bin"), bytes = Buffer.alloc(2_000_000, 9)
  await writeFile(target, bytes)
  await mockFileRead(t, target, (read, args) => {
    assert.ok(args[3] + args[2] <= bytes.length, "a growing tail must not be read as an EOF probe")
    return read(...args)
  })
  assert.deepEqual(await readAuditFile(directory, "exact.bin"), bytes)
})

test("aggregate audit limits can only reduce the fixed ceiling and refuse before payload IO", async t => {
  const directory = await cliFixture(t)
  let calls = 0
  await mockFileRead(t, path.join(directory, "docs/request-coverage.md"), (read, args) => { calls++; return read(...args) })
  for (const maxTotalBytes of [0, -1, 16_000_001, 1.5, Infinity, NaN, "100", null]) {
    await assert.rejects(auditRepository(directory, { maxTotalBytes }), /audit byte limit/)
  }
  assert.equal(calls, 0)
})

test("audit acquisition reads through short reads instead of treating a prefix as the whole file", async t => {
  const directory = await mkdtemp("/tmp/opencode/audit-short-read-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, "input.md")
  const text = "a complete audit input across multiple kernel reads"
  await writeFile(file, text)
  let reads = 0
  await mockFileRead(t, file, (read, args) => {
    reads++
    const [buffer, offset, length, position] = args
    return read(buffer, offset, Math.min(length, 7), position)
  })
  assert.equal((await readAuditFile(directory, "input.md")).toString(), text)
  assert.ok(reads > 1)
})

test("audit acquisition refuses a same-byte path replacement at the actual read boundary", async t => {
  const directory = await mkdtemp("/tmp/opencode/audit-read-replace-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  const file = path.join(directory, "input.md")
  await writeFile(file, "exact original bytes")
  let replaced = false
  await mockFileRead(t, file, async (read, args) => {
    const result = await read(...args)
    if (!replaced) {
      replaced = true
      await writeFile(file + ".new", "exact original bytes")
      await rename(file + ".new", file)
    }
    return result
  })
  await assert.rejects(readAuditFile(directory, "input.md"), { code: "AUDIT_INPUT_CHANGED" })
  assert.equal(replaced, true)
  assert.equal(await readFile(file, "utf8"), "exact original bytes")
})

test("archive audit refuses a manifest advanced during acquisition, without blessing mixed lineage", async t => {
  const directory = await cliFixture(t)
  const manifestPath = path.join(directory, "docs/goals/.goal-docs-manifest.json")
  const original = await readFile(manifestPath)
  let advanced = false
  await mockFileRead(t, manifestPath, async (read, args) => {
    const result = await read(...args)
    if (!advanced && args[0].subarray(args[1], args[1] + result.bytesRead).toString().includes("Synthetic CLI fixture")) {
      advanced = true
      await writeFile(manifestPath + ".new", Buffer.concat([original, Buffer.from("\n")]))
      await rename(manifestPath + ".new", manifestPath)
    }
    return result
  })
  const report = await auditRepository(directory)
  assert.equal(advanced, true)
  assert.equal(report.exitCode, 1)
  assert.equal(report.archive.status, "blocked")
  assert.ok(report.archive.errors.includes("archive changed during audit; retry read-only inspection"))
  assert.equal(report.coverage.status, "blocked")
  t.mock.restoreAll()
  const stable = await auditRepository(directory)
  assert.equal(stable.exitCode, 3, "an independent stable reread is still source-only/incomplete")
  assert.deepEqual(stable.archive.errors, [])
})

test("archive audit revalidates an earlier same-byte file even when the manifest stays unchanged", async t => {
  const directory = await cliFixture(t)
  const firstPlan = path.join(directory, `docs/goals/${sourceGroups.O}/plan.md`)
  const bytes = await readFile(firstPlan)
  let changed = false
  await mockFileRead(t, firstPlan, async (read, args) => {
    const result = await read(...args)
    if (!changed && args[0].subarray(args[1], args[1] + result.bytesRead).toString() === "Synthetic HANDOFF.md") {
      changed = true
      await writeFile(firstPlan + ".new", bytes)
      await rename(firstPlan + ".new", firstPlan)
    }
    return result
  })
  const report = await auditRepository(directory)
  assert.equal(changed, true)
  assert.equal(report.exitCode, 1)
  assert.equal(report.archive.status, "blocked")
  assert.equal(report.coverage.status, "blocked")
  assert.ok(report.inputErrors.some(error => error.path === `docs/goals/${sourceGroups.O}/plan.md` && error.code === "AUDIT_INPUT_CHANGED"))
  assert.equal(sha256(await readFile(firstPlan)), sha256(bytes), "same hashes cannot hide read-set replacement")
})

test("retirement verifier, JSONC editor and reversible transaction cannot disappear behind a coverage count", async () => {
  const fixture = await coverageFixture()
  for (const name of ["scripts/mcp_runtime.py", "scripts/setup-opencode-jsonc.py", "scripts/mcp_config_transaction.py"]) {
    const missing = new Map(fixture.files)
    missing.delete(name)
    assert.ok(auditCoverage({ ...fixture, files: missing }).errors.includes(`missing combined-tree implementation: ${name}`))
    const drift = new Map(fixture.files)
    drift.set(name, Buffer.from("unreviewed configuration path"))
    assert.ok(auditCoverage({ ...fixture, files: drift }).errors.includes(`review bytes changed: ${name}`))
  }
})

test("real CLI reports all missing lineage inputs while crosswalk and reviewed-byte failures stay visible", async t => {
  const directory = await cliFixture(t, { empty: true })
  await writeFile(path.join(directory, reviewedPaths[0]), "unreviewed source")
  const { result, report } = runCli(directory)
  assert.equal(result.status, 1)
  assert.equal(report.roots.lineage, directory)
  for (const id of Object.values(sourceGroups)) assert.ok(report.inputErrors.some(value => value.path === `docs/goals/${id}/snapshot.json` && value.code === "ENOENT"))
  assert.equal(report.coverage.status, "blocked")
  assert.equal(report.crosswalk.identifiers, 75)
  assert.deepEqual(report.crosswalk.errors, [])
  assert.ok(report.reviewed.errors.includes(`review bytes changed: ${reviewedPaths[0]}`))
})

test("real CLI explicit reference validates lineage without filling missing delivery archives or writing either root", async t => {
  const directory = await cliFixture(t, { empty: true })
  const reference = await mkdtemp("/tmp/opencode/coverage-reference-")
  t.after(() => rm(reference, { recursive: true, force: true }))
  await writeLineage(reference)
  const manifest = "docs/goals/.goal-docs-manifest.json"
  const before = await Promise.all([directory, reference].map(value => readFile(path.join(value, manifest))))
  const { result, report } = runCli(directory, ["--lineage-root", reference])
  assert.equal(result.status, 1)
  assert.deepEqual(report.coverage.errors, [])
  assert.deepEqual(report.sourceArchive.errors, [])
  assert.equal(report.roots.combinedTree, directory)
  assert.equal(report.roots.lineage, reference)
  for (const id of Object.values(sourceGroups)) assert.ok(report.archive.errors.includes(`missing required lineage bundle: ${id}`))
  assert.deepEqual(await Promise.all([directory, reference].map(value => readFile(path.join(value, manifest)))), before)
  await assert.rejects(readFile(path.join(directory, `docs/goals/${sourceGroups.O}/snapshot.json`)), { code: "ENOENT" })
})

test("real CLI all-valid fixture still returns incomplete exit 3, never live or whole-goal acceptance", async t => {
  const directory = await cliFixture(t)
  const { result, report } = runCli(directory)
  assert.equal(result.status, 3)
  assert.equal(report.readOnly, true)
  assert.equal(report.acceptance, "not_observed")
  assert.deepEqual(report.inputErrors, [])
  assert.deepEqual(report.coverage, { requirements: 68, findings: 7, errors: [] })
  assert.deepEqual(report.archive.errors, [])
  assert.equal(report.crosswalk.identifiers, 75)
})

test("real CLI refuses internally consistent reference snapshots bound to another directory", async t => {
  const directory = await cliFixture(t, { empty: true })
  const reference = await mkdtemp("/tmp/opencode/coverage-reference-")
  t.after(() => rm(reference, { recursive: true, force: true }))
  await writeLineage(reference, { sourceDirectory: "/repos/unrelated" })
  const { result, report } = runCli(directory, ["--lineage-root", reference])
  assert.equal(result.status, 1)
  assert.deepEqual(report.sourceArchive.errors, [])
  assert.equal(report.coverage.status, "blocked")
  assert.ok(report.inputErrors.some(value => value.code === "SOURCE_DIRECTORY_MISMATCH"))
})

test("real CLI rejects parsed but unowned reference snapshot bytes instead of trusting criterion count", async t => {
  const directory = await cliFixture(t, { empty: true })
  const reference = await mkdtemp("/tmp/opencode/coverage-reference-")
  t.after(() => rm(reference, { recursive: true, force: true }))
  await writeLineage(reference)
  const snapshot = path.join(reference, `docs/goals/${sourceGroups.O}/snapshot.json`)
  const value = JSON.parse(await readFile(snapshot))
  value.goal.plan.completionCriteria[0] = "unreviewed synthetic replacement"
  await writeFile(snapshot, JSON.stringify(value))
  const { result, report } = runCli(directory, ["--lineage-root", reference])
  assert.equal(result.status, 1)
  assert.equal(report.coverage.status, "blocked")
  assert.ok(report.sourceArchive.errors.includes(`archive hash mismatch: ${sourceGroups.O}/snapshot.json`))
})

test("real CLI malformed JSON remains a structured failure without echoing input contents", async t => {
  const directory = await cliFixture(t)
  await writeFile(path.join(directory, `docs/goals/${sourceGroups.O}/snapshot.json`), '{"privateSyntheticMarker":')
  const { result, report } = runCli(directory)
  assert.equal(result.status, 1)
  assert.equal(report.coverage.status, "blocked")
  assert.ok(report.inputErrors.some(value => value.code === "INVALID_JSON"))
  assert.equal((result.stdout + result.stderr).includes("privateSyntheticMarker"), false)
  assert.equal(report.crosswalk.identifiers, 75)
})

test("real CLI manifest identity drift blocks source-qualified coverage despite valid snapshot hashes", async t => {
  const directory = await cliFixture(t)
  const name = path.join(directory, "docs/goals/.goal-docs-manifest.json")
  const manifest = JSON.parse(await readFile(name))
  manifest.goals[sourceGroups.O].sourceSessionID = "unrelated-fixture-session"
  const { integrity, ...payload } = manifest
  manifest.integrity = sha256(JSON.stringify(payload))
  await writeFile(name, JSON.stringify(manifest))
  const { result, report } = runCli(directory)
  assert.equal(result.status, 1)
  assert.equal(report.coverage.status, "blocked")
  assert.ok(report.inputErrors.some(value => value.code === "SOURCE_IDENTITY_MISMATCH"))
})

test("real CLI rejects write modes and ambiguous or relative lineage selection", async t => {
  const directory = await cliFixture(t)
  for (const args of [["--apply"], ["--lineage-root", "relative"], ["--lineage-root", directory, "--lineage-root", directory]]) {
    const { result, report } = runCli(directory, args)
    assert.equal(result.status, 1)
    assert.ok(report.fatal)
  }
})

test("real CLI compares a supplied supported-tool checkpoint and reports staleness", async t => {
  const directory = await cliFixture(t)
  const checkpoint = path.join(directory, "checkpoint.json")
  await writeFile(checkpoint, JSON.stringify({ id: "missing-goal", status: "active", planRevision: 1, sessionID: "ses_missing", directory }))
  const { result, report } = runCli(directory, ["--checkpoint", checkpoint])
  assert.equal(result.status, 1)
  assert.match(report.sourceArchive.freshness, /compared with supplied supported-tool checkpoint/)
  assert.ok(report.sourceArchive.errors.some(value => value === "stale/missing selected archive: missing-goal"))
})

test("real CLI rejects a symlinked lineage root before reading reference inputs", async t => {
  const directory = await cliFixture(t)
  const link = path.join(directory, "linked-lineage")
  await symlink(directory, link)
  const { result, report } = runCli(directory, ["--lineage-root", link])
  assert.equal(result.status, 1)
  assert.ok(report.fatal)
})
