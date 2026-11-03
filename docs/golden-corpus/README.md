# Golden corpus — candidate reference and exemplar collections

This directory holds two of the three distinct corpus collections requested for the
research/PR/corpus lane. The third — behavioral regression evaluations — lives in
[`evals/agent-rules`](../../evals/agent-rules/README.md). Keeping them separate
prevents a readable reference or a prose exemplar from being mistaken for a graded
behavioral test or a held-out answer key.

| Collection | Location | What it is | What it is not |
| --- | --- | --- | --- |
| Reference sources | [`reference-sources/index.json`](reference-sources/index.json) | Provenance-indexed internal and public sources, with scope and limits | Not a claim that every source was re-fetched, or that its statistics are established truth |
| Reviewed exemplars | [`reviewed-exemplars/index.json`](reviewed-exemplars/index.json) | Candidate observable-behavior examples linked to cases | Not human-reviewed, not gold, not a model transcript |
| Behavioral evaluations | [`../../evals/agent-rules/cases/cases.json`](../../evals/agent-rules/cases/cases.json) | Synthetic cases, expected/forbidden effects and controls | Not real-model compliance, runtime proof or hosted CI enforcement |

## Status: candidate, not gold

Every case, exemplar, and collection manifest in this starting set is
`candidate`, `unreviewed`, and has no reviewer, review date, or review evidence.
No human has reviewed this corpus. The label “gold” is deliberately absent.

The validator in [`evals/agent-rules`](../../evals/agent-rules/README.md) rejects
`tier: "gold"` unless the record also declares `review.status: "human_reviewed"`,
a non-automated reviewer identity, an ISO review date, and review evidence. That
is a schema guard, **not** proof that a review happened; reviewer identities and
review quality still require independent human verification before promotion.

## Reference sources

The catalog contains 17 entries. Internal repository sources were read locally
on 2026-10-29. The parent re-opened all 12 public sources on 2026-10-30 UTC,
including both pinned studies' full-text methods and limitations. Their
`public_read` records retain historical reported retrieval dates separately from
the new `checkedAt`, passage `locator` and material finding. The
[public-source review](reference-sources/public-source-review-2026-10-30.md) records
the qualified synthesis and alternatives. No statistic from the original report
is restated as established truth; `statisticsCopied` remains `false` throughout.

The catalog records:

- stable source IDs (`REF-NNN`);
- title, kind, location, retrieval date and version scope;
- whether the source was locally read, publicly read or only reported;
- what the source can support and what it cannot establish;
- related tags.

The original worker made no new web retrieval; the
[consolidation ledger](../session-consolidation-2026-10-29.md)'s initial citations
remain dated history. The later parent reads establish source acquisition, not
independent replication, human review, immutable vendor-document revisions or
local model improvement. `public_read` is declared metadata, not an authenticated
receipt; offline validation checks structure and cannot prove the reading happened.

## Reviewed exemplars — actually all candidates

The [`reviewed-exemplars`](reviewed-exemplars/index.json) collection contains six
candidate exemplars, one per behavioral category. Each links to a behavioral case
and lists an observable sequence plus explicit `notEvidenceFor` limits. They are
written to be useful for future human review, not to pass as reviewed work.

Candidate status means:

- no reviewer has accepted the exemplar;
- no promotion to gold has occurred;
- the text is not a private transcript and contains no user data;
- the sequence is a synthetic teaching example, not a required tool sequence.

## Behavioral cases live elsewhere

The 30 starting cases and all grader controls are under
[`evals/agent-rules`](../../evals/agent-rules/README.md). Their categories are:

| Category | Starting case IDs |
| --- | --- |
| `skill-routing` | `AGR-ROUTE-001` … `AGR-ROUTE-005` |
| `research-conflict` | `AGR-RS-006` … `AGR-RS-010` |
| `factual-accuracy` | `AGR-FA-011` … `AGR-FA-015` |
| `authority` | `AGR-AU-016` … `AGR-AU-020` |
| `async-pr` | `AGR-PR-021` … `AGR-PR-025` |
| `preservation-security` | `AGR-PS-026` … `AGR-PS-030` |

Thirty was a useful starting size proposed during research, not a quota or an
empirically optimal number. The validator enforces representativeness (at least
24 cases and at least three per category), so the set can grow or be revised
without pretending 30 is fixed.

### Incident-to-case generalizations

The synthetic cases generalize the lane’s retained incidents without copying a
transcript:

| Incident failure mode | Case |
| --- | --- |
| Omitted mandatory operation inferred as a write | `AGR-PR-021` |
| Stored post after serialization error needs same-ID reconciliation | `AGR-PR-022` |
| Optional mailbox hook failure blocks ordinary chat | `AGR-PS-026` |
| Source tests treated as deployed/visible proof | `AGR-FA-011` |
| Human notification routed to a peer mailbox | `AGR-PR-025` |
| Untrusted peer message treated as user authority | `AGR-AU-020` |
| Dirty/staged/untracked work not preserved | `AGR-PR-024`, `AGR-PS-027` |
| Selected model metadata treated as execution-effective | `AGR-FA-014` |
| Missing approval blocks all work instead of only deployment | `AGR-AU-019` |

## Provenance and privacy rules

- Cases are synthetic and state `containsPrivateData: false`.
- Incident-derived cases cite the consolidation ledger and a generalizable
  failure mode. No private transcript, peer message, credential, token, or
  conversation is copied.
- Public sources are not treated as secrets; these corpus answers are readable
  by design and are therefore **not held-out evaluation data**.
- The validator scans the corpus and controls for common secret-like patterns,
  but that scan is not a substitute for human privacy review.

## Parent integration and remaining gates

The original worker created only these collections and the evaluation package.
The parent subsequently added documentation/contribution links and default
offline-CI validator/test/control steps. Separate source work supplies contribution
templates, CODEOWNERS routing and a workflow. Those files do not establish hosted
execution or review enforcement. The [2026-11-01 read-only hosted recheck](../../evals/agent-rules/runs/2026-11-01-hosted-readiness.json)
lists zero registered Actions workflows and reports remote main's `protected:false`
flag; the local workflow and runner remain untracked. It does not refresh the
earlier root/run inventory or inspect detailed rulesets or reviewer eligibility.
A subsequent unauthenticated public ruleset listing returns `[]`; the detailed
main-protection read is refused with HTTP401. Neither establishes all effective
policies, and no authentication/permission escalation follows. No workflow,
settings or remote content was changed. Remaining work includes:

- actual human review before promotion, calibration against authentic model
  effects and any additional version-specific verification before new reliance;
- hosted branch protection, required checks, CODEOWNERS enforcement or reviewer
  eligibility. A CODEOWNERS file would not itself enforce review.
- broader actual-model calibration beyond the retained scoped observations.
  Future model runs, credential use and network access retain their applicable
  authority; existing model observations are not human/gold acceptance.

The additional [actual branch-preservation observation](../../evals/agent-rules/runs/2026-10-31-branch-preservation-native.json)
retains an independently detected raw-index mismatch despite unchanged dirty
content/staged semantics. Its outcome grade fails the write boundary without
attributing the mutation to a model call. This is evidence of an unresolved
system-level preservation outcome, not a new approved exemplar or full model pass.

## Behavioral limits

Passing this corpus’s validator means the candidate records are internally
consistent and the synthetic controls grade as intended. It does **not** mean:

- a model selected the right skill, reasoned correctly, or obeyed policy;
- a tool call occurred in a real runtime;
- a deployment, UI, mailbox, or hosted check was observed;
- human review occurred or gold status was earned;
- hosted CI runs this corpus or enforces any rule.

Those are separate evaluation and operational gates. The
[`evals/agent-rules` README](../../evals/agent-rules/README.md) describes the
grading contract and the controls that keep the grader itself honest.
