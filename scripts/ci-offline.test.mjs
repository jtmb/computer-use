import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import test from "node:test"

import {
  REPO_CONTRACT_TESTS,
  UsageError,
  buildSteps,
  parseArgs,
  planCorpus,
  runCommand,
  runCorpus,
} from "./ci-offline.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const read = (file) => readFile(path.join(root, file), "utf8")

test("inbox retirement and decision-memory source regressions are required offline checks", () => {
  for (const file of ["scripts/inbox-retirement.test.mjs", "scripts/decision-memory-contract.test.mjs", "scripts/inbox-guidance.test.mjs"])
    assert.ok(REPO_CONTRACT_TESTS.includes(file), `${file} must run in the required repo-contracts step`)
})

test("plugin, tool and Python coverage steps cannot be dropped from offline CI", () => {
  const steps = buildSteps(parseArgs([]))
  const required = ["plugin-types", "goal-docs-types", "tool-plugin-types", "plugin-suites", "python-script-tests"]
  for (const id of required) {
    const step = steps.find(value => value.id === id)
    assert.ok(step, `${id} must exist`)
    assert.equal(step.kind, "required", `${id} must stay required`)
    assert.ok(step.commands.length > 0, `${id} must run something`)
  }
  assert.ok(REPO_CONTRACT_TESTS.includes("scripts/verification-receipt.test.mjs"))
})

test("document metadata evidence accounting is a required offline contract", () => {
  assert.ok(REPO_CONTRACT_TESTS.includes("scripts/document-metadata-contract.test.mjs"))
  assert.ok(REPO_CONTRACT_TESTS.includes("scripts/document-security-contract.test.mjs"))
})

test("coverage reader budget and lineage regressions are required offline checks", () => {
  assert.ok(REPO_CONTRACT_TESTS.includes("scripts/request-coverage-audit.test.mjs"))
  const step = buildSteps(parseArgs([])).find(value => value.id === "repo-contracts")
  assert.ok(step.dependencies.includes("mkfifo"), "the real FIFO reader control requires its executable")
})

test("actual branch-preservation failure evidence is required offline CI", () => {
  const step = buildSteps(parseArgs([])).find(value => value.id === "corpus-tests")
  assert.equal(step.kind, "required")
  assert.ok(step.commands[0][1].includes("evals/agent-rules/tests/branch-preservation-evidence.test.mjs"))
})

test("body-free assistant summaries and model-metadata evidence are required offline CI", () => {
  const step = buildSteps(parseArgs([])).find(value => value.id === "corpus-tests")
  for (const name of ["assistant-audit-summary", "model-metadata-evidence"]) {
    assert.ok(step.commands[0][1].includes(`evals/agent-rules/tests/${name}.test.mjs`))
  }
})

test("unprompted source/deployment evidence and its non-promotion limits are required offline CI", () => {
  const step = buildSteps(parseArgs([])).find(value => value.id === "corpus-tests")
  assert.equal(step.kind, "required")
  assert.ok(step.commands[0][1].includes("evals/agent-rules/tests/source-deployment-evidence.test.mjs"))
})

test("checkout safety suites are required offline checks using only isolated Git fixtures", () => {
  const step = buildSteps(parseArgs([])).find(value => value.id === "checkout-safety-tests")
  assert.equal(step?.kind, "required")
  assert.deepEqual(step.dependencies, ["node", "git", "mkfifo"])
  assert.deepEqual(step.commands, [[process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=spec",
    "scripts/checkout-command.test.mjs", "scripts/checkout-preflight.test.mjs"]]])
})

test("title staging and readonly-input safety tests are required without native checkout or compiler prerequisites", () => {
  const step = buildSteps(parseArgs([])).find(value => value.id === "title-stage-tests")
  assert.equal(step?.kind, "required")
  assert.deepEqual(step.dependencies, ["node", "mkfifo"])
  assert.deepEqual(step.commands, [[process.execPath, ["--test", "--test-reporter=spec", "tools/opencode-title-cas/typecheck-stage.test.mjs", "tools/opencode-title-cas/readonly-input.test.mjs", "tools/opencode-title-cas/overlay-set.test.mjs", "tools/opencode-title-cas/patch-provenance.test.mjs", "tools/opencode-title-cas/input-budget.test.mjs", "tools/opencode-title-cas/overlay-input.test.mjs"]]])
})

test("private staging preservation and pre-read capture limits are required offline checks", () => {
  const steps = buildSteps(parseArgs([]))
  const corpus = steps.find(step => step.id === "corpus-tests")
  assert.ok(corpus.commands[0][1].includes("evals/agent-rules/tests/capture-acquisition.test.mjs"))
  assert.ok(corpus.commands[0][1].includes("evals/agent-rules/tests/assistant-audit.test.mjs"))
  assert.ok(corpus.commands[0][1].includes("evals/agent-rules/tests/ownership-evidence.test.mjs"))
  assert.ok(corpus.commands[0][1].includes("evals/agent-rules/tests/saved-loaded-evidence.test.mjs"))
  assert.ok(corpus.commands[0][1].includes("evals/agent-rules/tests/orchestration-recall-evidence.test.mjs"))
  const staging = steps.find(step => step.id === "private-stage-tests")
  assert.equal(staging?.kind, "required")
  assert.deepEqual(staging.commands, [
    ["python3", ["-s", "-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_private_secret_stage.py", "-v"]],
  ])
})

test("aggregate monitor guards are required offline without compiler or process prerequisites", () => {
  const step = buildSteps(parseArgs([])).find(value => value.id === "monitor-budget-tests")
  assert.ok(step, "the aggregate monitor regression suite must not be omitted")
  assert.equal(step.kind, "required")
  assert.deepEqual(step.dependencies, ["node"])
  assert.deepEqual(step.commands, [[process.execPath, ["--test", "--test-concurrency=1", "--test-reporter=spec",
    "tools/opencode-native-row/full-graph-monitor-budget.test.mjs"]]])
})

test("memory native-host safety tests are required without launching the native host", () => {
  assert.ok(REPO_CONTRACT_TESTS.includes(".opencode/plugins/memory/acceptance/native-host.test.mjs"),
    "the isolated native-host helper safety suite must not be omitted")
  assert.ok(!REPO_CONTRACT_TESTS.includes(".opencode/plugins/memory/acceptance/native-host.mjs"),
    "the actual native launch is explicitly selected, never a default offline step")
})

test("health service-readiness source regressions are required with fake commands only", () => {
  assert.ok(REPO_CONTRACT_TESTS.includes("scripts/health-check.test.mjs"),
    "documented stopped output and discovery refusal must remain in offline checks")
})

test("zero-duration GNOME dispatch coverage is required with queued fake devices only", () => {
  assert.ok(REPO_CONTRACT_TESTS.includes("tools/gnome-window-control/input-zero-duration.test.mjs"),
    "default click dispatch, cleanup and no-delivery-ack coverage must not be omitted")
})

const CONTRACT_FIELDS = [
  "Objective",
  "Base",
  "Head",
  "Scope",
  "Skills",
  "Research",
  "Test commands",
  "Test results",
  "Runtime",
  "Risks",
  "Rollback",
  "Dependencies",
]
const NEW_FILES = [
  "CONTRIBUTING.md",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/ISSUE_TEMPLATE/agent-task.yml",
  ".github/workflows/ci.yml",
  "scripts/ci-offline.mjs",
  "scripts/ci-offline.test.mjs",
]

async function readAll(files) {
  return Promise.all(files.map(async (file) => [file, await read(file)]))
}

function workflowUses(text) {
  return [...text.matchAll(/^\s*uses:\s*(\S+)\s*$/gm)].map((match) => match[1])
}

function assertIssueForm(text) {
  assert.doesNotMatch(text, /\t/, "issue form must not contain tab indentation")
  const lines = text.split("\n")
  const topLevel = new Map()
  for (const line of lines) {
    const match = line.match(/^([a-z][a-z-]*):(?:\s*(.*))?$/)
    if (match) topLevel.set(match[1], (match[2] || "").trim())
  }
  for (const key of ["name", "description", "title"]) assert.ok(topLevel.get(key), `missing ${key}`)

  const bodyIndex = lines.indexOf("body:")
  assert.ok(bodyIndex >= 0, "missing body block")
  const entries = []
  let current = null
  for (let index = bodyIndex + 1; index < lines.length; index += 1) {
    const line = lines[index]
    const start = line.match(/^  - type:\s*(\S+)\s*$/)
    if (start) {
      current = {
        type: start[1],
        hasAttributes: false,
        hasLabel: false,
        hasValidations: false,
        hasOptions: false,
        optionRequired: false,
      }
      entries.push(current)
      continue
    }
    if (!current) {
      assert.equal(line.trim(), "", `unexpected line before first body entry: ${line}`)
      continue
    }
    const id = line.match(/^    id:\s*(\S+)\s*$/)
    if (id) current.id = id[1]
    if (/^    attributes:\s*$/.test(line)) current.hasAttributes = true
    if (/^      label:\s*\S/.test(line)) current.hasLabel = true
    if (/^      value:\s*\S/.test(line)) current.hasValue = true
    if (/^      options:\s*$/.test(line)) current.hasOptions = true
    if (/^    validations:\s*$/.test(line)) current.hasValidations = true
    if (/^      required:\s*true\s*$/.test(line)) current.required = true
    if (/^          required:\s*true\s*$/.test(line)) current.optionRequired = true
  }

  assert.ok(entries.length >= 10, "expected a bounded set of task fields")
  const allowed = new Set(["markdown", "input", "textarea", "dropdown", "checkboxes"])
  const ids = new Set()
  let requiredCount = 0
  for (const entry of entries) {
    assert.ok(allowed.has(entry.type), `unsupported body type: ${entry.type}`)
    assert.ok(entry.hasAttributes, `${entry.type} entry needs attributes`)
    if (entry.type === "markdown") {
      assert.ok(entry.hasValue, "markdown entry needs attributes.value")
      continue
    }
    assert.match(entry.id || "", /^[a-z0-9-]+$/, "body entry needs a kebab-case id")
    assert.ok(!ids.has(entry.id), `duplicate issue-form id: ${entry.id}`)
    ids.add(entry.id)
    assert.ok(entry.hasLabel, `${entry.id} needs attributes.label`)
    if (entry.type === "checkboxes") {
      assert.ok(entry.hasOptions, `${entry.id} needs attributes.options`)
      assert.ok(entry.optionRequired, `${entry.id} needs a required option`)
      continue
    }
    assert.ok(entry.hasValidations, `${entry.id} needs validations`)
    if (entry.required) requiredCount += 1
  }
  assert.ok(requiredCount >= 10, "most task fields must be required")
  for (const id of ["objective", "base-head", "scope", "skills", "research", "verification", "results", "runtime", "risks-rollback", "dependencies", "boundaries"])
    assert.ok(ids.has(id), `missing issue-form field: ${id}`)
}

test("workflow uses minimal permissions and only exact-SHA official actions", async () => {
  const workflow = await read(".github/workflows/ci.yml")
  assert.doesNotMatch(workflow, /pull_request_target/, "fork code must not run with a privileged trigger")
  assert.doesNotMatch(workflow, /\bsecrets\b|\$\{\{\s*secrets\./, "workflow must not consume secrets")
  assert.doesNotMatch(workflow, /self-hosted/, "untrusted pull-request code must not run on the user's desktop")
  assert.doesNotMatch(workflow, /npm\s+(?:ci|install)|npx|curl|wget/i, "offline CI must not install or fetch")
  assert.doesNotMatch(workflow, /opencode|playwright|health-check/i, "offline CI must not start runtime tooling")

  assert.match(workflow, /^permissions:\n  contents: read$/m)
  assert.doesNotMatch(workflow, /^\s+\w+:\s*write\s*$/m)
  assert.match(workflow, /runs-on: ubuntu-latest/)
  assert.match(workflow, /persist-credentials: false/)
  assert.match(workflow, /node scripts\/ci-offline\.mjs --no-git/)

  const uses = workflowUses(workflow)
  assert.equal(uses.length, 1, "vendor actions only when unavoidable")
  assert.equal(uses[0], "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1")
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}\s*\n/, "actions must be pinned to a full commit SHA")
  assert.doesNotMatch(workflow, /uses:\s*[^\s@]+@(?:v[\d.]+|main|master)\s*$/, "no mutable action refs")
})

test("pull request template records every contract field and separates authority", async () => {
  const template = await read(".github/PULL_REQUEST_TEMPLATE.md")
  for (const heading of [
    "## Objective",
    "## Base and head",
    "## Scope",
    "## Skills and research",
    "## Verification",
    "## Runtime and credentials",
    "## Risks and rollback",
    "## Dependencies",
    "## Review",
  ]) assert.ok(template.includes(heading), heading)

  for (const field of CONTRACT_FIELDS) assert.ok(template.includes(field), field)
  assert.match(template, /not an approval/i)
  assert.match(template, /independent reviewer/i)
  assert.match(template, /node scripts\/ci-offline\.mjs/)
  assert.match(template, /commit, push, deployment and security/i)
  assert.match(template, /Hosted checks or protections actually observed/)
})

test("agent-task issue form is structurally valid and bounded", async () => {
  assertIssueForm(await read(".github/ISSUE_TEMPLATE/agent-task.yml"))
})

test("contribution contract covers scope, re-entry, evidence, review and authority", async () => {
  const text = await read("CONTRIBUTING.md")
  for (const field of CONTRACT_FIELDS) assert.match(text, new RegExp(`\\| ${field} \\|`), field)
  for (const phrase of [
    "git rev-parse --show-toplevel",
    "One owner per task",
    "Preserve unrelated work",
    "small",
    "disjoint",
    "Re-entry and stale bases",
    "independent review",
    "Two agent sessions using one",
    "CODEOWNERS",
    "commit",
    "push",
    "deployment",
    "security",
    "rollback",
    "Dependencies",
    "hosted",
    "not proof",
    "operational",
    "not offline CI",
  ]) assert.ok(text.toLowerCase().includes(phrase.toLowerCase()), phrase)
  assert.doesNotMatch(text, /\/home\/|~\/repos\//, "no brittle checkout paths")
})

test("new documentation links resolve inside the repository", async () => {
  for (const [file, text] of await readAll(["CONTRIBUTING.md", ".github/PULL_REQUEST_TEMPLATE.md"])) {
    for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|mailto:|#)/.test(target)) continue
      await stat(path.resolve(root, path.dirname(file), target.split("#")[0]))
    }
  }
})

test("runner defaults to not-requested corpus integration and fails explicitly when missing", async () => {
  assert.deepEqual(await planCorpus({ corpusDir: null, corpusCommand: null }), {
    requested: false,
    status: "not-requested",
  })

  const missingDirectory = await planCorpus({ corpusDir: ".no-such-corpus-directory", corpusCommand: null })
  assert.equal(missingDirectory.status, "unavailable")
  assert.match(missingDirectory.reason, /not found/)

  const missingCommand = await planCorpus({
    corpusDir: null,
    corpusCommand: ["definitely-not-a-real-executable-12345"],
  })
  assert.equal(missingCommand.status, "unavailable")
  assert.match(missingCommand.reason, /executable not found/)
})

test("corpus execution reports pass and non-zero failure honestly", () => {
  const ready = { status: "ready", executable: process.execPath, cwd: root, display: "node -e" }
  const passed = runCorpus({ ...ready, args: ["-e", "process.exit(0)"] }, 10_000)
  assert.equal(passed.status, "passed")

  const failed = runCorpus({ ...ready, args: ["-e", "process.exit(3)"] }, 10_000)
  assert.equal(failed.status, "failed")
  assert.match(failed.reason, /exited 3/)

  const unavailable = runCorpus({ status: "unavailable", reason: "missing" }, 10_000)
  assert.equal(unavailable.status, "unavailable")
})

test("passing command evidence is retained for JSON and verbose reporting", () => {
  const result = runCommand({ commands: [[process.execPath, ["-e", 'console.log("fixture: 3 passed"); console.error("fixture warning")']]] }, root, 10_000)
  assert.equal(result.ok, true)
  assert.match(result.output, /fixture: 3 passed/)
  assert.match(result.output, /fixture warning/)
})

test("a later failure retains earlier command evidence as well as the failure", () => {
  const result = runCommand({ commands: [
    [process.execPath, ["-e", 'console.log("earlier check")']],
    [process.execPath, ["-e", 'console.error("later failure"); process.exit(4)']],
  ] }, root, 10_000)
  assert.equal(result.ok, false)
  assert.match(result.reason, /exit 4/)
  assert.match(result.output, /earlier check/)
  assert.match(result.output, /later failure/)
})

test("clean checkout mode marks git checks not applicable instead of green", () => {
  const clean = buildSteps({ noGit: true })
  const gitStep = clean.find((step) => step.id === "git-whitespace")
  assert.equal(gitStep.kind, "not-applicable")
  assert.ok(gitStep.reason)

  const local = buildSteps({ noGit: false })
  assert.equal(local.find((step) => step.id === "git-whitespace").kind, "required")
})

test("default CI requires the canonical corpus and ownership guards without opt-in discovery", () => {
  const steps = buildSteps(parseArgs([]))
  assert.ok(REPO_CONTRACT_TESTS.includes("scripts/local-artifact-guidance.test.mjs"), "adopted skill routing and converter boundaries remain checked")
  assert.ok(REPO_CONTRACT_TESTS.includes("scripts/deploy-global-config.test.mjs"), "deployment preservation regressions remain required")
  assert.ok(REPO_CONTRACT_TESTS.includes("tools/gnome-window-control/fresh-shell-acceptance.test.mjs"), "private-Shell boundary regressions remain required without running a compositor")
  for (const command of ["bash", "python3", "cp", "cmp", "diff", "mkdir", "rm", "date", "env", "mktemp", "chmod", "basename", "dirname", "tee", "seq"])
    assert.ok(steps.find(step => step.id === "repo-contracts").dependencies.includes(command), `shell fixture prerequisite ${command}`)
  const contracts = steps.find(step => step.id === "contract-tests")
  assert.ok(contracts.commands[0][1].includes("scripts/codeowners-contract.test.mjs"))
  for (const [id, target] of [
    ["corpus-validation", "evals/agent-rules/validate.mjs"],
    ["corpus-tests", "evals/agent-rules/tests/grader.test.mjs"],
    ["corpus-controls", "evals/agent-rules/grade.mjs"],
  ]) {
    const step = steps.find(item => item.id === id)
    assert.ok(step, `${id} is required by default`)
    assert.equal(step.kind, "required")
    assert.ok(step.commands[0][1].includes(target))
  }
  const corpusTests = steps.find(item => item.id === "corpus-tests")
  assert.ok(corpusTests.commands[0][1].includes("evals/agent-rules/tests/native-trace.test.mjs"), "native-format evidence regressions must run without a model or export")
  assert.ok(corpusTests.commands[0][1].includes("evals/agent-rules/tests/calibration-evidence.test.mjs"), "retained real-run evidence and reviewed/native grading separation stay in offline CI without rerunning a model")
})

test("default CI runs bounded Office and dependency fixtures without authoring packages or real documents", () => {
  const step = buildSteps(parseArgs([])).find(value => value.id === "office-package-tests")
  assert.ok(step)
  assert.equal(step.kind, "required")
  assert.deepEqual(step.dependencies, ["python3"])
  assert.deepEqual(step.commands, [
    ["python3", ["-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_office_package.py", "-v"]],
    ["python3", ["-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_document_sandbox_probe.py", "-v"]],
    ["python3", ["-s", "-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_document_authoring_preflight.py", "-v"]],
    ["python3", ["-s", "-B", "-m", "unittest", "discover", "-s", "scripts", "-p", "test_document_metadata.py", "-v"]],
  ])
  const result = runCommand(step, root, 15_000)
  assert.equal(result.ok, true, result.output)
  assert.match(result.output, /Ran 20 tests/)
  assert.match(result.output, /Ran 19 tests/)
  assert.match(result.output, /Ran 36 tests/)
  assert.match(result.output, /Ran 39 tests/)
  for (const name of [
    "test_launch_timeout_and_os_error_are_failed_outcomes",
    "test_missing_or_changed_host_fixture_is_not_preserved",
    "test_failed_control_writes_an_honest_failed_receipt",
    "test_control_receipt_binds_probe_payload_and_exact_check_names",
    "test_source_change_cannot_preserve_a_green_control_receipt",
    "test_complete_receipt_names_all_controls_and_retains_causal_limits",
    "test_mixed_probe_epochs_cannot_form_a_passing_combined_receipt",
    "test_full_synthetic_environment_is_clear_but_not_authoring_ready",
    "test_fifo_distribution_metadata_cannot_hang_inspection",
    "test_metadata_presence_never_invokes_cached_import_finders",
    "test_duplicate_same_version_distributions_are_still_ambiguous",
    "test_inspection_uses_one_deadline_for_candidate_and_scan",
    "test_scan_root_and_entry_budgets_are_enforced",
    "test_malformed_metadata_cannot_be_hidden_by_a_valid_root",
    "test_cli_subprocess_isolated_from_synthetic_user_site",
    "test_available_cli_interpreters_are_read_only_without_imports",
    "test_regression_reads_are_bounded_before_each_read",
    "test_budget_rejects_larger_or_invalid_limits_and_reassignment",
    "test_deadline_crossed_by_eof_is_not_success",
    "test_shared_job_refuses_overlapping_acquisitions",
    "test_identity_errors_do_not_echo_untrusted_metadata",
  ]) assert.ok(result.output.includes(name), `${name} must run in the required offline step`)
  assert.doesNotMatch(result.output, /FAILED|skipped/)
})

test("argument parsing rejects conflicting and unknown options", () => {
  assert.throws(() => parseArgs(["--nope"]), UsageError)
  assert.throws(() => parseArgs(["--corpus", "a", "--corpus-cmd", "node"]), UsageError)
  assert.throws(() => parseArgs(["--corpus"]), UsageError)
  assert.throws(() => parseArgs(["--timeout", "5"]), UsageError)
  const options = parseArgs(["--no-git", "--corpus-cmd", "node", "x.mjs"])
  assert.equal(options.noGit, true)
  assert.deepEqual(options.corpusCommand, ["node", "x.mjs"])
})

test("curated suite is file-bounded and contains no network or service calls", async () => {
  for (const file of REPO_CONTRACT_TESTS) {
    await stat(path.join(root, file))
    const text = await read(file)
    assert.match(text, /from "node:test"|require\("node:test"\)/, file)
    assert.doesNotMatch(text, /node:https?|fetch\(|undici|XMLHttpRequest|WebSocket|net\.connect|\bdns\./, file)
    assert.doesNotMatch(text, /spawnSync\(\s*["'](?:opencode|npm|npx|playwright)/, file)
  }
})

test("offline reporting labels owned-process fixtures without claiming deployed behavior", async () => {
  const help = spawnSync(process.execPath, [path.join(root, "scripts/ci-offline.mjs"), "--help"], { cwd: root, encoding: "utf8", timeout: 10000 })
  assert.equal(help.status, 0, help.stderr)
  assert.match(help.stdout, /Source\/fixture checks/)
  const source = await read("scripts/ci-offline.mjs")
  assert.ok(source.includes("These checks do not establish deployed integration or model behavior."))
})

test("runner CLI lists bounded steps and rejects bad usage without executing checks", () => {
  const list = spawnSync(process.execPath, [path.join(root, "scripts/ci-offline.mjs"), "--list"], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
  })
  assert.equal(list.status, 0, list.stderr)
  for (const id of ["node-syntax", "contract-tests", "repo-contracts", "git-whitespace", "corpus-integration"])
    assert.ok((list.stdout || "").includes(id), id)

  const cleanList = spawnSync(process.execPath, [path.join(root, "scripts/ci-offline.mjs"), "--no-git", "--list"], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
  })
  assert.equal(cleanList.status, 0)
  assert.match(cleanList.stdout, /git-whitespace\tnot-applicable/)

  const bad = spawnSync(process.execPath, [path.join(root, "scripts/ci-offline.mjs"), "--bogus"], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
  })
  assert.equal(bad.status, 2)
  assert.match(bad.stdout, /unknown argument/)

  const help = spawnSync(process.execPath, [path.join(root, "scripts/ci-offline.mjs"), "--help"], {
    cwd: root,
    encoding: "utf8",
    timeout: 20_000,
  })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /No installs, network/)
})

test("new source avoids checkout-specific paths and embedded credentials", async () => {
  const tokenPattern = new RegExp(
    `${"gh" + "p_"}|${"github" + "_pat_"}|${"sk" + "-"}[A-Za-z0-9]{16,}|` +
      `${"Bear" + "er"}\\s+[A-Za-z0-9._-]{20,}`,
  )
  for (const [file, text] of await readAll(NEW_FILES)) {
    assert.doesNotMatch(text, /\/home\/[a-z]/i, `${file} hardcodes a home path`)
    assert.doesNotMatch(text, /~\/repos\//, `${file} hardcodes a checkout path`)
    assert.doesNotMatch(text, tokenPattern, file)
  }
})
