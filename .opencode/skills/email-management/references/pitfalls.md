---
name: email-pitfalls
description: Failure catalogue for mailbox automation, each entry as symptom, cause, and fix, covering regex, UIDs, search counts, labels, counts, chunking, and external changes.
tags: "email,pitfalls,verification,failure-modes"
---

# Pitfalls

Read this file when a count, move, search, or verification disagrees with
expectation, or before designing a classifier that could repeat a known failure.

## Catalogue

| # | Symptom | Cause | Fix |
| --- | --- | --- | --- |
| 1 | Multi-word safety phrases never match; `security alert` is treated as safe. | A pattern compiled with `re.VERBOSE` ignores unescaped whitespace, so the phrase becomes `securityalert`. | Do not use verbose mode for phrase lists. Escape or join phrases explicitly and self-test a known phrase. |
| 2 | A successful move is reported as failed or missing. | The old UID was used to verify. UIDs are per-folder and change on move. | Verify in the destination by `Message-ID` with server search; record the new UID. |
| 3 | A narrow search returns a bogus count, often all messages or none. | An unsupported search key was silently ignored, or the count was read from the wrong response element. | Cross-check with `STATUS MESSAGES`, a narrower `X-GM-RAW` query, or a known `Message-ID` lookup. Abort on mismatch. |
| 4 | Promotional mail exists but category-based search returns nothing. | Gmail category labels may be unused or empty. | Classify by headers, sender, and `List-Unsubscribe`; never rely on category labels. |
| 5 | The web client's tab title shows a different unread count from the server. | The client caches or delays updates. | Trust `STATUS UNSEEN` and `UID SEARCH UNSEEN`; refresh the client only for the user's benefit. |
| 6 | A large scan times out, exhausts memory, or disconnects. | A folder with tens of thousands of messages was fetched in one command. | Chunk `UID FETCH`, report progress, keep a resumable cursor, back off on `BYE`, reconnect once. |
| 7 | Receipts and billing mail get moved even though the sender is "marketing". | Per-sender rules assume a sender has one purpose; mixed senders leak transactional mail. | A veto-matching subject is `PROTECT`; a sender that ever matched it is `ASK`. Split the sender by message action. |
| 8 | Verification fails mid-run or messages appear in unexpected folders. | The user filed mail manually in another client while the batch ran. | Re-read state before each batch; treat server state as authoritative; abort on `UIDVALIDITY` change. |
| 9 | Opening a scan marks unread mail as read. | `BODY[]`, `RFC822`, or `RFC822.TEXT` was used instead of `BODY.PEEK`. | Use `BODY.PEEK` only; audit every fetch command before running it. |
| 10 | The scanner crashes or mangles subjects with emoji or `unknown-8bit`. | The declared charset is missing, wrong, or not a Python codec. | Decode defensively: declared charset, UTF-8, Latin-1, with `errors="replace"`; normalize NFC after decoding. |
| 11 | Unrelated deleted messages disappear after a move. | A bare `EXPUNGE` ran, or `--delete-source` was used without `UIDPLUS` and a targeted expunge. | Keep `--delete-source` off by default; require `UIDPLUS` and expunge only the moved UID. |
| 12 | The app password appears in shell history or a process list. | The secret was passed with `-p`, an argument, or `echo`. | Read from `secret-tool` or stdin inside the process; revoke and rotate any exposed password. |
| 13 | Counts double-count or messages look duplicated. | The same message has a different UID in each label mailbox, and All Mail overlaps Inbox. | Deduplicate by `X-GM-MSGID` or `Message-ID`; never sum counts across labels. |
| 14 | "Archive" leaves the message in the inbox, or a copy appears twice. | The server uses labels, and the code copied instead of removing `\Inbox`. | Remove the `\Inbox` label with `-X-GM-LABELS`, or use `UID MOVE`; verify with server search. |
| 15 | Browser sign-in is rejected with a security page. | The provider refuses automation profiles; retries and flag spoofing cannot pass risk control. | Stop the browser path; use IMAP or have the user sign in interactively. |
| 16 | A rerun duplicates labels or moves messages twice. | The plan is not idempotent and does not check current membership; classic IMAP duplicates are expected on re-apply. | Take a fresh dry-run, skip messages already in the destination, and never re-apply the same plan. |
| 17 | A narrow-looking scan returns the whole folder and exits non-zero. | The server ignored or broadened the query; `mail_scan.py` treats a whole-folder result as suspicious. | Narrow `--search`, check `STATUS`, and use `--allow-suspicious-search` only after review. |
| 18 | `mail_move.py` refuses to mutate a UID list. | The input has no `source_folder` or `uidvalidity`. | Use `--from-plan`, or pass `--source-folder` and `--uidvalidity` with `--uids`. |

## Details for the subtle cases

### Verbose regex strips spaces

```python
import re

BAD = re.compile(r"security alert|password reset", re.VERBOSE)
GOOD = re.compile(r"security\ alert|password\ reset")
SAFE = re.compile(re.escape("security alert") + "|" + re.escape("password reset"))

assert BAD.search("securityalert")      # matches the wrong text
assert not BAD.search("security alert") # dangerous false negative
assert GOOD.search("security alert")
assert SAFE.search("security alert")
```

Keep phrase lists as data, build the pattern with `re.escape`, and assert one
positive and one negative case before using the pattern.

### UIDs are local and unstable

```text
INBOX UID 42  --move-->  LABEL_NAME UID 900
```

The message is the same; the identifier is not. Any verification, retry, or
rollback that uses `(INBOX, 42)` after the move is wrong. Key on `Message-ID`
and record both folder tuples, including `UIDVALIDITY`.

### Search counts need a second opinion

Before a mutation:

1. Record `STATUS MESSAGES` for source and destination.
2. Run the narrow search.
3. Compare the returned UID count with the expected count.
4. If they differ, do not mutate; diagnose the query and the parser.

After a mutation, compare counts again and verify a small sample by
`Message-ID`.
