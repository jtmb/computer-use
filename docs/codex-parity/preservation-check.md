# Independent source and preservation check

Historical observation at the HEAD recorded below, not the current worktree or
test count. Later coordination changes invalidated nine reviewed fingerprints;
the execution-goal parent subsequently rereviewed those bytes and expanded the
gate. See [current coverage review](../request-coverage.md#reviewed-combined-tree-bytes).
The original command outputs and archive failure below are retained as observed.

## Environment

- Repository: `/home/james/repos/computer-use`, worktree `main`.
- HEAD: `c71b8cc` (`Import hardened Tailscale deployment project`).
- Initial `git status --short` and `git status --porcelain` each had 132 records. This differs from the supplied expectation of 124 dirty/untracked paths plus the staged rename; the observed initial state was preserved as-is.
- Only this report was added by this check. No installer, deployer, service restart, Git write command, or desktop/browser input was used.

## Commands run

| Exact command | Exit | Result |
| --- | ---: | --- |
| `node scripts/request-coverage-audit.mjs` | 1 | Coverage: 68 requirements, 7 findings, no coverage errors. Archive: one hash mismatch (see Failures/unknowns). |
| `node --test scripts/request-coverage-audit.test.mjs` | 0 | 11 passed, 0 failed, 0 skipped. |
| `node --test scripts/orchestration-methods.test.mjs scripts/autonomy-contract.test.mjs scripts/handoff-resume-contract.test.mjs scripts/planning-contract.test.mjs scripts/goal-workflow.test.mjs scripts/repo-memory.test.mjs scripts/documentation-portability.test.mjs scripts/shared-skill-portability.test.mjs scripts/features-contract.test.mjs scripts/instruction-architecture.test.mjs scripts/credential-hygiene.test.mjs scripts/github-permissions.test.mjs` | 0 | 78 passed, 0 failed, 0 skipped across the 12 listed files. |
| `git diff --check` | 0 | No whitespace errors. |
| `git diff --cached --check` | 0 | No staged whitespace errors. |
| `./scripts/health-check.sh` | Not run | Source inspection found service/API/MCP/config queries; skipped under the no-service-call boundary. |

The two `node --test` invocations exercised 13 test files and 89 tests total: 89 passed, 0 failed, 0 skipped. The combined command had no failures, so no individual reruns were needed to identify a failing file.

## Results

| Check | Observed counts/status |
| --- | --- |
| Request coverage CLI | 68 requirements; 7 findings; 0 coverage errors; 1 archive error; exit 1. |
| Request coverage test | 11 pass / 0 fail / 0 skip. |
| Combined contract tests | 78 pass / 0 fail / 0 skip. |
| All Node tests | 89 pass / 0 fail / 0 skip across 13 test files. |
| Whitespace checks | Both diff checks exit 0. |

## Coverage audit

`docs/request-coverage.md` contains **68 requirement rows**, all unique, and **7 finding rows**, all unique. I counted identifiers in the two named mapping tables (excluding table headers/separators), then compared the requirement IDs with the source snapshots' `completionCriteria` counts: O=28, C=11, T=5, P=10, S=6, plus N01–N08. The finding set was checked against F01–F07. Missing identifiers: none. Duplicated identifiers: none. The CLI independently reports `requirements: 68`, `findings: 7`, and `coverage.errors: []`.

## Preservation evidence

- Before tests, `git status --short` and `git status --porcelain` each counted 132 records. After tests and before adding this report, both still counted 132. The supplied 124-path baseline therefore did not match the observed starting worktree.
- Expanded NUL-delimited status counted 492 path records before this report and 494 afterward; the staged rename contributes both old and new pathnames. This is a net increase of two, while this check added one report file. The remaining expanded-path increase is unattributed from the retained aggregate baseline and may be a concurrent change under an already-untracked directory. No path was removed or normalized; treat that attribution as unknown.
- The staged rename remains `R100`: `global/commands/resume.md` → `global/commands/handoff_resume.md`. `git diff --cached --summary -M` reported a 100% rename; the staged diff contains no computer-use capability paths.
- HEAD remains `c71b8cc`. The checked computer-use source paths are absent from the HEAD tree; the current capability sources are untracked, and no capability files are staged. HEAD's named commit changes only the Tailscale project.
- The deployer source (`scripts/deploy-window-control.py`) was inspected. Its default `apply=False` path returns the plan before `target.mkdir` or write operations; only `--apply` reaches mutation code. The deployer itself was not run. A direct read-only SHA-256 comparison with `/home/james/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local` found two mismatches: `extension.js` (source `91b4751a173920c18675044d1552482b7642895a318c97f8676dc2c7e53fc070`, target `a0d128443572b5ae80dc444a9592af12413f14451f958e8e028ed0836a7a83ca`) and `input.mjs` (source `e5d76e87fb355d4427b82ba0ee14f149472330144372fee9b7caff34aff53bd9`, target `f7da42d1fedd0e171ff438e93ff20d2ad0580c6b94d60a6808fa72ca885e05f9`). The other five managed files match. Thus the current source bundle is not fully deployed; no deployment occurred during this check.

## Failures/unknowns

- The coverage CLI exited 1 with this archive finding, verbatim: `archive hash mismatch: 483f6755-70a7-4912-aee3-816fbe0b7546/plan.md`. Archive freshness was also reported as `unverified: no supported-tool checkpoint supplied`. No repair was attempted.
- Initial Git record count was 132, not the 124 stated in the task context. No unrelated dirty, staged, or untracked work was changed.
- The health check was skipped because its source invokes `opencode service status`, `opencode api get`, `opencode mcp list`, and `opencode debug config`; those are runtime/service queries, despite no deployment or config-write command appearing in the script.
- The deployed bundle has two file differences. Hash inspection is not a live extension/runtime check.

## What this does not prove

These source, fixture, and hash checks are not runtime loading, deployed behavior, model behavior, or user-visible acceptance. They do not establish successful live computer-use input, an interactive app outcome, or correct model decisions.
