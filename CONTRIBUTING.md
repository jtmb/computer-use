# Contributing and task evidence

This file is the repository's contribution contract. It is source text, not proof
of hosted repository settings: branch protection, required reviewers, CODEOWNERS
enforcement, merge queues and Actions permissions must be verified separately in
the GitHub settings that actually apply. Never report a hosted check as observed
because a workflow file or a checkbox exists.

Read [AGENTS.md](AGENTS.md) and [maintainer policy](docs/maintainer-policy.md)
before changing source. Load the matching skill from the
[skill catalog](.opencode/skills/README.md) instead of copying policy into a task.

## Start from the actual checkout

- Confirm the worktree root with `git rev-parse --show-toplevel`; do not assume a
  fixed home-directory path.
- Inspect scoped `git status`, staged/unstaged diffs and untracked files before
  editing. Preserve unrelated work; a clean published branch does not prove the
  current implementation is clean or complete.
- One owner per task. Disjoint write scopes prevent collisions; they do not make
  a worktree a security sandbox or a substitute for a separate review.
- The parent coordinator owns task sequencing and integration. Contributors
  implement and verify their bounded scope; they do not silently take over
  another owner's files.

## Task contract

Every implementation task and every pull request must state these fields. Use the
[PR template](.github/PULL_REQUEST_TEMPLATE.md) and the
[bounded agent-task issue form](.github/ISSUE_TEMPLATE/agent-task.yml).

| Field | Requirement |
| --- | --- |
| Objective | The concrete outcome and why it is needed. |
| Base | Branch and exact commit or merge-base the work starts from. |
| Head | Branch and commit that contains the proposed change. |
| Scope | Exact paths to add, edit or leave untouched, plus non-goals. |
| Skills | Skill IDs loaded, or why none apply. Links do not load skills. |
| Research | Versioned/dated sources inspected, including conflicts and doubt. |
| Test commands | Exact commands run, with selection rationale and timeouts. |
| Test results | Pass/fail counts, failure output and the environment used. |
| Runtime | Required runtime/services/credentials, or an explicit statement that the change is static-only. |
| Risks | Failure modes, security/privacy impact and blast radius. |
| Rollback | How to revert safely, including data or configuration effects. |
| Dependencies | Other tasks, owners, corpus/eval interfaces, or external conditions. |

Mark unavailable prerequisites explicitly. "Not run" with a reason is honest;
"passed" without a command and result is not evidence.

## Small, disjoint pull requests

- Keep one reviewable purpose per pull request. Split unrelated refactors,
  generated files, policy edits and behavior changes.
- State files you deliberately did not touch. Overlapping ownership requires the
  owners' agreement before editing, not after a conflict appears.
- Do not mix a new contract with its deployment, a source fix with a runtime
  profile change, or formatting across untouched trees.
- Preserve exact user work, staged patches, generated exports and unrelated
  untracked files. Never run blanket staging, destructive cleanup or reformatting
  to make a diff look tidy.

## Re-entry and stale bases

- Before resuming, re-check the live base and your head. A previous green run does
  not carry over after the base moves, the owner changes or instructions change.
- Record who resumes ownership, which files are already dirty, and whether the
  prior evidence still applies to the current bytes.
- If the base moved, rebase or merge deliberately, then re-run the checks that
  cover the changed behavior. Do not force-push over another owner's commits or
  rewrite shared history to hide drift.
- If an interface is still unfinished (for example the reference corpus or agent
  evaluations), do not invent its contract. Use an explicit integration hook and
  report the prerequisite as unavailable until its owner binds it.

## Verification evidence

- Label evidence by kind: source-text/static contract, syntax check, unit test,
  runtime operation, GUI acceptance, or hosted check. A source-text test proves
  wording and wiring only.
- Run the offline suite from the worktree root:

  ```bash
  node scripts/ci-offline.mjs
  ```

  It performs static, credential-free checks and synthetic corpus controls. It does not install packages,
  call models, start browsers, audio, desktop services or user profiles, read
  private user data, or contact the network. Missing required tools are reported
  as unavailable and fail the run; they are not silently skipped.
- In a clean hosted checkout, pass `--no-git` so local dirty-tree whitespace
  checks are reported as not applicable instead of pretending to verify a diff.
- [scripts/health-check.sh](scripts/health-check.sh) is an operational
  environment check. It is not offline CI and must not be invoked as a substitute
  for it or reported as one.
- The canonical [candidate corpus](docs/golden-corpus/README.md) and
  [behavioral grader](evals/agent-rules/README.md) run by default: validator,
  regression tests, all known-good/known-bad/alternate controls. These are authored
  fixtures, not model runs, human review or gold promotion. Missing canonical
  files fail the run; no discovery flag is needed.
- An additional reviewed corpus command can be requested explicitly:

  ```bash
   node scripts/ci-offline.mjs --corpus-cmd node path/to/offline-runner.mjs
  ```

  With neither flag, additional integration is reported as not requested; the
  canonical corpus still runs. With a
  missing directory, runner or executable, the run fails with the prerequisite
  named instead of turning green. Directory discovery (`run-offline.mjs` or
  `run.mjs`) is provisional; bind the published interface explicitly with
  `--corpus-cmd` for other collections. This command hook is not a security
  sandbox: independently review extra commands for offline/credential-free safety.
- Record the exact command, pass/fail counts and the environment. Do not claim
  hosted Actions runs, protections or reviewer identities unless their output was
  actually observed.

## Independent review

- A reviewer must not be the author of the change. Two agent sessions using one
  account are still one human identity; they do not satisfy an independent-review
  requirement by themselves.
- Review the combined tree, including new untracked source, against the real base.
  Re-review after a base change or a material rewrite.
- CODEOWNERS text is routing information, not evidence that review happened.
  Merge-queue and required-review settings are hosted configuration and require
  their own verification.
- Reviewers check for overstated evidence, hidden runtime dependencies, scope
  creep, weakened security and missing rollback.

## Separate authority

Contribution does not grant permission. These actions keep their own explicit
approval and are never implied by writing code, opening a pull request, a green
check, auto-approve mode or this contract:

- committing, pushing or force-pushing;
- deployment, extension activation, shared restart or logout;
- account, security, permission or credential changes;
- publication, deletion, external messages or opening pull requests;
- running authorized model evaluations, desktop sessions or credentialed services.

A human approval for one action does not authorize the next. Never weaken browser
sandboxing, TLS validation, filesystem permissions or system security to make a
check pass. Never put credentials, tokens, payment data or private conversation
content in source, issues, pull requests, logs or evidence.

## Risks, rollback and dependencies

- State the failure modes the change can introduce and who is exposed.
- Give a rollback path that restores the previous source and any data/config it
  touches, including what cannot be rolled back.
- Name blocking dependencies and their live status. A receipt, stale comment or
  previous report is not current status.
- Keep unfinished work visible. Partial delivery with an explicit blocker is
  acceptable; a false completion claim is not.
