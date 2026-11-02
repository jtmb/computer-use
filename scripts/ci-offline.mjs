#!/usr/bin/env node
// Credential-free offline contributor checks.
//
// This runner is intentionally boring: it spawns a small, explicit set of
// source/fixture checks from its own worktree. Its default steps never install packages,
// contacts the network, invokes models, starts browsers/audio/desktop services,
// reads user profiles or writes to source. Operational environment checks
// (scripts/health-check.sh) are deliberately separate and are not run here.
// Additional command hooks must be reviewed separately; they are not sandboxed.

import { spawnSync } from "node:child_process"
import { access, stat } from "node:fs/promises"
import { constants as fsConstants } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const MIN_NODE_MAJOR = 20
const DEFAULT_TIMEOUT_MS = 180_000
const MAX_OUTPUT_BYTES = 10 * 1024 * 1024

// Explicit, reviewed source/fixture checks. Keep this list narrow: adding a test here is
// a claim that it needs no network, credentials, desktop session or real user data.
export const REPO_CONTRACT_TESTS = [
  "scripts/instruction-architecture.test.mjs",
  "scripts/documentation-portability.test.mjs",
  "scripts/shared-skill-portability.test.mjs",
  "scripts/local-artifact-guidance.test.mjs",
  "scripts/deploy-global-config.test.mjs",
  "tools/gnome-window-control/fresh-shell-acceptance.test.mjs",
  "tools/gnome-window-control/input-zero-duration.test.mjs",
  "scripts/features-contract.test.mjs",
  "scripts/request-coverage-audit.test.mjs",
  "scripts/planning-contract.test.mjs",
  "scripts/goal-workflow.test.mjs",
  "scripts/handoff-resume-contract.test.mjs",
  "scripts/autonomy-contract.test.mjs",
  "scripts/orchestration-methods.test.mjs",
  "scripts/repo-memory.test.mjs",
  "scripts/decision-memory-contract.test.mjs",
  ".opencode/plugins/memory/acceptance/native-host.test.mjs",
  "scripts/health-check.test.mjs",
  "scripts/document-metadata-contract.test.mjs",
  "scripts/document-security-contract.test.mjs",
  "scripts/inbox-retirement.test.mjs",
  "scripts/inbox-guidance.test.mjs",
  "scripts/copy-session-id.test.mjs",
  "scripts/github-permissions.test.mjs",
]

const NEW_TESTS = ["scripts/ci-offline.test.mjs", "scripts/codeowners-contract.test.mjs"]
const CORPUS_TESTS = ["corpus", "grader", "validator", "native-trace", "calibration-evidence", "capture-acquisition", "assistant-audit", "assistant-audit-summary", "ownership-evidence", "saved-loaded-evidence", "orchestration-recall-evidence", "branch-preservation-evidence", "model-metadata-evidence", "source-deployment-evidence"].map(name => `evals/agent-rules/tests/${name}.test.mjs`)

export class UsageError extends Error {}

export function parseArgs(argv) {
  const options = {
    help: false,
    list: false,
    json: false,
    noGit: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    corpusDir: null,
    corpusCommand: null,
    verbose: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--help" || arg === "-h") options.help = true
    else if (arg === "--list") options.list = true
    else if (arg === "--json") options.json = true
    else if (arg === "--no-git") options.noGit = true
    else if (arg === "--verbose") options.verbose = true
    else if (arg === "--corpus" || arg.startsWith("--corpus=")) {
      if (options.corpusCommand) throw new UsageError("--corpus and --corpus-cmd are mutually exclusive")
      const value = arg.includes("=") ? arg.slice("--corpus=".length) : argv[++index]
      if (!value) throw new UsageError("--corpus requires a directory")
      options.corpusDir = value
    } else if (arg === "--corpus-cmd") {
      if (options.corpusDir) throw new UsageError("--corpus and --corpus-cmd are mutually exclusive")
      const command = argv.slice(index + 1)
      if (command.length === 0) throw new UsageError("--corpus-cmd requires an executable followed by its arguments")
      options.corpusCommand = command
      break
    } else if (arg === "--timeout" || arg.startsWith("--timeout=")) {
      const value = arg.includes("=") ? arg.slice("--timeout=".length) : argv[++index]
      const timeout = Number(value)
      if (!Number.isInteger(timeout) || timeout < 1_000 || timeout > 3_600_000)
        throw new UsageError("--timeout must be an integer between 1000 and 3600000 milliseconds")
      options.timeoutMs = timeout
    } else {
      throw new UsageError(`unknown argument: ${arg}`)
    }
  }

  return options
}

function nodeStep(id, title, args) {
  return { id, title, kind: "required", dependencies: ["node"], commands: [[process.execPath, args]] }
}

export function buildSteps(options) {
  const steps = [
    {
      id: "node-syntax",
      title: "Node syntax for the offline runner and its tests",
      kind: "required",
      dependencies: ["node"],
      commands: [
        [process.execPath, ["--check", "scripts/ci-offline.mjs"]],
        ...NEW_TESTS.map((file) => [process.execPath, ["--check", file]]),
      ],
    },
    nodeStep("contract-tests", "Offline CI and ownership contract tests", [
      "--test",
      "--test-reporter=spec",
      ...NEW_TESTS,
    ]),
    {
      id: "repo-contracts",
      title: "Curated source/fixture repository contract tests",
      kind: "required",
      dependencies: ["node", "git", "bash", "python3", "cp", "cmp", "diff", "mkdir", "rm", "date", "env", "mktemp", "chmod", "basename", "dirname", "tee", "seq", "mkfifo"],
      commands: [[process.execPath, ["--test", "--test-reporter=spec", ...REPO_CONTRACT_TESTS]]],
    },
    {
      id: "checkout-safety-tests",
      title: "Checkout prompt and isolated Git preflight safety checks",
      kind: "required",
      dependencies: ["node", "git", "mkfifo"],
      commands: [[process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=spec",
        "scripts/checkout-command.test.mjs", "scripts/checkout-preflight.test.mjs"]]],
    },
    nodeStep("corpus-validation", "Canonical candidate corpus validation", ["evals/agent-rules/validate.mjs"]),
    {
      id: "plugin-types",
      title: "Strict type check for the computer-use plugin sources and tests",
      kind: "required",
      dependencies: ["node"],
      commands: [[process.execPath, ["tools/computer-use-browser/node_modules/typescript/lib/tsc.js", "-p", ".opencode/plugins/computer-use/tsconfig.json"]]],
    },
    nodeStep("monitor-budget-tests", "Aggregate monitor accounting and cleanup guards (no compiler/process fixture)", [
      "--test", "--test-concurrency=1", "--test-reporter=spec",
      "tools/opencode-native-row/full-graph-monitor-budget.test.mjs",
    ]),
    nodeStep("corpus-tests", "Corpus validator and grader regressions", ["--test", "--test-reporter=spec", ...CORPUS_TESTS]),
    nodeStep("corpus-controls", "Known-good, known-bad and alternate synthetic controls", ["evals/agent-rules/grade.mjs", "--controls", "all"]),
    {
      id: "title-stage-tests",
      title: "Synthetic title staging, readonly-input, overlay, provenance, shared-budget and composed callbacks",
      kind: "required",
      dependencies: ["node", "mkfifo"],
      commands: [[process.execPath, ["--test", "--test-reporter=spec", "tools/opencode-title-cas/typecheck-stage.test.mjs", "tools/opencode-title-cas/readonly-input.test.mjs", "tools/opencode-title-cas/overlay-set.test.mjs", "tools/opencode-title-cas/patch-provenance.test.mjs", "tools/opencode-title-cas/input-budget.test.mjs", "tools/opencode-title-cas/overlay-input.test.mjs"]]],
    },
    {
      id: "private-stage-tests",
      title: "Synthetic private staging preservation and bounded transport checks",
      kind: "required",
      dependencies: ["python3"],
      commands: [
        ["python3", ["-s", "-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_private_secret_stage.py", "-v"]],
      ],
    },
    {
      id: "office-package-tests",
      title: "Office ZIP, dependency preflight and offline trusted-isolation checks",
      kind: "required",
      dependencies: ["python3"],
      commands: [
        ["python3", ["-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_office_package.py", "-v"]],
        ["python3", ["-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_document_sandbox_probe.py", "-v"]],
        ["python3", ["-s", "-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_document_authoring_preflight.py", "-v"]],
        ["python3", ["-s", "-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_document_metadata.py", "-v"]],
      ],
    },
  ]

  if (options.noGit) {
    steps.push({
      id: "git-whitespace",
      title: "Local dirty-tree whitespace (not applicable in a clean checkout)",
      kind: "not-applicable",
      reason: "--no-git: a clean hosted checkout has no local diff to inspect",
      dependencies: [],
      commands: [],
    })
  } else {
    steps.push({
      id: "git-whitespace",
      title: "Local dirty-tree whitespace",
      kind: "required",
      dependencies: ["git"],
      commands: [
        ["git", ["--no-optional-locks", "diff", "--check"]],
        ["git", ["--no-optional-locks", "diff", "--cached", "--check"]],
      ],
    })
  }

  return steps
}

async function isExecutableFile(candidate) {
  try {
    await access(candidate, fsConstants.X_OK)
    const info = await stat(candidate)
    return info.isFile()
  } catch {
    return false
  }
}

async function isReadableFile(candidate) {
  try {
    await access(candidate, fsConstants.R_OK)
    const info = await stat(candidate)
    return info.isFile()
  } catch {
    return false
  }
}

async function findOnPath(command) {
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    if (!directory) continue
    if (await isExecutableFile(path.join(directory, command))) return path.join(directory, command)
  }
  return null
}

export async function resolveCommand(command) {
  const [executable, ...args] = command
  if (executable.includes("/") || executable.includes(path.sep)) {
    const resolved = path.resolve(process.cwd(), executable)
    return (await isExecutableFile(resolved))
      ? { executable: resolved, args, display: command.join(" "), cwd: process.cwd() }
      : null
  }
  const resolved = await findOnPath(executable)
  return resolved ? { executable: resolved, args, display: command.join(" "), cwd: process.cwd() } : null
}

const CORPUS_ENTRYPOINTS = ["run-offline.mjs", "run.mjs"]

export async function planCorpus(options) {
  if (options.corpusCommand) {
    const resolved = await resolveCommand(options.corpusCommand)
    return resolved
      ? { requested: true, status: "ready", ...resolved }
      : {
          requested: true,
          status: "unavailable",
          reason: `corpus command executable not found: ${options.corpusCommand[0]}`,
        }
  }

  if (!options.corpusDir) return { requested: false, status: "not-requested" }

  const directory = path.resolve(process.cwd(), options.corpusDir)
  try {
    const info = await stat(directory)
    if (!info.isDirectory()) {
      return { requested: true, status: "unavailable", reason: `corpus path is not a directory: ${directory}` }
    }
  } catch {
    return { requested: true, status: "unavailable", reason: `corpus directory not found: ${directory}` }
  }

  for (const entry of CORPUS_ENTRYPOINTS) {
    const candidate = path.join(directory, entry)
    if (await isReadableFile(candidate)) {
      return {
        requested: true,
        status: "ready",
        executable: process.execPath,
        args: [candidate],
        display: `node ${path.relative(process.cwd(), candidate) || candidate}`,
        cwd: directory,
      }
    }
  }
  return {
    requested: true,
    status: "unavailable",
    reason: `no offline runner found in ${directory}; looked for ${CORPUS_ENTRYPOINTS.join(", ")}. Bind the real corpus command with --corpus-cmd after its owner publishes the interface.`,
  }
}

function checkNodeVersion() {
  const major = Number.parseInt(process.versions.node.split(".")[0], 10)
  return Number.isInteger(major) && major >= MIN_NODE_MAJOR
    ? null
    : `Node ${MIN_NODE_MAJOR}+ required; running ${process.versions.node}`
}

async function dependencyProblem(step) {
  if (step.dependencies.includes("node")) {
    const problem = checkNodeVersion()
    if (problem) return problem
  }
  for (const dependency of step.dependencies) {
    if (dependency === "node") continue
    if (!(await findOnPath(dependency))) return `required executable not found on PATH: ${dependency}`
  }
  return null
}

export function runCommand(step, cwd, timeoutMs) {
  const outputs = []
  for (const [executable, args] of step.commands) {
    const result = spawnSync(executable, args, {
      cwd,
      env: { ...process.env, CI_OFFLINE: "1", NO_COLOR: "1" },
      encoding: "utf8",
      timeout: timeoutMs,
      maxBuffer: MAX_OUTPUT_BYTES,
    })
    const captured = `${result.stdout || ""}${result.stderr || ""}`.trim()
    if (captured) outputs.push(captured)
    if (result.error) {
      const reason =
        result.error.code === "ETIMEDOUT"
          ? `timed out after ${timeoutMs} ms: ${executable} ${args.join(" ")}`
          : `${result.error.code || "spawn error"}: ${result.error.message}`
      return { ok: false, reason, output: outputs.join("\n") }
    }
    if (result.status !== 0) {
      return {
        ok: false,
        reason: `exit ${result.status}: ${path.basename(executable)} ${args.join(" ")}`,
        output: outputs.join("\n"),
      }
    }
  }
  return { ok: true, output: outputs.join("\n") }
}

export function runCorpus(corpus, timeoutMs) {
  if (corpus.status !== "ready") return corpus
  const start = Date.now()
  const result = spawnSync(corpus.executable, corpus.args, {
    cwd: corpus.cwd || ROOT,
    env: { ...process.env, CI_OFFLINE: "1", NO_COLOR: "1" },
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: MAX_OUTPUT_BYTES,
  })
  if (result.error) {
    const reason =
      result.error.code === "ETIMEDOUT"
        ? `corpus command timed out after ${timeoutMs} ms`
        : `${result.error.code || "spawn error"}: ${result.error.message}`
    return { ...corpus, status: "failed", reason, durationMs: Date.now() - start }
  }
  if (result.status !== 0) {
    return {
      ...corpus,
      status: "failed",
      reason: `corpus command exited ${result.status}`,
      output: `${result.stdout || ""}${result.stderr || ""}`.trim(),
      durationMs: Date.now() - start,
    }
  }
  return { ...corpus, status: "passed", durationMs: Date.now() - start }
}

export async function runChecks(options) {
  const steps = buildSteps(options)
  const results = []
  const startedAt = Date.now()

  for (const step of steps) {
    const start = Date.now()
    if (step.kind === "not-applicable") {
      results.push({ ...step, status: "not-applicable", durationMs: 0 })
      continue
    }
    const problem = await dependencyProblem(step)
    if (problem) {
      results.push({ ...step, status: "unavailable", reason: problem, durationMs: Date.now() - start })
      continue
    }
    const outcome = runCommand(step, ROOT, options.timeoutMs)
    results.push({
      ...step,
      status: outcome.ok ? "passed" : "failed",
      ...(outcome.reason ? { reason: outcome.reason } : {}),
      ...(outcome.output ? { output: outcome.output } : {}),
      durationMs: Date.now() - start,
    })
  }

  const plannedCorpus = await planCorpus(options)
  const corpus = runCorpus(plannedCorpus, options.timeoutMs)
  const totalMs = Date.now() - startedAt
  const failed = results.filter((step) => step.status === "failed" || step.status === "unavailable")
  const corpusFailed = corpus.status === "unavailable" || corpus.status === "failed"
  return { ok: failed.length === 0 && !corpusFailed, results, corpus, totalMs }
}

function count(results, status) {
  return results.filter((step) => step.status === status).length
}

function printHuman(report, options) {
  console.log("Offline CI — credential-free source/fixture checks")
  console.log(`  node ${process.versions.node} · root ${ROOT}`)
  for (const step of report.results) {
    const seconds = (step.durationMs / 1000).toFixed(2)
    console.log(`  [${step.status}] ${step.id} (${seconds}s) — ${step.title}`)
    if (step.reason) console.log(`      reason: ${step.reason}`)
    if ((step.status === "failed" || options.verbose) && step.output) {
      for (const line of step.output.split("\n")) console.log(`      ${line}`)
    }
  }

  if (report.corpus.status === "not-requested") {
    console.log("  [not-requested] additional-corpus-integration — canonical corpus is required above; flags select an extra reviewed command")
  } else if (report.corpus.status === "passed") {
    console.log(`  [passed] corpus-integration — ${report.corpus.display}`)
  } else {
    console.log(`  [${report.corpus.status}] corpus-integration — ${report.corpus.reason}`)
    if (report.corpus.output) {
      for (const line of report.corpus.output.split("\n")) console.log(`      ${line}`)
    }
  }

  const corpusUnavailable = report.corpus.status === "unavailable" ? 1 : 0
  const corpusFailed = report.corpus.status === "failed" ? 1 : 0
  console.log(
    `Result: ${report.ok ? "PASS" : "FAIL"} (${count(report.results, "passed")} passed, ` +
      `${count(report.results, "failed") + corpusFailed} failed, ` +
      `${count(report.results, "unavailable") + corpusUnavailable} unavailable, ` +
      `${count(report.results, "not-applicable")} not applicable)`,
  )
  console.log("Coverage: source/fixture checks and synthetic corpus controls only. No hosted checks, git history,")
  console.log("credentials, desktop sessions or real user data. These checks do not establish deployed integration or model behavior.")
}

export async function main(argv, io = {}) {
  const stdout = io.stdout || console.log
  const print = (message) => stdout(message)
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    print(`error: ${error.message}`)
    print("Run with --help for usage.")
    return 2
  }

  if (options.help) {
    print(usage())
    return 0
  }

  if (options.list) {
    for (const step of buildSteps(options)) {
      print(`${step.id}\t${step.kind}\t${step.title}`)
    }
    print(`additional-corpus-integration\toptional\t--corpus <dir> or --corpus-cmd <cmd...>`)
    return 0
  }

  const report = await runChecks(options)
  if (options.json) print(JSON.stringify(report, null, 2))
  else printHuman(report, options)
  return report.ok ? 0 : 1
}

function usage() {
  return `Usage: node scripts/ci-offline.mjs [options]

Source/fixture checks only. No installs, network, models, browsers, audio, desktop
services, user profiles or real user data.

Options:
  --list                 List planned steps without running them.
  --json                 Print the machine-readable report.
  --no-git               Mark local dirty-tree checks not applicable (clean CI checkout).
  --timeout <ms>         Per-command timeout (default ${DEFAULT_TIMEOUT_MS}).
  --corpus <dir>         Add a reviewed corpus runner discovered at <dir>/run-offline.mjs
                         or <dir>/run.mjs (provisional interface).
  --corpus-cmd <cmd...>  Add an explicit reviewed corpus command; consumes the rest of argv.
  --verbose              Print captured output for passing steps too.
  -h, --help             Show this help.

Exit codes: 0 all required checks passed; 1 failed or unavailable check; 2 usage.
The canonical agent-rules validator, tests and controls are required by default.
Flags select an additional command, not a sandbox: review it for offline safety.
A requested but missing interface fails the run.
`
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (invokedDirectly) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((error) => {
      console.error(`ci-offline: ${error.stack || error}`)
      process.exitCode = 1
    })
}
