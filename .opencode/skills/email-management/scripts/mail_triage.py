#!/usr/bin/env python3
"""Offline sender-aware triage over JSONL from mail_scan.py.

This script never opens a network connection and never touches a mailbox. It
reads header records, aggregates them by sender, classifies each message, and
can emit a reviewable plan. `mail_move.py --from-plan` acts only on the plan's
`uids` field, which contains the MOVE group. NOISE is review-only.

Policy, in priority order
-------------------------
1. A missing, empty, or non-string subject is ASK. It can never be MOVE, and
   a missing/non-string subject blocks plan emission.
2. A message whose subject matches a transactional/security veto pattern is
   PROTECT. Message-level veto always wins over every sender-level decision.
3. A sender on the explicit `protect_senders` list is PROTECT.
4. A sender whose local part or domain matches the protected-category matcher
   (bank/brokerage, government, school/education, medical/health, insurance,
   travel/booking, billing/payments, account/security) is ASK. The default
   matcher ships populated; a rules file may empty it only with
   `acknowledge_empty_protected`.
5. A sender that has EVER sent a veto-matching subject is ASK for all
   non-veto messages. It can never be auto-MOVE. "Ever" means anywhere in the
   supplied input; triage is stateless by design. Pass every historical scan
   (or scan the whole mailbox) to make that history complete. All inputs must
   describe one folder and one UIDVALIDITY, because UIDs are per-mailbox.
6. A reply/forward subject, or a free-mail sender with no List-Unsubscribe
   header, is PROTECT (a human signal).
7. A promotional subject with a bulk or recurring sender is NOISE.
8. MOVE requires ALL of: List-Unsubscribe, at least `min_sender_count`
   messages from the sender, an automated subject, no veto ever, and no
   protected-category match. A sender that merely looks automated, or a
   one-off bulk sender, is ASK. `move_senders` is an allow-list note, not a
   bypass of these conditions.
9. Everything else is ASK.

The plan's actionable `uids` list is the MOVE group only. To file NOISE mail,
extract `noise_uids` into a JSON array and pass it to mail_move.py --uids after
reviewing it. An actionable plan also requires source_folder and uidvalidity;
--emit-plan refuses without them. Nothing here deletes or moves mail.

CRITICAL regex rule: patterns are compiled WITHOUT re.VERBOSE. Verbose mode
treats unescaped spaces in a pattern as insignificant, so "see you on board"
becomes "seeyouonboard" and every multi-word safety phrase silently stops
matching. That exact bug produced a half-broken veto in the session that
motivated this script. The self-test asserts both the regression and its
absence from every compiled pattern.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from mail_common import MailError, read_jsonl, shorten, write_json_atomic

SCHEMA = "email-management/mail-triage/1"
ACTIONS = ("MOVE", "NOISE", "ASK", "PROTECT")
DEFAULT_MIN_SENDER_COUNT = 5

DEFAULT_RULES: dict[str, Any] = {
    "veto": [
        r"\borders?\b",
        r"\border confirmation\b",
        r"\breceipts?\b",
        r"\binvoices?\b",
        r"\bpayments?\b",
        r"\bpayment (?:received|confirmed|due|failed)\b",
        r"\bbills?\b",
        r"\bstatements?\b",
        r"\bbalances?\b",
        r"\brefunds?\b",
        r"\bshipped\b",
        r"\bshipments?\b",
        r"\bshipping confirmation\b",
        r"\btracking\b",
        r"\btracking (?:number|info|details)\b",
        r"\bdeliver(?:y|ies)\b",
        r"\bdelivery (?:confirmation|status)\b",
        r"\be-?transfer\b",
        r"\bverif(?:y|ies)\b",
        r"\bverifications?\b",
        r"\bverify your (?:account|email|identity|login)\b",
        r"\b(?:one[- ]time|security|verification|login|sign-in) code\b",
        r"\bpasswords?\b",
        r"\bpassword reset\b",
        r"\bsign-in\b",
        r"\bsecurity alert\b",
        r"\bbookings?\b",
        r"\breservations?\b",
        r"\btickets?\b",
        r"\bboarding\b",
        r"\bflight alert\b",
        r"\bdepartures?\b",
        r"\bsee you on board\b",
        r"\bappointments?\b",
        r"\btax(?:es)?\b",
        r"\btax (?:document|return|receipt|invoice)\b",
        r"\bsubscription receipt\b",
        r"\bschool absence\b",
        r"\bclaim\b",
        r"\brenewal\b",
    ],
    "promotional": [
        r"\bsale\b",
        r"\bsales\b",
        r"\b\d+\s*%\s*off\b",
        r"\bdeals?\b",
        r"\bcoupons?\b",
        r"\bclearance\b",
        r"\bnewsletters?\b",
        r"\bback in stock\b",
        r"\bwebinars?\b",
        r"\blimited[- ]time\b",
        r"\bexpires? (?:today|soon|tonight)\b",
        r"\bfree shipping\b",
        r"\bblack friday\b",
        r"\bcyber monday\b",
        r"\bnew arrivals?\b",
        r"\blast chance\b",
        r"\bexclusive offer\b",
        r"\bpromo(?:tion)?s?\b",
        r"\bsave \d+%\b",
    ],
    "automated_subjects": [
        r"\b(?:notifications?|alerts?|updates?|digests?|newsletters?|reports?|"
        r"summar(?:y|ies)|status|builds?|deploy(?:ed|ment)?|backups?|monitor(?:ing)?|"
        r"reminders?|activity|changelogs?|releases?|feeds?)\b",
    ],
    "human_prefixes": [
        r"^\s*(?:re|fw|fwd)\s*(?:\[\d+\])?\s*:",
    ],
    "automated_sender_localparts": [
        r"^(?:no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?|notify|alerts?|"
        r"mailer[-_.]?daemon|bounces?|newsletters?|digest|updates?|automated)"
        r"(?:[+._-].*)?$",
    ],
    "protected_localparts": [
        r"(?:^|[-_.])(?:bank|banking|banks|credit[-_.]?union|broker|brokerage|"
        r"invest|investment|investments|wealth|securities|mortgage|mortgages|"
        r"loan|loans|lending)(?:[-_.]|$)",
        r"(?:^|[-_.])(?:gov|government|federal|municipal|irs|dmv|treasury|"
        r"revenue|tax|taxes|social[-_.]?security|ssa|passport|immigration|"
        r"city|county|state|agency|department|ministry|council|parliament)"
        r"(?:[-_.]|$)",
        r"(?:^|[-_.])(?:school|schools|university|college|academy|district|"
        r"education|edu|campus|student|students|registrar|alumni|pta)(?:[-_.]|$)",
        r"(?:^|[-_.])(?:medical|health|clinic|hospital|doctor|doctors|dental|"
        r"dentist|pharmacy|prescription|patient|patients|diagnostic|lab|labs)"
        r"(?:[-_.]|$)",
        r"(?:^|[-_.])(?:insurance|insurer|underwriting|policy|policies|"
        r"benefits|claims?)(?:[-_.]|$)",
        r"(?:^|[-_.])(?:travel|booking|bookings|reservation|reservations|"
        r"airline|airlines|airways|hotel|hotels|flight|flights|cruise|cruises|"
        r"trip|trips|vacation|rental|rentals|ticket|tickets|boarding|amtrak|rail)"
        r"(?:[-_.]|$)",
        r"(?:^|[-_.])(?:billing|payment|payments|invoice|invoices|receipt|"
        r"receipts|statement|statements|balance|balances|refund|refunds|finance|"
        r"financial|accounting|collections|renewal|renewals|subscription|"
        r"subscriptions)(?:[-_.]|$)",
        r"(?:^|[-_.])(?:security|secure|account|accounts|auth|authentication|"
        r"identity|login|signin|password|passwords|2fa|mfa|otp|sso|verify|"
        r"verification)(?:[-_.]|$)",
        r"^(?:bank|creditunion|brokerage|investment|mortgage|loan|insurance|"
        r"medical|health|travel|booking|billing|payment|security|school|"
        r"university|college|gov)",
    ],
    "protected_domains": [
        r"(?:^|\.)(?:bank|banking|banks|credit[-_.]?union|broker|brokerage|"
        r"invest|investment|investments|wealth|securities|mortgage|mortgages|"
        r"loan|loans|lending)\.",
        r"(?:^|\.)(?:gov|government|federal|municipal|irs|dmv|treasury|"
        r"revenue|tax|taxes|social[-_.]?security|ssa|passport|immigration|agency|"
        r"department|ministry|council|parliament)\.",
        r"(?:^|\.)(?:school|schools|university|college|academy|district|"
        r"education|campus|student|students|registrar|alumni|pta)\.",
        r"(?:^|\.)(?:medical|health|clinic|hospital|doctor|doctors|dental|"
        r"dentist|pharmacy|prescription|patient|patients|diagnostic|lab|labs)\.",
        r"(?:^|\.)(?:insurance|insurer|underwriting|policy|policies|benefits|"
        r"claims?)\.",
        r"(?:^|\.)(?:travel|booking|bookings|reservation|reservations|airline|"
        r"airlines|airways|hotel|hotels|flight|flights|cruise|cruises|trip|"
        r"trips|vacation|rental|rentals|ticket|tickets|boarding|amtrak|rail)\.",
        r"(?:^|\.)(?:billing|payment|payments|invoice|invoices|receipt|receipts|"
        r"statement|statements|balance|balances|refund|refunds|finance|financial|"
        r"accounting|collections|renewal|renewals|subscription|subscriptions)\.",
        r"(?:^|\.)(?:security|secure|account|accounts|auth|authentication|"
        r"identity|login|signin|password|passwords|verify|verification)\.",
        r"(?:^|\.)(?:gov|mil|edu)(?:\.[a-z]{2})?$",
        r"(?:^|\.)(?:k12|sch|ac)\.[a-z]{2}\.[a-z]{2}$",
        r"(?:^|\.)(?:state|city|county)\.[a-z]{2}\.us$",
        r"(?:bank|creditunion|brokerage|investment|mortgage|loan|insurance|"
        r"medical|health|hospital|travel|booking|billing|payment|security|"
        r"school|university|college|gov|edu)",
    ],
    "free_mail_domains": [
        "gmail.com",
        "googlemail.com",
        "yahoo.com",
        "yahoo.ca",
        "ymail.com",
        "outlook.com",
        "hotmail.com",
        "live.com",
        "msn.com",
        "icloud.com",
        "me.com",
        "mac.com",
        "aol.com",
        "proton.me",
        "protonmail.com",
        "pm.me",
        "gmx.com",
        "gmx.net",
        "mail.com",
        "yandex.com",
        "yandex.ru",
        "zoho.com",
        "fastmail.com",
        "qq.com",
        "163.com",
        "126.com",
    ],
    "protect_senders": [],
    "move_senders": [],
    "acknowledge_empty_protected": False,
    "min_sender_count": DEFAULT_MIN_SENDER_COUNT,
}

RULE_KEYS = frozenset(DEFAULT_RULES)
PATTERN_KEYS = (
    "veto",
    "promotional",
    "automated_subjects",
    "human_prefixes",
    "automated_sender_localparts",
    "protected_localparts",
    "protected_domains",
)
ADDRESS_SET_KEYS = ("free_mail_domains", "protect_senders", "move_senders")


@dataclass(frozen=True)
class CompiledRules:
    veto: tuple[re.Pattern[str], ...]
    promotional: tuple[re.Pattern[str], ...]
    automated_subjects: tuple[re.Pattern[str], ...]
    human_prefixes: tuple[re.Pattern[str], ...]
    automated_sender_localparts: tuple[re.Pattern[str], ...]
    protected_localparts: tuple[re.Pattern[str], ...]
    protected_domains: tuple[re.Pattern[str], ...]
    free_mail_domains: frozenset[str]
    protect_senders: frozenset[str]
    move_senders: frozenset[str]
    min_sender_count: int
    protected_empty: bool


@dataclass(frozen=True)
class Message:
    uid: int
    sender: str
    from_name: str
    subject: str
    subject_present: bool
    subject_is_string: bool
    date: str
    unread: bool
    labels: tuple[str, ...]
    list_unsubscribe: bool
    folder: str | None
    uidvalidity: int | None
    message_id: str

    @property
    def subject_safe_for_move(self) -> bool:
        return (
            self.subject_present
            and self.subject_is_string
            and bool(self.subject.strip())
        )


@dataclass
class SenderState:
    count: int = 0
    veto: bool = False


def _require_string_list(value: object, key: str) -> list[str]:
    if not isinstance(value, list):
        raise MailError(f"rules key {key!r} must be a JSON array of strings")
    result: list[str] = []
    for item in value:
        if not isinstance(item, str) or not item.strip():
            raise MailError(f"rules key {key!r} contains a non-string or empty value")
        result.append(item)
    return result


def compile_rules(
    overrides: Mapping[str, Any] | None,
    *,
    min_sender_count: int | None = None,
    source: str = "builtin",
) -> CompiledRules:
    """Validate and compile rule overrides.

    A supplied key replaces that built-in key. Unknown keys are rejected so a
    typo cannot silently disable a safety rule. Empty patterns are rejected
    because an empty regex matches everything.
    """
    merged: dict[str, Any] = {
        key: list(value) if isinstance(value, list) else value
        for key, value in DEFAULT_RULES.items()
    }
    if overrides is not None:
        unknown = sorted(set(overrides) - RULE_KEYS)
        if unknown:
            raise MailError(
                f"{source}: unknown rule key(s): {', '.join(unknown)}; "
                f"allowed: {', '.join(sorted(RULE_KEYS))}"
            )
        merged.update(overrides)

    def compile_patterns(key: str) -> tuple[re.Pattern[str], ...]:
        patterns = _require_string_list(merged[key], key)
        compiled: list[re.Pattern[str]] = []
        for pattern in patterns:
            try:
                # Do NOT add re.VERBOSE here. Verbose mode ignores unescaped
                # whitespace, turning "see you on board" into "seeyouonboard"
                # and silently disabling every multi-word safety phrase.
                compiled.append(re.compile(pattern, re.IGNORECASE | re.UNICODE))
            except re.error as exc:
                raise MailError(
                    f"{source}: invalid regex in {key!r}: {pattern!r}: {exc}"
                ) from exc
        return tuple(compiled)

    value = (
        min_sender_count
        if min_sender_count is not None
        else merged.get("min_sender_count", DEFAULT_MIN_SENDER_COUNT)
    )
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise MailError("min_sender_count must be an integer of at least 1")

    address_sets: dict[str, frozenset[str]] = {}
    for key in ADDRESS_SET_KEYS:
        values = _require_string_list(merged[key], key)
        address_sets[key] = frozenset(item.strip().lower() for item in values)

    protected_localparts = compile_patterns("protected_localparts")
    protected_domains = compile_patterns("protected_domains")
    protected_empty = not (
        protected_localparts
        or protected_domains
        or address_sets["protect_senders"]
    )
    acknowledgement = merged.get("acknowledge_empty_protected", False)
    if not isinstance(acknowledgement, bool):
        raise MailError("acknowledge_empty_protected must be a boolean")
    if protected_empty and not acknowledgement:
        raise MailError(
            f"{source}: protected matching is empty. Set protected_localparts, "
            "protected_domains, or protect_senders, or set "
            'acknowledge_empty_protected to true to disable hard protection '
            "explicitly."
        )

    return CompiledRules(
        veto=compile_patterns("veto"),
        promotional=compile_patterns("promotional"),
        automated_subjects=compile_patterns("automated_subjects"),
        human_prefixes=compile_patterns("human_prefixes"),
        automated_sender_localparts=compile_patterns(
            "automated_sender_localparts"
        ),
        protected_localparts=protected_localparts,
        protected_domains=protected_domains,
        free_mail_domains=address_sets["free_mail_domains"],
        protect_senders=address_sets["protect_senders"],
        move_senders=address_sets["move_senders"],
        min_sender_count=value,
        protected_empty=protected_empty,
    )


def load_rules(path: str | None, *, min_sender_count: int | None) -> tuple[
    CompiledRules, str
]:
    if not path:
        return compile_rules(None, min_sender_count=min_sender_count), "builtin"
    try:
        with open(path, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except OSError as exc:
        raise MailError(f"cannot read rules {path}: {exc}") from exc
    except json.JSONDecodeError as exc:
        raise MailError(f"{path}: invalid JSON: {exc}") from exc
    if not isinstance(payload, dict):
        raise MailError(f"{path}: rules must be a JSON object")
    return (
        compile_rules(payload, min_sender_count=min_sender_count, source=path),
        path,
    )


def _domain_of(sender: str) -> str:
    if "@" not in sender:
        return ""
    return sender.rsplit("@", 1)[1].strip().lower()


def matches(patterns: Sequence[re.Pattern[str]], text: str) -> bool:
    return any(pattern.search(text) for pattern in patterns)


def human_signal(message: Message, rules: CompiledRules) -> tuple[bool, str]:
    if matches(rules.human_prefixes, message.subject):
        return True, "reply/forward subject"
    if (
        _domain_of(message.sender) in rules.free_mail_domains
        and not message.list_unsubscribe
    ):
        return True, "free-mail sender without bulk signal"
    return False, ""


def protected_sender(
    message: Message, rules: CompiledRules
) -> tuple[bool, str]:
    """Match explicit protected senders or protected-category local/domain."""
    if message.sender in rules.protect_senders:
        return True, "sender on explicit protect list"
    if "@" not in message.sender:
        return False, ""
    local_part, domain = message.sender.rsplit("@", 1)
    if local_part and matches(rules.protected_localparts, local_part):
        return True, "protected-category local part"
    if domain and matches(rules.protected_domains, domain):
        return True, "protected-category domain"
    return False, ""


def classify(
    message: Message, state: SenderState, rules: CompiledRules
) -> tuple[str, str]:
    """Return (action, stable reason). Pure and order-independent."""
    if not message.subject_safe_for_move:
        return "ASK", "missing, empty, or non-string subject"

    if matches(rules.veto, message.subject):
        return "PROTECT", "transactional/security subject veto"

    if message.sender in rules.protect_senders:
        return "PROTECT", "sender on explicit protect list"

    protected, protected_reason = protected_sender(message, rules)
    if protected:
        return "ASK", protected_reason

    if state.veto:
        return "ASK", "sender previously sent a veto-matching subject"

    human, human_reason = human_signal(message, rules)
    if human:
        return "PROTECT", human_reason

    promotional = matches(rules.promotional, message.subject)
    if promotional and (
        message.list_unsubscribe or state.count >= rules.min_sender_count
    ):
        return "NOISE", "promotional subject with bulk or recurring sender"

    automated_subject = matches(rules.automated_subjects, message.subject)
    if (
        message.list_unsubscribe
        and state.count >= rules.min_sender_count
        and automated_subject
    ):
        reason = (
            "recurring bulk sender with automated subject and no veto or "
            "protected-category match"
        )
        if message.sender in rules.move_senders:
            reason += " (explicit move list)"
        return "MOVE", reason

    if message.sender in rules.move_senders:
        return "ASK", "explicit move sender lacks MOVE preconditions"

    return "ASK", "insufficient positive signals for MOVE"


def normalize_records(
    records: Iterable[Mapping[str, Any]],
) -> list[Message]:
    """Validate, deduplicate, and enforce one folder/UIDVALIDITY per run."""
    messages: list[Message] = []
    seen: dict[tuple[str | None, int | None, int], tuple[Any, ...]] = {}
    folders: set[str] = set()
    uidvalidities: set[int] = set()

    for index, raw in enumerate(records, 1):
        uid = raw.get("uid")
        if isinstance(uid, bool) or not isinstance(uid, int) or uid <= 0:
            raise MailError(f"record {index}: uid must be a positive integer")
        sender = str(raw.get("from") or "").strip().lower()
        subject_present = "subject" in raw
        subject_raw = raw.get("subject")
        subject_is_string = isinstance(subject_raw, str)
        subject = subject_raw if subject_is_string else ""
        date = str(raw.get("date") or "")
        unread = bool(raw.get("unread", False))
        list_unsubscribe = bool(raw.get("list_unsubscribe", False))
        message_id = str(raw.get("message_id") or "")
        labels_raw = raw.get("labels") or []
        labels = (
            tuple(str(label) for label in labels_raw)
            if isinstance(labels_raw, list)
            else ()
        )
        folder_raw = raw.get("folder")
        folder = str(folder_raw) if folder_raw not in (None, "") else None
        uidvalidity_raw = raw.get("uidvalidity")
        uidvalidity = (
            uidvalidity_raw
            if isinstance(uidvalidity_raw, int)
            and not isinstance(uidvalidity_raw, bool)
            else None
        )

        if folder is not None:
            folders.add(folder)
        if uidvalidity is not None:
            uidvalidities.add(uidvalidity)

        identity = (folder, uidvalidity, uid)
        fingerprint = (sender, subject, date, unread, list_unsubscribe)
        if identity in seen:
            if seen[identity] != fingerprint:
                raise MailError(
                    f"UID {uid} has conflicting content in "
                    f"{folder or 'an unknown folder'}; triage one folder at a time"
                )
            continue
        seen[identity] = fingerprint
        messages.append(
            Message(
                uid=uid,
                sender=sender,
                from_name=str(raw.get("from_name") or ""),
                subject=subject,
                subject_present=subject_present,
                subject_is_string=subject_is_string,
                date=date,
                unread=unread,
                labels=labels,
                list_unsubscribe=list_unsubscribe,
                folder=folder,
                uidvalidity=uidvalidity,
                message_id=message_id,
            )
        )

    if len(folders) > 1:
        raise MailError(
            "inputs span multiple folders ("
            + ", ".join(sorted(folders))
            + "); triage one folder at a time so UIDs and the plan stay valid"
        )
    if len(uidvalidities) > 1:
        raise MailError(
            "inputs span multiple UIDVALIDITY values; rescan the mailbox and "
            "use one consistent export"
        )
    return messages


def aggregate_senders(
    messages: Sequence[Message], rules: CompiledRules
) -> dict[str, SenderState]:
    states: dict[str, SenderState] = {}
    for message in messages:
        state = states.setdefault(message.sender, SenderState())
        state.count += 1
        if matches(rules.veto, message.subject):
            state.veto = True
    return states


def triage(
    records: Iterable[Mapping[str, Any]],
    rules: CompiledRules,
    *,
    input_paths: Sequence[str],
    rules_source: str,
) -> dict[str, Any]:
    """Build a deterministic plan. No timestamps, no network, no writes."""
    messages = normalize_records(records)
    states = aggregate_senders(messages, rules)

    decisions: list[dict[str, Any]] = []
    for message in messages:
        action, reason = classify(message, states[message.sender], rules)
        protected, _ = protected_sender(message, rules)
        decisions.append(
            {
                "uid": message.uid,
                "action": action,
                "reason": reason,
                "from": message.sender,
                "from_name": message.from_name,
                "subject": message.subject,
                "protected": protected,
                "date": message.date,
                "unread": message.unread,
                "labels": list(message.labels),
                "list_unsubscribe": message.list_unsubscribe,
                "message_id": message.message_id,
            }
        )
    decisions.sort(key=lambda decision: (decision["uid"], decision["from"]))

    grouped: dict[str, list[int]] = {action: [] for action in ACTIONS}
    for decision in decisions:
        grouped[decision["action"]].append(decision["uid"])
    for action in ACTIONS:
        grouped[action].sort()

    folder = messages[0].folder if messages else None
    uidvalidity = messages[0].uidvalidity if messages else None
    summary = {"total": len(decisions)}
    for action in ACTIONS:
        summary[action] = len(grouped[action])
    protected_senders = sorted(
        {
            message.sender
            for message in messages
            if protected_sender(message, rules)[0]
        }
    )

    return {
        "schema": SCHEMA,
        "input": list(input_paths),
        "rules_source": rules_source,
        "min_sender_count": rules.min_sender_count,
        "source_folder": folder,
        "uidvalidity": uidvalidity,
        "source_complete": bool(
            messages and folder is not None and uidvalidity is not None
        ),
        "subject_complete": all(
            message.subject_present and message.subject_is_string
            for message in messages
        ),
        "summary": summary,
        "uids": grouped["MOVE"],
        "noise_uids": grouped["NOISE"],
        "ask_uids": grouped["ASK"],
        "protect_uids": grouped["PROTECT"],
        "veto_senders": sorted(
            sender for sender, state in states.items() if state.veto
        ),
        "protected_senders": protected_senders,
        "decisions": decisions,
    }


def plan_blockers(plan: Mapping[str, Any]) -> list[str]:
    """Reasons an actionable plan must not be emitted."""
    blockers: list[str] = []
    if not plan.get("source_folder"):
        blockers.append("source_folder is missing")
    uidvalidity = plan.get("uidvalidity")
    if (
        isinstance(uidvalidity, bool)
        or not isinstance(uidvalidity, int)
        or uidvalidity < 1
    ):
        blockers.append("uidvalidity is missing or invalid")
    if not plan.get("subject_complete"):
        blockers.append("one or more records lack a string subject field")
    for decision in plan.get("decisions", []):
        if decision.get("action") != "MOVE":
            continue
        subject = decision.get("subject")
        if not isinstance(subject, str) or not subject.strip():
            blockers.append(
                f"MOVE candidate uid {decision.get('uid')} lacks a subject"
            )
    return blockers


def render_report(plan: Mapping[str, Any]) -> str:
    summary = plan["summary"]
    folder = plan.get("source_folder") or "unknown folder"
    lines = [
        f"Triage report: {summary['total']} messages from {folder}",
        f"Rules: {plan['rules_source']}; min sender count "
        f"{plan['min_sender_count']}",
        "",
    ]
    decisions = plan["decisions"]
    for action in ACTIONS:
        rows = [row for row in decisions if row["action"] == action]
        lines.append(f"{action} ({len(rows)})")
        for row in rows:
            sender = row["from"] or "(unknown sender)"
            subject = shorten(row["subject"], 68)
            lines.append(
                f'  uid {row["uid"]:<7} {sender}  "{subject}"  [{row["reason"]}]'
            )
        lines.append("")
    lines.append(
        "Summary: "
        + " ".join(f"{action}={summary[action]}" for action in ACTIONS)
        + f" total={summary['total']}"
    )
    veto_senders = plan.get("veto_senders") or []
    if veto_senders:
        lines.append(
            f"Veto senders ({len(veto_senders)}): " + ", ".join(veto_senders)
        )
    protected_senders = plan.get("protected_senders") or []
    if protected_senders:
        lines.append(
            f"Protected-category senders ({len(protected_senders)}): "
            + ", ".join(protected_senders)
        )
    lines.append(
        "Actionable plan: only the MOVE uids are in `uids`; NOISE is review-only."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------


def _check(condition: bool, message: str, checks: list[str]) -> None:
    if not condition:
        raise AssertionError(message)
    checks.append(message)


def _fixture() -> list[dict[str, Any]]:
    return [
        {
            "uid": 1,
            "from": "notifications@example.org",
            "subject": "Build finished",
            "date": "Mon, 26 Oct 2026 09:00:00 +0000",
            "unread": True,
            "labels": ["\\Inbox"],
            "list_unsubscribe": True,
            "folder": "INBOX",
            "uidvalidity": 1,
            "message_id": "<one@example.org>",
        },
        {
            "uid": 2,
            "from": "notifications@example.org",
            "subject": "Deploy complete",
            "date": "Mon, 26 Oct 2026 09:01:00 +0000",
            "unread": True,
            "labels": ["\\Inbox"],
            "list_unsubscribe": True,
            "folder": "INBOX",
            "uidvalidity": 1,
            "message_id": "<two@example.org>",
        },
        {
            "uid": 3,
            "from": "notifications@example.org",
            "subject": "Your receipt for order 12345",
            "date": "Mon, 26 Oct 2026 09:02:00 +0000",
            "unread": True,
            "labels": ["\\Inbox"],
            "list_unsubscribe": True,
            "folder": "INBOX",
            "uidvalidity": 1,
            "message_id": "<three@example.org>",
        },
        {
            "uid": 4,
            "from": "alerts@example.net",
            "subject": "Nightly backup finished",
            "date": "Mon, 26 Oct 2026 09:03:00 +0000",
            "unread": False,
            "labels": ["\\Inbox"],
            "list_unsubscribe": True,
            "folder": "INBOX",
            "uidvalidity": 1,
            "message_id": "<four@example.net>",
        },
        {
            "uid": 5,
            "from": "alerts@example.net",
            "subject": "Nightly backup verified",
            "date": "Mon, 26 Oct 2026 09:04:00 +0000",
            "unread": False,
            "labels": ["\\Inbox"],
            "list_unsubscribe": True,
            "folder": "INBOX",
            "uidvalidity": 1,
            "message_id": "<five@example.net>",
        },
        {
            "uid": 6,
            "from": "person@corp.example",
            "subject": "Re: lunch on Friday",
            "date": "Mon, 26 Oct 2026 09:05:00 +0000",
            "unread": False,
            "labels": ["\\Inbox"],
            "list_unsubscribe": False,
            "folder": "INBOX",
            "uidvalidity": 1,
            "message_id": "<six@corp.example>",
        },
        {
            "uid": 7,
            "from": "friend@gmail.com",
            "subject": "Weekend plans",
            "date": "Mon, 26 Oct 2026 09:06:00 +0000",
            "unread": False,
            "labels": ["\\Inbox"],
            "list_unsubscribe": False,
            "folder": "INBOX",
            "uidvalidity": 1,
            "message_id": "<seven@gmail.com>",
        },
        {
            "uid": 8,
            "from": "shop@example.com",
            "subject": "50% off everything",
            "date": "Mon, 26 Oct 2026 09:07:00 +0000",
            "unread": True,
            "labels": ["\\Inbox"],
            "list_unsubscribe": True,
            "folder": "INBOX",
            "uidvalidity": 1,
            "message_id": "<eight@example.com>",
        },
        {
            "uid": 9,
            "from": "notify@example.io",
            "subject": "Build finished",
            "date": "Mon, 26 Oct 2026 09:08:00 +0000",
            "unread": True,
            "labels": ["\\Inbox"],
            "list_unsubscribe": False,
            "folder": "INBOX",
            "uidvalidity": 1,
            "message_id": "<nine@example.io>",
        },
        {
            "uid": 10,
            "from": "security@example.com",
            "subject": "Your security code is 123456",
            "date": "Mon, 26 Oct 2026 09:09:00 +0000",
            "unread": True,
            "labels": ["\\Inbox"],
            "list_unsubscribe": False,
            "folder": "INBOX",
            "uidvalidity": 1,
            "message_id": "<ten@example.com>",
        },
    ]


def self_test() -> int:
    checks: list[str] = []
    try:
        rules = compile_rules(None, min_sender_count=2)
        plan = triage(
            _fixture(),
            rules,
            input_paths=["synthetic-fixture.jsonl"],
            rules_source="builtin",
        )
        by_uid = {row["uid"]: row for row in plan["decisions"]}

        sample = "See you on board soon!"
        _check(
            matches(rules.veto, sample),
            "multi-word veto phrase matches",
            checks,
        )
        _check(
            matches(rules.veto, "Flight departures for tomorrow"),
            "plural veto pattern matches",
            checks,
        )
        _check(
            matches(rules.veto, "Your security code is 123456"),
            "security-code phrase matches",
            checks,
        )
        bare_terms = (
            "payment",
            "delivery",
            "tax",
            "verify",
            "invoice",
            "receipt",
            "bill",
            "statement",
            "balance",
            "refund",
            "appointment",
            "booking",
            "reservation",
            "ticket",
            "boarding",
            "password",
            "order",
            "shipment",
            "tracking",
        )
        for term in bare_terms:
            _check(
                matches(rules.veto, f"Your {term}"),
                f"bare veto term {term!r} matches",
                checks,
            )
        plurals = (
            "orders",
            "receipts",
            "invoices",
            "payments",
            "bills",
            "statements",
            "balances",
            "refunds",
            "deliveries",
            "shipments",
            "taxes",
            "verifications",
            "passwords",
            "appointments",
            "bookings",
            "reservations",
            "tickets",
        )
        for term in plurals:
            _check(
                matches(rules.veto, f"Your {term}"),
                f"plural veto term {term!r} matches",
                checks,
            )

        verbose = re.compile(r"see you on board", re.IGNORECASE | re.VERBOSE)
        _check(
            not verbose.search(sample),
            "re.VERBOSE is proven to break the multi-word phrase",
            checks,
        )
        all_patterns = (
            rules.veto
            + rules.promotional
            + rules.automated_subjects
            + rules.human_prefixes
            + rules.automated_sender_localparts
            + rules.protected_localparts
            + rules.protected_domains
        )
        _check(
            all(not (pattern.flags & re.VERBOSE) for pattern in all_patterns),
            "no shipped pattern is compiled with re.VERBOSE",
            checks,
        )

        _check(
            by_uid[3]["action"] == "PROTECT",
            "receipt subject is PROTECT",
            checks,
        )
        _check(
            by_uid[1]["action"] == "ASK" and by_uid[2]["action"] == "ASK",
            "a sender with veto history can never be auto-MOVE",
            checks,
        )
        _check(
            plan["uids"] == [4, 5],
            "MOVE contains only the clean recurring sender",
            checks,
        )
        _check(
            by_uid[6]["action"] == "PROTECT",
            "Re: subject is PROTECT",
            checks,
        )
        _check(
            by_uid[7]["action"] == "PROTECT",
            "free-mail sender without bulk signal is PROTECT",
            checks,
        )
        _check(
            by_uid[8]["action"] == "NOISE",
            "promotional bulk message is NOISE",
            checks,
        )
        _check(
            by_uid[9]["action"] == "ASK",
            "one-off automated message is ASK at min count 2",
            checks,
        )
        _check(
            by_uid[10]["action"] == "PROTECT",
            "message-level security veto wins",
            checks,
        )

        repeated = triage(
            _fixture(),
            rules,
            input_paths=["synthetic-fixture.jsonl"],
            rules_source="builtin",
        )
        _check(
            json.dumps(plan, sort_keys=True) == json.dumps(repeated, sort_keys=True),
            "classification and plan output are deterministic",
            checks,
        )

        strict = compile_rules(None, min_sender_count=3)
        strict_plan = triage(
            _fixture(),
            strict,
            input_paths=["synthetic-fixture.jsonl"],
            rules_source="builtin",
        )
        strict_by_uid = {row["uid"]: row for row in strict_plan["decisions"]}
        _check(
            strict_by_uid[4]["action"] == "ASK",
            "--min-sender-count raises the recurrence bar",
            checks,
        )

        explicit = compile_rules(
            {"move_senders": ["alerts@bank.example"]}, min_sender_count=2
        )
        explicit_plan = triage(
            [
                {
                    "uid": 20 + index,
                    "from": "alerts@bank.example",
                    "subject": "Monthly service update",
                    "list_unsubscribe": True,
                    "folder": "INBOX",
                    "uidvalidity": 1,
                }
                for index in range(3)
            ],
            explicit,
            input_paths=["fixture"],
            rules_source="fixture",
        )
        _check(
            all(
                row["action"] == "ASK"
                for row in explicit_plan["decisions"]
            ),
            "explicit move_senders cannot bypass protected categories",
            checks,
        )

        clean_bulk = triage(
            [
                {
                    "uid": 30 + index,
                    "from": "news@example.com",
                    "subject": "Weekly digest",
                    "list_unsubscribe": True,
                    "folder": "INBOX",
                    "uidvalidity": 1,
                }
                for index in range(3)
            ],
            rules,
            input_paths=["fixture"],
            rules_source="fixture",
        )
        _check(
            clean_bulk["uids"] == [30, 31, 32],
            "clean recurring bulk sender still classifies MOVE",
            checks,
        )

        bank = triage(
            [
                {
                    "uid": 40 + index,
                    "from": "alerts@bank.example",
                    "subject": "Monthly service update",
                    "list_unsubscribe": True,
                    "folder": "INBOX",
                    "uidvalidity": 1,
                }
                for index in range(3)
            ],
            rules,
            input_paths=["fixture"],
            rules_source="fixture",
        )
        _check(
            bank["uids"] == []
            and all(row["action"] == "ASK" for row in bank["decisions"]),
            "bland bank sender is not MOVE-eligible",
            checks,
        )

        protected_samples = (
            "alerts@credit-union.example",
            "alerts@agency.gov",
            "alerts@school.example",
            "alerts@health.example",
            "alerts@insurance.example",
            "alerts@travel.example",
            "alerts@billing.example",
            "alerts@security.example",
        )
        protected_rows = []
        for offset, sender in enumerate(protected_samples):
            for index in range(3):
                protected_rows.append(
                    {
                        "uid": 200 + offset * 10 + index,
                        "from": sender,
                        "subject": "Monthly service update",
                        "list_unsubscribe": True,
                        "folder": "INBOX",
                        "uidvalidity": 1,
                    }
                )
        protected_plan = triage(
            protected_rows,
            rules,
            input_paths=["fixture"],
            rules_source="fixture",
        )
        _check(
            protected_plan["uids"] == []
            and all(
                row["action"] == "ASK"
                for row in protected_plan["decisions"]
            ),
            "protected categories cover bank/brokerage, government, school, "
            "medical, insurance, travel, billing, and security",
            checks,
        )

        no_positive = triage(
            [
                {
                    "uid": 50 + index,
                    "from": "alerts@example.com",
                    "subject": "Quarterly hello",
                    "list_unsubscribe": True,
                    "folder": "INBOX",
                    "uidvalidity": 1,
                }
                for index in range(3)
            ],
            rules,
            input_paths=["fixture"],
            rules_source="fixture",
        )
        _check(
            no_positive["uids"] == [],
            "recurring bulk sender without a positive subject is ASK",
            checks,
        )

        no_bulk = triage(
            [
                {
                    "uid": 55 + index,
                    "from": "notifications@example.com",
                    "subject": "Weekly digest",
                    "list_unsubscribe": False,
                    "folder": "INBOX",
                    "uidvalidity": 1,
                }
                for index in range(3)
            ],
            rules,
            input_paths=["fixture"],
            rules_source="fixture",
        )
        _check(
            no_bulk["uids"] == [],
            "automated-looking sender without bulk signal is ASK",
            checks,
        )

        subject_rows = [
            {
                "uid": 60,
                "from": "news@example.com",
                "subject": "Weekly digest",
                "list_unsubscribe": True,
                "folder": "INBOX",
                "uidvalidity": 1,
            },
            {
                "uid": 61,
                "from": "news@example.com",
                "list_unsubscribe": True,
                "folder": "INBOX",
                "uidvalidity": 1,
            },
            {
                "uid": 62,
                "from": "news@example.com",
                "subject": "",
                "list_unsubscribe": True,
                "folder": "INBOX",
                "uidvalidity": 1,
            },
            {
                "uid": 63,
                "from": "news@example.com",
                "subject": ["not", "a", "string"],
                "list_unsubscribe": True,
                "folder": "INBOX",
                "uidvalidity": 1,
            },
        ]
        subject_plan = triage(
            subject_rows,
            rules,
            input_paths=["fixture"],
            rules_source="fixture",
        )
        subject_by_uid = {
            row["uid"]: row for row in subject_plan["decisions"]
        }
        _check(
            subject_by_uid[61]["action"] == "ASK"
            and subject_by_uid[62]["action"] == "ASK"
            and subject_by_uid[63]["action"] == "ASK",
            "missing, empty, and non-string subjects fail closed to ASK",
            checks,
        )
        _check(
            "one or more records lack a string subject field"
            in " ".join(plan_blockers(subject_plan)),
            "missing subject blocks plan emission",
            checks,
        )

        incomplete = triage(
            [
                {
                    "uid": 70,
                    "from": "news@example.com",
                    "subject": "Weekly digest",
                    "list_unsubscribe": True,
                }
            ],
            rules,
            input_paths=["fixture"],
            rules_source="fixture",
        )
        incomplete_blockers = " ".join(plan_blockers(incomplete))
        _check(
            "source_folder is missing" in incomplete_blockers
            and "uidvalidity is missing" in incomplete_blockers,
            "plan emission requires source_folder and uidvalidity",
            checks,
        )

        empty_protected = ""
        try:
            compile_rules(
                {
                    "protected_localparts": [],
                    "protected_domains": [],
                    "protect_senders": [],
                },
                min_sender_count=2,
            )
        except MailError as exc:
            empty_protected = str(exc)
        _check(
            "protected matching is empty" in empty_protected,
            "empty protected matching is rejected without acknowledgement",
            checks,
        )
        acknowledged = compile_rules(
            {
                "protected_localparts": [],
                "protected_domains": [],
                "protect_senders": [],
                "acknowledge_empty_protected": True,
            },
            min_sender_count=2,
        )
        _check(
            acknowledged.protected_empty,
            "explicit acknowledgement allows empty protected matching",
            checks,
        )

        invalid_regex = ""
        try:
            compile_rules({"veto": ["("]}, min_sender_count=2)
        except MailError as exc:
            invalid_regex = str(exc)
        _check("invalid regex" in invalid_regex, "invalid regex is rejected", checks)

        empty_pattern = ""
        try:
            compile_rules({"veto": [""]}, min_sender_count=2)
        except MailError as exc:
            empty_pattern = str(exc)
        _check(
            "empty value" in empty_pattern,
            "empty pattern is rejected instead of matching everything",
            checks,
        )

        unknown_key = ""
        try:
            compile_rules({"veto_typo": []}, min_sender_count=2)
        except MailError as exc:
            unknown_key = str(exc)
        _check("unknown rule key" in unknown_key, "unknown rule key is rejected", checks)

        mixed_folder = ""
        try:
            triage(
                [
                    {
                        "uid": 1,
                        "from": "a@example.com",
                        "subject": "one",
                        "folder": "INBOX",
                        "uidvalidity": 1,
                    },
                    {
                        "uid": 2,
                        "from": "b@example.com",
                        "subject": "two",
                        "folder": "Archive",
                        "uidvalidity": 1,
                    },
                ],
                rules,
                input_paths=["fixture"],
                rules_source="fixture",
            )
        except MailError as exc:
            mixed_folder = str(exc)
        _check(
            "multiple folders" in mixed_folder,
            "mixed-folder inputs are rejected",
            checks,
        )
    except AssertionError as exc:
        print(f"mail_triage self-test: FAIL: {exc}", file=sys.stderr)
        return 1
    except MailError as exc:
        print(f"mail_triage self-test: FAIL: {exc}", file=sys.stderr)
        return 1
    print(f"mail_triage self-test: PASS ({len(checks)} checks)")
    return 0


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Offline, sender-aware triage over mail_scan.py JSONL. No network, "
            "no mailbox writes. Emits MOVE/NOISE/ASK/PROTECT and an optional plan."
        )
    )
    parser.add_argument(
        "--input",
        nargs="+",
        metavar="PATH.jsonl",
        help=(
            "one or more scan exports, all from one folder. Pass every "
            "historical scan to make the sender veto history complete."
        ),
    )
    parser.add_argument(
        "--rules",
        metavar="PATH.json",
        help=(
            "JSON rule overrides. Keys: veto, promotional, automated_subjects, "
            "human_prefixes, automated_sender_localparts, protected_localparts, "
            "protected_domains, free_mail_domains, protect_senders, "
            "move_senders, acknowledge_empty_protected, min_sender_count. A "
            "supplied key replaces the built-in key; unknown keys are rejected."
        ),
    )
    parser.add_argument(
        "--report",
        action="store_true",
        help="print the grouped human-readable report to stdout",
    )
    parser.add_argument(
        "--emit-plan",
        metavar="PATH.json",
        help="write a private 0600 plan JSON (uids = MOVE only)",
    )
    parser.add_argument(
        "--min-sender-count",
        type=int,
        metavar="N",
        help=(
            "messages a sender must have before MOVE is allowed (default: 5, "
            "or the rules file value; this flag wins)"
        ),
    )
    parser.add_argument(
        "--self-test",
        action="store_true",
        help="run offline classification assertions and exit",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.self_test:
        return self_test()

    if not args.input:
        parser.error("--input is required unless --self-test is used")
    if args.min_sender_count is not None and args.min_sender_count < 1:
        parser.error("--min-sender-count must be at least 1")
    if args.emit_plan:
        plan_path = os.path.abspath(args.emit_plan)
        for source_path in args.input:
            if source_path != "-" and os.path.abspath(source_path) == plan_path:
                parser.error("--emit-plan must not overwrite an input scan")
        if args.rules and os.path.abspath(args.rules) == plan_path:
            parser.error("--emit-plan must not overwrite the --rules file")

    try:
        rules, rules_source = load_rules(
            args.rules, min_sender_count=args.min_sender_count
        )
        if not rules.veto:
            print(
                "mail_triage: warning: the veto list is empty; transactional "
                "and security mail is no longer protected",
                file=sys.stderr,
            )
        if rules.protected_empty:
            print(
                "mail_triage: WARNING: protected matching is empty "
                "(acknowledged in rules); bank, government, school, medical, "
                "insurance, travel, billing, and account-security senders are "
                "no longer hard-protected",
                file=sys.stderr,
            )
        records: list[Mapping[str, Any]] = []
        for path in args.input:
            records.extend(read_jsonl(path))
        plan = triage(
            records,
            rules,
            input_paths=args.input,
            rules_source=rules_source,
        )
    except MailError as exc:
        print(f"mail_triage: {exc}", file=sys.stderr)
        return 1

    if args.emit_plan:
        blockers = plan_blockers(plan)
        if blockers:
            print(
                "mail_triage: refusing to emit an actionable plan: "
                + "; ".join(blockers),
                file=sys.stderr,
            )
            return 1
        try:
            destination = write_json_atomic(args.emit_plan, plan)
        except MailError as exc:
            print(f"mail_triage: {exc}", file=sys.stderr)
            return 1
        print(f"mail_triage: plan -> {destination}", file=sys.stderr)

    if args.report:
        print(render_report(plan))
        print(
            f"mail_triage: total={plan['summary']['total']} "
            + " ".join(
                f"{action}={plan['summary'][action]}" for action in ACTIONS
            ),
            file=sys.stderr,
        )
    else:
        print(
            f"mail_triage: total={plan['summary']['total']} "
            + " ".join(
                f"{action}={plan['summary'][action]}" for action in ACTIONS
            ),
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
