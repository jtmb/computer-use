---
name: email-management
description: Triage, sort, label, and archive IMAP mailboxes with read-only discovery, sender-level classification, and approval before bulk changes. Use when the user asks to clean up an inbox, sort mail by sender, label or archive messages, or automate mailbox triage over IMAP.
metadata:
  schema-version: "1"
  category: "email"
  tags: "email,imap,gmail,mailbox,triage,labels,spam,sorting"
---

# Email Management

Operate a user's mailbox through IMAP (`imaplib`). Only IMAP is implemented;
there is no REST client in this bundle. Read-only first; mutate only after
approval. Automating a browser sign-in for hosted mail is not a supported path.

## Mandatory reference gate

Read [`references/safety.md`](references/safety.md) before any credential use,
export, or mutation. Read [`references/access.md`](references/access.md) before
connecting. Then read only the references that match the current phase:

| Reference | Name | Tags | Read when |
| --- | --- | --- | --- |
| [`references/access.md`](references/access.md) | `email-access` | `email,imap,credentials,tls,providers` | Before any connection, credential lookup, provider setup, or login-failure diagnosis. |
| [`references/discovery.md`](references/discovery.md) | `email-discovery` | `email,imap,folders,labels,capabilities` | Before enumerating mailboxes, checking label existence, or planning a move. |
| [`references/fetch.md`](references/fetch.md) | `email-fetch` | `email,imap,headers,search,mime` | Before any search, header scan, or message-part fetch. |
| [`references/triage.md`](references/triage.md) | `email-triage` | `email,triage,senders,classification,approval` | Before classifying mail or proposing what to move. |
| [`references/labeling.md`](references/labeling.md) | `email-labeling` | `email,labels,move,archive,rollback` | Before creating a label, moving, archiving, verifying, or rolling back. |
| [`references/safety.md`](references/safety.md) | `email-safety` | `email,safety,approval,credentials,privacy` | Before credentials, exports, mutations, destructive requests, or conflict checks. |
| [`references/pitfalls.md`](references/pitfalls.md) | `email-pitfalls` | `email,pitfalls,verification,failure-modes` | When a count, move, search, or verification disagrees with expectation. |

Rules:

- Read only the matching references. Do not preload the whole bundle.
- Read a selected reference in full before acting on its procedure.
- Loading this skill reads only `SKILL.md`; references and the usage guide are
  not loaded automatically.
- Repository-root `AGENTS.md` overrides this skill where they differ.

## Non-negotiable rules

1. Read-only until approved. Discovery, search, and header scan never write.
2. Fetch headers with `BODY.PEEK`, never `BODY[]`; `BODY[]` can set `\Seen`.
3. Never delete or expunge without separate explicit approval. Prefer label,
   archive, and move.
4. Never run a bulk mutation without a reviewed plan and explicit approval of
   its exact scope.
5. Never put credentials in a repository, chat, memory file, shell history,
   command argument, or log. Use `secret-tool`, `--password-stdin`, or a named
   environment variable.
6. Never disable TLS verification or fall back to plaintext.
7. Never use the provider's spam/report-spam action unless explicitly asked.
8. Stop and ask when the stated goal conflicts with the proposed action.

## Workflow

1. Establish access. Read `access.md`, retrieve the secret through `secret-tool`
   or stdin, connect over TLS, and verify login read-only. Do not enumerate or
   mutate before the login check passes.
2. Inventory. Read `discovery.md`; enumerate mailboxes, special-use flags,
   counts, capabilities (`X-GM-EXT-1`, `MOVE`, `UIDPLUS`), and whether the
   target label exists. `mail_scan.py` scans one folder and does not enumerate
   these; use `LIST`/`STATUS`/`CAPABILITY` or the shared helpers. Confirm the
   server model: folders or labels.
3. Scan. Read `fetch.md`; run `mail_scan.py` newest-first in bounded UID
   chunks. Decode RFC 2047 headers defensively. The scanner fetches headers
   only. A suspicious search that looks like the whole mailbox exits non-zero
   unless `--allow-suspicious-search` is explicitly set.
4. Classify. Read `triage.md`; aggregate by sender, apply the veto and human
   signals, and split MOVE from NOISE, ASK, and PROTECT.
5. Approve. Present counts, sample subjects, the action and its reason.
   Request approval for that exact scope. Calibrate on a small newest-first
   batch before scaling.
6. Apply. Read `labeling.md` and `safety.md`; check the source folder and
   UIDVALIDITY, dry-run, then apply. Use the documented transport: `UID MOVE`,
   label removal, or the approved `--delete-source` fallback. Record the
   rollback file.
7. Verify. Confirm with `--verify` and server search, not the pre-move UID.
   Report moved, skipped, and failed counts. `PROTECT` and `NOISE` counts come
   from the triage report.
8. Clean up. Delete cached exports, revoke temporary app passwords, and remove
   any plaintext secret material.

## Scripts

The bundle's `scripts/` directory holds `mail_common.py`, `mail_scan.py`,
`mail_triage.py`, and `mail_move.py`. Treat their presence and flags as
authoritative only after `--help` and a read-only run.

| Script | Contract |
| --- | --- |
| `mail_common.py` | Shared IMAP helpers: credential resolution (stdin, named env, `EMAIL_APP_PASSWORD`, `secret-tool`), TLS or STARTTLS connection, header decoding, mailbox quoting, and JSON I/O. Not a mutation entry point. |
| `mail_scan.py` | Read-only single-folder header scan. Opens the folder with EXAMINE, fetches with `BODY.PEEK`, processes newest-first, writes JSONL. Does not list folders or capabilities. |
| `mail_triage.py` | Offline sender aggregation and classification over a scan export. Emits `MOVE`/`NOISE`/`ASK`/`PROTECT`; only MOVE UIDs are actionable. No network, no mailbox writes. |
| `mail_move.py` | Applies a reviewed move plan. Dry-run by default; mutates only with `--apply`. Requires source folder and UIDVALIDITY. Verifies by `Message-ID`; not idempotent. |

Never infer a flag from this document. Run `--help` first.

## Stop conditions

Stop and ask when:

- Login fails, the provider blocks the client, or IMAP is disabled.
- The target label does not exist and creating it was not approved.
- A proposed batch includes bank, brokerage, government, school, medical,
  insurance, travel, security-code, password-reset, or receipt-shaped mail.
- A sender mixes billing or security mail with marketing.
- The plan lacks `source_folder` or `uidvalidity` and the user has not supplied
  them explicitly.
- A server count delta disagrees after a move.
- `--delete-source` is requested; treat it as destructive and separate.
- `UIDVALIDITY` changed, or the user moved mail mid-run.
- Verification counts disagree with the server.
- The requested action is delete, expunge, spam report, filter creation, send,
  or an account/security change.

## Usage guide

When the user asks how to use this skill, also read [README.md](./README.md)
for request examples, prerequisites, commands, verification, and safety.
