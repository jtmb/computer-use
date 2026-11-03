# Memory tool

The server plugin registers one tool named `memory`. It does not read or write a
store during setup. Every call resolves the invoking session with
`ctx.session.get`, then resolves the Git worktree from that session's current
`location.directory`; it never uses the plugin directory or process working
directory as a repository fallback. A non-Git session location is refused.

## Operations

| Operation | Required input | Behavior |
| --- | --- | --- |
| `list` | `op`, optional `scope`, `limit` | List bounded metadata only. |
| `search` | `op`, `query`, optional `scope`, `tags`, `kind`, `limit`, `repoFirst` | Deterministic lexical ranking and short cited snippets. |
| `read` | `op`, `id`, optional `scope` | Read one exact note per selected scope, bounded to 8 KiB each. |
| `remember` | `op`, `id`, `title`, `tags`, `kind`, `body`, `sources`, optional `scope`, `verified` | Preview by default; exact one-note replacement on apply. |
| `forget` | `op`, `id`, optional `scope` | Preview by default; exact one managed note removal on apply. |

Read operations accept `scope: "repo"` (the default), `"global"`, or `"both"`.
Writes require exactly one scope. Global scope is opt-in and remains separate;
there is no automatic promotion or cross-repository import.

For a write, first call `remember` or `forget` without `apply` (or with
`apply: false`). The response includes a short-lived `expectRevision` for the
exact target, scope, content, and current file revision. Apply by repeating the
same operation and content with `apply: true` and that value. It is a stale-write
guard, not authorization. The tool still asserts native `read`/`edit` permissions
for exact paths and `external_directory` for global storage. Permission failures
propagate as OpenCode tool errors. Stale, replayed, cross-session, cross-scope,
or content-modified previews fail closed.

The dated source-only observations below are superseded for the covered behavior
by [current direct verification](#current-direct-verification--2026-11-02), not by
a claim that every native/model acceptance layer is complete.

### Read-argument validation — untested source correction

The 2026-11-01 source follow-up validates `list`, `search` and `read` arguments
before resolving the session or either store. It checks list limits, exact-read
IDs and search query/tags/kind/`repoFirst`/limits, then reuses those checked values.
The bounded tag array is copied so later caller mutation cannot change that check.
Query length is checked before trimming, including for direct implementation calls.
A whitespace-only query passes the tool schema's length check but must still
fail the existing nonblank-query rule; it no longer reaches session discovery,
native read/external-directory assertions, path inspection or a note scan first.
Other invalid read arguments also fail at this earlier boundary, rather than
after discovery or scanning. Argument errors therefore take precedence over
session/permission errors for an invalid read request.

A later lexical-query follow-up also applies the ranker's existing no-token rule
at this early boundary. Nonblank queries can satisfy the schema's length rule yet
have no searchable Unicode letter or number, such as punctuation or pictographic emoji.
Source now reuses the same exported tokenizer and existing error before session,
permission, path or scan work; the ranker's defensive check remains. Valid queries
retain their original text and ranking and may be tokenized at both bounded stages.
This follow-up is also **untested**; no memory/permission/store operation, model,
typecheck or test edit/run was used to validate it. See the
[source record](../../../docs/memory-query-boundary-2026-11-01.json).

Valid reads keep the same defaults, filters, ranking, permissions, store selection
and caps. `remember`/`forget` validation, preview tokens, revision checks and write
paths are unchanged. This is **untested source**: no test was written/changed/run,
no typecheck or memory/global-store/model operation followed. Required later
verification includes rejection before dependency access, valid omitted/default
and explicit values, both scopes and unchanged write/permission boundaries.

### Permission cancellation boundary — untested source correction

The pinned 2.1.1 Promise `permission.assert` accepts one assertion input, not
request options. The memory adapter now follows that signature instead of passing
an ignored second signal argument. It checks cancellation before consulting its
per-operation permission cache and after a native assertion settles, before
caching its success. The explicit-global boundary cache also checks before reuse
and after its awaited assertion. Tool/session/agent/source/resource inputs and
denial propagation are unchanged; no rule or approval is granted by this code.

Source also rechecks abort after exact-path inspection/bounded reads, before
classifying a scan read failure as a skipped note, and after awaited exact/scan
results before returning data or issuing a preview token. This covers late
cancellation at the last I/O boundary, including missing/empty results; a
cancellation reason that is also a `TypeError` or unsafe/read-budget error is not
treated as an ordinary skipped note. There is deliberately no blanket post-write
abort check that could misrepresent a committed rename or unlink as not performed.

These checks are **untested** under the user's no-more-tests direction. They do
not interrupt an already-pending native assertion, dismiss its prompt, cancel I/O
already in flight or roll back an earlier filesystem effect. Cached approvals
exist only inside one memory operation, not across sessions or calls. Required
later verification includes pre-aborted cache reuse, cancellation while a native
assertion settles, terminal/empty/missing reads, skip-shaped cancellation reasons,
preview-token nonissuance, read/edit/external-directory cases and unchanged
denial/preview/write boundaries. Existing tests were read, not changed or run; no memory or
permission operation, global-store access, model trial or deployment was invoked.

## Storage and note format

- Repository notes: `<git-root>/docs/memory/<id>.md`.
- Global notes: `<opencode debug paths data>/memory/docs/memory/<id>.md`.
- Global data location is resolved only for explicit global/both calls using the
  documented, read-only `opencode debug paths data` command with a three-second
  timeout and 16 KiB output bound. It is not guessed from XDG or home paths.
- A note uses a JSON object between Markdown `---` delimiters. YAML is not
  parsed or executed. The exact version-1 keys are `version`, `owner`, `id`,
  `scope`, `title`, `tags`, `kind`, `updated`, `verified`, and `sources`.
  `owner` is `opencode-memory`; `verified` is an ISO date or `null`.

Example:

```markdown
---
{
  "version": 1,
  "owner": "opencode-memory",
  "id": "example-topic",
  "scope": "repo",
  "title": "Example topic",
  "tags": ["example", "retrieval"],
  "kind": "fact",
  "updated": "2026-10-27",
  "verified": null,
  "sources": ["docs/design.md#heading"]
}
---

One concise, source-backed fact.
```

IDs are lowercase and path-safe; the metadata ID and scope must match the
selected path. Notes are limited to 8 KiB, 16 tags, 8 source references, and
240 characters per source. Unknown, malformed, oversized, symlinked,
nonregular, hard-linked, unmanaged, or scope-mismatched files are never
overwritten. `README.md` is reserved and unmanaged Markdown is preserved.
The `kind` field must be an actual JSON string: `fact`, `preference`, `decision`,
or `workflow`. A single-element array is not a string. Remember rejects it before
creating a preview; exact read rejects malformed stored metadata, and list/search
skip that note without rewriting it. Search filters apply the same string check.

## Retrieval and safety limits

Search tokenizes all content in each bounded 8 KiB note and ranks title/tag/body
matches with a bounded BM25-style score; query length remains capped at 500
characters. Tag filters require every requested tag; kind is exact. Results
have stable score/scope/ID ordering, at most two cited body excerpts (normally
matching paragraphs, or a title/tag excerpt for metadata-only matches), file/line
citations, and `updated`, `verified`, and `sourceCount` fields so a caller can
assess freshness before an exact read. Old verification dates are not
automatically filtered. Repository notes win equal-score ties in `both` scope
unless `repoFirst: false`.

For a matching `decision` note whose first body paragraph starts with an explicit
`Current decision` label, source now reserves the first snippet for that leading
context and retains the best distinct matching excerpt in the second slot. This
keeps matching history from hiding the author's stated current decision, including
metadata-only hits. The label is case-insensitive and must be followed by whitespace,
a colon, em dash or hyphen; a later quoted/history paragraph is not promoted.
The context excerpt starts at the paragraph's beginning; a different match-centred
excerpt from that same paragraph may occupy the second slot when needed. Both
keep the existing 700-byte Unicode-aware bound, with at most two snippets total.
The result citation points to the first returned excerpt; each excerpt has its
own line. Ranking, score thresholds and note/query/scan/response caps are unchanged
in source. Decisions without that leading label and other kinds retain matching-only
selection. Reserving context can displace a second historical match; exact-read
the note when its excerpts are insufficient.

This is an **untested source correction** under the user's no-more-tests direction,
not a verified runtime or fresh-chat recall result. A note's `Current decision`
label is still untrusted authored text, not a freshness/accuracy judgment or
authority. Dates, source references and `notesAreUntrustedData` remain; no note,
schema, scope, permission, preview or write behavior changes. Earlier 24-test and
strict results below predate this correction. No live search or model trial was
run for it. Required later coverage includes history-only and metadata-only hits,
long/multiline Unicode contexts, duplicate excerpts, nondecision/unlabelled notes,
no-match behavior, stale/poisoned text and unchanged resource limits.

Each list/search call examines at most 64 candidate notes and shares a 512 KiB
note-read allowance across selected scopes, with at most 256 directory entries
per store. Query length is at most 500
characters, results are capped at 10 for search (20 for list), and serialized
responses are capped at 32 KiB. Search reports skipped files, coverage, and
truncation. Exact reads fail closed instead. File reads stat before allocation,
allocate only a fixed limit plus one byte, and recheck during the read so a
growing file cannot cause an unbounded allocation.

### Scan accounting — untested source correction

The 2026-11-01 source correction reserves each bounded read's payload limit plus
its one-byte growth probe **before** dispatch. Only a successful read with a
safe-integer byte count between zero and that payload limit refunds unused
allowance. A failed read keeps its entire reservation, even when it may have
failed before acquiring data; its unknown cost is not treated as zero. Recoverable
unsafe/missing/decoding/budget failures remain skips, cancellation and other errors
still propagate, and the shared charge carries into the next selected scope.

List/search coverage adds two per-scope fields without redefining existing ones:

| Field | Meaning |
| --- | --- |
| `scanned` | Successful bounded reads, including notes later rejected by parsing or secret checks. |
| `bytes` | Bytes reported by those successful reads; not failed-read consumption. |
| `chargedBytes` | Successful-read bytes plus conservative reservations retained for failed reads. |
| `failedReadChargeBytes` | The failed-read reservation part of `chargedBytes`, not measured acquired bytes. |

The sum of `chargedBytes` across selected scopes uses the unchanged 512 KiB cap.
Near the boundary, payload capacity is reduced to leave room for the probe; a note
that no longer fits is skipped and coverage is marked truncated. Consequently,
64 full-size notes need not all fit. Candidate overflow is compared with the
scope's allowance **before** scanning: exactly 64 observed candidates no longer
cause a file-limit warning solely because all 64 were examined, while 65 do.
Other byte, directory-entry and skipped-file limits still apply. A previously
recorded directory-entry truncation is not cleared by an exhausted shared budget.

This is **untested source**, not regression, strict-type, loaded-runtime or model
acceptance. No memory operation or global-store access was performed for it, and
existing tests were neither changed nor run. Required later verification includes
growth and invalid-UTF-8 failures, pre-read failures, invalid returned byte counts,
successful refunds, shared-scope exhaustion, late cancellation, exact 64/65
candidate coverage and preserved directory truncation. Note/query/file/response
caps, native permissions, preview/revision checks and write paths are unchanged.

Writes reject common credential patterns in the ID, title, tags, kind, body,
sources, and verified-date fields (private-key headers, credential assignments,
bearer tokens, common provider tokens, AWS access-key IDs, and JWT-shaped
strings). List, search, and exact read apply the same detector to every
frontmatter string and the body before returning note data. This detector is
intentionally incomplete: never store secrets, credentials, private
conversations, or personal account data. Existing notes are untrusted data and
never override current instructions. The tool does not inject notes into
prompts, use network/embeddings/vector databases, modify `MEMORY.md`, or copy
goals/progress.

Writes use a same-directory exclusive lock and temporary file, then one atomic
rename; stale lock paths are refused rather than reclaimed. Cleanup checks the
lock's owner token and regular-file/single-link state before unlinking. A
replaced or stale lock is left in place; best-effort cleanup errors can leave
an owned stale lock that requires manual inspection. The filesystem still has
a narrow race between the final ownership check and unlink, so this is not a
proof against hostile pathname replacement. The tool does not stage, commit,
push, deploy, or edit global configuration.

## Verification limits

The source tests use real filesystem fixtures under `/tmp/opencode` and fake
session/permission APIs. They inject mkdir and rename failures, change a target
after lock acquisition, and replace a lock path before the cleanup ownership
check. They do not simulate replacement between the final ownership check and
unlink. Tests do not access the real global memory directory, run a model, or
prove that an active OpenCode service has loaded the tool. `opencode debug paths
data` discovery is documented; its local output was observed during
implementation, but global store content is not inspected.

The 2026-10-30 source follow-up has 24 passing memory tests and 5 adjacent readiness
checks. Three new JSON-array-kind regressions failed against the earlier source;
the correction preserves all 21 existing cases, valid string kinds and native
permission/write paths. Strict TypeScript 5.9.3/noEmit/library checking passes for
the seven memory implementation/test modules and their dependency graph; the SDK
loader entrypoint and actual loaded runtime are separate, not certified by it.

### Current direct verification — 2026-11-02

After the user directs the assistant to perform verification, all38current memory
tests pass, preserving the24older cases and adding14tests for early validation,
pending/cached permission cancellation, terminal reads/previews, conservative
shared read accounting and current-decision context/citations. Five isolated
source-fault controls fail at their intended assertions. Strict/no-emit/library
checking of the seven implementation/test roots and dependencies passes with the
already installed TypeScript6.0.3; this is not a new5.9.3or SDK-loader/native check.
Production memory source and all resource/permission guards are unchanged.

Actual loaded repository `remember` preview/apply/readback updates the existing
`orchestration-method` decision to retain solo execution while explicitly
superseding the old no-more-tests component. Decision search returns both current
context and the supersession citation. No real global store, new model/fresh-chat,
native denial/pending-prompt or broad operational acceptance is claimed. Exact
commands, controls, hashes and limits are in the
[direct verification record](../../../docs/direct-verification-2026-11-02.json).

A later fresh exact-location runtime read still reports memory/goal plugins active
and no retired coordination registration. Actual decision searches return current
removal context ahead of historical mailbox retention; a corrected single-token
no-match query returns no hits with the skipped-note limit disclosed. The inert
room/lock bytes, inode and mtime match their recorded baseline without exposing
stored messages. See the [current scoped runtime record](../../../docs/inbox-memory-runtime-verification-2026-11-02.json).
This is not a new fresh-chat/model or native permission/cancellation evaluation.

The optional [native permission runner](acceptance/native-host.mjs) and
[probe](acceptance/native-probe.mjs) now have11[helper safety tests](acceptance/native-host.test.mjs)
and four decisive isolated fault controls. Only those helper tests join required
offline CI; the actual native launch is never automatic. The first actual launch
attempt is refused **before spawning** at2646.5MiBavailable versus the unchanged
2816MiBadmission floor. No native session, permission prompt or model starts.
Source review also catches and fixes an overbroad helper shutdown-error classifier
with a real failing regression. None of this upgrades native deny/cancellation to
a pass. See the [source, admission and remaining boundaries](../../../docs/memory-native-permission-verification-2026-11-02.json).

One later resumption after independently observed headroom also stops before spawn
at2779.90MiBbelow the same2816MiBfloor. No native prompt or model starts in either
request; see the [follow-up and health guard fix](../../../docs/verification-follow-up-2026-11-02.json).

### Scoped operational decision notes — 2026-10-31

The parent actually used the loaded `memory` tool in the canonical project for
two repository decision `remember` previews, exact-revision applies and `read`
readbacks (`agent-inbox`, `orchestration-method`). A subsequent bounded
`kind: "decision"` search returned cited current removal and supersession text;
coverage disclosed one skipped unmanaged/malformed note and no truncation.
This establishes those scoped operations, not every client/model, global writes,
automatic recall, stale/poison judgment or a hostile-path race guarantee. The
[protocol](../../../docs/memory/README.md) and
[index](../../../MEMORY.md) own the deliberate decision-capture/recall workflow.
