import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { lstat, open, readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const sourceGroups = {
  O: "46f3f7e1-a5eb-4b84-b392-016ece39e46b",
  C: "464c3066-1eb6-452a-bbe5-4c138dc9e899",
  T: "0d966462-9d3a-4194-b518-e3eeaed60644",
  P: "ec2a347f-8071-4358-bc93-a223a846247d",
  S: "483f6755-70a7-4912-aee3-816fbe0b7546",
}
export const reviewedPaths = [
  "tools/gnome-window-control/input.mjs",
  "tools/gnome-window-control/extension.js",
  "global/commands/handoff_resume.md",
  "scripts/handoff-resume-contract.test.mjs",
  ...[".gitignore", "index.ts", "tui.ts", "tui-host.ts", "rpc.ts", "rpc-contract.ts",
    "service.ts", "tool.ts", "store.ts", "policy.ts", "result.ts", "watchdog.ts", "native-observation.ts",
    "rpc-compatible.ts", "model.ts", "settings.ts", "inbox-ui.ts", "inbox-discovery.ts", "retired.ts"].map(name => `tools/session-coordination/${name}`),
  "tools/opencode-plugins/resource-monitor/src/proc.ts",
  "tools/chatgpt-connector/verify-dependencies.mjs",
  "scripts/mcp_runtime.py",
  "scripts/setup-opencode-jsonc.py",
  "scripts/mcp_config_transaction.py",
]
const sourceOnly = new Set(["O07", "O08", "O19", "O21", "O22", "O25", "O27", "C02", "N01", "N02", "N04", "N06", "N08"])
const modelRequired = new Set(["S02", "N03"])
const decisionsRequired = {
  O10: "D-code-mode", O16: "D-no-pr", O17: "D-handoff", P07: "D-code-mode", S01: "D-cancelled",
  S05: "D-reviewer", N06: "D-reviewer", N07: "D-current-chat", T03: "D-retirement",
}
const numbered = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, "0")}`)
export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")
const nonempty = (value) => typeof value === "string" && value.trim().length > 0 && value !== "-"
const safeRelative = (value) => typeof value === "string" && value.length > 0 && !value.includes("\\") && !path.posix.isAbsolute(value) && value.split("/").every(part => part && part !== "." && part !== "..")

export function table(text, heading) {
  if (text.length > 2_000_000) throw new Error("coverage document exceeds audit budget")
  const lines = text.split("\n")
  const starts = lines.flatMap((line, i) => line === `## ${heading}` ? [i] : [])
  if (starts.length !== 1) throw new Error(`expected one ${heading} section`)
  const result = []
  for (const line of lines.slice(starts[0] + 1)) {
    if (line.startsWith("## ")) break
    if (line.startsWith("| ")) result.push(line.slice(1, -1).split("|").map(cell => cell.trim()))
  }
  if (result.length < 2 || result.length > 260) throw new Error(`invalid ${heading} table size`)
  return result.slice(2)
}

export function auditCoverage({ text, sources, files, reviewView = "combined-local" }) {
  const errors = []
  const expected = []
  for (const [prefix, id] of Object.entries(sourceGroups)) {
    const source = sources.get(id)
    const criteria = source?.goal?.plan?.completionCriteria
    if (source?.goal?.id !== id || source?.goal?.sessionID !== source?.source?.sessionID || !Array.isArray(criteria) || !criteria.length || criteria.length > 32) {
      errors.push(`source identity/criteria invalid: ${id}`)
      continue
    }
    expected.push(...numbered(prefix, criteria.length))
  }
  expected.push(...numbered("N", 8), ...numbered("F", 7))
  if (expected.length !== 75) errors.push("selected source baseline must retain 68 requirements plus F01–F07")
  const decisions = new Map()
  for (const row of table(text, "Decision lineage")) {
    if (row.length !== 4 || decisions.has(row[0]) || row.some(cell => !nonempty(cell))) errors.push(`invalid decision: ${row[0]}`)
    decisions.set(row[0], row)
  }
  for (const id of new Set(Object.values(decisionsRequired))) if (!decisions.has(id)) errors.push(`lost decision: ${id}`)
  const seen = new Set()
  const rows = [...table(text, "Current 68-row mapping"), ...table(text, "Findings mapping")]
  for (const row of rows) {
    const [id, requirement, tasks, needs, has, disposition, artifact, reason, decision] = row
    if (row.length !== 9 || seen.has(id) || !expected.includes(id)) errors.push(`invalid/duplicate requirement: ${id}`)
    seen.add(id)
    if (![requirement, tasks, artifact, reason].every(nonempty)) errors.push(`unmapped requirement: ${id}`)
    const required = id.startsWith("F") || sourceOnly.has(id) ? "source" : modelRequired.has(id) ? "model" : "live"
    if (needs !== required) errors.push(`acceptance layer downgraded: ${id}`)
    if (!["source", "deployed", "model", "live", "none"].includes(has) || !["complete", "retained", "blocked"].includes(disposition)) errors.push(`invalid disposition/layer: ${id}`)
    if (disposition === "complete" && needs !== has) errors.push(`false completion layer: ${id}`)
    // Offline audits can verify source presence, never promote a document to a live observation.
    if (disposition === "complete" && has !== "source") errors.push(`external observation required: ${id}`)
    const match = artifact?.match(/^\[[^\]]+\]\(([^)]+)\)$/)
    const relative = match && path.posix.normalize(path.posix.join("docs", match[1]))
    if (!relative || !safeRelative(relative) || !files.has(relative)) errors.push(`missing named deliverable: ${id}`)
    if (decision !== "-") for (const name of decision.split(",")) if (!decisions.has(name.trim())) errors.push(`unknown decision: ${id}/${name}`)
    if (decisionsRequired[id] && !decision?.split(",").map(item => item.trim()).includes(decisionsRequired[id])) errors.push(`missing supersession link: ${id}`)
  }
  for (const id of expected) if (!seen.has(id)) errors.push(`omitted requirement: ${id}`)
  if (reviewView !== "combined-local") errors.push("cloud/HEAD-only input cannot review missing combined-tree implementations")
  errors.push(...reviewedByteErrors(text, files))
  return { requirements: rows.filter(row => !row[0].startsWith("F")).length, findings: rows.filter(row => row[0].startsWith("F")).length, errors }
}

function reviewedByteErrors(text, files) {
  const errors = []
  const reviewed = new Map(table(text, "Reviewed combined-tree bytes"))
  for (const name of reviewedPaths) {
    if (!reviewed.has(name) || !files.has(name)) errors.push(`missing combined-tree implementation: ${name}`)
    else if (sha256(files.get(name)) !== reviewed.get(name)) errors.push(`review bytes changed: ${name}`)
  }
  return errors
}

export function auditConsolidatedCrosswalk({ coverageText, planText }) {
  const expected = [...table(coverageText, "Current 68-row mapping"), ...table(coverageText, "Findings mapping")].map(row => row[0])
  const expectedIDs = new Set(expected)
  const rows = table(planText, "Requirement ownership crosswalk")
  const errors = []
  if (expected.length !== 75 || expectedIDs.size !== 75) errors.push("crosswalk source must retain 75 unique requirement/finding IDs")
  if (rows.length > 64) return { identifiers: 0, lanes: rows.length, errors: [...errors, "crosswalk exceeds lane budget"] }
  const lanes = new Set()
  const seen = new Set()
  let identifiers = 0
  for (const row of rows) {
    if (row.length !== 2 || !row.every(nonempty) || lanes.has(row[0])) {
      errors.push("crosswalk lane must have a unique name and one nonempty ID list")
      continue
    }
    lanes.add(row[0])
    const ids = row[1].split(",").map(id => id.trim())
    identifiers += ids.length
    if (identifiers > 128) return { identifiers, lanes: rows.length, errors: [...errors, "crosswalk exceeds identifier budget"] }
    for (const id of ids) {
      if (!expectedIDs.has(id)) errors.push(`unknown crosswalk identifier: ${id}`)
      if (seen.has(id)) errors.push(`duplicate crosswalk identifier: ${id}`)
      seen.add(id)
    }
  }
  for (const id of expectedIDs) if (!seen.has(id)) errors.push(`omitted crosswalk identifier: ${id}`)
  if (identifiers !== 75) errors.push("crosswalk must assign exactly 75 identifiers")
  return { identifiers, lanes: rows.length, errors }
}

export function auditArchive({ manifest, files, checkpoints = [] }) {
  const errors = []
  if (manifest?.version !== 1 || manifest?.owner !== "goal-docs" || !manifest.files || !manifest.goals || !manifest.transfers || Object.keys(manifest.files).length > 256 || Object.keys(manifest.goals).length > 64 || Object.keys(manifest.transfers).length > 200) return { errors: ["invalid/beyond-budget archive manifest"] }
  const { version, owner, files: owned, goals, transfers } = manifest
  if (sha256(JSON.stringify({ version, owner, files: owned, goals, transfers })) !== manifest.integrity) errors.push("archive manifest integrity mismatch")
  for (const [name, digest] of Object.entries(owned)) {
    const bytes = files.get(name)
    if (!safeRelative(name) || !bytes) { errors.push(`missing/unsafe archive file: ${name}`); continue }
    let data = bytes.toString()
    if (name === "README.md") {
      const start = "<!-- goal-docs:managed:start -->", end = "<!-- goal-docs:managed:end -->"
      if (data.split(start).length !== 2 || data.split(end).length !== 2 || data.indexOf(end) < data.indexOf(start)) { errors.push("invalid README ownership block"); continue }
      data = data.slice(data.indexOf(start), data.indexOf(end) + end.length)
    }
    if (sha256(data) !== digest) errors.push(`archive hash mismatch: ${name}`)
  }
  for (const [directory, record] of Object.entries(goals)) {
    for (const name of ["plan.md", "HANDOFF.md", "work-history.md", "snapshot.json"]) if (!owned[`${directory}/${name}`] || !files.has(`${directory}/${name}`)) errors.push(`missing mandatory archive file: ${directory}/${name}`)
    let snapshot
    try { snapshot = JSON.parse(files.get(`${directory}/snapshot.json`)?.toString()) } catch { errors.push(`invalid snapshot: ${directory}`); continue }
    if (snapshot.goal?.id !== record.goalID || directory !== record.goalID || snapshot.goal?.sessionID !== record.sourceSessionID || snapshot.source?.sessionID !== record.sourceSessionID || snapshot.source?.directory !== record.sourceDirectory) errors.push(`archive source identity mismatch: ${directory}`)
    if (snapshot.goal?.status !== record.status || snapshot.goal?.planRevision !== record.planRevision) errors.push(`archive index/snapshot drift: ${directory}`)
  }
  for (const checkpoint of checkpoints) {
    const record = goals[checkpoint.id]
    if (!record || record.status !== checkpoint.status || record.planRevision !== checkpoint.planRevision || record.sourceSessionID !== checkpoint.sessionID || record.sourceDirectory !== checkpoint.directory) errors.push(`stale/missing selected archive: ${checkpoint.id}`)
  }
  return { errors, bundles: Object.keys(goals).length, freshness: checkpoints.length ? "compared with supplied supported-tool checkpoint, not a live query" : "unverified: no supported-tool checkpoint supplied" }
}

const sameIdentity = (left, right, keys) => keys.every(key => left[key] === right[key])
const fileIdentity = ["dev", "ino", "mode", "uid", "gid", "nlink", "size", "mtimeMs", "ctimeMs"]
const directoryIdentity = ["dev", "ino", "mode", "uid", "gid"]
const changedInput = relative => Object.assign(new Error(`audit input changed during acquisition: ${relative}`), { code: "AUDIT_INPUT_CHANGED" })
const MAX_AUDIT_FILE_BYTES = 2_000_000
const MAX_AUDIT_TOTAL_BYTES = 16_000_000

function acquisitionBudget(limitBytes) {
  if (!Number.isSafeInteger(limitBytes) || limitBytes < 1 || limitBytes > MAX_AUDIT_TOTAL_BYTES) {
    throw new Error("audit byte limit must be a positive integer no greater than 16000000")
  }
  return { limitBytes, observedBytes: 0, chargedBytes: 0, failedReadChargeBytes: 0 }
}

function requireBudgetFit(size, budget) {
  if (size > budget.limitBytes - budget.chargedBytes) {
    throw Object.assign(new Error("audit byte budget would be exceeded"), { code: "AUDIT_BYTE_BUDGET" })
  }
}

async function readAuditEntry(root, relative, budget = acquisitionBudget(MAX_AUDIT_FILE_BYTES)) {
  if (!safeRelative(relative)) throw new Error("unsafe audit input path")
  let current = root
  let finalStat
  const directories = []
  const parts = relative.split("/")
  for (let index = -1; index < parts.length; index++) {
    if (index >= 0) current = path.join(current, parts[index])
    finalStat = await lstat(current)
    if (finalStat.isSymbolicLink()) throw new Error(`symlink audit input refused: ${relative}`)
    if (index < parts.length - 1) {
      if (!finalStat.isDirectory()) throw new Error(`nonregular audit input ancestor: ${relative}`)
      directories.push({ path: current, stat: finalStat })
    }
  }
  if (!finalStat.isFile()) throw new Error(`nonregular audit input: ${relative}`)
  if (finalStat.size > MAX_AUDIT_FILE_BYTES) throw new Error(`nonregular/oversize audit input: ${relative}`)
  requireBudgetFit(finalStat.size, budget)
  const handle = await open(current, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > MAX_AUDIT_FILE_BYTES) throw new Error(`nonregular/oversize audit input: ${relative}`)
    if (!sameIdentity(finalStat, stat, fileIdentity)) throw changedInput(relative)
    requireBudgetFit(stat.size, budget)
    const buffer = Buffer.alloc(stat.size)
    let size = 0
    // Held-size completion plus identity rechecks avoid acquiring a growing tail as an EOF probe.
    while (size < stat.size) {
      const length = Math.min(64 * 1024, stat.size - size, budget.limitBytes - budget.chargedBytes)
      requireBudgetFit(length || 1, budget)
      let bytesRead
      try {
        const result = await handle.read(buffer, size, length, size)
        bytesRead = result.bytesRead
        if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > length) throw new Error("invalid read result")
      } catch {
        // A rejected read may have delivered bytes before failing; never refund its requested allowance.
        budget.chargedBytes += length
        budget.failedReadChargeBytes += length
        throw Object.assign(new Error("audit input read failed"), { code: "AUDIT_INPUT_READ_FAILED" })
      }
      budget.chargedBytes += bytesRead
      budget.observedBytes += bytesRead
      if (bytesRead === 0) break
      size += bytesRead
    }
    const verify = async () => {
      try {
        for (const directory of directories) {
          const info = await lstat(directory.path)
          if (!info.isDirectory() || info.isSymbolicLink() || !sameIdentity(directory.stat, info, directoryIdentity)) throw changedInput(relative)
        }
        const info = await lstat(current)
        if (!info.isFile() || info.isSymbolicLink() || !sameIdentity(stat, info, fileIdentity)) throw changedInput(relative)
      } catch { throw changedInput(relative) }
    }
    if (size !== stat.size || !sameIdentity(stat, await handle.stat(), fileIdentity)) throw changedInput(relative)
    await verify()
    return { bytes: Buffer.from(buffer.subarray(0, size)), verify }
  } finally { await handle.close() }
}

export async function readAuditFile(root, relative) {
  return (await readAuditEntry(root, relative)).bytes
}

export async function auditRepository(root, { lineageRoot = root, maxTotalBytes = MAX_AUDIT_TOTAL_BYTES, checkpoints = [] } = {}) {
  const budget = acquisitionBudget(maxTotalBytes)
  for (const directory of new Set([root, lineageRoot])) {
    if (typeof directory !== "string" || !path.isAbsolute(directory) || path.resolve(directory) !== directory || directory.length > 4096 || /[\u0000-\u001f\u007f]/u.test(directory)) throw new Error("audit roots must be absolute normalized bounded paths")
    if (await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error("audit roots must be canonical real directories")
  }
  const inputErrors = [], cache = new Map(), parsed = new Map(), records = new Map()
  const read = async (directory, relative) => {
    const key = `${directory}\0${relative}`
    if (cache.has(key)) return cache.get(key)
    let data
    try {
      const entry = await readAuditEntry(directory, relative, budget)
      data = entry.bytes
      records.set(key, entry)
    } catch (error) {
      inputErrors.push({ root: directory, path: relative, code: error.code ?? "UNSAFE_OR_OVER_BUDGET" })
    }
    cache.set(key, data)
    return data
  }
  const json = async (directory, relative) => {
    const key = `${directory}\0${relative}`
    if (parsed.has(key)) return parsed.get(key)
    const bytes = await read(directory, relative)
    let value
    if (bytes) try { value = JSON.parse(bytes.toString()) }
    catch { inputErrors.push({ root: directory, path: relative, code: "INVALID_JSON" }) }
    parsed.set(key, value)
    return value
  }
  const object = value => value !== null && typeof value === "object" && !Array.isArray(value)
  const stage = operation => {
    try { return operation() }
    catch { return { status: "blocked", errors: ["audit structure invalid or unavailable"] } }
  }
  const names = ["plan.md", "HANDOFF.md", "work-history.md", "snapshot.json"]
  const lineageIDs = Object.values(sourceGroups)
  const archive = async directory => {
    const manifestPath = "docs/goals/.goal-docs-manifest.json"
    const manifest = await json(directory, manifestPath)
    const owned = object(manifest?.files) && Object.keys(manifest.files).length <= 256 ? Object.keys(manifest.files) : []
    const selected = lineageIDs.flatMap(id => names.map(name => `${id}/${name}`))
    const files = new Map()
    for (const name of new Set([...owned, ...selected])) {
      const bytes = await read(directory, `docs/goals/${name}`)
      if (bytes) files.set(name, bytes)
    }
    // Writer publication is per file. Reject a moving read set rather than label
    // a mixed generation corrupt or certify its snapshots as lineage evidence.
    const paths = new Set([...owned, ...selected].map(name => `docs/goals/${name}`))
    paths.add(manifestPath)
    for (const relative of paths) {
      try { await records.get(`${directory}\0${relative}`)?.verify() }
      catch { inputErrors.push({ root: directory, path: relative, code: "AUDIT_INPUT_CHANGED" }) }
    }
    if (inputErrors.some(error => error.root === directory && paths.has(error.path) && error.code === "AUDIT_INPUT_CHANGED")) {
      return { manifest, files, result: { status: "blocked", errors: ["archive changed during audit; retry read-only inspection"] } }
    }
    const result = stage(() => auditArchive({ manifest, files, checkpoints }))
    for (const id of lineageIDs) if (!manifest?.goals?.[id] || names.some(name => !manifest?.files?.[`${id}/${name}`] || !files.has(`${id}/${name}`))) result.errors.push(`missing required lineage bundle: ${id}`)
    return { manifest, files, result }
  }
  const delivery = await archive(root)
  const lineage = lineageRoot === root ? delivery : await archive(lineageRoot)
  const sources = new Map()
  let sourcesReady = !!lineage.manifest && lineage.result.status !== "blocked" && !lineage.result.errors.some(value => value === "archive manifest integrity mismatch" || value === "invalid/beyond-budget archive manifest")
  for (const id of lineageIDs) {
    const relative = `docs/goals/${id}/snapshot.json`
    const source = await json(lineageRoot, relative)
    if (!object(source)) { sourcesReady = false; continue }
    if (source.source?.directory !== lineageRoot) {
      inputErrors.push({ root: lineageRoot, path: relative, code: "SOURCE_DIRECTORY_MISMATCH" })
      sourcesReady = false
    }
    const record = lineage.manifest?.goals?.[id]
    if (source.goal?.id !== id || source.goal?.sessionID !== source.source?.sessionID || record?.goalID !== id || record?.sourceSessionID !== source.goal?.sessionID || record?.sourceDirectory !== source.source?.directory || record?.status !== source.goal?.status || record?.planRevision !== source.goal?.planRevision) {
      inputErrors.push({ root: lineageRoot, path: relative, code: "SOURCE_IDENTITY_MISMATCH" })
      sourcesReady = false
    }
    const bytes = lineage.files.get(`${id}/snapshot.json`)
    if (!bytes || lineage.manifest?.files?.[`${id}/snapshot.json`] !== sha256(bytes) || !lineage.manifest?.goals?.[id]) {
      inputErrors.push({ root: lineageRoot, path: relative, code: "UNVERIFIED_SNAPSHOT_BYTES" })
      sourcesReady = false
    }
    sources.set(id, source)
  }
  const text = (await read(root, "docs/request-coverage.md"))?.toString()
  const files = new Map()
  const paths = new Set(reviewedPaths)
  stage(() => {
    for (const row of [...table(text, "Current 68-row mapping"), ...table(text, "Findings mapping")]) {
      const match = row[6]?.match(/^\[[^\]]+\]\(([^)]+)\)$/)
      if (match) paths.add(path.posix.normalize(path.posix.join("docs", match[1])))
    }
  })
  for (const name of paths) {
    const bytes = await read(root, name)
    if (bytes) files.set(name, bytes)
  }
  const planText = (await read(root, "docs/codex-parity/consolidated-delivery-plan.md"))?.toString()
  const report = {
    readOnly: true, acceptance: "not_observed", roots: { combinedTree: root, lineage: lineageRoot }, inputErrors,
    acquisition: { ...budget, perFileBytes: MAX_AUDIT_FILE_BYTES, remainingBytes: budget.limitBytes - budget.chargedBytes },
    coverage: sourcesReady ? stage(() => auditCoverage({ text, sources, files })) : { status: "blocked", errors: ["source-qualified coverage unavailable: required lineage inputs are missing or unverified"] },
    crosswalk: stage(() => auditConsolidatedCrosswalk({ coverageText: text, planText })),
    reviewed: stage(() => ({ errors: reviewedByteErrors(text, files) })),
    archive: delivery.result, sourceArchive: lineage.result,
  }
  report.exitCode = inputErrors.length || [report.coverage, report.crosswalk, report.reviewed, report.archive, report.sourceArchive].some(value => value.errors.length) ? 1 : 3
  return report
}

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
  const args = process.argv.slice(2)
  let lineageRoot = root
  let checkpointPath = null
  const seen = new Set()
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index]
    const value = args[index + 1]
    if (typeof value !== "string" || seen.has(flag)) throw new Error("usage: node scripts/request-coverage-audit.mjs [--lineage-root DIR] [--checkpoint FILE] (read-only; no repair mode)")
    seen.add(flag)
    if (flag === "--lineage-root") lineageRoot = value
    else if (flag === "--checkpoint") checkpointPath = value
    else throw new Error("usage: node scripts/request-coverage-audit.mjs [--lineage-root DIR] [--checkpoint FILE] (read-only; no repair mode)")
  }
  let checkpoints = []
  if (checkpointPath) {
    const parsed = JSON.parse(await readFile(checkpointPath, "utf8"))
    checkpoints = Array.isArray(parsed) ? parsed : [parsed]
  }
  const report = await auditRepository(root, { lineageRoot, checkpoints })
  console.log(JSON.stringify(report, null, 2))
  process.exitCode = report.exitCode
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  console.log(JSON.stringify({ readOnly: true, acceptance: "not_observed", exitCode: 1, fatal: "invalid arguments or unsafe/unavailable audit root" }))
  process.exitCode = 1
})
