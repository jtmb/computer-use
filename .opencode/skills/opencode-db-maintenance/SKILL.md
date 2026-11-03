---
name: opencode-db-maintenance
description: Diagnose and reclaim opencode.db SQLite disk usage when the database fills the disk (event-table bloat, freelist pages, VACUUM, prune); back up chats to opencode-backups and manage the weekly maintenance cron job. Use ONLY when the user mentions opencode database size, opencode.db disk space, opencode.db, VACUUM, prune, chat backup, opencode-backups, maintenance cron, or DB maintenance.
metadata:
  schema-version: "1"
  category: "maintenance"
  tags: "maintenance,sqlite,backup,cron"
---

# OpenCode DB Maintenance

## Auto-approve and autonomous work

In Build auto, project auto-approve, or explicit no-question work, do not ask
routine clarifying, preference, confirmation, Git, delegation-opt-in, or
"continue?" questions. Use existing authority and reversible defaults. If a
required approval or essential detail is missing, block that action, state the
reason, and continue independent work; never grant authority yourself.

Use this skill only for OpenCode database growth, chat backup, or maintenance
schedule tasks. OpenCode stores session data in a version-dependent local data
store; verify the active database path and storage format from the selected
runtime rather than assuming a location or schema.

## Diagnose read-only first

1. Identify the active OpenCode version, data directory, database path, and
   whether the application is currently running.
2. Prefer supported OpenCode inspection/maintenance commands when available.
   If using SQLite diagnostics, keep them read-only and verify that the target is
   the active database, not a backup or unrelated file.
3. Compare total file size, live table/index sizes, freelist pages, WAL/journal
   state, and available disk space. Distinguish reclaimable empty pages from
   live historical/event data; a vacuum alone cannot remove live rows.
4. Do not infer that a table, row, or event is safe to delete from its name. Use
   only a maintenance procedure documented for the exact installed version.
   If none exists, report the limitation rather than improvising SQL.

## Maintenance and backup

- Keep diagnosis separate from writes. A request to inspect size does not
  authorize pruning, vacuuming, deleting backups, or changing schedules.
- Before any write, verify the application's locking/WAL requirements, a
  recoverable backup method, integrity checks, disk headroom, and exact scope.
  Follow the project's preview and authorization policy.
- Do not use a bare filesystem copy of a live SQLite database unless the
  documented backup procedure proves it captures WAL/journal state.
- Preserve a verified backup until the application is reopened and the relevant
  workflow is confirmed healthy.
- Distinguish a backup schedule from a successful backup and a tested restore.
  Verify actual output, integrity, and restore behavior when requested.

## Chat exports and schedules

Discover whether the selected installation provides an export tool or a
maintenance scheduler. Verify output ownership, overwrite behavior, manifests,
locks, logs, and failure markers before enabling or running one. Never assume a
script name, output directory, cron entry, retention count, or unattended
schedule exists.

## Report honestly

Report the exact database/runtime identified, evidence for the diagnosed cause,
commands actually run, whether anything changed, backup/restore verification,
and any remaining risk. A zero exit status does not establish database
integrity or successful recovery.

## Usage guide

When the user asks how to use this skill, also read
[README.md](./README.md) for request examples, prerequisites, verification,
and safety requirements.
