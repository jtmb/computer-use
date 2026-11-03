# Persistent Goal Mode Usage

Persistent goals are the execution record for authorized multi-step work; they
are not an automatic side effect of writing a conversational plan. Keep the
goal's durable objective, ordered phases, task backlog, evidence, and blockers
consistent with the work actually performed.

## Start with live state

Before work under an existing goal, call `get_goal` and inspect the current
status and `planRevision`. Read the full plan when the task cursor or phase
dependencies are not clear from the summary. Continue only an `active` goal;
do not implicitly resume paused goals or reopen completed, unmet, or cancelled
ones. Use the revision from the fresh read for supported plan updates, and
reread state if an update conflicts.

## Select work without skipping the backlog

**Goal planning is parent-only.** The main coordinator creates/revises goal plans,
decomposes/prioritizes/sequences the backlog, chooses the next goal task, and
makes lifecycle and completion decisions. General delegation authorization does not
transfer these responsibilities, including in parallel or auto mode. Children
may do bounded implementation and factual verification, not goal planning or
goal-plan drafting/summary fixtures. The parent evaluates returned evidence and
records all goal updates.

Honor `currentTask` first. After it is verified and recorded complete, reread
the goal and select the derived `nextTask`, which is scoped to the active phase.
Do not treat a null `nextTask` as proof that later phases have no pending work
or as authorization to start later-phase implementation. Inspect the full plan
and the next-phase field actually returned by the current tool (`nextPhase`,
`nextPhaseID`, or its documented equivalent).

The goal view exposes a single coordinator phase/task cursor, not a complete
concurrency registry. That serial cursor does not prohibit explicitly
user-authorized independent preparatory or review work in parallel when its
dependencies are satisfied and ownership is disjoint; a pending later-phase
task alone does not authorize its execution. Keep the coordinator cursor
unchanged and track parallel children in a separate child ownership/verification
registry with exact owner, task/path scope, status, expected return/evidence,
and independent verification. Prevent overlapping writes. A child's reported
completion or pending parent acceptance is not verified task completion; record
evidence through the supported goal update before advancing the cursor or phase.

When newly authorized scope belongs in the active phase but is missing from its
task list, add concrete pending successor tasks before implementation. Each task
should name an outcome and what evidence will establish completion. Scope that
belongs in a later phase can be recorded there, but must not be executed before
its dependencies and phase boundary allow it. Don't edit a derived cursor to
force selection. Advance only after the active phase's tasks have evidence and
the phase-level verification is recorded.

## Record completion and blockers

Mark a task complete only after its work is actually done and evidence is
available. Record a specific blocker for blocked work; don't discard it or
call it complete. Preserve the overall objective, immutable completion
criteria, and completed tasks when making an authorized plan extension. Do not
close a goal because one task ended, `nextTask` is null, or a later phase has
backlog. Audit all completion criteria against real evidence before marking the
goal complete; use unmet only for a concrete impossibility or blocker.

All supported reads and writes go through goal tools. Never modify raw goal
storage, generated goal documents, or derived fields by hand. A planning-only
request does not authorize goal creation or lifecycle changes; explicit
requests and the current mode/policy are still required for those operations.

In auto/no-question mode, use reasonable reversible defaults for ordinary
ambiguity. If essential information or authority is missing, record a blocker
and continue independent authorized work instead of asking another question.

## Waiting-audit fields and interrupted reviews

The selected enhanced engine's `remaining_work` means **independently actionable
work**, not every externally blocked deliverable. Its current validator rejects a
nonempty array. Keep every blocked requirement in the exact audit item/dependency
and unchanged plan; an empty independent-work remainder never means the goal is
finished. Any available independent action must be performed, not hidden there.
An `approval_required` item also needs the actual applicable policy/user instruction
in its `evidence` array; `authorization_basis` alone is insufficient. Reuse existing
authority instead of inventing a new approval gate.

The [2026-11-01 source diagnosis](goal-lifecycle-diagnosis-2026-11-01.json) separates
those caller-payload defects from three interrupted waiting calls. Current source
awaits the model review before transactional audit validation, so an abort can mask
a later deterministic rejection. Caller and plugin-lifetime cancellation are
forwarded, but neither source nor the one redacted log window establishes which
boundary aborted those calls. No implementation, model trial or runtime change
was made for this diagnosis.

After a lifecycle error, read supported goal state once. Do not claim waiting from
an attempted call, blindly repeat it, force a pause, disable review or edit raw
state. A future justified submission needs a fresh exact-scope audit and corrected
evidence; all original unfinished deliverables and actual verification gates remain.

The later **revision188** submission corrects both identified input issues while
retaining all20blocked tasks/eight criteria, but again returns **The operation was
aborted** without a reviewer verdict or validation acceptance. Immediate supported
readback confirms **active188**, not waiting. This does not identify the abort's
cause or authorize another unchanged retry, service restart or forced pause.

A later **revision198** full-scope request returns an actual reviewer continuation
verdict, not an unexplained abort: inspect whether the public message reader
requires the missing metadata. The parent performs that read-only pinned-source
check: both public list and known-ID message routes require the same metadata
`get` before message storage. Internal storage alone does not supply that public
gate and is not an authorized bypass. No repeated request, database read or new
test/model/child trial is used. The [updated diagnosis](goal-lifecycle-diagnosis-2026-11-01.json)
records this materially different result and the exact source evidence. It is
not original-history recovery, loaded-code proof or an accepted wait; the earlier
four aborts retain their unexplained causes.

A subsequent **revision200** request accepts that source finding but returns
another concrete continuation verdict: open the CVE's still-unopened public
advisory/issue and inspect any exposed public fix references. The parent performs
three bounded public fetches and local inert-HTML extraction: the advisory's
Markdown reader omitted its body, while issue494352583 exposes only Sign in.
The complete CVE entry links to that issue, not a public fix; broad change logs
and generic testing links are not substituted. The [diagnosis](goal-lifecycle-diagnosis-2026-11-01.json)
and [owning security record](document-authoring-transitive-native-declarations-2026-11-01.json)
retain those completed actions and corrected caller errors. No private access,
package-budget reset, test, installation or deployment is performed. This closes
the identified unopened-source lead, not wheel applicability, full delivery or
an accepted waiting transition; supported state remains active.

A later **revision203** review identifies a different read-only lead: trace the
generic Pillow expansion refusal against the retained artifact metadata and
canonical guard. The parent performs that comparison without tests, extraction
or downloads. Matching artifact/source hashes and bounded central-header fields
identify the first candidate member and **ratio**, not size, predicate; the
[batch follow-up](document-authoring-transitive-wheel-bytes-2026-11-01.json) retains
the evidence and inference limit. The original refusal/counters remain unchanged,
not upgraded to container/rights/runtime acceptance. The [diagnosis](goal-lifecycle-diagnosis-2026-11-01.json)
records this third concrete continuation verdict and active readback, separately
from the four older unexplained aborts. No waiting transition is inferred.

The **revision205** review identifies upstream OpenSSL advisories as another
specific missing source lead, not a reason to rerun tests or inspect native
payloads. The parent completes four bounded official/public reads and the full
saved4.0index range table: declared4.0.3is outside its43listed affected ranges,
while actual wheel linkage remains unresolved. The [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
and [diagnosis](goal-lifecycle-diagnosis-2026-11-01.json) retain source limits,
corrected caller parsing errors and the actual fourth continuation verdict.
This is neither complete security/delivery acceptance nor an accepted wait;
the four historical unexplained aborts remain a separate outcome class.

The **revision207** review identifies the exact pypdfium2 release's public
build/provenance references as an unperformed lead. Both resulting bounded units
are now performed: four discovery fetches establish an exact publisher-listed
wheel digest match; three newly exposed attestation-reference fetches return a
release-inventory statement and two MIME refusals, alongside the discovery
unit's matrix MIME refusal. The statement repeats the digest but is **not verified
build provenance**; no signature/trust or actual PDFium source/native mapping is
proved. The [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
and [diagnosis](goal-lifecycle-diagnosis-2026-11-01.json) retain all seven calls,
three real refusals and this fifth continuation verdict. Earlier calls/failures
and spent package allowances are not reset, and unread bodies are not called
absent/private. No tests, extraction, alternate client or deployment follows;
no waiting transition or task/phase completion is inferred.

The **revision211** review requests a narrower available lead: inspect the
already-returned certificate metadata. The parent recovers that exact public
tool result locally and displays the complete certificate extensions, retaining
the first lookup's buffer failure and changed bounded page shape. The asserted
release-service SAN gives no repository/workflow/commit or extra provenance
reference. The [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
and [diagnosis](goal-lifecycle-diagnosis-2026-11-01.json) retain this performed
sixth lead without promoting decoding to signature/trust/native-build proof.
No new external fetch, tests or deployment occurs; no waiting is inferred.

The **revision214** review separately requests the actual existing-byte DSSE
signature/key calculation. The parent performs it: exact pre-authentication
encoding, ECDSA/SHA-256 and the included public key yield **a matching signature**.
The [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
and [diagnosis](goal-lifecycle-diagnosis-2026-11-01.json) retain the hashes, algorithm
and seventh continuation verdict. This supersedes only the earlier unperformed
signature-check status, not certificate-chain/time/build trust. No new external
fetch, software test suite or deployment occurs; no waiting is inferred.

Parent independent-work review then proactively schedules the already-returned
timestamp metadata/imprint comparison at **revision217**, not an invented eighth
review verdict. Its hash matches the signature, while its time is unverified and
certificate container empty. The [owning record](document-authoring-transitive-native-declarations-2026-11-01.json)
retains actual caller/host failures and the completed bounded readback; no config
repair, trust-root installation or additional external fetch occurs. Metadata/
integrity results still do not complete original native/human acceptance.

The actual **revision218** review then requests official GitHub/Sigstore trust
sources: an empty embedded certificate container is not public-source exhaustion.
Two bounded units perform two searches/eight fetches, recording supported release
versus workflow verification, bootstrap/update policy and TSA-chain requirements
in the [native record](document-authoring-transitive-native-declarations-2026-11-01.json)
and [diagnosis](goal-lifecycle-diagnosis-2026-11-01.json). Historical version1 root
metadata with past expiry is not authenticated/current trust or proof recovery is
impossible. GitHub release-verifier source remains a concrete read-only lead;
no trust setting is changed, test run, or waiting/acceptance claim made. This is
the eighth continuation verdict, distinct from parent217 preparation and four
older unexplained aborts.

The **revision221** source-binding continuation identifies the official release
verifier's GitHub service-name/signed-time policy and explicit TUF distribution
references. It is performed, not another reviewer verdict or installed execution.
After the user reports a server restart, supported state is still active221;
completed reads/counters are retained and only write-safety identities rechecked.
The [owning record](document-authoring-transitive-native-declarations-2026-11-01.json)
keeps the new metadata/target lead explicit. No root is selected/installed, tests
run, worker restarted, or waiting/completion inferred.

The **revision222-226** continuation recovers the actual GitHub issuer/TSA target,
checks its checksum, timestamp/certificate signature relations and conditional
root3→9 metadata continuity. The [owning record](document-authoring-transitive-native-declarations-2026-11-01.json)
preserves an initial canonical-string encoding failure and the source-backed
correction; the exact next root returns404 without retry. These performed reads
are not another reviewer verdict, trusted-root adoption or native build proof.
All acquisition costs, original failures and full unfinished scope survive;
no tests, delegation, trust setting change or lifecycle acceptance is inferred.

### Structured-error follow-up and capture limits, revisions252-254

The later **revision249** waiting call is the fifth unexplained interruption,
separate from13actual continuation verdicts. The fresh250log window and subsequent
252source review do not identify its cause. The native durable log accepts
`after`/`follow`, not a bounded recent-error query; its512-event internal batches
continue through the replay boundary. Transient reviewer generation does not
directly save reviewer turns, while an outer tool error may retain optional
metadata. Neither path may be assumed to contain, or lack, the target evidence.

The changed **revision253** assistant-only metadata read parses two one-message
pages, then stops on `ENOBUFS`: the third capture contains131072bytes despite a
65536-byte `maxBuffer` setting. All three calls/184318bytes/3260ms remain charged;
this is not a clean64KiB-bounded read or proof the target is absent. Exact-version
Node source inspected at254 appends a chunk **before** checking its shared output
threshold. `maxBuffer` alone therefore does not enforce a hard before-read quota.
A future justified reader needs remaining-length-limited raw pipe reads and
bounded owned-client cleanup, without an overflow probe or unbounded drain.

The inspected message routes return full messages and expose no tool-only
projection; the CLI also buffers the full HTTP body before writing it. A count
limit of one is not a byte limit, and filtering afterward does not reduce bytes
already acquired. No replacement reader or known-oversized response retry is
run. The [source-bound diagnosis](goal-lifecycle-diagnosis-2026-11-01.json) preserves
the actual refusal, incomplete coverage, safe future acquisition requirements
and separate unknown249cause. This is not a new reviewer verdict, loaded-code
proof, behavioral repair or accepted waiting transition.

## Keep the visible session name current

Follow the [goal-usage title rule](../.opencode/skills/goal-usage/SKILL.md#keep-the-session-name-aligned-with-meaningful-goal-changes)
after successful goal mutations: update a stale semantic name when the objective,
current phase/task or meaningful lifecycle state changes. Read-only goal queries,
failed/no-op results and evidence-only plan bookkeeping do not require renaming.
Use the exposed supported current-session rename tool and inspect its result;
do not assume the visible name changed because a goal hook exists in source.
Preserve known user-chosen custom titles unless goal-driven renaming is authorized.

The existing [native mutation hook](../.opencode/plugins/goal-docs/goal-tool-titles.ts)
already selects mutating tools and rejects read/error/reused/conflicting results.
Its [automatic controller](../.opencode/plugins/goal-docs/README.md#ordinary-root-goal-task-titles)
still requires conditional-title host support. This instruction change does not
weaken that guard, deploy the native artifact or prove automatic runtime behavior.
The user-requested direct rename on 2026-11-01 succeeded through the exposed tool;
no new tests, model generation, installation or restart was performed.

## Provider-repository source checks

The following reproduction commands belong to the repository that maintains
this guide; they are not prerequisites for projects that consume the planning
skill:

```bash
node --test scripts/planning-contract.test.mjs
node --test scripts/goal-workflow.test.mjs
```

These source-contract and illustrative-fixture checks do not establish live
model behavior, successful tool execution, or rendered Plan-mode link handling.

The companion reference in the reusable planning skill provides a worked
illustration of `currentTask`, `nextTask`, and a null-cursor fallback. That
illustration is not a live tool response or model-acceptance result.
