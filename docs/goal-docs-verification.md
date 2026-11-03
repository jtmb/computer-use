# Goal-docs exporter verification

**Scope:** Read-only audit of the repo-local goal-docs exporter and the exported goal `53eacb15-7fd9-4c20-b4d4-038111b68e6f`. This report is the only repository file this audit writes.

## Result

The current generated package is internally coherent and preserves the requested plan/history content. Source and package checks passed; no exporter or package-integrity defect was found. Live identity of the named source session and current live handoff/model behavior remain unverified.

The package changed during this audit: the first read showed revision 12 / `active`; a later read showed revision 33 / `cancelled` with a later export timestamp and an expanded manifest. After observing that real change, I performed one bounded consistency recheck. The checks below describe that later snapshot; I did not poll for further changes.

## Source and recorded identity

The exported handoff, plan, snapshot, index and manifest agree on goal `53eacb15-7fd9-4c20-b4d4-038111b68e6f`, source session `ses_e8275dbd2ffe5vkgrWh4gVCnVB`, source directory `/home/james/repos/computer-use`, repository `github.com/jtmb/computer-use`, worktree `main`, and relative scope `.`. The current checkout independently reports that same top-level directory, `main` branch, origin `https://github.com/jtmb/computer-use.git`, and HEAD `b47765e4a9f5c124c4716deb52962e17d7fb4a2a`.

This confirms the package's recorded repo/worktree identity against this checkout; it does **not** prove that the source session is currently located there or establish its live status. The repository's `session-context` skill describes a read-only `session_context` lookup, but that tool was not present in the exposed tool catalog after the server restart. No equivalent live session lookup was available, and no raw goal/session storage was read.

## Generated package and manifest

At the consistency recheck, the package recorded export time `2026-10-27T15:05:40.992Z`, plan revision `33`, status `cancelled`, and record kind `archive`. The plan's revision timestamp is `2026-10-27T14:59:19Z`; the retained history records cancellation at `2026-10-27T15:00:24Z`; the export follows both. The package records no completion evidence and a stop reason of `cancelled`. These are export-time facts, not a claim about live goal status.

Verified package details:

- All 18 completion criteria are present in the snapshot and rendered in `HANDOFF.md`.
- `HANDOFF.md` has the mandatory `## Plan` and `## Historical documentation` sections. `plan.md` contains the persisted plan, criteria and decisions; `work-history.md` includes coverage notices, lifecycle history and plan revision history.
- Session ID, directory, status, revision, content/plan fingerprints, index row and export timestamps agree across the snapshot, package files, index and manifest.
- Snapshot hashes for `plan.md`, `HANDOFF.md` and `work-history.md` match. The manifest integrity digest is valid; all 41 manifest file entries exist and hash correctly. For `README.md`, the manifest intentionally hashes the managed section, not the whole file, so manual surrounding text remains owned by the user.
- The index lists 10 goal records. Earlier package IDs remain in the manifest and their handoff files are present; no older package was removed.

## Exporter contract and source tests

Source review covered `.opencode/plugins/goal-docs/exporter.ts`, `session.ts`, `state.ts`, `model.ts`, `repository.ts`, `render.ts`, `observer.ts`, `writer.ts`, and `process-lock.ts`.

- The exporter requires an explicit session ID, obtains that exact session, checks its exact location against the plugin worktree and rejects cross-worktree export. Goal state is read through a version-checked adapter with bounded input and allowlisted fields; credential-like text is redacted and transcript/usage data is excluded.
- Writes are limited to `docs/goals/**` and require the V2 edit permission assertion. Plan/read-only sessions and missing permission APIs fail closed. Source state is read before the assertion, but no generated documents are written until after it succeeds; missing state returns without requesting write permission.
- Repository metadata is collected with bounded read-only Git commands. The writer checks ownership-manifest integrity and generated-file bounds, preserves manual/unowned content, rejects symlinks and stale revisions, atomically replaces files, and serializes writers per worktree. The persistent process-lock inode is not unlinked. Observer startup/event refresh is bounded and semantic changes retain prior goal packages rather than deleting them.
- Tests cover exact-session/worktree isolation, scoped permissions, allowlisting and redaction, mandatory rendering, stale/manual-edit rejection, atomic-write recovery, lock races and cross-worktree isolation, lifecycle export/retention, and handoff identity/permissions/retry behavior.

Ran the documented isolated suite:

```text
node --test .opencode/plugins/goal-docs/*.test.ts
```

Result: **100 tests passed, 0 failed** (95 top-level tests, including nested cases). These are source/unit/integration-fixture checks; they do not prove a fresh live exporter interaction, a real handoff for this source session, or model continuation. The process-lock tests use local scratch fixtures; the suite does not invoke the deferred screenshot backend or operate the desktop.

## Historical and live-acceptance boundaries

`docs/handoff-live-acceptance.json` records a real producer/focus/read-only-preview acceptance for a **different** source (`ses_e85293a02ffe7Hlk5CfyoIgStT`, goal `a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7`) and destination. It explicitly says continuation was not invoked or verified. The pilot CLI receipt likewise records an earlier failed attempt and a separately approved producer retry, not model continuation. These receipts are useful historical evidence, not live acceptance of the selected source session.

No handoff producer, continuation command, model, desktop, screenshot, or source-session mutation was invoked during this audit. Do not treat the package's recorded identity or passing source tests as proof of current session status or live model behavior.
