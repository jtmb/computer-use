# Email Management Usage

This guide explains how to use the `email-management` skill. The agent-facing
rules remain in [SKILL.md](./SKILL.md); references and this guide are not loaded
automatically when the skill is loaded.

Category: `email`

Tags: `email`, `imap`, `gmail`, `mailbox`, `triage`, `labels`, `spam`, `sorting`

## Purpose and when to use it

Use `email-management` to inventory a mailbox, classify mail by sender, create a
label, and move or archive messages over IMAP with approval before bulk
changes.

Appropriate requests include:

- "Show me which senders fill my inbox, without changing anything."
- "Sort promotional mail into a label, but keep receipts and security mail."
- "Archive these senders after showing me the plan."
- "Why did IMAP login fail, and is my app password set up correctly?"
- "Move this batch back; the sort was wrong."

Do not use it to automate a provider's browser sign-in. Hosted mail providers
refuse automation profiles; use IMAP instead.

## Prerequisites and setup verification

Normal use requires:

- Python 3 with stdlib `imaplib` and `email`.
- IMAP enabled for the account. OAuth2 and REST clients are not implemented.
- Two-factor authentication enabled and an app password issued.
- `secret-tool` on `PATH` (libsecret), or a supported password source described
  below.
- Outbound TLS to `IMAP_HOST:993`, or port 143 with `--starttls`. Do not use
  plaintext or disable certificate verification.

Store the secret once with `secret-tool`; the prompt does not echo it:

```bash
secret-tool store --label="IMAP USER@example.com" service imap user USER@example.com
```

The scripts resolve a secret in this order: `--password-stdin`,
`--password-env VAR`, `EMAIL_APP_PASSWORD`, then
`secret-tool lookup service imap user USER@example.com`. Prefer `secret-tool`
or `--password-stdin`; an environment variable can leak to child processes. The
lookup and read-only login check are in
[`references/access.md`](references/access.md).

If IMAP is disabled, the provider rejects the app password, or the network
blocks port 993, stop and report the blocker. Do not retry a browser sign-in or
weaken TLS.

## How to request it

Ask in ordinary language. Example requests:

- "Inventory my mailbox folders and tell me whether a `LABEL_NAME` label already
  exists. Do not change anything."
- "Scan the newest 100 messages and group them by sender. Show counts and a few
  subjects."
- "Propose which senders to archive into `LABEL_NAME`, but protect banks,
  receipts, and security mail."
- "Apply the approved plan and verify the move."
- "Roll back the last batch using the rollback file."

The user does not need to know IMAP commands, UID rules, or script flags. The
agent selects those details and presents the plan for approval.

## Worked workflow and expected result

1. Confirm the account, the mailbox, and whether the user wants a read-only
   inventory or a change.
2. Store or locate the app password through `secret-tool` or stdin; connect over
   TLS and verify login read-only. Do not proceed if the check fails.
3. Enumerate folders or labels, counts, capabilities, and destination existence.
   `mail_scan.py` does not do this; it scans one folder. Report the server
   model: folders or labels.
4. Scan headers newest-first in bounded chunks. `mail_scan.py` fetches no body
   and exits non-zero on a search that looks like the whole mailbox unless
   `--allow-suspicious-search` is set.
5. Aggregate by sender, apply the veto and human signals, and present a small
   batch with counts and sample subjects. Ask for approval.
6. Create the label if approved, run the dry-run, then apply. The plan must name
   the source folder and UIDVALIDITY. Record the rollback file.
7. After `--apply`, run `--verify` to check each message with server search by
   `Message-ID`, not the pre-move UID. Report moved, skipped, and failed counts;
   triage reports `PROTECT` and `NOISE`. A count delta that disagrees exits
   non-zero.
8. Delete temporary exports, revoke the temporary app password, and summarize
   what changed.

Expected result: the destination label contains exactly the approved messages,
protected mail remains in the inbox, verification counts reconcile, and a
rollback file exists until the user accepts the result.

## Tools and commands

The bundle's `scripts/` directory contains the automation entry points. This
guide documents their behavior; confirm the current flags with `--help` before
use. The scripts are maintained with the bundle and may have more options than
listed here.

| Script | Behavior |
| --- | --- |
| `mail_common.py` | Shared helpers for credential resolution, TLS or STARTTLS connection, mailbox quoting, header decoding, and JSON I/O. Not a mutation entry point. |
| `mail_scan.py` | Read-only single-folder header scan. Opens the folder with EXAMINE, fetches with `BODY.PEEK`, processes newest-first, and writes JSONL. It does not enumerate folders or capabilities. |
| `mail_triage.py` | Offline classification over a scan export. Aggregates by sender, emits `MOVE`/`NOISE`/`ASK`/`PROTECT`, and can write a plan whose `uids` are MOVE only. No network and no mailbox writes. |
| `mail_move.py` | Applies a reviewed plan. Dry-run by default; mutates only with `--apply`. Requires `source_folder` and `uidvalidity`, verifies by `Message-ID`, and is not idempotent. |

Key flags (confirm with `--help`):

| Script | Flags |
| --- | --- |
| `mail_scan.py` | `--user`, `--host`, `--port`, `--starttls`, `--password-stdin`, `--password-env`, `--timeout`, `--folder`, `--limit`, `--search`, `--imap-search`, `--fields`, `--out`, `--json`, `--chunk-size`, `--yes`, `--allow-suspicious-search` |
| `mail_triage.py` | `--input`, `--rules`, `--report`, `--emit-plan`, `--min-sender-count`, `--self-test` |
| `mail_move.py` | `--label`, `--uids`, `--from-plan`, `--rollback`, `--source-folder`, `--uidvalidity`, `--apply`, `--verify`, `--rollback-out`, `--delete-source`, `--chunk-size`, `--self-test` |

Important behavior:

- `mail_scan.py` is read-only; treat any write from it as a defect.
- `mail_scan.py` scans one folder. Inventory folders, counts, and capabilities
  separately with `LIST`, `STATUS`, and `CAPABILITY` as described in
  [`references/discovery.md`](references/discovery.md).
- A scan search that appears to return the whole mailbox exits non-zero unless
  `--allow-suspicious-search` is set. Inspect the query before overriding.
- `mail_triage.py` is offline; it cannot see mail that is not in the export.
  Pass every historical scan if the sender-veto history must be complete.
- `mail_move.py` prints the exact planned UIDs, subjects, counts, transport, and
  rollback path without `--apply`. It does not receive NOISE or PROTECT groups;
  those stay in the triage report for review.
- `mail_move.py` refuses a plan without `source_folder` and `uidvalidity`. Use a
  plan from `--from-plan`, or pass `--source-folder` and `--uidvalidity` with a
  bare UID list.
- A server count delta that disagrees with the planned count exits non-zero.
  `Message-ID` verification remains authoritative.
- The tool is not idempotent: applying the same plan twice can create duplicates
  on classic IMAP. Take a fresh dry-run and keep the rollback file.
- `--delete-source` permits the non-Gmail `COPY` + `\Deleted` + targeted
  `UID EXPUNGE` fallback when `MOVE` is unavailable. It requires `UIDPLUS`, is
  destructive, and needs separate explicit approval.
- Flags select the account, folder, input or output path, bounds, and
  destination label. Do not guess a flag; read `--help`.

These examples are representative invocations, not recorded output. Run them
only after reading `--help` and confirming the account and scope:

```bash
python3 .opencode/skills/email-management/scripts/mail_scan.py --help
python3 .opencode/skills/email-management/scripts/mail_triage.py --help
python3 .opencode/skills/email-management/scripts/mail_move.py --help
```

A representative scan, triage, and move sequence is:

```bash
scripts/mail_scan.py --user USER@example.com --folder INBOX --limit 200 \
  --out /tmp/opencode/email/scan.jsonl
scripts/mail_triage.py --input /tmp/opencode/email/scan.jsonl --report \
  --emit-plan /tmp/opencode/email/plan.json
scripts/mail_move.py --from-plan /tmp/opencode/email/plan.json \
  --label LABEL_NAME
scripts/mail_move.py --from-plan /tmp/opencode/email/plan.json \
  --label LABEL_NAME --apply
```

## Verification and known limitations

Verification steps:

1. Confirm syntax with `python3 -m py_compile` on each script.
2. Confirm `--help` documents the flags actually used.
3. Run the scan read-only and compare its counts with `STATUS MESSAGES` and
   `STATUS UNSEEN` for the same folder. The scanner does not inventory other
   folders or capabilities.
4. Confirm the scan left unread counts unchanged and did not fetch bodies.
5. Review the triage plan: PROTECT messages excluded, mixed senders asked
   about, receipts kept, and only MOVE UIDs actionable.
6. Run the move dry-run and compare the exact planned UIDs, subjects, counts,
   transport, and rollback path with the approved plan.
7. After `--apply`, verify with server search by `Message-ID` and compare
   source and destination counts. A count delta that disagrees exits non-zero.
8. Confirm the rollback file lists every moved message and that a dry-run
   rollback is possible. Do not re-apply the same plan; the tool is not
   idempotent.

Known limitations:

- IMAP UIDs are per-folder and change on move; only `Message-ID` is a stable
  cross-folder key.
- Gmail-style labels overlap. Counts across labels cannot be summed, and All
  Mail contains archived mail.
- Server search syntax and capability support vary. `X-GM-RAW`, `MOVE`, and
  `UIDPLUS` are not universal.
- Category labels may be empty; promotional classification must use headers.
- Web client counts can lag the server; trust server `STATUS`.
- A mailbox with tens of thousands of messages needs chunking and a resume path.
- The scanner fetches headers only. It does not inspect bodies.
- The scripts cannot verify a human intent. Approval of the exact scope remains
  a required step.

## Troubleshooting

- Login rejected: reissue the app password with 2FA, confirm IMAP is enabled,
  and check whether the provider requires OAuth2.
- Browser sign-in rejected: stop; the automation profile is refused by policy.
  Use IMAP.
- Certificate error: correct the hostname and system trust store. Never disable
  verification.
- Timeout on a large mailbox: reduce the batch size, resume from the last
  completed UID, and use one connection.
- Scan exits non-zero with a suspicious-search warning: narrow `--search` or
  inspect the result. Set `--allow-suspicious-search` only after review.
- Count mismatch after a search: cross-check with `STATUS` or a narrower
  `X-GM-RAW` query; do not mutate on an unverified count.
- Move refuses without source metadata: use `--from-plan`, or pass
  `--source-folder` and `--uidvalidity` with a bare UID list.
- Move refuses a destination: `mail_move.py` rejects INBOX and spam, junk,
  trash, deleted, and bin destinations, including Gmail system folders.
- Move reported as failed but mail moved: verification used the old UID. Search
  the destination by `Message-ID`.
- Unexpected duplicates: the same plan was applied twice, or a copy ran without
  removing the source label. Reconcile from the rollback file before continuing.
- User filed mail during the run: re-read state, report partial completion, and
  do not guess.
- Ambiguous sender: keep it, ask, and show the sample subjects.

## Safety, confirmation, and elevation

The agent must:

- Keep discovery, search, and header scan read-only.
- Fetch with `BODY.PEEK`; never mark mail read as a side effect.
- Ask before any bulk label, move, archive, delete, spam report, filter rule, or
  send.
- Treat delete and expunge as irreversible and require separate approval.
  `--delete-source` is the only expunge path and is never routine.
- Never store credentials in the repository, chat, task memory, or shell
  history.
- Delete private header exports and rollback data when the task ends.
- Never disable TLS verification or enable less-secure access.
- Stop when the requested action conflicts with protecting bank, brokerage,
  government, school, medical, insurance, travel, security-code,
  password-reset, or receipt-shaped mail.

The detailed gates are in [`references/safety.md`](references/safety.md) and
[`references/labeling.md`](references/labeling.md).

## Related skills and documents

- [`files-and-documents`](../files-and-documents/README.md) handles local
  exports and document inspection.
- [`task-memory`](../task-memory/README.md) carries durable preferences; never
  store credentials or private mail there.
- [`skill-maintenance`](../skill-maintenance/README.md) covers bundle and
  catalog changes.
- The canonical catalog is `.opencode/skills/README.md` in the repository.
