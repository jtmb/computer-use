import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFile, link, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function fixture(t, { lateArrival = false, fixedStamp = false } = {}) {
  const directory = await mkdtemp("/tmp/opencode/global-deploy-preservation-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const name of ["scripts", "bin", "global/commands", "global/agents", "target/commands", "target/agents"]) {
    await mkdir(path.join(directory, name), { recursive: true })
  }
  await copyFile(path.join(root, "scripts/deploy-global-config.sh"), path.join(directory, "scripts/deploy-global-config.sh"))
  for (const name of ["opencode.jsonc", "cli.json"]) {
    await writeFile(path.join(directory, "global", name), '{"fixture":"source"}\n')
    await writeFile(path.join(directory, "target", name), '{"fixture":"before"}\n')
  }
  for (const name of ["commands", "agents"]) {
    await writeFile(path.join(directory, "global", name, "managed.md"), "Source definition.\n")
    await writeFile(path.join(directory, "target", name, "managed.md"), "Prior definition.\n")
  }
  const target = path.join(directory, "target")
  if (fixedStamp) {
    await writeFile(path.join(directory, "bin/date"), "#!/bin/bash\nprintf '20261030-000000\\n'\n", { mode: 0o700 })
  }
  if (lateArrival) {
    await writeFile(path.join(directory, "bin/cp"), `#!/bin/bash
/usr/bin/cp "$@" || exit "$?"
for argument in "$@"; do
  case "$argument" in
    ${JSON.stringify(target)}/backup-*/commands)
      umask 077
      printf 'Late unrelated command.\\n' > ${JSON.stringify(path.join(target, "commands/arrived-late.md"))}
      ;;
  esac
done
`, { mode: 0o700 })
  }
  const originalNames = (await readdir(target)).sort()
  return {
    directory, target, originalNames,
    run(args = []) {
      const result = spawnSync("bash", [path.join(directory, "scripts/deploy-global-config.sh"), "--config-dir", target, ...args], {
        cwd: directory, encoding: "utf8", timeout: 5000,
        env: { PATH: `${directory}/bin:/usr/bin:/bin`, HOME: directory, PYTHONDONTWRITEBYTECODE: "1" },
      })
      assert.ifError(result.error)
      return result
    },
  }
}

for (const name of ["commands", "agents"]) {
  test(`unmanaged ${name} content blocks publication before backup or deletion`, async t => {
    const f = await fixture(t)
    const custom = path.join(f.target, name, "user-owned.md")
    await writeFile(custom, "Unrelated user definition.\n", { mode: 0o600 })
    const before = await lstat(custom)
    const result = f.run(["--apply", "--only", name])
    assert.equal(await readFile(custom, "utf8"), "Unrelated user definition.\n")
    assert.equal((await lstat(custom)).ino, before.ino)
    assert.equal((await lstat(custom)).mode, before.mode)
    assert.equal(await readFile(path.join(f.target, name, "managed.md"), "utf8"), "Prior definition.\n")
    assert.deepEqual((await readdir(f.target)).sort(), f.originalNames)
    assert.notEqual(result.status, 0, "unmanaged target entries must refuse apply")
    assert.match(result.stderr, /unmanaged target entry/)
  })
}

for (const kind of ["symlink", "hardlink"]) {
  test(`a selected config ${kind} cannot overwrite another file`, async t => {
    const f = await fixture(t)
    const protectedFile = path.join(f.directory, "protected.json")
    await writeFile(protectedFile, '{"synthetic":"preserve"}\n', { mode: 0o600 })
    const target = path.join(f.target, "opencode.jsonc")
    await rm(target)
    if (kind === "symlink") await symlink(protectedFile, target)
    else await link(protectedFile, target)
    const before = await lstat(protectedFile)
    const result = f.run(["--apply", "--only", "opencode.jsonc"])
    assert.equal(await readFile(protectedFile, "utf8"), '{"synthetic":"preserve"}\n')
    assert.equal((await lstat(protectedFile)).ino, before.ino)
    assert.equal((await lstat(protectedFile)).mode, before.mode)
    assert.deepEqual((await readdir(f.target)).sort(), f.originalNames)
    assert.notEqual(result.status, 0, "target aliases must be refused")
    assert.match(result.stderr, /target.*(symlink|regular|link)/)
  })
}

test("a selected directory's linked managed child is refused without removing it", async t => {
  const f = await fixture(t)
  const child = path.join(f.target, "commands/managed.md")
  const protectedFile = path.join(f.directory, "protected.md")
  await writeFile(protectedFile, "Preserved outside the selected entry.\n")
  await rm(child)
  await symlink(protectedFile, child)
  const before = await lstat(child)
  const result = f.run(["--apply", "--only", "commands"])
  assert.equal((await lstat(child)).ino, before.ino)
  assert.equal((await lstat(child)).isSymbolicLink(), true)
  assert.equal(await readFile(protectedFile, "utf8"), "Preserved outside the selected entry.\n")
  assert.deepEqual((await readdir(f.target)).sort(), f.originalNames)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /target.*(symlink|regular|link)/)
})

test("a selected nonregular config target is refused before backup", async t => {
  const f = await fixture(t)
  const target = path.join(f.target, "opencode.jsonc")
  await rm(target)
  await mkdir(target)
  const before = await lstat(target)
  const result = f.run(["--apply", "--only", "opencode.jsonc"])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /target must be an unlinked regular file/)
  assert.equal((await lstat(target)).ino, before.ino)
  assert.deepEqual(await readdir(target), [])
  assert.deepEqual((await readdir(f.target)).sort(), f.originalNames)
})

test("all selected entries are checked before an earlier config can be published", async t => {
  const f = await fixture(t)
  await writeFile(path.join(f.target, "agents/user-owned.md"), "Preserve this agent.\n")
  const result = f.run(["--apply"])
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /unmanaged target entry/)
  for (const name of ["opencode.jsonc", "cli.json"])
    assert.equal(await readFile(path.join(f.target, name), "utf8"), '{"fixture":"before"}\n')
  for (const name of ["commands", "agents"])
    assert.equal(await readFile(path.join(f.target, name, "managed.md"), "utf8"), "Prior definition.\n")
  assert.equal(await readFile(path.join(f.target, "agents/user-owned.md"), "utf8"), "Preserve this agent.\n")
  assert.deepEqual((await readdir(f.target)).sort(), f.originalNames)
})

test("a concurrent unmanaged arrival after preflight is preserved and verification fails honestly", async t => {
  const f = await fixture(t, { lateArrival: true })
  const before = await lstat(path.join(f.target, "commands"))
  const result = f.run(["--apply", "--only", "commands"])
  assert.equal(await readFile(path.join(f.target, "commands/arrived-late.md"), "utf8"), "Late unrelated command.\n")
  assert.equal((await lstat(path.join(f.target, "commands"))).ino, before.ino)
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /verification failed/)
  assert.equal(await readFile(path.join(f.target, "commands/managed.md"), "utf8"), "Source definition.\n")
})

test("dry-run remains non-writing and an explicitly selected managed update keeps a backup", async t => {
  const f = await fixture(t)
  const preview = f.run(["--only", "commands"])
  assert.equal(preview.status, 0, preview.stderr)
  assert.match(preview.stdout, /dry run only/)
  assert.equal(await readFile(path.join(f.target, "commands/managed.md"), "utf8"), "Prior definition.\n")
  assert.deepEqual((await readdir(f.target)).sort(), f.originalNames)
  const apply = f.run(["--apply", "--only", "commands"])
  assert.equal(apply.status, 0, apply.stderr)
  const backups = (await readdir(f.target)).filter(name => name.startsWith("backup-"))
  assert.equal(backups.length, 1)
  assert.equal(await readFile(path.join(f.target, backups[0], "commands/managed.md"), "utf8"), "Prior definition.\n")
  assert.equal(await readFile(path.join(f.target, "commands/managed.md"), "utf8"), "Source definition.\n")
  assert.equal(await readFile(path.join(f.target, "agents/managed.md"), "utf8"), "Prior definition.\n")
  const info = await lstat(path.join(f.target, "commands/managed.md"))
  const noop = f.run(["--apply", "--only", "commands"])
  assert.equal(noop.status, 0, noop.stderr)
  assert.match(noop.stdout, /already matches/)
  assert.equal((await lstat(path.join(f.target, "commands/managed.md"))).ino, info.ino)
  assert.equal((await readdir(f.target)).filter(name => name.startsWith("backup-")).length, 1)
})

test("an unselected customized directory is neither validated as owned nor replaced", async t => {
  const f = await fixture(t)
  const custom = path.join(f.target, "commands/user-owned.md")
  await writeFile(custom, "Keep this independent command.\n")
  const result = f.run(["--apply", "--only", "cli.json"])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(await readFile(custom, "utf8"), "Keep this independent command.\n")
  assert.equal(await readFile(path.join(f.target, "commands/managed.md"), "utf8"), "Prior definition.\n")
  assert.equal(await readFile(path.join(f.target, "cli.json"), "utf8"), '{"fixture":"source"}\n')
  assert.equal(await readFile(path.join(f.target, "opencode.jsonc"), "utf8"), '{"fixture":"before"}\n')
})

for (const kind of ["directory", "symlink"]) {
  test(`an existing backup ${kind} is never reused or changed`, async t => {
    const f = await fixture(t, { fixedStamp: true })
    const backup = path.join(f.target, "backup-20261030-000000")
    const saved = kind === "directory" ? backup : path.join(f.directory, "prior-backup")
    await mkdir(saved)
    await writeFile(path.join(saved, "cli.json"), "Prior rollback snapshot.\n")
    if (kind === "symlink") await symlink(saved, backup)
    const before = await lstat(path.join(saved, "cli.json"))
    const result = f.run(["--apply", "--only", "cli.json"])
    assert.equal(await readFile(path.join(saved, "cli.json"), "utf8"), "Prior rollback snapshot.\n")
    assert.equal((await lstat(path.join(saved, "cli.json"))).ino, before.ino)
    assert.equal((await lstat(path.join(saved, "cli.json"))).mtimeMs, before.mtimeMs)
    assert.equal(await readFile(path.join(f.target, "cli.json"), "utf8"), '{"fixture":"before"}\n')
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /refusing to reuse backup path/)
    assert.deepEqual((await readdir(f.target)).sort(), [...f.originalNames, path.basename(backup)].sort())
  })
}
