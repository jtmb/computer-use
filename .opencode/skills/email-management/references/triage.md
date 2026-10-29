---
name: email-triage
description: Offline sender-level IMAP triage with subject vetoes, bulk and human signals, MOVE/NOISE/ASK/PROTECT outcomes, minimum sender counts, and a reviewable plan.
tags: "email,triage,senders,classification,approval"
---

# Triage

Read this file before classifying mail or proposing what to move. `mail_triage.py`
is offline: it reads `mail_scan.py` JSONL and never contacts a mailbox.

## Input contract

- One folder and one `UIDVALIDITY` per run. Mixed inputs are rejected because
  UIDs are per-folder.
- All inputs must come from the same folder.
- The script is stateless. Pass every historical scan, or scan the whole
  mailbox, to make the sender veto history complete.
- Records use `uid`, `from`, `subject`, and preferably `folder`,
  `uidvalidity`, `list_unsubscribe`, and `message_id`.

Override rules with `--rules PATH`. Supported keys are `veto`, `promotional`,
`human_prefixes`, `automated_sender_localparts`, `free_mail_domains`,
`protect_senders`, `move_senders`, and `min_sender_count`. The
`--min-sender-count N` flag wins over the rules file.

## Aggregation

Group by sender address only, lowercased. For each sender track:

| Field | Source |
| --- | --- |
| Message count | Number of scanned records from that address. |
| Veto history | Whether any subject from that sender matched a veto pattern. |

Do not aggregate by domain, thread, `List-Id`, or recipient. The classifier does
not read `To`, `Cc`, `In-Reply-To`, or `References`, and it emits no confidence
score.

## Signals

| Signal | Evidence | Effect |
| --- | --- | --- |
| Transactional/security veto | Subject matches a veto pattern. | `PROTECT` |
| Explicit protect sender | `protect_senders` in `--rules`. | `PROTECT` |
| Veto history | Sender ever matched a veto subject in the input. | `ASK` for non-veto mail; never auto-`MOVE` |
| Explicit move sender | `move_senders` in `--rules`. | `MOVE` |
| Human conversation | `Re:`/`Fw:`/`Fwd:` subject prefix. | `PROTECT` |
| Free-mail human | Free-mail domain and no `List-Unsubscribe`. | `PROTECT` |
| Bulk mail | `List-Unsubscribe` header present. | Supports `NOISE` or `MOVE` |
| Automated sender | Local part matches the automated pattern (`no-reply`, `notify`, `alerts`, `bounces`, and similar). | Supports `MOVE` |
| Promotional subject | Subject matches the promotional pattern. | Supports `NOISE` |
| Recurring sender | Count is at least `min_sender_count` (default 5). | Required for `NOISE`/`MOVE` |

## Outcomes

| Action | Meaning | In the actionable plan |
| --- | --- | --- |
| `MOVE` | Recurring bulk or automated sender with no veto or human signal. | Yes; `uids` contains these only. |
| `NOISE` | Promotional subject with a bulk or recurring sender. | No; review-only in `noise_uids`. |
| `ASK` | Ambiguous sender, one-off message, or sender with veto history. | No; in `ask_uids`. |
| `PROTECT` | Vetoed subject, protected sender, or human signal. | No; in `protect_uids`. |

`mail_move.py --from-plan` acts only on `uids` (`MOVE`). To file `NOISE` mail,
review `noise_uids`, extract them into a JSON UID list, and pass that list to
`mail_move.py --uids` with `--source-folder` and `--uidvalidity`. Do not treat
`NOISE` as pre-approved.

## Policy order

The classifier applies these rules in order and records the first reason that
fires:

1. A subject matching a veto pattern is `PROTECT`.
2. A sender on `protect_senders` is `PROTECT`.
3. A sender that has ever sent a veto-matching subject is `ASK` for all
   non-veto messages. It can never be auto-`MOVE`.
4. A sender on `move_senders` is `MOVE`.
5. A reply/forward subject, or a free-mail sender with no
   `List-Unsubscribe`, is `PROTECT` (human signal).
6. A promotional subject with `List-Unsubscribe` or at least
   `min_sender_count` messages is `NOISE`.
7. A sender with `List-Unsubscribe` or an automated local part and at least
   `min_sender_count` messages is `MOVE`.
8. Everything else is `ASK`.

A `MOVE` candidate must satisfy all gates: a bulk signal, at least
`min_sender_count` messages, a promotional or automated rather than personal
pattern, no veto ever, no human signal, and no protected-category match.
Promotional subjects are reported as `NOISE` for review; `MOVE` is the
actionable recurring-bulk or automated subset. Unknown or ambiguous senders
fail closed to `ASK`. A missing or empty subject is `ASK`.

## Veto patterns

The veto list covers bare transactional terms, their plurals, and multi-word
phrases. Examples:

| Group | Terms |
| --- | --- |
| Billing and payment | payment, invoice, receipt, bill, statement, balance, refund, order, tax |
| Shipping | delivery, shipment, tracking, shipped |
| Travel | booking, reservation, ticket, boarding, flight alert, departure |
| Account security | password, password reset, verification, one-time code, security code, sign-in, security alert |
| Appointments and claims | appointment, claim, renewal |
| School | school absence |

Protected categories are bank, brokerage, government, school, medical, health,
insurance, travel booking, billing/payment, and account security. A matching
message is `PROTECT` regardless of sender. Billing and security are protected by
construction: a sender that mixes billing with marketing can never have the
whole sender moved, and its non-veto messages become `ASK` through the
veto-history rule.

The exact pattern list is in `DEFAULT_RULES["veto"]` in `mail_triage.py`. A
`--rules` file replaces any key it supplies.

## Human-in-the-loop

`mail_triage.py` classifies every message in the export. The agent presents a
small batch, about 12 senders, with:

| Sender | Messages | Action | Reason | Sample subjects |
| --- | --- | --- | --- | --- |
| `SENDER@example.com` | 14 | `MOVE` or `NOISE` | `List-Unsubscribe` + recurring | 3 truncated subjects |

Ask per sender for mixed or `ASK` groups. Do not treat a general request such as
"clean up my inbox" as approval for a batch. Calibrate on a newest-first batch
of roughly 50-100 messages before scaling.

## Plan

`--emit-plan PATH.json` writes a private `0600` plan:

| Field | Content |
| --- | --- |
| `schema` | Plan schema identifier. |
| `input`, `rules_source` | Source exports and rule origin. |
| `min_sender_count` | Threshold used. |
| `source_folder`, `uidvalidity` | Required metadata for `mail_move.py`. |
| `summary` | Total and counts for `MOVE`/`NOISE`/`ASK`/`PROTECT`. |
| `uids` | `MOVE` UIDs only; the actionable list. |
| `noise_uids`, `ask_uids`, `protect_uids` | Review groups. |
| `veto_senders` | Senders with veto history. |
| `decisions` | Per message: uid, action, reason, from, subject, date, unread, labels, list_unsubscribe, message_id. |

There is no confidence field and no per-message protected-category field. The
action and reason carry the decision.

## Not implemented

These are optional future work, not current behavior:

- Domain-level or thread-level aggregation.
- `List-Id`, `To`, `Cc`, `In-Reply-To`, or `References` analysis.
- Body-text classification.
- Confidence scores or model-based ranking.
- Automatic `NOISE` filing; `NOISE` is always review-only.

## Never use the spam mechanism

Do not report mail as spam, move it to a spam folder, or create provider filter
rules unless the user explicitly requests it. Reporting trains the provider
filter, can suppress legitimate future mail, and is not equivalent to labeling
or archiving. Unsubscribing also requires explicit approval; it can confirm the
address to the sender.

## Conflict checks

Before proposing, compare the user's goal with the batch contents:

- "Archive all promotions" but the batch contains security alerts, statements,
  or travel bookings: exclude them and say why.
- "Delete old mail" but the batch contains receipts or tax documents: keep them
  and ask.
- "Sort everything from this sender" but the sender mixes billing and marketing:
  split by message action and keep the protected messages.

When the stated goal conflicts with a safe action, stop and ask.
