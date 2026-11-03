# Permanent pilot handoff cutover manifest

Status: prepared after the user selected **Permanent pilot cutover**. That scope
decision did not authorize runtime writes. This manifest still needs final
execution approval. Source verification: 100 passing tests, strict checking of
21 companion source/test files against the real V2.1.1 SDK with zero diagnostics,
passing actual health, and preserved staging/configuration/capture hashes.

## Scope and effect

Selected runtime profile: `/home/james/.opencode-v2-pilot/config`.
The currently discovered global `/handoff` and `/resume` are retired in this
profile. Other pilot repositories without this project's companion lose those
old command names. No companion is installed globally or in another repository.
This project's TUI may expose its replacement `/handoff` only after the server
inventory confirms that no server command still claims that name.

The separate `/home/james/.config/opencode` tree is not part of this change.
Neither are project/global JSON configuration, permissions, MCPs, upstream goal
storage, source goal state, screenshots, commits, pushes or other runtime commands.

## Exact files

All paths below are regular files with non-symlink ancestors at inspection.
Recheck that condition and the exact hashes immediately before execution. Stop
on drift, an occupied backup path or an unexpected destination; do not overwrite.

| Action | Path | Required bytes / SHA-256 / mode |
|---|---|---|
| Back up, then retire | `/home/james/.opencode-v2-pilot/config/commands/handoff.md` | 827 bytes; `8f53405441607fb20f2df0ca325a089ef65548edc622e65900a9d891d9b1250e`; existing `0664` |
| Back up, then retire | `/home/james/.opencode-v2-pilot/config/commands/resume.md` | 946 bytes; `de730405361e8295f9f622c8ddcb8e2f791315ae3df6a0cc226838ac37dcc0fa`; existing `0664` |
| Deploy canonical source | `/home/james/repos/computer-use/global/commands/handoff_resume.md` -> `/home/james/.opencode-v2-pilot/config/commands/handoff_resume.md` | source 4635 bytes; `12b407c7543019eb8a6d63026492d629c0051f8a31007378cecb7a7660c4cf9d`; destination must be absent, new mode `0600` |

Proposed backup directory, currently absent:
`/home/james/.opencode-v2-pilot/config/commands.backup-handoff-cutover-20261027/`.
It is beside, not inside, the discovered `commands/` tree. Create it owner-only
(`0700`). Before retirement, save verified byte copies as `handoff.md.backup` and
`resume.md.backup` with mode `0600`, plus a receipt containing original hashes,
modes and the untouched command-file inventory. Then move the original files to
`handoff.md.retired` and `resume.md.retired` there, preserving their original
metadata. Do not delete the originals or replace unrelated runtime files.

Stage the new continuation from the canonical source outside Markdown command
discovery, verify and flush it, then install it without replacing any existing
destination. Remove only a temporary file demonstrably created by this operation.

## Verification and limits

- Preserve `deploy.md` and `promote-skills.md`, their bytes/modes and every other
  unrelated command entry. Verify the separate config tree is unchanged.
- Rely on the documented command-file watcher, not an unapproved restart. Query
  the exact-project server inventory: `handoff` and `resume` should disappear,
  `handoff_resume` should appear, and unrelated command names should remain.
- If another server claimant remains, the replacement must stay disabled. Do
  not bypass collision checks or change configuration/permissions to force it.
- Recheck health, source/index preservation and the runtime receipt. API success
  is not proof that a real TUI loaded or focused the new command's target.
- This approval does **not** invoke `/handoff` or `/handoff_resume`, seed a live
  destination, run a model/worker, take a screenshot or restart a service/client.
  Real-client acceptance remains a separate step with the user's visual
  confirmation while the unsafe screenshot backend remains deferred.

## Rollback

If execution fails partway, stop further rollout and restore the prior command
state from these verified backups only when doing so cannot replace concurrent
user changes. An execution approval for this manifest includes that bounded
failure rollback; later discretionary rollback needs approval again.

Move only this operation's unchanged deployed `handoff_resume.md` out of discovery
into the backup directory; retain it rather than deleting it. Restore the retired
originals to their exact old paths only when those paths remain absent, preserving
their bytes and metadata. Stop and ask if any command has drifted or an unexpected
file occupies a path. Keep all backups/receipts and source sessions/documents.
Restoring the legacy `/handoff` must cause the project TUI replacement to stand
down. Never deploy a historical archive as a substitute for an actual live backup.
