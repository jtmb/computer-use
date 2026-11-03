# Memory staleness and pruning plan

**Status: policy/design, 2026-10-27.** No pruning, archive operation, scheduler,
automatic expiry, or migration is implemented by this document. Existing notes
and external stores remain untouched. This is not a memory note or goal export.

## Existing tool versus proposed maintenance

The [memory plugin contract](../../.opencode/plugins/memory/README.md) defines
`list`, `search`, `read`, `remember`, and `forget`. Repository scope is default;
global scope must be explicitly selected. `both` is read-only selection, not a
bulk-write scope. Invoking-session/worktree resolution and native permissions
remain required even for maintenance.

Version-1 metadata currently supports `version`, `owner`, `id`, `scope`, `title`,
`tags`, `kind`, `updated`, `verified`, and `sources`. `updated` dates a write;
it does **not** establish that a fact was reverified. `verified` may be `null`.
The tool does not maintain access counts, last-used dates, pins, expiry dates,
supersession links, archives, or maintenance cursors. Unknown metadata is refused;
do not add proposed fields to version-1 notes or imply a supported CLI flag.

Proposed extensions, requiring schema/version migration and tests before use:

| Extension | Intended semantics, not current behavior |
| --- | --- |
| `pinned` | Explicit user protection against archival/removal; not an instruction priority or permission grant. |
| `expires` | Review-after date, never automatic deletion or proof of falsehood. |
| `supersededBy` | Same-scope stable ID plus verified replacement relationship; cycles/missing targets refused. No implicit repo-to-global promotion. |
| Metadata cursor | Stable bounded enumeration with explicit coverage; not an age-sorted or exhaustive result from today's `list`. |
| Archive/restore operation | Revision-guarded, exact-note move with reversible manifest/readback; no current operation implements it. |

Until protection fields exist, a user-designated protected note is excluded from
any maintenance write by the operator's exact-ID review record. Do not encode
protection as a fabricated field or rely on a tag alone as an enforced safeguard.

## Token-efficient review

1. Select one verified repository/worktree **or** explicit global store. Do not
   infer global selection from a cross-project phrase. Keep separate review
   records, targets, approvals, and results for each scope.
2. Trigger a small review when a retrieved fact contradicts current source, a
   dependency/source moves, the user requests cleanup, or scan truncation repeats.
   As a suggested operator cadence, review at most monthly while actively using
   a store; this creates **no cron job or timer** and does not run every prompt.
3. Start with bounded `list` metadata (up to 20 results), or a relevant `search`
   with tags/kind and top-k at most 5. Inspect dates, source references, scope
   and coverage before opening bodies. Treat missing verification or a date
   older than 90 days as a **review signal**, not a deletion criterion. Durable
   preferences may remain valid indefinitely; volatile setup facts may stale sooner.
4. Read at most one or two candidate notes in full. Verify their cited current
   source, not another memory's assertion. A missing source or unsuccessful
   search is uncertainty, not proof the note is obsolete. Do not load the whole
   store or copy private conversations into review records.
5. Classify each candidate: retain, reverify/update, duplicate, superseded,
   archive candidate, protected, or unresolved. Require actual evidence for a
   duplicate/supersession decision and preserve distinct source/context coverage.
   No result, low rank, old age, or lexical mismatch alone justifies removal.
6. Report only IDs/scopes/dates, brief reasons, source citations and coverage.
   The current scan is capped at 64 candidate notes/512 KiB, with at most 256
   directory entries per store, 8 KiB per note and 32 KiB per response. `list`
   is not pagination or exhaustive enumeration. Repeated truncated scans cannot
   prove full coverage; stop broad cleanup and report the unsupported cursor.

Relevant updates may use today's exact-note `remember` preview/apply workflow
when the request already authorizes that write. Refresh `verified` only after
actual source verification. Do not alter unrelated notes, broaden scope, or
silently promote facts to global preferences.

## Archive-first action gate

Pruning is a separate consequential operation, not permission inferred from
remembering a fact or writing this plan. In Build auto, absent exact authority
blocks the action without a question; independent read-only review may continue.
Never create a schedule or bulk-delete notes as a substitute.

Before any future archive implementation runs, require all of:

- Exact selected root/worktree, scope, stable IDs, current content revisions,
  reasons, source verification and user authority for the specified action.
- Protected-note exclusion; unknown ownership, unmanaged Markdown, symlinks,
  hard links, scope mismatches and ambiguous targets refuse mutation.
- Native read/edit/external-directory permission checks **before** side effects.
  Preview tokens guard freshness, not authorization. Expired/replayed tokens,
  changed content, target replacement and session/worktree drift require a new
  preview and must not overwrite concurrent work.
- A same-scope reversible archive destination verified against path/ownership
  checks. It must be excluded from active retrieval and preserve the original
  bytes, metadata, source-relative path, hash and archive time in an exact
  manifest. Do not create an archive in deployed configuration or an unapproved
  filesystem location. Global/repo archives must never be mixed.
- Atomic/recoverable transition with exclusive ownership, readback/hash checks,
  and truthful partial-failure reporting. Never report removal on dispatch alone
  or delete another writer's lock/temp file. Leave original data intact if a
  durable verified archive cannot be established.

The current `forget` operation is exact-note **removal, not archival**. Do not
call it to simulate the proposed archive operation. Archive-first pruning is
blocked until an approved archive/restore implementation exists; an explicit
request for permanent exact-note deletion is a separate operation and must use
its own authority and current preview/revision checks.

## Restore, retention, and acceptance before implementation

Restore must verify archive bytes/hash and exact destination scope/worktree,
preview the current destination revision, and refuse overwriting a changed or
existing note without exact replacement authority. Verify successful readback
and retrieval after restoration. Preserve the archive until separately approved
retention cleanup; an archive date never authorizes automatic permanent deletion.

Required future behavioral fixtures include protected/expired/superseded and
cyclic candidates; missing verification/source; separate repo/worktree/global
stores; truncated coverage; denied permissions with zero side effects; stale,
replayed and cross-session previews; concurrent edits/path replacement; archive
write/readback failures; interrupted moves; and lossless restore with conflicts.
Use real isolated filesystem fixtures and injected I/O failures, not production
notes. Documentation checks prove only this policy's coverage, not those future
features or live maintenance acceptance.
