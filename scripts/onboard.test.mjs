import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtemp, mkdir, readFile, rm, writeFile, copyFile, symlink } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function fixture(t, { helperStatus = 0, preflightStatus = 0 } = {}) {
  const directory = await mkdtemp("/tmp/opencode/onboard-integration-")
  t.after(() => rm(directory, { recursive: true, force: true }))
  for (const name of ["scripts", "global", "bin"]) await mkdir(path.join(directory, name))
  await copyFile(path.join(root, "scripts/onboard.sh"), path.join(directory, "scripts/onboard.sh"))
  await symlink(process.execPath, path.join(directory, "bin/node"))
  await writeFile(path.join(directory, "scripts/onboarding-preflight.mjs"), `process.exit(${preflightStatus})\n`)
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
  await writeFile(path.join(directory, "scripts/mcp_runtime.py"),
    `import sys\nif "--apply" in sys.argv:\n KIND = "github-runtime"\n ${logger.split("\n").filter(Boolean).join("\n ")}\n`)
  await writeFile(path.join(directory, "bin/opencode"), `#!/bin/sh
case "$*" in
  --version) echo 'opencode v2.1.1' ;;
  'service status') exit 0 ;;
  *) echo 'unexpected opencode call' >&2; exit 97 ;;
esac
`, { mode: 0o700 })
  await writeFile(path.join(directory, "bin/gh"), `#!/bin/sh
printf 'called' > '${directory}/gh-called'
[ "$*" = 'auth status' ]
`, { mode: 0o700 })
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
      return { ...result, calls: calls.trim() ? calls.trim().split("\n").map(JSON.parse) : [], ghCalled: await readFile(path.join(directory, "gh-called"), "utf8").catch(() => "") }
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

test("missing required runtime dependencies prevent deployment instead of reporting success", async t => {
  const state = await fixture(t, { preflightStatus: 1 })
  const result = await state.run(["--apply", "--no-search"])
  assert.notEqual(result.status, 0)
  assert.deepEqual(result.calls, [])
  assert.match(result.stderr, /required runtime components are missing; nothing deployed/)
  assert.doesNotMatch(result.stdout, /configuration applied/)
})

test("model selection precedes the single deployment and cannot redeploy into a same-second backup collision", async t => {
  const state = await fixture(t)
  const result = await state.run(["--apply", "--no-search", "--model", "fixture/model"])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls, [
    { kind: "model", args: ["--model", "fixture/model", "--no-deploy", "--apply"] },
    { kind: "deploy", args: ["--apply"] },
  ])
})

test("GitHub runtime provisioning is explicit and precedes global deployment without authenticating", async t => {
  const state = await fixture(t)
  const result = await state.run(["--apply", "--with-github", "--no-search"])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls, [
    { kind: "github-runtime", args: ["github-runtime", "--profile", "native", "--apply"] },
    { kind: "deploy", args: ["--apply"] },
  ])
})

test("credential-free onboarding does not invoke gh auth status", async t => {
  const state = await fixture(t)
  const result = await state.run(["--apply", "--no-search", "--no-auth-check"])
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.ghCalled, "")
  assert.match(result.stdout, /gh=not checked/)
})

test("voice is never implicitly enabled; an explicit selection is forwarded to guarded deployment", async t => {
  const state = await fixture(t)
  const result = await state.run(["--apply", "--with-voice", "--no-search"])
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(result.calls, [{ kind: "deploy", args: ["--apply", "--with-voice"] }])
})
