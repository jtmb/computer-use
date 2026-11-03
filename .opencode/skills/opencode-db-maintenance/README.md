# OpenCode DB Maintenance Usage

This guide explains how to use the `opencode-db-maintenance` skill. Agent-facing
rules remain in [SKILL.md](./SKILL.md); OpenCode does not automatically load
this usage guide.

Category: `maintenance`

Tags: `maintenance`, `sqlite`, `backup`, `schedule`

## Purpose and when to use it

Use this skill only for OpenCode database growth, chat backup, and maintenance
scheduling. Do not use it for unrelated databases, general disk cleanup, or
ordinary OpenCode use.

## Prerequisites and setup verification

Identify the selected OpenCode version, actual active data path/database format,
application process state, available disk space, and the maintenance/export
interfaces actually provided. Read the matching version's documentation. Do not
assume script paths, schema, cron jobs, backup locations, retention counts, or
runtime commands.

## How to request it

- "Diagnose why OpenCode is using so much disk space; keep it read-only."
- "Show which cleanup candidates are safe without changing the database."
- "Back up chats before any maintenance."
- "Check whether maintenance is scheduled and when it last succeeded."

A diagnostic request does not authorize database writes.

## Worked workflow and expected result

### Read-only diagnosis

1. Identify the database actually used by the running installation.
2. Use supported read-only diagnostics to distinguish live data from reclaimable
   storage and inspect WAL/journal state.
3. Estimate recoverable space only from evidence the tool provides.

Expected result: a version-specific diagnosis and a clear statement of whether
any data could be changed safely.

### Maintenance or backup

1. Review the exact supported operation, lock behavior, backup method, output
   location, overwrite/retention behavior, and required free space.
2. Verify an integrity-preserving backup before the write.
3. Obtain the applicable authority and run one bounded operation.
4. Verify integrity, expected size/result, reopen the application, and test the
   relevant workflow. For restore requests, verify a real restore rather than
   relying on a scheduled backup or file existence.

Expected result: an evidence-backed report of the exact target and operation,
verified backup status, before/after observations, and remaining caveats.

## Verification and known limitations

Database internals and maintenance interfaces can change across versions. Live
SQLite copies may depend on WAL/journal files. Vacuuming reclaims empty pages but
does not remove live historical data. Avoid direct SQL deletion without a
version-specific supported procedure.

## Troubleshooting

- Database path unclear: inspect the active runtime's configured data directory.
- Application is running: follow the documented lock/online-backup procedure;
  do not bypass a lock check casually.
- Integrity check fails: stop and preserve the current database and backups.
- Backup/export failed: inspect the exact error and available disk space before
  retrying; do not overwrite a potentially good backup.
- Schedule status unclear: inspect the configured scheduler and its logs; do not
  infer a successful run from the presence of a schedule.

## Safety

- Keep diagnosis read-only until a specific write is authorized.
- Verify recovery before deleting or replacing data.
- Preserve backups until the application is verified working.
- Avoid lock bypasses, backup skipping, and broad pruning.
- Never store database credentials or unrelated private chat content outside an
  approved backup location.

## Related skills

- [`routine-automation`](../routine-automation/README.md) provides general
  scheduling, logging, locking, and rollback practices.
- [`files-and-documents`](../files-and-documents/README.md) handles preservation
  and organization of exported artifacts.
- [`system-troubleshooting`](../system-troubleshooting/README.md) diagnoses
  storage or application failures outside this narrow workflow.
