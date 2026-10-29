---
name: email-fetch
description: Scan one IMAP folder safely with BODY.PEEK, newest-first UID chunks, X-GM-RAW search, suspicious-search refusal, and defensively decoded headers.
tags: "email,imap,headers,search,mime"
---

# Fetch

Read this file before any search, header scan, or message-part fetch. Fetching
is read-only only when it uses `PEEK`.

## Never mark mail read

Use `BODY.PEEK[...]` for every fetch. Never use `BODY[]`, `RFC822`, or
`RFC822.TEXT`; those can set `\Seen` and silently destroy an unread inbox.

`mail_scan.py` opens the folder with `EXAMINE`, fetches with `BODY.PEEK`, and
never requests a body part.

```python
fields = "(FROM SUBJECT DATE LIST-UNSUBSCRIBE MESSAGE-ID)"
typ, data = conn.uid(
    "FETCH", uid, f"(UID FLAGS BODY.PEEK[HEADER.FIELDS {fields}])"
)
```

## What the scanner collects

`mail_scan.py` requests only these headers, plus `UID`, `FLAGS`, and on Gmail
`X-GM-LABELS`:

| Field | Use |
| --- | --- |
| `From` | Sender address and display name; the triage aggregation key. |
| `Subject` | Display and subject-pattern classification. |
| `Date` | Ordering context in the report. |
| `List-Unsubscribe` | Boolean bulk-mail signal. |
| `Message-ID` | Stable identity for verification and rollback. |

It does not fetch `To`, `Cc`, `List-Id`, `In-Reply-To`, `References`,
`Auto-Submitted`, or `Precedence`. Do not design a rule that depends on them
without changing the scanner and its triage input.

JSONL output fields:

| Field | Meaning |
| --- | --- |
| `uid` | UID in the scanned folder. |
| `from`, `from_name` | Parsed sender address and display name. |
| `subject`, `date` | Decoded header values. |
| `unread` | True when `\Seen` is absent. |
| `labels` | Gmail labels, otherwise an empty list. |
| `list_unsubscribe` | True when the header has a non-empty value. |
| `folder` | Scanned folder name. |
| `uidvalidity` | Folder UIDVALIDITY at scan time. |
| `message_id` | Message-ID header, possibly empty. |

Use `--fields` to reduce the export. Keep `folder`, `uidvalidity`, and
`message_id` when the output may feed triage or a move.

## Search

Collect UIDs with `UID SEARCH`, then fetch headers for those UIDs in chunks.

| Goal | Command |
| --- | --- |
| Everything in the selected folder | `UID SEARCH ALL` (default) |
| Unread only | `--search "UNSEEN"` |
| Since a date | `--search "SINCE 01-Jan-2026"` |
| Header contains text | `--search 'HEADER SUBJECT "word"'` |
| Gmail query syntax | `--search "from:example.com has:list-unsubscribe"` |

On a Gmail account (`X-GM-EXT-1`), `--search` is sent as `X-GM-RAW` unless
`--imap-search` is also set. Elsewhere it is IMAP SEARCH criteria. Pass the
query as one argument; escape `\` and `"` inside it.

### Suspicious-search refusal

A query can be silently ignored or broadened by the server. `mail_scan.py`
detects a search that appears to return the whole mailbox and exits non-zero
with a warning. Do not mutate from that result.

- Narrow the query, or use `--imap-search` when Gmail syntax is not intended.
- Inspect the returned count against `STATUS MESSAGES`.
- Set `--allow-suspicious-search` only after review and with the user's
  agreement; it is an override, not a fix.

## Newest-first and limits

- The scan selects the highest UIDs first, so calibration sees recent mail.
- `--limit` defaults to 200. `--limit 0` means the whole mailbox and requires
  `--yes`.
- Report the folder, limit, searched count, and written count.

## Chunking

Do not fetch an entire large mailbox in one command.

- Fetch in bounded UID batches; `--chunk-size` defaults to 300.
- Report progress per batch: fetched, total, folder.
- On `BYE`, timeout, or rate limit, reconnect and resume after the last
  completed UID. Keep a resumable cursor in private temporary state.
- Keep one connection per account unless the provider permits more.

A mailbox with tens of thousands of messages is normal for this workflow. It
requires chunking, progress output, and a resume path; a single unpaged fetch
will time out or exhaust memory.

## Decode headers defensively

Real mail contains encoded words with missing or invalid charsets, including
`unknown-8bit`, and subjects with emoji. Decode bytes; never regex-match the raw
encoded header.

```python
from email.header import decode_header

def decode_value(raw):
    if not raw:
        return ""
    out = []
    for chunk, charset in decode_header(raw):
        if isinstance(chunk, bytes):
            for enc in (charset, "utf-8", "latin-1"):
                try:
                    out.append(chunk.decode(enc or "utf-8", "replace"))
                    break
                except (LookupError, UnicodeDecodeError):
                    continue
            else:
                out.append(chunk.decode("utf-8", "replace"))
        else:
            out.append(chunk)
    return " ".join(out)
```

Rules:

- Fall back through the declared charset, UTF-8, then Latin-1.
- Use `errors="replace"`; one bad byte must not abort the scan.
- Normalize with `unicodedata.normalize("NFC", value)` and collapse whitespace
  before matching. Keep the original for display.
- Parse full messages with `email.parser.BytesParser(policy=policy.default)`;
  fall back to `policy.compat32` when default policy rejects malformed mail.
- Folded headers are unfolded by the parser; do not split on newlines manually.

## No body fetch

`mail_scan.py` fetches headers only. It does not read message bodies, so
classification cannot use body text.

- Do not add a body fetch to make a borderline sender fit a rule.
- Keep ambiguous senders as `ASK` and show the user the header evidence.
- If a future manual check is approved, use `BODY.PEEK[TEXT]<0.2048>`, cap the
  message count, never fetch attachments, and do not persist body text.

## Export hygiene

Write scan output as JSONL with `folder`, `uidvalidity`, `uid`, and the decoded
headers you need. Create the file in a private temporary directory with mode
`600`; `--out` does this. Delete it when triage and verification finish. It
contains private subjects and addresses and must never be committed, stored in
task memory, or pasted into a report.
