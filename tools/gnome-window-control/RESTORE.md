# Installed-byte restore (source-only)

`scripts/restore-window-control.py` previews restoration of an earlier installed
bundle from the **original forward deployer's actual apply stdout**, its selected
backup, and current installed bytes. It does not restore repository source, enable
an extension, restart Shell, or prove anything about the loaded extension.

## Explicit selection and approval

From the repository root, substitute the operator's actual absolute target and
previously saved forward receipt. Do not guess a profile from the agent's XDG
environment. The target basename must be
`opencode-window-control@computer-use.local`.

```bash
EXTENSION_DIR='/absolute/operator/selected/extensions/opencode-window-control@computer-use.local'
FORWARD_RECEIPT='/absolute/operator/selected/original-forward-stdout.json'
python3 -B scripts/restore-window-control.py \
  --extension-dir "$EXTENSION_DIR" --receipt "$FORWARD_RECEIPT"
```

Preview performs no application writes: no lock, directory, journal, or temporary
file creation. Normal filesystem read-atime behavior is not suppressed. Review the
old managed subset, desired hashes/absences, evidence paths and `plan_sha256`.

Only after the exact operator-approved restore action, use `--apply`. Optional
`--expect-plan` rejects stale previews; a hash is not an approval grant.

```bash
PLAN_SHA='paste-the-reviewed-plan_sha256-here'
python3 -B scripts/restore-window-control.py \
  --extension-dir "$EXTENSION_DIR" --receipt "$FORWARD_RECEIPT" \
  --apply --expect-plan "$PLAN_SHA"
```

## Required proof

- Receipt fields are the original `source`, `target`, complete seven-file `files`
  and `before` maps, exact ordered `changes`, old `marker_sha256`, exact `backup`,
  `verified: true` and `dry_run: false`. There is no required receipt version-two
  format, persisted-receipt field, or invented source hash. Source is descriptive,
  not a restore-byte source. The operator must trust the selected receipt: these
  unsigned hashes do not authenticate its author.
- All seven current installed hashes must match `files`. The current
  `.computer-use-managed.json` must record exactly that map and the correct UUID
  and marker version one; extra managed paths are refused. Its bytes must also
  match the original deployer's deterministic version-one publication format,
  reconstructed from `files` (not an invented receipt marker-hash field).
- Backup must be the **exact named directory under the selected target's
  `.backups/`**, not a search result. Its saved marker must match the receipt's
  actual old marker hash. The old marker's actual managed subset is preserved.
- Each changed, non-null old file requires actual saved bytes matching `before`.
  An unchanged old file may come from current bytes only after an exact hash
  match. Only an explicit `before[name]: null` authorizes that particular new
  managed file's removal. Missing backups or missing legacy marker members never
  imply absence. A partial old marker does not authorize deleting an unlisted
  preexisting file.
- First-install/no-old-marker receipts, incomplete legacy receipts, inconsistent
  proofs, manual edits, unsafe paths and changed identities fail closed.

Reads are bounded before and during I/O: 4 MiB per managed byte file, 16 KiB per
marker, and 64 KiB per receipt/journal. Symlink components, nonregular files,
hardlinked files, growth, duplicate JSON keys and invalid hashes are refused.
`O_NOFOLLOW` and `O_NONBLOCK` prevent link following and FIFO-open blocking.

## Preservation, locking and limits

Apply uses the shared stdlib `window_control_lock.target_lock(target)` context
manager on an **existing** target. Its persistent
`.computer-use-window-control.lock` inode must never be unlinked. The context
yields a target directory descriptor; contention fails rather than waiting.
The forward deployer uses the same lock for actual updates, rechecking its plan
after acquisition. Its previews and no-change applies do not create a lock.
Only these cooperating writers are serialized, not arbitrary external processes.

Before any managed publication/removal, apply creates an exclusive private sibling
directory named `.opencode-window-control@computer-use.local.restore-<random>`:

- `current/`: every current seven-file byte stream and the exact current marker;
- `desired/`: proven desired old bytes and exact old marker (null files omitted);
- `receipt.json`: the selected receipt's exact bytes;
- `plan.json`: the complete restore plan;
- `journal.jsonl`: fsynced, read-back preparation, intent, publication and terminal
  records, with synced recovery files and directory entries.

Original backup and receipt remain unchanged. Full input signatures/hashes and
directory identities are rechecked under flock before every managed mutation,
with an immediate destination check. Publication is atomic **per file**, marker
last; staged bytes and identity are checked before replacement. Deletion is only
for explicitly proved introduced files. Unrelated files,
other locks, backups and the persistent lock are preserved.

This is not a multi-file transaction. Unknown/uncooperative writers still have a
race between checking and rename/unlink; there is no hostile same-UID protection.
Restoration is byte-only, not ownership/mode/timestamp restoration. New private
files use mode 0600, directories 0700 (subject to umask); no chmod is performed.

## Interruption and inspection

Before the first managed mutation, stderr prints the **exact recovery path**.
Handled errors exit nonzero with `verified: false`, that retained path when
created, and an inspection error. Inspect `journal.jsonl`, `plan.json`, `current/`
and `desired/` at that path. A kill may leave only an intent record, or temporary
`.restore-*` files; preserve these too. Never delete lock inodes or original proof
to make a check pass.

No automatic rollback/resume is implemented. Partial installed state cannot pass
the original receipt's complete current-map check; re-running blindly is refused.
A preparation failure leaves the installed managed bytes untouched; a later
failure may leave some old bytes published. Retained copies support inspection,
not an invented complete recovery transaction. Only complete installed-byte and
terminal-journal readback returns `verified: true`; this is **not** Shell activation
or loaded-code acceptance. Any further recovery action requires separate scope.

## Verification

```bash
python3 -B scripts/test_restore_window_control.py
python3 -B scripts/test_deploy_window_control.py
```

Parent source verification: **26 restore tests and the original 6 forward tests
passed**; all five selected Python files parsed without writing bytecode. Restore
fixtures own cleanup and use the forward CLI entry point's original receipt and
backup contracts with the additive shared-lock integration. They use
real stdout/backups with isolated source configuration under `/tmp/opencode`.
The original six test bodies remain byte-exact and passed through a
scratch-cleanup-only runner.
Coverage includes legacy/partial markers, explicit absences, actual competing
process flock, unsafe files/bounds/growth, stale proof/target identities, injected
CAS edits, changed staging before publication, post-publication/removal
interruptions and bad journal readback. Parent reproduced staging-publication and
forward-lock failures before fixing them; actual competing-process contention now
refuses both forward and restore writes. Original test hash and both original
`0664` modes remain unchanged; the deployer intentionally adds locking. No real profile,
deployment, activation, restart, GUI or loaded-Shell test was performed.
