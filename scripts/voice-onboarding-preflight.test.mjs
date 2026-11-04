import assert from "node:assert/strict"
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { spawnSync } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
test("the default template does not activate a microphone-dependent plugin", async () => {
  const config = JSON.parse(await readFile(path.join(root, "global/cli.json"), "utf8"))
  assert.ok(!config.plugins.some(entry => JSON.stringify(entry).includes("voice-assistant")))
})

test("voice opt-in refuses missing dependencies and requires the real sandboxed device-free model check", async t => {
  const dir = await mkdtemp("/tmp/opencode/voice-onboarding-")
  t.after(() => rm(dir, { recursive: true, force: true }))
  for (const name of ["scripts", "bin", "voice-assistant/.venv/bin", "voice-assistant/node_modules/jsonc-parser", "voice-assistant/scripts"]) await mkdir(path.join(dir, name), { recursive: true })
  await copyFile(path.join(root, "scripts/voice-onboarding-preflight.sh"), path.join(dir, "scripts/voice-onboarding-preflight.sh"))
  const run = args => spawnSync("bash", [path.join(dir, "scripts/voice-onboarding-preflight.sh"), ...args], { encoding: "utf8", env: { PATH: `${dir}/bin:/usr/bin:/bin`, HOME: dir, OPENCODE_VOICE_OFFLINE: "1" } })
  assert.notEqual(run(["--check"]).status, 0)
  await writeFile(path.join(dir, "voice-assistant/package.json"), "{}")
  await writeFile(path.join(dir, "voice-assistant/node_modules/jsonc-parser/package.json"), "{}")
  await writeFile(path.join(dir, "voice-assistant/.venv/bin/python"), `#!/bin/bash
if [[ "$1" = "-" ]]; then
  printf '%s' '${dir}/voice-assistant/models/fixture-sherpa'
  exit 0
fi
printf '%s\\n' "$@" > '${dir}/model-call'
printf '%s' "\${OPENCODE_VOICE_OFFLINE-unset}" > '${dir}/offline-flag'
exit 7
`, { mode: 0o700 })
  for (const name of ["bwrap", "pw-cli", "pw-cat", "pw-dump"]) await symlink("/usr/bin/true", path.join(dir, "bin", name))
  assert.equal(run(["--check"]).status, 0)
  assert.equal(run(["--verify-models"]).status, 7, "model failure must not be suppressed")
  assert.deepEqual((await readFile(path.join(dir, "model-call"), "utf8")).trim().split("\n").slice(1), ["--recognition-only", "--recognizer-backend", "sherpa", "--recognizer-model", `${dir}/voice-assistant/models/fixture-sherpa`])
  assert.equal(await readFile(path.join(dir, "offline-flag"), "utf8"), "unset", "the smoke check must establish its own sandbox")
})
