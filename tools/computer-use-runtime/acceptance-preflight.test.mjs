import assert from "node:assert/strict"
import { chmod, lstat, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { fileURLToPath } from "node:url"

import {
  SCRATCH_ROOT,
  inspectBrowserScratch,
  preflight,
} from "./acceptance-preflight.mjs"

const SCRIPT = fileURLToPath(new URL("./acceptance-preflight.mjs", import.meta.url))
const WINDOW_ID = "01234567-89ab-cdef-0123-456789abcdef:42"
const DESKTOP_ID = "org.gnome.Calculator.desktop"

async function scratchDirectory(t) {
  const directory = await mkdtemp(path.join(SCRATCH_ROOT, "computer-use-acceptance."))
  t.after(async () => rm(directory, { recursive: true, force: true }))
  return directory
}

function environment(directory) {
  return { OPENCODE_DATA_DIR: directory, TMPDIR: SCRATCH_ROOT }
}

function options(directory, extra = {}) {
  return {
    windowId: WINDOW_ID,
    desktopId: DESKTOP_ID,
    browserDataDir: directory,
    env: environment(directory),
    ...extra,
  }
}

function cli(args, env = process.env) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8", env })
}

test("source-only preparation validates exact inputs without querying a seat or browser", async (t) => {
  const directory = await scratchDirectory(t)
  const before = await readdir(directory)
  const document = await preflight(options(directory))

  assert.equal(document.preflight.status, "exact_targets_prepared")
  assert.equal(document.acceptance.status, "not_accepted")
  assert.equal(document.source.status, "verified_source_bytes")
  assert.equal(document.installedExtension.status, "not_selected")
  assert.deepEqual(document.selectedTargets.desktop, {
    selected: true,
    windowId: WINDOW_ID,
    desktopId: DESKTOP_ID,
    status: "selected_not_observed",
    note: "A fresh desktop.windows inventory must confirm this exact ID and that it is disposable before any live capture.",
  })
  assert.equal(document.selectedTargets.browserDataDirectory.status, "empty_private_scratch_ready")
  assert.equal(document.evidence.loadedDesktopCode, "not_observed")
  assert.equal(document.evidence.browserWorker, "not_observed")
  assert.equal(document.evidence.model, "not_observed")
  assert.equal(document.evidence.visibleOutcome, "not_observed")
  assert.equal(document.evidence.humanPrivateEntry, "human_only_not_observed")
  assert.equal(document.evidence.legacyScreenshotBackend, "hold_preserved_not_invoked")
  assert.deepEqual(await readdir(directory), before)
})

test("CLI returns a source-only manifest and leaves the selected scratch directory unchanged", async (t) => {
  const directory = await scratchDirectory(t)
  const before = await lstat(directory, { bigint: true })
  const result = cli([
    "--window-id", WINDOW_ID,
    "--desktop-id", DESKTOP_ID,
    "--browser-data-dir", directory,
  ], environment(directory))

  assert.equal(result.status, 0, result.stderr)
  const document = JSON.parse(result.stdout)
  assert.equal(document.preflight.status, "exact_targets_prepared")
  assert.equal(document.acceptance.status, "not_accepted")
  assert.equal(document.selectedTargets.desktop.status, "selected_not_observed")
  assert.equal(document.selectedTargets.browserDataDirectory.status, "empty_private_scratch_ready")
  assert.equal(document.evidence.exactWindowReadback, "not_observed")
  assert.equal(document.evidence.browserWorker, "not_observed")
  assert.equal(document.evidence.legacyScreenshotBackend, "hold_preserved_not_invoked")
  assert.deepEqual(await readdir(directory), [])
  const after = await lstat(directory, { bigint: true })
  assert.equal(after.dev, before.dev)
  assert.equal(after.ino, before.ino)
  assert.equal(after.size, before.size)
  assert.equal(after.mtimeNs, before.mtimeNs)
  assert.equal(after.ctimeNs, before.ctimeNs)
  assert.equal(after.mode, before.mode)
})

test("an explicit extension directory is delegated to the existing read-only byte preflight", async (t) => {
  const directory = await scratchDirectory(t)
  const extensionDir = path.join(directory, "opencode-window-control@computer-use.local")
  const document = await preflight(options(directory, { extensionDir }))

  assert.equal(document.installedExtension.selected, true)
  assert.equal(document.installedExtension.status, "absent")
  assert.equal(document.installedExtension.path, extensionDir)
  await assert.rejects(lstat(extensionDir), { code: "ENOENT" })
  assert.deepEqual(await readdir(directory), [])
})

test("CLI rejects missing exact targets instead of selecting defaults", () => {
  const result = cli([])
  assert.equal(result.status, 1)
  assert.equal(JSON.parse(result.stdout).error.code, "INVALID_ARGUMENT")
  assert.match(JSON.parse(result.stdout).error.message, /--window-id is required/u)
})

test("CLI rejects duplicate and unknown flags, including mutation flags", async (t) => {
  const directory = await scratchDirectory(t)
  const common = ["--window-id", WINDOW_ID, "--desktop-id", DESKTOP_ID, "--browser-data-dir", directory]
  const duplicate = cli([...common, "--window-id", WINDOW_ID], environment(directory))
  const mutation = cli([...common, "--apply"], environment(directory))

  assert.equal(JSON.parse(duplicate.stdout).error.code, "INVALID_ARGUMENT")
  assert.equal(JSON.parse(mutation.stdout).error.code, "INVALID_ARGUMENT")
  assert.deepEqual(await readdir(directory), [])
})

test("CLI accepts only exact compositor IDs and desktop-entry IDs", async (t) => {
  const directory = await scratchDirectory(t)
  const common = ["--desktop-id", DESKTOP_ID, "--browser-data-dir", directory]
  const badWindow = cli([...common, "--window-id", "*"], environment(directory))
  const badDesktop = cli(["--window-id", WINDOW_ID, "--desktop-id", "../Calculator.desktop", "--browser-data-dir", directory], environment(directory))

  assert.equal(JSON.parse(badWindow.stdout).error.code, "WINDOW_ID_INVALID")
  assert.equal(JSON.parse(badDesktop.stdout).error.code, "DESKTOP_ID_INVALID")
})

test("scratch target must be an exact direct child of /tmp/opencode", async (t) => {
  const directory = await scratchDirectory(t)
  await assert.rejects(
    inspectBrowserScratch(path.join(directory, "nested"), { env: environment(path.join(directory, "nested")) }),
    (error) => error.code === "SCRATCH_PATH_REFUSED",
  )
})

test("scratch target refuses a non-normalized path", async (t) => {
  const directory = await scratchDirectory(t)
  const nonNormalized = `${directory}/../${path.basename(directory)}`
  await assert.rejects(
    inspectBrowserScratch(nonNormalized, { env: environment(nonNormalized) }),
    (error) => error.code === "AMBIGUOUS_PATH",
  )
})

test("a missing scratch target is never created", async (t) => {
  const parent = await scratchDirectory(t)
  const missing = path.join(SCRATCH_ROOT, `computer-use-acceptance.missing-${path.basename(parent)}`)
  await assert.rejects(
    inspectBrowserScratch(missing, { env: environment(missing) }),
    (error) => error.code === "SCRATCH_MISSING",
  )
  await assert.rejects(lstat(missing), { code: "ENOENT" })
})

test("scratch symlinks are refused", async (t) => {
  const directory = await scratchDirectory(t)
  const alias = path.join(SCRATCH_ROOT, `computer-use-acceptance.alias-${path.basename(directory)}`)
  await symlink(directory, alias)
  t.after(async () => rm(alias, { force: true }))

  await assert.rejects(
    inspectBrowserScratch(alias, { env: environment(alias) }),
    (error) => error.code === "SYMLINK_REFUSED",
  )
})

test("scratch directory must be private mode 0700", async (t) => {
  const directory = await scratchDirectory(t)
  await chmod(directory, 0o755)

  await assert.rejects(
    inspectBrowserScratch(directory, { env: environment(directory) }),
    (error) => error.code === "SCRATCH_MODE_MISMATCH",
  )
})

test("scratch directory must belong to the current user", async (t) => {
  const directory = await scratchDirectory(t)
  await assert.rejects(
    inspectBrowserScratch(directory, { env: environment(directory), uid: 4_000_000 }),
    (error) => error.code === "SCRATCH_OWNER_MISMATCH",
  )
})

test("nonempty scratch data is preserved and rejected", async (t) => {
  const directory = await scratchDirectory(t)
  const sentinel = path.join(directory, "keep.txt")
  const contents = Buffer.from("preserve this unrelated entry")
  await writeFile(sentinel, contents)

  await assert.rejects(
    inspectBrowserScratch(directory, { env: environment(directory) }),
    (error) => error.code === "SCRATCH_NOT_EMPTY",
  )
  assert.deepEqual(await readFile(sentinel), contents)
  assert.deepEqual(await readdir(directory), ["keep.txt"])
})

test("OPENCODE_DATA_DIR and TMPDIR must match their explicit acceptance targets", async (t) => {
  const directory = await scratchDirectory(t)
  await assert.rejects(
    inspectBrowserScratch(directory, { env: { OPENCODE_DATA_DIR: "/home/user/.config/opencode", TMPDIR: SCRATCH_ROOT } }),
    (error) => error.code === "DATA_DIRECTORY_MISMATCH",
  )
  await assert.rejects(
    inspectBrowserScratch(directory, { env: { OPENCODE_DATA_DIR: directory, TMPDIR: "/tmp" } }),
    (error) => error.code === "TEMP_DIRECTORY_MISMATCH",
  )
  assert.deepEqual(await readdir(directory), [])
})

test("preflight preserves a selected target fingerprint check without applying it", async (t) => {
  const directory = await scratchDirectory(t)
  const invalidFingerprint = "not-a-digest"
  await assert.rejects(
    preflight(options(directory, {
      extensionDir: path.join(directory, "opencode-window-control@computer-use.local"),
      expectTargetFingerprint: invalidFingerprint,
    })),
    (error) => error.code === "INVALID_FINGERPRINT",
  )
  assert.deepEqual(await readdir(directory), [])
})

test("rollback and cleanup are plans only, not target mutations", async (t) => {
  const directory = await scratchDirectory(t)
  const document = await preflight(options(directory))

  assert.equal(document.cleanupPlan.status, "plan_only")
  assert.equal(document.rollbackPlan.status, "not_performed")
  assert.match(document.rollbackPlan.note, /original apply receipt/u)
  assert.match(document.cleanupPlan.desktop, /fresh identity\/readback/u)
  assert.deepEqual(await readdir(directory), [])
})
