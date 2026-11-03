import { lstat, readdir, realpath } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  CANONICAL_SOURCE_ROOT,
  preflight as extensionPreflight,
} from "../gnome-window-control/acceptance-preflight.mjs"

export const SCRATCH_ROOT = "/tmp/opencode"
export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

const FILESYSTEM = { lstat, readdir, realpath }

export class AcceptancePreflightError extends Error {
  constructor(code, message) {
    super(message)
    this.name = "AcceptancePreflightError"
    this.code = code
  }
}

function reject(code, message) {
  throw new AcceptancePreflightError(code, message)
}

function absolutePath(value, label) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0") || !path.isAbsolute(value)) {
    reject("INVALID_PATH", `${label} must be an explicit absolute path`)
  }
  if (path.resolve(value) !== value) reject("AMBIGUOUS_PATH", `${label} must be normalized`)
  return value
}

function fileType(stat) {
  return Number(stat.mode & 0o170000n)
}

function stableStat(stat) {
  return [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].map(String).join(":")
}

async function inspectNoSymlinks(absolute, label, filesystem) {
  const root = path.parse(absolute).root
  const parts = absolute.slice(root.length).split(path.sep).filter(Boolean)
  let current = root
  let finalStat

  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index])
    let stat
    try {
      stat = await filesystem.lstat(current, { bigint: true })
    } catch (error) {
      if (error?.code === "ENOENT") reject("SCRATCH_MISSING", `${label} does not exist`)
      throw error
    }
    if (fileType(stat) === 0o120000) reject("SYMLINK_REFUSED", `${label} contains a symbolic link`)
    if (index < parts.length - 1 && fileType(stat) !== 0o040000) {
      reject("NON_DIRECTORY_ANCESTOR", `${label} has a non-directory ancestor`)
    }
    finalStat = stat
  }

  return finalStat
}

export async function inspectBrowserScratch(browserDataDir, {
  filesystem = FILESYSTEM,
  env = process.env,
  uid = process.getuid?.(),
} = {}) {
  const selected = absolutePath(browserDataDir, "--browser-data-dir")
  const relative = path.relative(SCRATCH_ROOT, selected)
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || relative.includes(path.sep)) {
    reject("SCRATCH_PATH_REFUSED", "--browser-data-dir must be one exact child of /tmp/opencode")
  }
  if (!/^computer-use-acceptance\.[A-Za-z0-9._-]+$/u.test(path.basename(selected))) {
    reject("SCRATCH_IDENTITY_MISMATCH", "scratch directory must use the computer-use-acceptance. prefix")
  }
  if (env.OPENCODE_DATA_DIR !== selected) {
    reject("DATA_DIRECTORY_MISMATCH", "OPENCODE_DATA_DIR must equal the exact selected browser scratch directory")
  }
  if (env.TMPDIR !== SCRATCH_ROOT) {
    reject("TEMP_DIRECTORY_MISMATCH", "TMPDIR must be explicitly set to /tmp/opencode")
  }

  const before = await inspectNoSymlinks(selected, "browser scratch directory", filesystem)
  if (fileType(before) !== 0o040000) reject("SCRATCH_NOT_DIRECTORY", "browser scratch target must be a directory")
  if (uid !== undefined && before.uid !== BigInt(uid)) reject("SCRATCH_OWNER_MISMATCH", "browser scratch directory must be owned by this user")
  const mode = Number(before.mode & 0o777n)
  if (mode !== 0o700) reject("SCRATCH_MODE_MISMATCH", "browser scratch directory must have mode 0700")

  const entries = await filesystem.readdir(selected)
  if (entries.length !== 0) reject("SCRATCH_NOT_EMPTY", "browser scratch directory must be empty before acceptance")

  const [after, resolved] = await Promise.all([
    filesystem.lstat(selected, { bigint: true }),
    filesystem.realpath(selected),
  ])
  if (resolved !== selected || fileType(after) !== 0o040000 || stableStat(after) !== stableStat(before)) {
    reject("SCRATCH_CHANGED", "browser scratch directory changed during preflight")
  }

  return {
    selected: true,
    inspected: true,
    path: selected,
    status: "empty_private_scratch_ready",
    mode: `0${mode.toString(8)}`,
    contentsExposed: false,
    workerStarted: false,
  }
}

function exactWindowId(value) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]+$/iu.test(value)) {
    reject("WINDOW_ID_INVALID", "--window-id must be one explicit GNOME compositor ID in uuid:number form")
  }
  return value
}

function exactDesktopId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.desktop$/u.test(value)) {
    reject("DESKTOP_ID_INVALID", "--desktop-id must be one exact desktop-entry ID, not a path or wildcard")
  }
  return value
}

export async function preflight({
  windowId,
  desktopId,
  browserDataDir,
  extensionDir,
  expectTargetFingerprint,
  env = process.env,
  filesystem = FILESYSTEM,
} = {}) {
  const selectedWindowId = exactWindowId(windowId)
  const selectedDesktopId = exactDesktopId(desktopId)
  const browserScratch = await inspectBrowserScratch(browserDataDir, { filesystem, env })

  const extension = await extensionPreflight({
    sourceRoot: CANONICAL_SOURCE_ROOT,
    ...(extensionDir === undefined ? {} : { extensionDir }),
    ...(expectTargetFingerprint === undefined ? {} : { expectTargetFingerprint }),
  })

  return {
    schemaVersion: 1,
    preflight: { status: "exact_targets_prepared", mode: "read_only" },
    acceptance: {
      status: "not_accepted",
      reason: "Exact selection and source bytes do not establish a live seat, loaded code, model-visible output, or human action.",
    },
    source: extension.source,
    installedExtension: extension.installedExtension,
    installedProfile: extension.installedProfile,
    selectedTargets: {
      desktop: {
        selected: true,
        windowId: selectedWindowId,
        desktopId: selectedDesktopId,
        status: "selected_not_observed",
        note: "A fresh desktop.windows inventory must confirm this exact ID and that it is disposable before any live capture.",
      },
      browserDataDirectory: browserScratch,
    },
    evidence: {
      source: extension.source.status,
      installedBytes: extension.installedExtension.selected
        ? extension.installedExtension.status
        : "not_selected",
      loadedDesktopCode: "not_observed",
      exactWindowReadback: "not_observed",
      browserWorker: "not_observed",
      visibleOutcome: "not_observed",
      model: "not_observed",
      syntheticBrowserPrivateEntryCancellation: "not_observed",
      humanPrivateEntry: "human_only_not_observed",
      legacyScreenshotBackend: "hold_preserved_not_invoked",
    },
    cleanupPlan: {
      status: "plan_only",
      desktop: "This preflight creates no window and performs no input, capture, close, or placement. Later cleanup must use the exact new disposable target and fresh identity/readback; never substitute a similar window.",
      browser: `Close only the acceptance worker. Inspect ${browserScratch.path}; remove no file recursively. Use rmdir only for the exact run-owned directory after confirming it contains no retained data.`,
    },
    rollbackPlan: {
      status: "not_performed",
      note: "No deployment or profile write is performed. Installed-byte restoration requires the exact selected target, original apply receipt, verified backup and the existing restore preview/apply gate; this preflight is not a rollback authorization.",
    },
    nextOperations: [
      {
        operation: "desktop_exact_target_readback",
        status: "not_performed",
        constraint: "Use a fresh read-only windows inventory; confirm exact ID, app ID, PID and geometry, and establish that the target is disposable before a separately authorized capture or input.",
      },
      {
        operation: "isolated_browser_acceptance",
        status: "not_performed",
        dataDirectory: browserScratch.path,
        constraint: "Pass this exact OPENCODE_DATA_DIR and TMPDIR=/tmp/opencode to each helper; never fall back to a home or visible-browser profile.",
      },
      {
        operation: "model_visible_and_human_acceptance",
        status: "not_performed",
        constraint: "Source tests and helper output do not prove model receipt/rendering or human-only private entry.",
      },
    ],
  }
}

function parseArguments(argv) {
  const parsed = {}
  const allowed = new Map([
    ["--window-id", "windowId"],
    ["--desktop-id", "desktopId"],
    ["--browser-data-dir", "browserDataDir"],
    ["--extension-dir", "extensionDir"],
    ["--expect-target-fingerprint", "expectTargetFingerprint"],
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const key = allowed.get(argv[index])
    if (!key) reject("INVALID_ARGUMENT", `unknown argument: ${argv[index]}`)
    if (parsed[key] !== undefined || argv[index + 1] === undefined || argv[index + 1].startsWith("--")) {
      reject("INVALID_ARGUMENT", `${argv[index]} requires one value and may appear only once`)
    }
    parsed[key] = argv[index + 1]
    index += 1
  }
  for (const key of ["windowId", "desktopId", "browserDataDir"]) {
    if (parsed[key] === undefined) reject("INVALID_ARGUMENT", `--${key.replace(/[A-Z]/gu, letter => `-${letter.toLowerCase()}`)} is required; no target is guessed`)
  }
  return parsed
}

function errorDocument(error) {
  const sourceError = error && typeof error === "object" && typeof error.code === "string"
  return {
    schemaVersion: 1,
    preflight: { status: "blocked", mode: "read_only" },
    acceptance: { status: "not_accepted" },
    error: {
      code: sourceError ? error.code : "IO_ERROR",
      message: error instanceof Error ? error.message : "read-only acceptance preflight could not complete",
    },
    constraints: [
      "No desktop or browser worker was started.",
      "No target/config/profile was created or modified.",
      "No capture, input, sign-in, deployment, or model action was performed.",
    ],
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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main()
}
