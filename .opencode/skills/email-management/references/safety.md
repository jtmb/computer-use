---
name: email-safety
description: Approval gates, secret-tool credential handling, privacy, irreversibility rules, and conflict checks for IMAP mailbox automation.
tags: "email,safety,approval,credentials,privacy"
---

# Safety

Read this file before handling credentials, exporting mail metadata, mutating a
mailbox, or acting on a destructive request.

## Approval gates

| Action | Gate |
| --- | --- |
| `LIST`, `STATUS`, `SEARCH`, header scan | Read-only; still scoped to the named account and folders. |
| Export headers to a private temp file | Tell the user; mode `600`; delete when done. |
| Create a label or folder | Approval if it was not already requested. |
| Show a dry-run plan | Required before any bulk mutation. |
| Bulk label, move, or archive | Explicit approval of the exact scope: senders or UIDs, count, destination, action. |
| `--delete-source` fallback | Separate explicit approval that names the expunge as destructive; `UIDPLUS` required. |
| Delete, expunge, empty Trash | Separate explicit destructive approval, plus a statement that it cannot be undone. |
| Report spam or create a filter rule | Explicit approval; explain that it trains the provider filter and can suppress legitimate mail. |
| Send, reply, or forward | Explicit approval for each message. |
| Unsubscribe | Explicit approval; it can contact the sender and confirm the address. |
| Account or security settings, password reset, app-password revocation | User action or separate explicit approval. |

A general request to organize or clean up a mailbox is not approval for a
specific bulk operation. Approval must name or accept a presented scope.

## Read-only by default

- Discovery, search, and header scan must not change flags, labels, or folders.
- Use `BODY.PEEK`, read-only selection, and `STATUS` rather than mutating reads.
- Dry-run is the default for `mail_move.py`. A mutation requires `--apply`.
- Show the exact count and sample before applying. Silence is not approval.

## Credentials

- Store the secret with `secret-tool`:
  `secret-tool store --label="IMAP USER@example.com" service imap user USER@example.com`.
- The scripts look it up with
  `secret-tool lookup service imap user USER@example.com`.
- Supported alternatives are `--password-stdin`, `--password-env VAR`, and
  `EMAIL_APP_PASSWORD`, in that order before the `secret-tool` lookup. Prefer
  `secret-tool` or stdin; environment variables leak to child processes.
- Never pass a secret as a command-line argument.
- Never store a secret in the repository, task memory, chat, shell history,
  screenshots, or logs.
- Redact the account address and any token material from reports and command
  output. `mail_move.py` redacts the account in its reports.
- Use a temporary app password where possible and have the user revoke it after
  the task.
- If a secret is exposed, stop, tell the user to revoke and rotate it, and
  remove the exposed artifact. Do not hide the incident.
- Never disable TLS verification, downgrade to plaintext, or enable
  less-secure-app access.

## Privacy

Mail headers and bodies are private.

- Do not paste real subjects, addresses, or message bodies into the repository,
  commits, task memory, or shared reports.
- Use placeholders in documentation and examples: `USER@example.com`,
  `LABEL_NAME`, `APP_NAME`, `IMAP_HOST`.
- Keep samples minimal and relevant. Prefer counts and rule names over content.
- Put scans, plans, and rollback files in a private temporary directory with
  mode `600`.
- Delete header exports, triage plans, and cached bodies when the task ends.
- Do not send mail content to an external service without explicit approval.
- Do not log credentials, full headers, or bodies by default.

## Irreversibility

| Action | Undo |
| --- | --- |
| Apply label | Remove the label. |
| Archive | Re-add the `\Inbox` label or move back. |
| Move | Reverse with the rollback file, matched by `Message-ID`. |
| Delete / expunge | Impossible. |
| `--delete-source` fallback | Impossible once `UID EXPUNGE` succeeds. |
| Report spam | Not reliably reversible; it changes future filtering. |
| Provider filter rule | Not automatically reversible; it persists until removed. |
| Unsubscribe | Not reversible; the sender may treat the address as confirmed. |

`mail_move.py` refuses spam, junk, trash, deleted, and bin destinations. Do not
describe a Trash move as supported by these scripts.

Routine moves never expunge: they use `UID MOVE`, or a copy plus label removal.
`--delete-source` is the only expunge path. Treat it as an explicitly approved
destructive fallback, not a convenience for a stuck move.

Never describe a delete as reversible.

## Counts and retries

- A source or destination `STATUS` delta that disagrees with the planned count
  makes `mail_move.py` exit non-zero. Stop and investigate.
- `Message-ID` verification is authoritative; Gmail counts can lag.
- The tool is not idempotent on classic IMAP. Do not re-apply the same plan;
  take a fresh dry-run. A second application can create duplicates.
- Keep the rollback file until the user accepts the result.

## Conflict checks

Stop and ask when the stated goal conflicts with the proposed action:

- Archiving security alerts, password resets, or verification codes.
- Moving bank, brokerage, government, school, medical, insurance, or travel
  booking mail.
- Deleting "old" mail that may contain receipts, statements, or tax records.
- Sorting a mixed sender's billing mail together with its marketing.
- Reporting legitimate transactional mail as spam because the user called it
  "junk".

Do not silently narrow, widen, or reinterpret the request to avoid the conflict.

## External changes

The user may file, read, or delete mail in another client while the run is
active.

- Re-read folder state immediately before each apply batch.
- Treat current server state as authoritative.
- Abort if `UIDVALIDITY` changed, a target label disappeared, or counts moved
  outside the expected range.
- Report partial completion and the rollback file; do not guess what happened.

## Incident response

If a credential leaks, a batch moves protected mail, or a delete occurs without
approval:

1. Stop all mutation.
2. Preserve the rollback file and current counts.
3. Tell the user plainly what happened and what is recoverable.
4. Revoke the credential or restore mail only with the user's direction.
5. Do not continue with the original plan in the same run.
