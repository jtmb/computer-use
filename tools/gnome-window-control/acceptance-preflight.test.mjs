import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { spawnSync } from "node:child_process"
import test from "node:test"
import {
  CANONICAL_SOURCE_ROOT,
  EXTENSION_UUID,
  MANAGED_FILES,
  OWNERSHIP_MARKER,
  preflight,
} from "./acceptance-preflight.mjs"

const REPOSITORY_ROOT = path.resolve(CANONICAL_SOURCE_ROOT, "../..")
const PREFLIGHT_PATH = path.join(CANONICAL_SOURCE_ROOT, "acceptance-preflight.mjs")
const SCRATCH_ROOT = "/tmp/opencode"

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex")
}

async function fixtureDirectory(t) {
  const directory = await mkdtemp(path.join(SCRATCH_ROOT, "gnome-acceptance-preflight-"))
  t.after(async () => rm(directory, { recursive: true, force: true }))
  return directory
}

async function sourceBytes(name) {
  const sourcePath = name === "runtime-contract.mjs"
    ? path.join(REPOSITORY_ROOT, "tools/computer-use-runtime/src/runtime-contract.mjs")
    : path.join(CANONICAL_SOURCE_ROOT, name)
  return readFile(sourcePath)
}

async function makeTarget(directory, { markerFiles = MANAGED_FILES } = {}) {
  const target = path.join(directory, EXTENSION_UUID)
  await mkdir(target)
  const hashes = {}
  for (const name of MANAGED_FILES) {
    const bytes = await sourceBytes(name)
    await writeFile(path.join(target, name), bytes)
    hashes[name] = digest(bytes)
  }
  const recorded = Object.fromEntries(markerFiles.map(name => [name, hashes[name]]))
  await writeFile(path.join(target, OWNERSHIP_MARKER), JSON.stringify({
    uuid: EXTENSION_UUID,
    version: 1,
    files: recorded,
  }))
  return { target, hashes }
}

async function targetSnapshot(target) {
  const entries = {}
  for (const name of (await readdir(target)).sort()) {
    const bytes = await readFile(path.join(target, name))
    entries[name] = digest(bytes)
  }
  return entries
}

function args(extra = {}) {
  return { sourceRoot: CANONICAL_SOURCE_ROOT, ...extra }
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code, `expected ${code}`)
}

test("CLI emits source-only readiness and never inspects an unselected target", async t => {
  const directory = await fixtureDirectory(t)
  const target = path.join(directory, EXTENSION_UUID)
  await mkdir(target)
  const sentinel = path.join(target, "unrelated.txt")
  await writeFile(sentinel, "fixture sentinel\n")
  const before = digest(await readFile(sentinel))
  const result = spawnSync(process.execPath, [PREFLIGHT_PATH, "--source-root", CANONICAL_SOURCE_ROOT], {
    encoding: "utf8",
  })

  assert.equal(result.status, 0, result.stderr)
  const document = JSON.parse(result.stdout)
  assert.equal(document.preflight.status, "source_ready_only")
  assert.equal(document.acceptance.status, "not_accepted")
  assert.equal(document.source.managedFiles.length, 7)
  assert.deepEqual(document.installedExtension, {
    selected: false,
    inspected: false,
    status: "not_selected",
    note: "installed extension target was not inspected",
  })
  assert.equal(document.installedProfile.status, "not_selected")
  assert.equal(document.runtimeEvidence.loadedShell.status, "not_observed")
  assert.equal(document.runtimeEvidence.windows.status, "not_observed")
  assert.equal(document.runtimeEvidence.humanPrivateEntry.status, "human_only_not_observed")
  assert.equal(document.runtimeEvidence.legacyScreenshotBackend.status, "hold_preserved_not_invoked")
  assert.equal(digest(await readFile(sentinel)), before)
  assert.deepEqual(await readdir(target), ["unrelated.txt"])
})

test("managed file set matches the deployer's reviewed contract", async () => {
  const deployer = await readFile(path.join(REPOSITORY_ROOT, "scripts/deploy-window-control.py"), "utf8")
  const declaration = deployer.match(/^FILES = \(([^)]*)\)/m)
  assert.ok(declaration, "deployer FILES contract is present")
  const names = [...declaration[1].matchAll(/"([^"]+)"/g)].map(match => match[1])
  assert.deepEqual([...MANAGED_FILES], names)
  const marker = deployer.match(/^MARKER = "([^"]+)"$/m)
  assert.ok(marker, "deployer ownership marker contract is present")
  assert.equal(marker[1], OWNERSHIP_MARKER, "preflight and deployer must use the same ownership marker")
  assert.match(deployer, /"runtime-contract\.mjs"\s*:\s*Path\(__file__\)\.resolve\(\)\.parents\[1\]/)
})

test("explicit owned target hash-manifests the exact seven files without writing", async t => {
  const directory = await fixtureDirectory(t)
  const { target, hashes } = await makeTarget(directory)
  const before = await targetSnapshot(target)
  const document = await preflight(args({ extensionDir: target }))

  assert.equal(document.installedExtension.status, "matches_source")
  assert.equal(document.installedExtension.ownership, "marker_verified")
  assert.deepEqual(document.installedExtension.changes, [])
  assert.equal(document.installedExtension.files["input.mjs"].sourceSha256, hashes["input.mjs"])
  assert.equal(document.installedExtension.files["input.mjs"].installedSha256, hashes["input.mjs"])
  assert.match(document.installedExtension.managedFingerprint, /^[a-f0-9]{64}$/)
  assert.deepEqual(await targetSnapshot(target), before)
  assert.deepEqual((await readdir(target)).sort(), [...MANAGED_FILES, OWNERSHIP_MARKER].sort())
  assert.equal(document.acceptance.status, "not_accepted")
})

test("legacy subset ownership markers remain valid when recorded bytes match", async t => {
  const directory = await fixtureDirectory(t)
  const { target } = await makeTarget(directory, { markerFiles: ["metadata.json", "extension.js"] })
  const document = await preflight(args({ extensionDir: target }))
  assert.equal(document.installedExtension.ownership, "marker_verified")
  assert.equal(document.installedExtension.status, "matches_source")
})

test("explicit missing target is previewed but never created", async t => {
  const directory = await fixtureDirectory(t)
  const target = path.join(directory, EXTENSION_UUID)
  const document = await preflight(args({ extensionDir: target }))
  assert.equal(document.installedExtension.status, "absent")
  assert.deepEqual(document.installedExtension.changes, [...MANAGED_FILES])
  await assert.rejects(readFile(target), error => error?.code === "ENOENT")
  assert.deepEqual(await readdir(directory), [])
})

test("source identity rejects a different root before scanning it", async t => {
  const directory = await fixtureDirectory(t)
  await writeFile(path.join(directory, "marker"), "must not be consulted")
  await expectCode(preflight(args({ sourceRoot: directory })), "SOURCE_IDENTITY_MISMATCH")
})

test("unmarked existing managed files and bytes changed since marker creation fail closed", async t => {
  const directory = await fixtureDirectory(t)
  const { target } = await makeTarget(directory)
  await rm(path.join(target, OWNERSHIP_MARKER))
  await expectCode(preflight(args({ extensionDir: target })), "UNOWNED_TARGET")

  const owned = path.join(directory, "owned", EXTENSION_UUID)
  await mkdir(path.dirname(owned))
  const { target: ownedTarget } = await makeTarget(path.dirname(owned))
  await writeFile(path.join(ownedTarget, "input.mjs"), "out-of-band change\n")
  await expectCode(preflight(args({ extensionDir: ownedTarget })), "OWNERSHIP_MISMATCH")
})

test("unknown marker paths, symlink escapes, and nonregular files are refused", async t => {
  const directory = await fixtureDirectory(t)
  const { target } = await makeTarget(directory)
  await writeFile(path.join(target, OWNERSHIP_MARKER), JSON.stringify({
    uuid: EXTENSION_UUID,
    version: 1,
    files: { "outside.txt": null },
  }))
  await expectCode(preflight(args({ extensionDir: target })), "OWNERSHIP_MARKER_INVALID")

  const symlinkTarget = path.join(directory, "symlink", EXTENSION_UUID)
  await mkdir(path.dirname(symlinkTarget))
  await symlink(target, symlinkTarget)
  await expectCode(preflight(args({ extensionDir: symlinkTarget })), "SYMLINK_REFUSED")

  const nonRegularDirectory = path.join(directory, "nonregular")
  await mkdir(nonRegularDirectory)
  const { target: nonRegular } = await makeTarget(nonRegularDirectory)
  await rm(path.join(nonRegular, "input.mjs"))
  await mkdir(path.join(nonRegular, "input.mjs"))
  await expectCode(preflight(args({ extensionDir: nonRegular })), "NON_REGULAR_FILE")
})

test("a file replaced by a FIFO just before open refuses without blocking", async t => {
  const directory = await fixtureDirectory(t)
  const { target } = await makeTarget(directory)
  const replacedFile = path.join(target, "input.mjs")
  const moduleUrl = new URL("./acceptance-preflight.mjs", import.meta.url).href
  const filesystemBoundary = `
    export * from "node:fs/promises";
    import * as fs from "node:fs/promises";
    import { execFileSync } from "node:child_process";
    export async function open(file, flags) {
      if (file === ${JSON.stringify(replacedFile)}) {
        await fs.unlink(file);
        execFileSync("mkfifo", [file]);
      }
      return fs.open(file, flags);
    }
  `
  const boundaryUrl = `data:text/javascript,${encodeURIComponent(filesystemBoundary)}`
  const child = `
    import { registerHooks } from "node:module";
    registerHooks({ resolve(specifier, context, next) {
      if (specifier === "node:fs/promises" && context.parentURL === ${JSON.stringify(moduleUrl)})
        return { url: ${JSON.stringify(boundaryUrl)}, shortCircuit: true };
      return next(specifier, context);
    }});
    const { preflight } = await import(${JSON.stringify(moduleUrl)});
    try {
      await preflight(${JSON.stringify(args({ extensionDir: target }))});
      process.exitCode = 2;
    } catch (error) {
      process.stdout.write(error.code);
    }
  `
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", child], {
    encoding: "utf8",
    timeout: 5_000,
  })
  assert.equal(result.error, undefined, "file replacement must not hang waiting for a FIFO writer")
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stdout, "FILE_CHANGED")
})

test("file and marker bounds are enforced before content can be adopted", async t => {
  const directory = await fixtureDirectory(t)
  const { target } = await makeTarget(directory)
  await writeFile(path.join(target, "input.mjs"), Buffer.alloc(2 * 1024 * 1024 + 1))
  await expectCode(preflight(args({ extensionDir: target })), "FILE_TOO_LARGE")

  const markerTarget = path.join(directory, "marker-bound", EXTENSION_UUID)
  await mkdir(path.dirname(markerTarget))
  await mkdir(markerTarget)
  await writeFile(path.join(markerTarget, OWNERSHIP_MARKER), Buffer.alloc(16 * 1024 + 1))
  await expectCode(preflight(args({ extensionDir: markerTarget })), "FILE_TOO_LARGE")
})

test("expected target fingerprint rejects a target changed since its prior preview", async t => {
  const directory = await fixtureDirectory(t)
  const { target } = await makeTarget(directory)
  const first = await preflight(args({ extensionDir: target }))
  const changed = Buffer.from("reviewed-byte-change\n")
  await writeFile(path.join(target, "input.mjs"), changed)

  const markerFiles = {}
  for (const name of MANAGED_FILES) {
    markerFiles[name] = name === "input.mjs"
      ? digest(changed)
      : digest(await readFile(path.join(target, name)))
  }
  const marker = {
    uuid: EXTENSION_UUID,
    version: 1,
    files: markerFiles,
  }
  await writeFile(path.join(target, OWNERSHIP_MARKER), JSON.stringify(marker))
  await expectCode(preflight(args({
    extensionDir: target,
    expectTargetFingerprint: first.installedExtension.managedFingerprint,
  })), "TARGET_CHANGED")
})

test("selected profile hashes one exact command file and exposes no content", async t => {
  const directory = await fixtureDirectory(t)
  const commands = path.join(directory, "profile", "commands")
  await mkdir(commands, { recursive: true })
  const profileFile = path.join(commands, "handoff_resume.md")
  const original = await readFile(path.join(REPOSITORY_ROOT, "global/commands/handoff_resume.md"))
  await writeFile(profileFile, original)
  const document = await preflight(args({ profileFile }))
  assert.equal(document.installedProfile.status, "matches_source")
  assert.equal(document.installedProfile.contentExposed, false)
  assert.equal(document.runtimeEvidence.profileDiscovery.status, "bytes_only")

  await writeFile(profileFile, "stale synthetic profile fixture\n")
  const stale = await preflight(args({ profileFile }))
  assert.equal(stale.installedProfile.status, "source_drift")
  assert.equal(stale.acceptance.status, "not_accepted")
})

test("profile selection refuses other files, symlink ancestors, and oversized content", async t => {
  const directory = await fixtureDirectory(t)
  await expectCode(preflight(args({ profileFile: path.join(directory, "config.json") })), "PROFILE_IDENTITY_MISMATCH")

  const commandDir = path.join(directory, "commands")
  await mkdir(commandDir)
  const profileFile = path.join(commandDir, "handoff_resume.md")
  await writeFile(profileFile, Buffer.alloc(1024 * 1024 + 1))
  await expectCode(preflight(args({ profileFile })), "FILE_TOO_LARGE")

  const alias = path.join(directory, "profile-alias")
  await symlink(directory, alias)
  await expectCode(preflight(args({ profileFile: path.join(alias, "commands", "handoff_resume.md") })), "SYMLINK_REFUSED")
})

test("CLI requires explicit canonical source identity and rejects stale fingerprints", async t => {
  const directory = await fixtureDirectory(t)
  const missingSource = spawnSync(process.execPath, [PREFLIGHT_PATH], { encoding: "utf8" })
  assert.equal(missingSource.status, 1)
  assert.equal(JSON.parse(missingSource.stdout).error.code, "INVALID_ARGUMENT")

  const wrongSource = spawnSync(process.execPath, [PREFLIGHT_PATH, "--source-root", directory], { encoding: "utf8" })
  assert.equal(wrongSource.status, 1)
  assert.equal(JSON.parse(wrongSource.stdout).error.code, "SOURCE_IDENTITY_MISMATCH")
})
