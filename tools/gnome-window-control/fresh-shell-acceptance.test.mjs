import assert from "node:assert/strict"
import { spawn, spawnSync } from "node:child_process"
import { once } from "node:events"
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import test from "node:test"

async function fixture(t, { executeBusChild = false } = {}) {
  const root = await mkdtemp("/tmp/opencode/fresh-shell-boundary-")
  t.after(() => rm(root, { recursive: true, force: true }))
  for (const name of ["bin", "scratch", "home/.config", "repo/tools/gnome-window-control", "home/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local"])
    await mkdir(path.join(root, name), { recursive: true })
  const script = path.join(root, "repo/tools/gnome-window-control/fresh-shell-acceptance.sh")
  await copyFile(new URL("./fresh-shell-acceptance.sh", import.meta.url), script)
  await copyFile(new URL("./owned-process.py", import.meta.url), path.join(root, "repo/tools/gnome-window-control/owned-process.py"))
  const names = ["metadata.json", "extension.js", "policy.mjs", "capture.mjs", "input.mjs", "launch.mjs", "runtime-contract.mjs"]
  for (const name of names) await writeFile(path.join(root, "home/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local", name), name + " synthetic deployed bytes\n")
  const log = path.join(root, "calls.jsonl")
  await writeFile(path.join(root, "bin/node"), `#!/bin/bash\nexec ${JSON.stringify(process.execPath)} "$@"\n`, { mode: 0o700 })
  const logger = `node -e 'require("node:fs").appendFileSync(process.env.FIXTURE_LOG, JSON.stringify({command:process.argv[1],args:process.argv.slice(2),bus:process.env.DBUS_SESSION_BUS_ADDRESS,starter:process.env.DBUS_STARTER_ADDRESS,config:process.env.XDG_CONFIG_HOME,data:process.env.XDG_DATA_HOME,state:process.env.XDG_STATE_HOME,cache:process.env.XDG_CACHE_HOME,home:process.env.HOME})+"\\n")' "$0" "$@"\n`
  await writeFile(path.join(root, "bin/dbus-run-session"), `#!/bin/bash\n${logger}${executeBusChild ? '[[ "$1" == "--" ]] || exit 88\nshift\nexport DBUS_SESSION_BUS_ADDRESS="unix:path=/synthetic-private-bus"\nexec "$@"\n' : "exit 73\n"}`, { mode: 0o700 })
  for (const [name, code] of [["gnome-shell", 1], ["gdbus", 1], ["gsettings", 0], ["dbus-update-activation-environment", 0], ["sleep", 0]])
    await writeFile(path.join(root, "bin", name), `#!/bin/bash\n${name === "sleep" ? "" : logger}exit ${code}\n`, { mode: 0o700 })
  const environment = { PATH: `${root}/bin:/usr/bin:/bin`, HOME: root + "/home", TMPDIR: root + "/scratch", LANG: "C.UTF-8",
    DBUS_SESSION_BUS_ADDRESS: "unix:path=/synthetic-operator-bus", DBUS_STARTER_ADDRESS: "unix:path=/synthetic-operator-starter",
    XDG_CONFIG_HOME: root + "/home/.config", XDG_STATE_HOME: root + "/operator-state", XDG_CACHE_HOME: root + "/operator-cache", FIXTURE_LOG: log }
  return { root, script, names, environment, log,
    run(extra = {}) {
      const result = spawnSync("bash", [script], { env: { ...environment, ...extra }, encoding: "utf8", timeout: 10000 })
      assert.ifError(result.error)
      return result
    },
    async calls() { return (await readFile(log, "utf8")).trim().split("\n").map(line => JSON.parse(line)) },
  }
}

test("an inherited matching shared nonce cannot bypass creation of a private bus", async t => {
  const f = await fixture(t)
  const marker = path.join(f.root, "scratch/.ocwc-fresh-shell-nonce")
  await writeFile(marker, "synthetic-inherited-nonce")
  const result = f.run({ OCWC_FRESH_SHELL_NONCE: "synthetic-inherited-nonce" })
  assert.equal(result.status, 73, "the fake bus boundary must run, not the inner Shell body")
  assert.equal(await readFile(marker, "utf8"), "synthetic-inherited-nonce", "shared marker is not owned by this invocation")
  const calls = await f.calls()
  assert.equal(calls.length, 1)
  assert.ok(calls[0].command.endsWith("dbus-run-session"))
})

test("the new bus launcher never inherits the operator's bus or activation address", async t => {
  const f = await fixture(t)
  const result = f.run()
  assert.equal(result.status, 73, result.stderr)
  const [call] = await f.calls()
  assert.equal(call.bus, undefined)
  assert.equal(call.starter, undefined)
})

test("private Shell failure retains evidence and confines every XDG state home", async t => {
  const f = await fixture(t, { executeBusChild: true })
  const result = f.run()
  assert.equal(result.status, 1, result.stderr)
  const shell = (await f.calls()).find(call => call.command.endsWith("gnome-shell"))
  assert.ok(shell, "the actual harness must reach only our fake Shell boundary")
  assert.equal(shell.bus, "unix:path=/synthetic-private-bus")
  const bases = (await readdir(path.join(f.root, "scratch"))).filter(name => name.startsWith("ocwc-fresh-shell."))
  assert.equal(bases.length, 1, "failed-run artifacts must survive cleanup")
  const base = path.join(f.root, "scratch", bases[0])
  for (const key of ["home", "config", "data", "state", "cache"])
    assert.ok(shell[key].startsWith(base + "/"), `${key} must not use operator state`)
  const staged = path.join(shell.data, "gnome-shell/extensions/opencode-window-control@computer-use.local")
  for (const name of f.names) assert.equal(await readFile(path.join(staged, name), "utf8"), name + " synthetic deployed bytes\n")
  assert.match(await readFile(path.join(base, "result.log"), "utf8"), /headless Shell did not start/)
  assert.deepEqual(await readdir(path.join(f.root, "home/.config")), [], "no operator config is written")
})

test("private D-Bus activation receives private homes before any settings client starts", async t => {
  const f = await fixture(t, { executeBusChild: true })
  assert.equal(f.run().status, 1)
  const calls = await f.calls()
  const update = calls.findIndex(call => call.command.endsWith("dbus-update-activation-environment"))
  const settings = calls.findIndex(call => call.command.endsWith("gsettings"))
  assert.ok(update >= 0 && update < settings, "the new bus initially inherits the launcher environment; update it before dconf activation")
  assert.equal(calls[update].bus, "unix:path=/synthetic-private-bus")
  assert.ok(calls[update].config.startsWith(f.root + "/scratch/ocwc-fresh-shell."))
  assert.ok(calls[update].args.includes("XDG_CONFIG_HOME"))
  assert.ok(calls[update].args.includes("HOME"))
  assert.equal(calls[update].args.includes("--systemd"), false, "never update the operator's shared systemd user manager")
})

test("an incomplete seat workflow has a non-success exit code without running a Shell", async t => {
  const f = await fixture(t)
  const code = 'source "$1"; FAILED=0; INCOMPLETE=1; log() { printf "%s\\n" "$*"; }; finish_private_run'
  const result = spawnSync("bash", ["-c", code, "fixture", f.script], { env: f.environment, encoding: "utf8", timeout: 10000 })
  assert.ifError(result.error)
  assert.equal(result.status, 3)
  assert.match(result.stdout, /incomplete workflow/i)
})

test("the final classifier distinguishes complete, failed and failed-plus-incomplete outcomes", async t => {
  const f = await fixture(t)
  for (const [failed, incomplete, expected] of [[0, 0, 0], [1, 0, 1], [1, 1, 1]]) {
    const code = 'source "$1"; FAILED="$2"; INCOMPLETE="$3"; log() { printf "%s\\n" "$*"; }; finish_private_run'
    const result = spawnSync("bash", ["-c", code, "fixture", f.script, String(failed), String(incomplete)], { env: f.environment, encoding: "utf8", timeout: 10000 })
    assert.ifError(result.error)
    assert.equal(result.status, expected)
  }
})

test("a linked deployed member is refused before private settings or Shell activation", async t => {
  const f = await fixture(t, { executeBusChild: true })
  const protectedFile = path.join(f.root, "protected.txt")
  await writeFile(protectedFile, "Keep this unrelated synthetic file.\n")
  const member = path.join(f.root, "home/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local/metadata.json")
  await rm(member)
  await symlink(protectedFile, member)
  const result = f.run()
  assert.equal(result.status, 2)
  assert.match(result.stdout, /deployed extension member is missing\/nonregular\/linked/)
  assert.equal((await f.calls()).length, 1, "only the fake private-bus boundary may run")
  assert.equal(await readFile(protectedFile, "utf8"), "Keep this unrelated synthetic file.\n")
})

test("harness stop requests bind to owned jobs and refuse an unrelated fixture PID", async t => {
  const f = await fixture(t)
  const unrelated = spawn(process.execPath, ["-e", "setTimeout(() => {}, 30000)"], { stdio: "ignore" })
  try {
    const base = path.join(f.root, "owned-jobs")
    await mkdir(base, { mode: 0o700 })
    const code = `set -e
source "$1"
BASE="$2"; REPO="$3"; OWNED_JOBS=(); OWNED_PIDS=()
log() { printf '%s\\n' "$*"; }
start_owned fixture "$BASE/child.log" python3 -c 'import time; time.sleep(30)'
job="$OWNED_JOB"
pid=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["processId"])' "$job/receipt.json")
if stop_owned_target "$4"; then exit 90; else [ "$?" -eq 1 ] || exit 91; fi
stop_owned_target "$pid"
wait "$OWNED_PID"
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); assert d["reaped"] and d["reason"] == "stop-requested"' "$job/receipt.json"
`
    const result = spawnSync("bash", ["-c", code, "fixture", f.script, base, f.root + "/repo", String(unrelated.pid)], { env: f.environment, encoding: "utf8", timeout: 10000 })
    assert.ifError(result.error)
    assert.equal(result.status, 0, result.stderr)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(unrelated.exitCode, null, "unrelated test-owned child must not be signaled")
  } finally {
    if (unrelated.exitCode === null) {
      unrelated.kill("SIGTERM")
      await once(unrelated, "exit")
    }
  }
})

test("owned-process kernel-handle controls run without desktop or external processes", () => {
  const result = spawnSync("python3", ["-B", "-m", "unittest", "-v", "test_owned_process"], {
    cwd: new URL(".", import.meta.url), encoding: "utf8", timeout: 20000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  })
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /Ran 9 tests/)
})

test("a missing supervisor fails before the private-bus boundary or settings activation", async t => {
  const f = await fixture(t)
  await rm(path.join(f.root, "repo/tools/gnome-window-control/owned-process.py"))
  const result = f.run()
  assert.equal(result.status, 2)
  assert.match(result.stderr, /refusing before private activation/)
  await assert.rejects(readFile(f.log), { code: "ENOENT" })
})

// Documentation contracts below are derived from the sources they describe:
// scripts/deploy-window-control.py (FILES, SOURCE_OVERRIDES),
// .opencode/plugins/computer-use/acceptance-safety.mjs (parseAcceptanceArgs) and
// desktop-workflow-acceptance.py (argparse). They read text only and never run a
// helper, so a doc or a declaration can drift without a live seat.
const REPO_ROOT = new URL("../../", import.meta.url)
const DOC_CONTRACT = "deployment-docs"
const COUNT_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }

function parseDeployerManagedSet(source) {
  const files = /^FILES\s*=\s*\(([^)]*)\)/m.exec(source)
  if (!files) throw new Error(`${DOC_CONTRACT}: the deployer FILES tuple is not parseable`)
  const names = [...files[1].matchAll(/"([^"]+)"/g)].map(match => match[1])
  if (names.length < 2 || !names.every(name => /\.(?:json|m?js)$/u.test(name)))
    throw new Error(`${DOC_CONTRACT}: the deployer FILES tuple does not list managed files`)
  const block = /^SOURCE_OVERRIDES\s*=\s*\{([\s\S]*?)^\}/m.exec(source)
  if (!block) throw new Error(`${DOC_CONTRACT}: the deployer SOURCE_OVERRIDES mapping is not parseable`)
  const overrides = [...block[1].matchAll(/"([^"]+)"\s*:\s*Path\(__file__\)[\s\S]*?parents\[(\d+)\][\s\S]*?\/\s*"([^"]+)"/g)]
    .map(match => ({ key: match[1], parents: Number(match[2]), path: match[3] }))
  return { names, overrides }
}

function backtickRuns(text) {
  const runs = []
  let run = []
  let previous = null
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const token = { value: match[1], start: match.index, end: match.index + match[0].length }
    if (previous !== null) {
      const gap = text.slice(previous.end, token.start)
      if (!/^[\s,]+$/u.test(gap) && !/^[\s,]*and\s*,?[\s]*$/iu.test(gap)) {
        runs.push(run)
        run = []
      }
    }
    run.push(token)
    previous = token
  }
  if (run.length > 0) runs.push(run)
  return runs
}

function documentedList(section, names) {
  const scored = backtickRuns(section).map(run => {
    const listed = new Set(run.map(token => path.basename(token.value)))
    return { listed, hits: [...listed].filter(name => names.includes(name)).length }
  })
  scored.sort((first, second) => second.hits - first.hits)
  return scored.length > 0 && scored[0].hits >= 2 ? scored[0].listed : null
}

function assertDeploymentDocs({ readme, deployer }) {
  const { names, overrides } = parseDeployerManagedSet(deployer)
  const section = readme.split(/^## /m).find(part => part.startsWith("Source and deployment"))
  if (!section) throw new Error(`${DOC_CONTRACT}: the README has no Source and deployment section`)
  const listed = documentedList(section, names)
  if (!listed) throw new Error(`${DOC_CONTRACT}: the README does not enumerate the managed files`)
  const missing = names.filter(name => !listed.has(name))
  if (missing.length > 0) throw new Error(`${DOC_CONTRACT}: the README omits managed file(s): ${missing.join(", ")}`)
  const unmanaged = [...listed].filter(name => !names.includes(name))
  if (unmanaged.length > 0) throw new Error(`${DOC_CONTRACT}: the README lists entries the deployer does not manage: ${unmanaged.join(", ")}`)
  const claims = [...section.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:managed\s+)?files\b/giu)]
  if (claims.length === 0) throw new Error(`${DOC_CONTRACT}: the README states no managed-file count`)
  for (const claim of claims) {
    if (COUNT_WORDS[claim[1].toLowerCase()] !== names.length)
      throw new Error(`${DOC_CONTRACT}: the README claims ${claim[1]} files but the deployer manages ${names.length}`)
  }
  for (const override of overrides) {
    if (override.parents !== 1) throw new Error(`${DOC_CONTRACT}: ${override.key} override is not repo-root-relative`)
    if (path.basename(override.path) !== override.key) throw new Error(`${DOC_CONTRACT}: ${override.key} override name disagrees with its key`)
    if (!names.includes(override.key)) throw new Error(`${DOC_CONTRACT}: ${override.key} is overridden but not managed`)
    if (!section.includes("`" + override.path + "`")) throw new Error(`${DOC_CONTRACT}: the README does not cite the shared source ${override.path}`)
  }
  return { names, overrides }
}

function parseAcceptanceParser(source) {
  const list = /!\s*\[([^\]]*)\]\.includes\(name\)/u.exec(source)
  if (!list) throw new Error(`${DOC_CONTRACT}: the acceptance parser option list is not parseable`)
  const accepted = new Set([...list[1].matchAll(/"(--[a-z-]+)"/g)].map(match => match[1]))
  if (/name\s*===\s*"--allow-effects"/u.test(source)) accepted.add("--allow-effects")
  const required = [...source.matchAll(/requiredExact\(values\.get\("(--[a-z-]+)"\)/g)].map(match => match[1])
  if (required.length < 2) throw new Error(`${DOC_CONTRACT}: the acceptance parser required flags are not parseable`)
  return { accepted, required }
}

function parseArgparseFlags(source) {
  const flags = new Set([...source.matchAll(/add_argument\(\s*"(--[a-z-]+)"/g)].map(match => match[1]))
  if (flags.size === 0) throw new Error(`${DOC_CONTRACT}: no argparse flags were parsed`)
  return flags
}

function assertRunbookFlagOwnership({ runbook, harnesses, parser, argparse }) {
  const paragraphs = runbook.split(/\n\s*\n/)
  for (const harness of harnesses) {
    if (!/parseAcceptanceArgs\s*\(/u.test(harness.source))
      throw new Error(`${DOC_CONTRACT}: ${harness.name} does not use the shared acceptance parser`)
    const stated = paragraphs.some(paragraph =>
      paragraph.includes(harness.name) && parser.required.every(flag => paragraph.includes(flag)))
    if (!stated) throw new Error(`${DOC_CONTRACT}: the runbook does not tie ${harness.name} to ${parser.required.join(" ")}`)
  }
  if (!paragraphs.some(paragraph => harnesses.every(harness => paragraph.includes(harness.name))))
    throw new Error(`${DOC_CONTRACT}: the runbook does not name both canonical harnesses in one ownership statement`)
  if (parser.accepted.has("--desktop-id"))
    throw new Error(`${DOC_CONTRACT}: the canonical acceptance parser accepts --desktop-id`)
  if (!argparse.has("--desktop-id"))
    throw new Error(`${DOC_CONTRACT}: desktop-workflow-acceptance.py does not declare --desktop-id`)
  for (const foreign of ["--window-id", "--app-id"])
    if (argparse.has(foreign)) throw new Error(`${DOC_CONTRACT}: desktop-workflow-acceptance.py unexpectedly declares ${foreign}`)
  const fenced = [...runbook.matchAll(/```[a-z]*\n([\s\S]*?)```/g)].map(match => match[1])
  const block = fenced.find(text => text.includes("desktop-workflow-acceptance.py"))
  if (!block) throw new Error(`${DOC_CONTRACT}: the runbook has no invocation block for desktop-workflow-acceptance.py`)
  for (const match of block.matchAll(/(--[a-z-]+)/g))
    if (!argparse.has(match[1])) throw new Error(`${DOC_CONTRACT}: the runbook invokes desktop-workflow-acceptance.py with undeclared ${match[1]}`)
}

async function readContractDocs() {
  const [readme, runbook, deployer, parser, live, resilience, workflow] = await Promise.all([
    readFile(new URL("tools/gnome-window-control/README.md", REPO_ROOT), "utf8"),
    readFile(new URL("docs/codex-parity/acceptance-runbook.md", REPO_ROOT), "utf8"),
    readFile(new URL("scripts/deploy-window-control.py", REPO_ROOT), "utf8"),
    readFile(new URL(".opencode/plugins/computer-use/acceptance-safety.mjs", REPO_ROOT), "utf8"),
    readFile(new URL(".opencode/plugins/computer-use/live-desktop-acceptance.mjs", REPO_ROOT), "utf8"),
    readFile(new URL(".opencode/plugins/computer-use/resilience-acceptance.mjs", REPO_ROOT), "utf8"),
    readFile(new URL("tools/gnome-window-control/desktop-workflow-acceptance.py", REPO_ROOT), "utf8"),
  ])
  return { readme, runbook, deployer, parser, live, resilience, workflow }
}

test("deployment documentation matches the deployer managed set and shared override", async () => {
  const docs = await readContractDocs()
  const parsed = parseDeployerManagedSet(docs.deployer)
  assert.ok(parsed.names.length >= 3, "the deployer tuple must parse as a real managed set")
  assert.ok(parsed.overrides.length >= 1, "the shared contract override must be present")
  assertDeploymentDocs(docs)
})

test("deployment documentation rejects an obsolete, miscounted or unmanaged file list", async () => {
  const docs = await readContractDocs()
  assertDeploymentDocs(docs)
  const seven = /`metadata\.json`, `extension\.js`, `policy\.mjs`,\s*`capture\.mjs`, `input\.mjs`, `launch\.mjs`, and `runtime-contract\.mjs`/u
  const obsolete = docs.readme.replace(seven, "`metadata.json`, `extension.js`, and `policy.mjs`")
  assert.ok(obsolete !== docs.readme, "the obsolete-list mutation must apply")
  assert.throws(() => assertDeploymentDocs({ ...docs, readme: obsolete }), /deployment-docs/u)
  const miscounted = docs.readme.replace("seven managed files above", "three managed files above")
  assert.ok(miscounted !== docs.readme, "the count mutation must apply")
  assert.throws(() => assertDeploymentDocs({ ...docs, readme: miscounted }), /deployment-docs/u)
  const missing = docs.readme.replace("`input.mjs`, ", "")
  assert.ok(missing !== docs.readme, "the missing-module mutation must apply")
  assert.throws(() => assertDeploymentDocs({ ...docs, readme: missing }), /deployment-docs/u)
  const wrongOverride = docs.readme.replace("tools/computer-use-runtime/src/runtime-contract.mjs", "tools/gnome-window-control/runtime-contract.mjs")
  assert.ok(wrongOverride !== docs.readme, "the override mutation must apply")
  assert.throws(() => assertDeploymentDocs({ ...docs, readme: wrongOverride }), /deployment-docs/u)
  const invented = docs.readme.replace("and `runtime-contract.mjs`", "`runtime-contract.mjs`, and `invented.txt`")
  assert.ok(invented !== docs.readme, "the unmanaged-entry mutation must apply")
  assert.throws(() => assertDeploymentDocs({ ...docs, readme: invented }), /deployment-docs/u)
})

test("acceptance runbook helper flags match the harness parser and argparse declarations", async () => {
  const docs = await readContractDocs()
  const parser = parseAcceptanceParser(docs.parser)
  const argparse = parseArgparseFlags(docs.workflow)
  assert.ok(parser.required.includes("--window-id"), "the harnesses require a window ID")
  assert.ok(parser.required.includes("--app-id"), "the harnesses require an app ID")
  assert.equal(parser.accepted.has("--desktop-id"), false)
  assert.ok(argparse.has("--desktop-id"))
  const harnesses = [{ name: "live-desktop-acceptance.mjs", source: docs.live }, { name: "resilience-acceptance.mjs", source: docs.resilience }]
  assertRunbookFlagOwnership({ runbook: docs.runbook, harnesses, parser, argparse })
})

test("acceptance runbook rejects unnamed harnesses or a reassigned --desktop-id", async () => {
  const docs = await readContractDocs()
  const paragraph = docs.runbook.split(/\n\s*\n/).find(text =>
    text.includes("live-desktop-acceptance.mjs") && text.includes("resilience-acceptance.mjs"))
  assert.ok(paragraph, "the harness ownership paragraph must be discoverable")
  const parser = parseAcceptanceParser(docs.parser)
  const argparse = parseArgparseFlags(docs.workflow)
  const harnesses = [{ name: "live-desktop-acceptance.mjs", source: docs.live }, { name: "resilience-acceptance.mjs", source: docs.resilience }]
  assertRunbookFlagOwnership({ runbook: docs.runbook, harnesses, parser, argparse })
  const misattributed = docs.runbook.replace(paragraph, paragraph.replace('--app-id "$APP_ID"', '--desktop-id "$DESKTOP_ID"'))
  assert.ok(misattributed !== docs.runbook, "the flag-ownership mutation must apply")
  assert.throws(() => assertRunbookFlagOwnership({ runbook: misattributed, harnesses, parser, argparse }), /deployment-docs/u)
  const unnamed = docs.runbook.replace(paragraph, paragraph.replace(/\[`(?:live-desktop|resilience)-acceptance\.mjs`\]\([^)]*\)/g, "the harnesses"))
  assert.ok(unnamed !== docs.runbook, "the unnamed-harness mutation must apply")
  assert.throws(() => assertRunbookFlagOwnership({ runbook: unnamed, harnesses, parser, argparse }), /deployment-docs/u)
})
