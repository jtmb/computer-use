---
name: email-discovery
description: Enumerate IMAP mailboxes, labels, counts, special-use flags, UID semantics, and server capabilities before designing any mailbox plan.
tags: "email,imap,folders,labels,capabilities"
---

# Discovery

Read this file before enumerating mailboxes, checking a label, or designing a
move. Discovery is read-only.

## Folders and labels are different models

| Model | What a "folder" is | Archive means | Delete means |
| --- | --- | --- | --- |
| Classic IMAP | A mailbox containing messages. | Move the message out of `INBOX`. | Move to Trash, then expunge (not a `mail_move.py` destination). |
| Gmail-style labels | A label; a message may carry several. All Mail holds every message. | Remove the `\Inbox` label; the message remains in All Mail. | Move to Trash, then delete permanently (not supported by `mail_move.py`). |

Consequences:

- On a label server, the same message appears in multiple mailboxes with a
  different UID in each. Counts across labels overlap; never sum them.
- All Mail contains archived and inbox mail. A search there is complete; a
  search in `INBOX` is not.
- A folder name is not portable. Resolve special mailboxes by attributes
  (`\Inbox`, `\Sent`, `\Drafts`, `\Trash`, `\Junk`, `\All`, `\Flagged`,
  `\Important`), not by localized display name.
- Gmail category labels such as `CATEGORY_PROMOTIONS` may be unused or empty.
  Never assume promotional mail carries them.
- `mail_move.py` refuses spam, junk, trash, deleted, and bin destinations,
  including Gmail system folders. Deletion is not a supported move action; the
  only expunge path is the explicitly approved `--delete-source` fallback in
  [`labeling.md`](labeling.md).

## Enumerate before acting

```python
typ, boxes = conn.list()                 # LIST "" "*"
for raw in boxes:
    print(raw.decode("utf-8", "replace"))
```

Use `LIST` to answer:

- Which mailboxes exist, including nested names.
- Which special-use attributes the server advertises.
- Whether the destination label already exists, exactly.
- Whether the name needs quoting, and which hierarchy separator is used.

Check the destination before creating it. A case difference, a space, or a
different hierarchy separator creates a near-duplicate label. If the name is
ambiguous, ask instead of guessing.

`mail_scan.py` does not perform this inventory. It opens one folder, scans its
headers, and reports that folder and UIDVALIDITY. Enumerate other folders,
counts, and capabilities separately with `LIST`, `STATUS`, and `CAPABILITY`, or
the helpers in `mail_common.py`.

Read counts with `STATUS`; do not select a mailbox read-write to inspect it.

```python
conn.status("INBOX", "(MESSAGES UNSEEN UIDNEXT UIDVALIDITY)")
```

| Field | Use |
| --- | --- |
| `MESSAGES` | Baseline count before and after a move. |
| `UNSEEN` | Unread count from the server, not the web client. |
| `UIDNEXT` | Next UID; useful for incremental scans. |
| `UIDVALIDITY` | Epoch for the UID space; changes invalidate saved UIDs. |

## UID semantics

- A UID identifies a message only within one mailbox.
- UIDs are assigned in increasing order and are not reused while `UIDVALIDITY`
  is unchanged.
- A move or copy gives the message a new UID in the destination.
- If `UIDVALIDITY` changes, discard saved UIDs and rescan that mailbox.
- Record the tuple `(mailbox, UIDVALIDITY, UID)` for every planned action.
- Deduplicate across label mailboxes with `X-GM-MSGID` or `Message-ID`, not UID.

## Capabilities

Request `CAPABILITY` after login and record the result before planning.

| Capability | Enables | Plan impact |
| --- | --- | --- |
| `IMAP4rev1` | Baseline commands. | Fallback only. |
| `UIDPLUS` | `UID EXPUNGE`, `COPYUID`, `APPENDUID`. | Safe targeted expunge after a copy. |
| `MOVE` | Atomic `UID MOVE`. | Preferred move path. |
| `X-GM-EXT-1` | `X-GM-RAW`, `X-GM-LABELS`, `X-GM-MSGID`, `X-GM-THRID`. | Gmail query search, label changes, stable IDs. |
| `UNSELECT` | Close a mailbox without expunging. | Optional convenience. |

If `MOVE` is absent:

1. `UID COPY` to the destination.
2. `UID STORE +FLAGS.SILENT (\Deleted)` on the source UID.
3. `UID EXPUNGE` for that UID only, when `UIDPLUS` is present.

Without `UIDPLUS`, do not run a bare `EXPUNGE`: it can purge unrelated messages
already marked deleted by another client. Stop and ask for a different approach.

## Read-only inventory artifact

Produce one inventory before scanning headers:

| Field | Example |
| --- | --- |
| Server and account | `IMAP_HOST`, `USER@example.com` (redact in reports) |
| Capabilities | `IMAP4rev1 UIDPLUS MOVE X-GM-EXT-1` |
| Mailboxes | name, attributes, `MESSAGES`, `UNSEEN`, `UIDVALIDITY` |
| Destination label | exists / missing, exact resolved name |
| Server model | classic folders or labels |

Keep the artifact in a private temporary directory with mode `600`. It contains
private mailbox structure; delete it when finished. Do not commit it.

## Re-check before mutating

Immediately before a mutation, re-run `LIST`, the destination check, and
`STATUS`/`UIDVALIDITY`. The user or another client may have filed mail since the
scan. Treat current server state as authoritative; abort on a changed
`UIDVALIDITY` or a vanished destination.
