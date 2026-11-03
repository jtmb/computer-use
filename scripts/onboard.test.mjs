import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function fixture(t, { helperStatus = 0 } = {}) {
  const directory = await mkdtemp("/tmp/opencode/onboard-integration-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const name of ["scripts", "global", "bin"]) await mkdir(path.join(directory, name))
  await copyFile(path.join(root, "scripts/onboard.sh"), path.join(directory, "scripts/onboard.sh"))
  const config = '{"model":"fixture/model","mcp":{"servers":{"unrelated":{"disabled":true}}}}\n'
  await writeFile(path.join(directory, "global/opencode.jsonc"), config)
  await writeFile(path.join(directory, "global/cli.json"), "{}\n")
  const log = path.join(directory, "calls.jsonl")
  const logger = `import json, os, sys\nwith open(os.environ["ONBOARD_FIXTURE_LOG"], "a") as f:\n f.write(json.dumps({"kind": KIND, "args": sys.argv[1:]}) + "\\n")\n`
  for (const [filename, kind] of [["deploy-global-config.sh", "deploy"], ["setup-model.sh", "model"]]) {
    await writeFile(path.join(directory, "scripts", filename),
      `#!/usr/bin/python3\nKIND = ${JSON.stringify(kind)}\n${logger}`, { mode: 0o700 })
  }
  await writeFile(path.join(directory, "scripts/setup-chatgpt.py"),
    `KIND = "chatgpt"\n${logger}\nsys.exit(${helperStatus})\n`)
  await writeFile(path.join(directory, "bin/opencode"), `#!/bin/sh
case "$*" in
  --version) echo 'opencode v2.1.1' ;;
  'service status') exit 0 ;;
  *) echo 'unexpected opencode call' >&2; exit 97 ;;
esac
`, { mode: 0o700 })
  await writeFile(path.join(directory, "bin/gh"), "#!/bin/sh\n[ \"$*\" = 'auth status' ]\n", { mode: 0o700 })
  await writeFile(path.join(directory, "bin/npm"), "#!/bin/sh\necho unexpected-package-install >&2\nexit 98\n", { mode: 0o700 })
  return {
    directory,
    async run(args = []) {
      const result = spawnSync("bash", [path.join(directory, "scripts/onboard.sh"), ...args], {
        cwd: directory, encoding: "utf8", timeout: 10_000,
        env: { ...process.env, PATH: `${directory}/bin:/usr/bin:/bin`, ONBOARD_FIXTURE_LOG: log },
      })
      assert.ifError(result.error)
      const calls = await readFile(log, "utf8").catch((error) => {
        if (error.code === "ENOENT") return ""
        throw error
      })
      assert.equal(await readFile(path.join(directory, "global/opencode.jsonc"), "utf8"), config)
      return { ...result, calls: calls.trim() ? calls.trim().split("\n").map(JSON.parse) : [] }
    },
  }
}

test("default preview neither selects ChatGPT nor installs packages", async (t) => {
  const state = await fixture(t)
  const result = await state.run()
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls, [{ kind: "deploy", args: [] }])
  assert.match(result.stdout, /chatgpt=not selected/)
  assert.match(result.stdout, /search=skipped \(dry run/)
})

test("explicit ChatGPT preview calls only the preview helper before deployment preview", async (t) => {
  const state = await fixture(t)
  const result = await state.run(["--with-chatgpt", "--no-search"])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls, [{ kind: "chatgpt", args: [] }, { kind: "deploy", args: [] }])
  assert.match(result.stdout, /chatgpt=preview only/)
})

test("explicit apply selects install/preflight/source merge before global deployment", async (t) => {
  const state = await fixture(t)
  const result = await state.run(["--with-chatgpt", "--apply", "--no-search"])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls, [
    { kind: "chatgpt", args: ["--apply", "--install-dependencies"] },
    { kind: "deploy", args: ["--apply"] },
  ])
  assert.match(result.stdout, /account\/tools not tested/)
})

test("apply without the opt-in never installs or configures ChatGPT", async (t) => {
  const state = await fixture(t)
  const result = await state.run(["--apply", "--no-search"])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls, [{ kind: "deploy", args: ["--apply"] }])
})

test("ChatGPT helper failure prevents all global deployment and later steps", async (t) => {
  const state = await fixture(t, { helperStatus: 23 })
  const result = await state.run(["--with-chatgpt", "--apply", "--no-search"])
  assert.equal(result.status, 23)
  assert.deepEqual(result.calls, [{ kind: "chatgpt", args: ["--apply", "--install-dependencies"] }])
  assert.doesNotMatch(result.stdout, /Deploy global configuration|configuration applied/)
})
