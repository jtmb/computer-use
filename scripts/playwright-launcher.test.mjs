import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

for (const launcher of ["playwright-mcp.sh", "playwright-headless-mcp.sh"]) {
  test(`${launcher} works in a fresh home using PATH Node and does not leak provider secrets`, async t => {
    const dir = await mkdtemp("/tmp/opencode/playwright-launcher-")
    t.after(() => rm(dir, { recursive: true, force: true }))
    for (const name of ["scripts", "bin", "home", "tools/browser/node_modules/@playwright/mcp"]) await mkdir(path.join(dir, name), { recursive: true })
    await copyFile(path.join(root, "scripts", launcher), path.join(dir, "scripts", launcher))
    await writeFile(path.join(dir, "tools/browser/node_modules/@playwright/mcp/cli.js"), "// fixture")
    await writeFile(path.join(dir, "bin/node"), `#!/bin/bash
if [[ "$1" == *playwright-browser-select.mjs ]]; then
  printf 'profile=chrome\\n--browser\\nchrome\\n'
else
  /usr/bin/python3 - "$@" <<'PY'
import json, os, sys
print(json.dumps({"args":sys.argv[1:], "secret":os.environ.get("PROVIDER_SECRET"), "home":os.environ.get("HOME")}))
PY
fi
`, { mode: 0o700 })
    const env = { HOME: path.join(dir, "home"), PATH: `${dir}/bin:/usr/bin:/bin`, PROVIDER_SECRET: "synthetic-must-not-leak", PLAYWRIGHT_OUTPUT_DIR: path.join(dir, "output") }
    const result = spawnSync("bash", [path.join(dir, "scripts", launcher)], { env, encoding: "utf8", timeout: 10000 })
    assert.equal(result.status, 0, result.stderr)
    const output = JSON.parse(result.stdout)
    assert.equal(output.secret, null)
    assert.equal(output.home, env.HOME)
    assert.ok(output.args.includes("--headless"), "no display must not cause a headed-browser crash")
    assert.deepEqual(output.args.slice(1, 3), ["--browser", "chrome"])
  })
}
