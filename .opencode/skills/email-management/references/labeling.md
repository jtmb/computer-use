---
name: email-labeling
description: Create a label or folder, move or archive with UID MOVE, verify by Message-ID, and record a rollback file; --delete-source is the only destructive fallback.
tags: "email,labels,move,archive,rollback"
---

# Labeling

Read this file before creating a label, moving, archiving, verifying, rolling
back, or using `--delete-source`. Read [`safety.md`](safety.md) before any
mutation.

## Preconditions

- Approval covers the exact sender list, UID list, count, destination, and
  action.
- The destination label exists or its creation is approved.
- The capability check from `discovery.md` is current.
- The plan names `source_folder` and `uidvalidity`, or both are passed
  explicitly.
- The plan was re-checked against current server state.

## Semantics

| Action | What changes | Reversible | Notes |
| --- | --- | --- | --- |
| Apply a label | Adds a label or folder membership. | Yes | Message stays in `INBOX`. |
| Archive on a label server | Removes the `\Inbox` label. | Yes | Message remains in All Mail. |
| Move | Removes from source, adds destination. | Yes, with the rollback file. | UID changes in the destination. |
| Delete or expunge | Removes the message. | No | Only the explicit `--delete-source` fallback. |
| Move to Trash | Not supported. | n/a | `mail_move.py` refuses spam, junk, trash, deleted, and bin destinations. |
| Report spam | Trains the provider filter. | Effectively no | Do not use unless requested. |

State the difference to the user before acting: archiving is not deleting, and
moving is reversible while deleting is not.

## Create the label first

`mail_move.py --apply` creates the destination only if it is missing. A dry run
validates the name but creates nothing.

```python
conn.create('"LABEL_NAME"')          # if creating manually
typ, data = conn.list('""', '"LABEL_NAME"')
```

- Nested labels may use the server's hierarchy separator, often `/`.
- Creating a near-duplicate label is a real risk. Compare the exact resolved
  name, including case and spaces.
- Do not rename, delete, or merge existing labels without separate approval.
- INBOX is not a valid move destination.

## Source metadata is mandatory

`mail_move.py` refuses to mutate without a source folder and a recorded
`UIDVALIDITY`.

| Input | What it supplies |
| --- | --- |
| `--from-plan PATH` | `source_folder`, `uidvalidity`, and the `MOVE` UID list. |
| `--uids PATH` object | `uids`, optional `source_folder`, optional `uidvalidity`. |
| `--uids PATH` array | UIDs only; add `--source-folder NAME` and `--uidvalidity N`. |

At apply time the tool compares the recorded `UIDVALIDITY` with the server and
aborts on a mismatch. It also rejects mixed or missing metadata. A stale UID is
never "repaired" silently.

## Move

Transport selection:

| Server | Transport | Gate |
| --- | --- | --- |
| `MOVE` advertised | Atomic `UID MOVE` per chunk. | None beyond `--apply`. |
| No `MOVE`, Gmail | `UID COPY`, then remove the source label with `-X-GM-LABELS`. | `--apply`. |
| No `MOVE`, classic IMAP | `UID COPY` + `\Deleted` + targeted `UID EXPUNGE`. | `--delete-source` plus `UIDPLUS`. |

Without `--delete-source`, the classic fallback refuses rather than leaving
duplicate copies. Without `UIDPLUS`, a targeted expunge is impossible and the
tool refuses.

## `--delete-source` destructive fallback

`--delete-source` is not a normal move option. It permits the non-Gmail
`COPY` + `\Deleted` + `UID EXPUNGE` path when `MOVE` is unavailable.

- Requires `UIDPLUS`; a bare `EXPUNGE` is never run.
- Never enabled by default.
- Requires separate explicit approval that names the action as destructive.
- If the expunge fails after the copy, duplicates remain; the rollback file and
  the per-chunk status record the partial state.
- On Gmail or any `MOVE`-capable server, `--delete-source` is ignored because
  the move or label removal needs no expunge.

Prefer `MOVE`. Prefer a label and archive over any expunge.

## Verify at the end

`mail_move.py` compares source and destination counts at the end, not after
every batch. It records the rollback entry per chunk. Pass `--verify` with
`--apply` to also check each message; `--verify PATH` checks a rollback file
read-only.

With `--verify`:

1. Checks each message is present in the destination and absent from the source
   by `Message-ID`:
   - Gmail: `UID SEARCH X-GM-RAW "rfc822msgid:<...>"`.
   - Other: `UID SEARCH HEADER Message-ID "<...>"`.
2. Compares source and destination server `STATUS` counts, taken after `NOOP`.
3. Exits non-zero when a source or destination count delta disagrees with the
   planned count.
4. Reports moved, skipped, and failed counts, plus verification results. The
   account address is redacted in reports.

Message-ID verification is authoritative. Gmail counts can lag a mutation, so a
count warning alone does not prove a failure; a verification failure does.
Do not verify with the pre-move UID. UIDs are per-folder and change on move.

## Rollback file

Write one JSON record before the first mutation and update it after each chunk.

```json
{
  "schema": "email-management/mail-move/1",
  "created": "2026-01-01T00:00:00Z",
  "server": "IMAP_HOST",
  "account": "USER@example.com",
  "action": "move",
  "destination": "LABEL_NAME",
  "source_folder": "INBOX",
  "source_uidvalidity": 1,
  "transport": "MOVE",
  "items": [
    {
      "message_id": "<id@example.com>",
      "from_mailbox": "INBOX",
      "from_uidvalidity": 1,
      "from_uid": 100,
      "to_uid": 200,
      "subject": "...",
      "status": "moved"
    }
  ]
}
```

Rules:

- Store it in a private `0600` file, by default under
  `$XDG_STATE_HOME/email-management/rollbacks/`.
- Never commit it; it contains private headers.
- Keep it until the user confirms the result, then delete it.
- `--rollback PATH` validates the recorded source folder and `UIDVALIDITY`,
  refuses spam, junk, trash, deleted, and bin sources, and locates each message
  by `Message-ID` (falling back to `to_uid` only when no Message-ID exists).
- A rollback writes a `.reversed.json` file so the rollback itself can be
  redone.
- Rollback cannot undo a delete or expunge; say so before deleting.

## Apply safely

- Dry-run first. The dry-run prints the exact planned UIDs, subjects, counts,
  transport, and rollback path. It does not create, copy, flag, or expunge
  anything.
- The dry-run does not show `NOISE` or `PROTECT` groups; those remain in the
  triage report and are not passed to `mail_move.py`.
- Re-check `UIDVALIDITY` and label existence immediately before `--apply`.
- Apply in bounded chunks; `--chunk-size` defaults to 100 and is capped at
  1000.
- On a count mismatch, `BYE`, or timeout: pause, re-read state, report partial
  progress, and do not start the next batch.
- The tool is not idempotent on classic IMAP. Applying the same plan twice can
  create duplicate copies. Always take a fresh dry-run; do not re-apply.

## Approval text

Make the approval request concrete:

```text
Destination: LABEL_NAME
Action: move (reversible)
Source: INBOX (UIDVALIDITY 1)
Messages: 143
Transport: UID MOVE
Rollback: recorded locally
Apply?
```

Do not proceed on silence, a changed subject, or an earlier general request. If
the transport is the `--delete-source` fallback, say "destructive fallback" and
ask separately.
