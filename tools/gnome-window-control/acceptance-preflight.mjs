import { createHash } from "node:crypto"
import { constants as fsConstants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const EXTENSION_UUID = "opencode-window-control@computer-use.local"
export const OWNERSHIP_MARKER = ".computer-use-managed.json"
export const MANAGED_FILES = Object.freeze([
  "metadata.json",
  "extension.js",
  "policy.mjs",
  "capture.mjs",
  "input.mjs",
  "launch.mjs",
  "runtime-contract.mjs",
])

export const CANONICAL_SOURCE_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
)

const REPOSITORY_ROOT = path.resolve(CANONICAL_SOURCE_ROOT, "../..")
const SOURCE_OVERRIDES = Object.freeze({
  "runtime-contract.mjs": path.join(
    REPOSITORY_ROOT,
    "tools/computer-use-runtime/src/runtime-contract.mjs",
  ),
})
const PROFILE_SOURCE = path.join(REPOSITORY_ROOT, "global/commands/handoff_resume.md")
const FILE_MAX_BYTES = 2 * 1024 * 1024
const SOURCE_TOTAL_MAX_BYTES = 8 * 1024 * 1024
const MARKER_MAX_BYTES = 16 * 1024
const PROFILE_MAX_BYTES = 1024 * 1024
const HASH_PATTERN = /^[a-f0-9]{64}$/

export class PreflightError extends Error {
  constructor(code, message) {
    super(message)
    this.name = "PreflightError"
    this.code = code
  }
}

function reject(code, message) {
  throw new PreflightError(code, message)
}

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

function identity(stat) {
  return [stat.dev.toString(), stat.ino.toString()]
}

function stableStat(stat) {
  return [
    stat.dev.toString(),
    stat.ino.toString(),
    stat.size.toString(),
    stat.mtimeNs.toString(),
    stat.ctimeNs.toString(),
  ]
}

function fileType(stat) {
  return Number(stat.mode & BigInt(fsConstants.S_IFMT))
}

function absolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || !path.isAbsolute(value))
    reject("INVALID_PATH", `${label} must be an explicit absolute path`)
  if (path.resolve(value) !== value)
    reject("AMBIGUOUS_PATH", `${label} must use a normalized absolute path`)
  return value
}

async function inspectPath(absolute, label) {
  const root = path.parse(absolute).root
  const parts = absolute.slice(root.length).split(path.sep).filter(Boolean)
  let current = root
  let finalStat = null

  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index])
    let stat
    try {
      stat = await lstat(current, { bigint: true })
    } catch (error) {
      if (error?.code === "ENOENT")
        return { exists: false, path: current, missingAt: current }
      throw error
    }
    if (fileType(stat) === fsConstants.S_IFLNK)
      reject("SYMLINK_REFUSED", `${label} contains a symbolic link`)
    if (index < parts.length - 1 && fileType(stat) !== fsConstants.S_IFDIR)
      reject("NON_DIRECTORY_ANCESTOR", `${label} has a non-directory ancestor`)
    finalStat = stat
  }

  return { exists: true, path: absolute, stat: finalStat }
}

function sameStat(first, second) {
  const firstValues = stableStat(first)
  const secondValues = stableStat(second)
  return firstValues.every((value, index) => value === secondValues[index])
}

async function readBoundedFile(absolute, maxBytes, label) {
  const before = await inspectPath(absolute, label)
  if (!before.exists)
    return null
  if (fileType(before.stat) !== fsConstants.S_IFREG)
    reject("NON_REGULAR_FILE", `${label} must be a regular file`)
  if (before.stat.size > BigInt(maxBytes))
    reject("FILE_TOO_LARGE", `${label} exceeds its ${maxBytes}-byte bound`)

  let handle
  try {
    // A regular file can become a FIFO after inspection; never wait for its writer.
    handle = await open(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK)
    const opened = await handle.stat({ bigint: true })
    if (fileType(opened) !== fsConstants.S_IFREG || !sameStat(before.stat, opened))
      reject("FILE_CHANGED", `${label} changed while it was opened`)

    const chunks = []
    let total = 0
    while (total <= maxBytes) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maxBytes + 1 - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0)
        break
      chunks.push(chunk.subarray(0, bytesRead))
      total += bytesRead
    }
    if (total > maxBytes)
      reject("FILE_TOO_LARGE", `${label} exceeds its ${maxBytes}-byte bound`)

    const afterRead = await handle.stat({ bigint: true })
    const afterPath = await inspectPath(absolute, label)
    if (!afterPath.exists || !sameStat(opened, afterRead) || !sameStat(afterRead, afterPath.stat))
      reject("FILE_CHANGED", `${label} changed during the read-only scan`)
    return Buffer.concat(chunks, total)
  } finally {
    await handle?.close()
  }
}

function fingerprint(value) {
  return hash(Buffer.from(JSON.stringify(value)))
}

async function scanSourceOnce(sourceRoot) {
  let total = 0
  const files = {}
  const entries = []

  for (const name of MANAGED_FILES) {
    const sourcePath = SOURCE_OVERRIDES[name] ?? path.join(sourceRoot, name)
    const bytes = await readBoundedFile(sourcePath, FILE_MAX_BYTES, `source file ${name}`)
    if (!bytes)
      reject("SOURCE_FILE_MISSING", `canonical source file ${name} is missing`)
    total += bytes.length
    if (total > SOURCE_TOTAL_MAX_BYTES)
      reject("SOURCE_TOO_LARGE", `managed source exceeds its ${SOURCE_TOTAL_MAX_BYTES}-byte total bound`)
    const digest = hash(bytes)
    files[name] = digest
    entries.push({ name, path: sourcePath, size: bytes.length, sha256: digest })
  }

  let metadata
  try {
    metadata = JSON.parse((await readBoundedFile(
      path.join(sourceRoot, "metadata.json"), FILE_MAX_BYTES, "source metadata.json",
    )).toString("utf8"))
  } catch (error) {
    if (error instanceof PreflightError)
      throw error
    reject("SOURCE_METADATA_INVALID", "canonical source metadata.json is not valid JSON")
  }
  if (!metadata || metadata.uuid !== EXTENSION_UUID ||
      JSON.stringify(metadata["shell-version"]) !== JSON.stringify(["50"]))
    reject("SOURCE_IDENTITY_MISMATCH", "source metadata UUID or Shell version does not match the reviewed bundle")

  return {
    files,
    entries,
    totalBytes: total,
    fingerprint: fingerprint({ sourceRoot, files }),
  }
}

async function verifiedSource(sourceRoot) {
  const selected = absolutePath(sourceRoot, "--source-root")
  if (selected !== CANONICAL_SOURCE_ROOT)
    reject("SOURCE_IDENTITY_MISMATCH", "--source-root must be the exact canonical gnome-window-control source directory")
  const actual = await realpath(selected)
  if (actual !== CANONICAL_SOURCE_ROOT)
    reject("SOURCE_IDENTITY_MISMATCH", "canonical source path resolves through an alias or outside the reviewed source root")
  const rootInfo = await inspectPath(selected, "canonical source root")
  if (!rootInfo.exists || fileType(rootInfo.stat) !== fsConstants.S_IFDIR)
    reject("SOURCE_ROOT_INVALID", "canonical source root is not a directory")

  const first = await scanSourceOnce(selected)
  const second = await scanSourceOnce(selected)
  if (first.fingerprint !== second.fingerprint)
    reject("SOURCE_CHANGED", "canonical managed source changed during preflight")
  return second
}

function validateOwnershipMarker(bytes, actual) {
  let marker
  try {
    marker = JSON.parse(bytes.toString("utf8"))
  } catch {
    reject("OWNERSHIP_MARKER_INVALID", "ownership marker is not valid JSON")
  }
  if (!marker || Array.isArray(marker) || marker.uuid !== EXTENSION_UUID || marker.version !== 1 ||
      !marker.files || Array.isArray(marker.files) || typeof marker.files !== "object")
    reject("OWNERSHIP_MARKER_INVALID", "ownership marker identity or file map is invalid")
  const recordedNames = Object.keys(marker.files)
  if (recordedNames.some(name => !MANAGED_FILES.includes(name)))
    reject("OWNERSHIP_MARKER_INVALID", "ownership marker names a file outside the managed set")
  for (const name of recordedNames) {
    if (marker.files[name] !== actual[name])
      reject("OWNERSHIP_MISMATCH", "a managed target file differs from its ownership marker")
  }
  return recordedNames
}

async function scanTargetOnce(targetPath) {
  const info = await inspectPath(targetPath, "extension target")
  if (!info.exists) {
    const actual = Object.fromEntries(MANAGED_FILES.map(name => [name, null]))
    const markerSha256 = null
    const targetFingerprint = fingerprint({ path: targetPath, exists: false, actual, markerSha256 })
    return { exists: false, actual, markerSha256, targetFingerprint, ownership: "not_present" }
  }
  if (fileType(info.stat) !== fsConstants.S_IFDIR)
    reject("TARGET_NOT_DIRECTORY", "extension target must be a directory")
  if (path.basename(targetPath) !== EXTENSION_UUID)
    reject("TARGET_IDENTITY_MISMATCH", `extension target directory must be named ${EXTENSION_UUID}`)

  const directoryIdentity = identity(info.stat)
  const actual = {}
  for (const name of MANAGED_FILES) {
    const bytes = await readBoundedFile(path.join(targetPath, name), FILE_MAX_BYTES, `installed file ${name}`)
    actual[name] = bytes === null ? null : hash(bytes)
  }
  const markerBytes = await readBoundedFile(
    path.join(targetPath, OWNERSHIP_MARKER), MARKER_MAX_BYTES, "ownership marker",
  )
  const markerSha256 = markerBytes === null ? null : hash(markerBytes)
  let ownership
  let recordedFiles = []
  if (markerBytes !== null) {
    recordedFiles = validateOwnershipMarker(markerBytes, actual)
    ownership = "marker_verified"
  } else if (Object.values(actual).some(value => value !== null)) {
    reject("UNOWNED_TARGET", "managed extension files exist without the deployer's ownership marker")
  } else {
    ownership = "no_managed_files"
  }

  const after = await inspectPath(targetPath, "extension target")
  if (!after.exists || fileType(after.stat) !== fsConstants.S_IFDIR ||
      identity(after.stat).some((value, index) => value !== directoryIdentity[index]))
    reject("TARGET_CHANGED", "extension target directory changed during preflight")

  const targetFingerprint = fingerprint({
    path: targetPath,
    directoryIdentity,
    actual,
    markerSha256,
  })
  return { exists: true, actual, markerSha256, targetFingerprint, ownership, recordedFiles }
}

async function verifiedTarget(targetPath, sourceFiles, expectedFingerprint) {
  const selected = absolutePath(targetPath, "--extension-dir")
  if (path.basename(selected) !== EXTENSION_UUID)
    reject("TARGET_IDENTITY_MISMATCH", `--extension-dir must name ${EXTENSION_UUID}`)
  const first = await scanTargetOnce(selected)
  const second = await scanTargetOnce(selected)
  if (first.targetFingerprint !== second.targetFingerprint)
    reject("TARGET_CHANGED", "managed target bytes or ownership marker changed during preflight")
  if (expectedFingerprint !== undefined) {
    if (typeof expectedFingerprint !== "string" || !HASH_PATTERN.test(expectedFingerprint))
      reject("INVALID_FINGERPRINT", "--expect-target-fingerprint must be a lowercase SHA-256 digest")
    if (second.targetFingerprint !== expectedFingerprint)
      reject("TARGET_CHANGED", "selected extension target differs from the supplied preflight fingerprint")
  }

  const changes = MANAGED_FILES.filter(name => sourceFiles[name] !== second.actual[name])
  let status
  if (!second.exists) status = "absent"
  else if (second.ownership === "no_managed_files") status = "no_managed_files"
  else if (changes.length === 0) status = "matches_source"
  else status = "owned_source_drift"

  return {
    selected: true,
    inspected: true,
    path: selected,
    status,
    ownership: second.ownership,
    marker: { path: path.join(selected, OWNERSHIP_MARKER), sha256: second.markerSha256 },
    files: Object.fromEntries(MANAGED_FILES.map(name => [name, {
      sourceSha256: sourceFiles[name],
      installedSha256: second.actual[name],
      matchesSource: sourceFiles[name] === second.actual[name],
    }])),
    changes,
    managedFingerprint: second.targetFingerprint,
    fingerprintScope: "seven managed files, marker, and extension-directory identity; unrelated entries are not scanned",
  }
}

async function verifiedProfile(profileFile) {
  const selected = absolutePath(profileFile, "--profile-file")
  if (path.basename(selected) !== "handoff_resume.md" || path.basename(path.dirname(selected)) !== "commands")
    reject("PROFILE_IDENTITY_MISMATCH", "--profile-file must select one commands/handoff_resume.md file")

  const sourceBytes = await readBoundedFile(PROFILE_SOURCE, PROFILE_MAX_BYTES, "canonical handoff_resume.md source")
  if (!sourceBytes)
    reject("PROFILE_SOURCE_MISSING", "canonical handoff_resume.md source is missing")
  const installedBytes = await readBoundedFile(selected, PROFILE_MAX_BYTES, "selected installed handoff_resume.md")
  const sourceSha256 = hash(sourceBytes)
  const installedSha256 = installedBytes === null ? null : hash(installedBytes)
  return {
    selected: true,
    inspected: true,
    path: selected,
    status: installedBytes === null ? "absent" : installedSha256 === sourceSha256 ? "matches_source" : "source_drift",
    sourceSha256,
    installedSha256,
    contentExposed: false,
    limitBytes: PROFILE_MAX_BYTES,
  }
}

function notSelected(label) {
  return { selected: false, inspected: false, status: "not_selected", note: `${label} was not inspected` }
}

export async function preflight({
  sourceRoot,
  extensionDir,
  profileFile,
  expectTargetFingerprint,
} = {}) {
  const source = await verifiedSource(sourceRoot)
  let installedExtension = notSelected("installed extension target")
  if (extensionDir !== undefined) {
    installedExtension = await verifiedTarget(extensionDir, source.files, expectTargetFingerprint)
  } else if (expectTargetFingerprint !== undefined) {
    reject("INVALID_ARGUMENT", "--expect-target-fingerprint requires an explicit --extension-dir")
  }

  const installedProfile = profileFile === undefined
    ? notSelected("installed profile file")
    : await verifiedProfile(profileFile)

  return {
    schemaVersion: 1,
    preflight: { status: "source_ready_only", mode: "read_only_preview" },
    acceptance: {
      status: "not_accepted",
      reason: "A source/installed-byte manifest is not loaded-Shell, live-window, browser, model, or human evidence.",
    },
    source: {
      status: "verified_source_bytes",
      identity: { root: CANONICAL_SOURCE_ROOT, extensionUuid: EXTENSION_UUID, shellVersions: ["50"] },
      managedFiles: source.entries,
      totalBytes: source.totalBytes,
      fingerprint: source.fingerprint,
    },
    installedExtension,
    installedProfile,
    runtimeEvidence: {
      loadedShell: { status: "not_observed", note: "Installed hashes do not prove which module a Shell process loaded." },
      windows: { status: "not_observed", note: "No seat query is performed; use exact-ID native readback in the separately selected acceptance." },
      profileDiscovery: { status: installedProfile.selected ? "bytes_only" : "not_selected", note: "A file hash does not prove active-profile discovery or command invocation." },
      browserIsolationTlsSandbox: { status: "not_observed" },
      passiveSeedAndContinuation: { status: "not_observed" },
      memoryModelScenarios: { status: "not_observed" },
      humanPrivateEntry: { status: "human_only_not_observed" },
      legacyScreenshotBackend: { status: "hold_preserved_not_invoked" },
    },
    nextOperations: [
      {
        operation: "deployment_preview",
        status: "not_performed_by_this_preflight",
        argv: ["python3", "scripts/deploy-window-control.py", "--extension-dir", installedExtension.selected ? installedExtension.path : "<explicit-absolute-extension-directory>"],
        constraint: "The deployer previews by default; do not add --apply unless the exact deployment action already has its separate authority.",
      },
      {
        operation: "loaded_shell_and_live_window_acceptance",
        status: "unverified",
        constraint: "Prove loaded code separately from copied bytes; use only disposable exact IDs and confirm release/readback plus unrelated-window preservation.",
      },
      {
        operation: "browser_acceptance",
        status: "unverified",
        constraint: "Use an explicitly selected scratch OPENCODE_DATA_DIR; TLS validation and browser sandbox stay enabled.",
      },
      {
        operation: "model_and_human_acceptance",
        status: "unverified",
        constraint: "Passive seeds, explicit continuation, synthetic memory scenarios, and human-only private entry remain separate evidence classes; synthetic results never promote to live or human acceptance.",
      },
    ],
  }
}

function parseArguments(argv) {
  const parsed = {}
  const allowed = new Map([
    ["--source-root", "sourceRoot"],
    ["--extension-dir", "extensionDir"],
    ["--profile-file", "profileFile"],
    ["--expect-target-fingerprint", "expectTargetFingerprint"],
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const key = allowed.get(argv[index])
    if (!key)
      reject("INVALID_ARGUMENT", `unknown argument: ${argv[index]}`)
    if (parsed[key] !== undefined || argv[index + 1] === undefined || argv[index + 1].startsWith("--"))
      reject("INVALID_ARGUMENT", `${argv[index]} requires one value and may appear only once`)
    parsed[key] = argv[index + 1]
    index += 1
  }
  if (parsed.sourceRoot === undefined)
    reject("INVALID_ARGUMENT", "--source-root is required; no source path is guessed")
  return parsed
}

function errorDocument(error) {
  return {
    schemaVersion: 1,
    preflight: { status: "blocked", mode: "read_only_preview" },
    acceptance: { status: "not_accepted" },
    error: {
      code: error instanceof PreflightError ? error.code : "IO_ERROR",
      message: error instanceof PreflightError ? error.message : "read-only preflight could not complete",
    },
    constraints: ["No target/config/state was created or modified.", "No GUI, browser, model, or human-entry evidence was queried."],
  }
}

export async function main(argv = process.argv.slice(2)) {
  try {
    const document = await preflight(parseArguments(argv))
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`)
    return 0
  } catch (error) {
    process.stdout.write(`${JSON.stringify(errorDocument(error), null, 2)}\n`)
    return 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  process.exitCode = await main()
