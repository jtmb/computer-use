# Learning candidate: evidence for deliberate fault controls

**Status: reviewable draft only; no skill change, native proposal or application.**

## Finding and scope

Two different tasks in this same parent session exposed the same narrow driver
mistake: requiring the literal `ERR_ASSERTION` label rejected an intended assertion
failure that Node reported as `ERR_TEST_FAILURE`. The saved assertion diagnostics
identify the intended failures. However, an actual module-import failure also
carries `ERR_TEST_FAILURE`, so accepting that label indiscriminately is unsafe.
A separate saved title fault survives with one passing test; it must remain an
undetected fault, not be reclassified as a detected regression.

The existing [testing guide](../.opencode/skills/development-conventions/references/testing/patterns.md)
owns this intent and is already mandatory for test work. Its complete current
source covers useful tests and avoiding over-mocking, but not fault-result
classification. The local [quality checklist](test-quality-audit.md#when-to-review)
requires meaningful failures; its historical pointer-review excerpt rejects
module-load failures and records a specific `ERR_ASSERTION` check, not a universal
Node error-code contract. No new skill, routing, catalog or usage-guide change is
proposed. Unrelated dirty skill-root/usage-guide changes are preserved.

**Confidence: medium for the generalized improvement.** These are separate tasks,
not independent sessions or a model-behavior evaluation. The observed environment
is Node 22.22.2 with evaluated source boundaries. No universal Node-version,
cross-project or native self-learning acceptance is claimed.

## Source-linked evidence

All four rows are read-only comparisons of existing receipts, not new test runs.
Both recurring episodes belong to parent session
`ses_e78fdcc9affeNOlKMRek7Yobo3`; exact source message IDs are not available from
these local artifacts and are not invented.

| Artifact | What its preserved output establishes | Correct assessment |
| --- | --- | --- |
| [Clipboard verification](terminal-clipboard-verification-2026-11-02.json), `faultControls` | `dispose-promise-dropped.tap`: the named adapter test fails with the specific disposal-promise assertion and actual-versus-expected Promise diagnostic; one test, one failure, no cancellation; `ERR_TEST_FAILURE`. | Intended assertion detected; the original driver classifier was too narrow. |
| [Recovery-timeout verification](image-recovery-timeout-verification-2026-11-02.json), `faultControls` | `postload-abort-omitted.tap`: the named late-success test fails its Text-versus-Image reference-identity assertion; one test, one failure, no cancellation; `ERR_TEST_FAILURE`. | Intended assertion detected; preserve the original false-classification receipt and correct only its interpretation. |
| [Zero-duration verification](desktop-zero-duration-click-verification-2026-11-02.json), `controls.callerFailure` | `missing-interclick-release.tap`: `ERR_MODULE_NOT_FOUND` before the intended test body, then the file-level `ERR_TEST_FAILURE` wrapper. | Invalid setup control, not a detected production fault. |
| [Title verification](title-receipt-verification-2026-11-02.json), `faultControls.originalSixth` | Original `UTF8-parts-before-join.tap`: one test, one pass, zero failures; the owning record preserves its original exit0. | Genuine surviving fault/coverage gap; not successful detection. |

Exact paths, complete TAP digests and selected-source preimages are in
`Documents/computer-use-native-host-20261029/fault-learning-candidate-lLvDOA/preimages.json`
(7,227 bytes, SHA-256
`fed1f4f243888b0308e9cbab8a7bcfd29c8eac3cdbb8e82a442092594ad78a32`).
This is a local evidence locator, not a served/click-verified document or a native
reviewed proposal hash. No conversation, reasoning, credentials or private-session
content is copied into this draft.

## Exact proposed addition

Target: `.opencode/skills/development-conventions/references/testing/patterns.md`.
Append the following text after its current final table, preserving the existing
3,415-byte file and all distinct failure guidance. Baseline SHA-256:
`600cc55597ed51f72150e8ffd086f066afa39a87f8414aadf86896056d0cac6b`.

```markdown
### Evidence for deliberate fault controls

A nonzero test exit alone does not prove a deliberate fault was detected.

- Bind the exact source change and selected test to an already-observed baseline.
  Require the intended assertion or deliberate-trap diagnostic from that test,
  using structured results when available. Confirm the expected failing outcome,
  with no cancellation or capture refusal.
- An error label such as `ERR_ASSERTION` or `ERR_TEST_FAILURE` is not decisive.
  In Node, the latter can wrap either an assertion or a setup failure. Do not
  accept it without the specific expected test and failure evidence.
- Do not count import/setup failures, crashes, cancellations, time/output/resource
  refusals, or unexplained errors as detected faults. Keep them as failed or
  incomplete controls. A passing mutated test is a surviving fault, not success.
- Preserve the original output and classification errors. Reassess saved
  diagnostics before rerunning anything; fix only the evidenced classifier or
  fixture gap. Recheck changed work without replaying accepted, unchanged cases.
  Keep original limits and spent acquisition costs.
```

## Proposed validation and approval boundary

The addition is a candidate, not an implemented classifier or a validated skill
bundle. No source patch, test, fixture rerun, disposable application, rollback,
deployment, model call, memory write, commit or push occurs in this unit.

If this exact addition is approved, the assistant must first recheck the target
hash and applicable ownership/permissions, then validate the affected bundle's
actual metadata/routing/links and the proposed evidence rules. Any future
classifier implementation needs distinct positive and negative cases: both
preserved intended assertions, the import failure and the surviving mutant, plus
cancellation, truncation, resource/deadline refusal, unknown outcomes and a wrong
assertion in the right test. Do not rerun these completed task suites merely to
prepare the candidate. Full-bundle review/application/rollback and native
deny/cancellation remain separate unfinished acceptance requirements.

The exposed self-learning `proposal` path requires two to six **distinct-session**
actual message references and emits a root `SKILL.md` diff
(`tools/self-learning/proposal.mjs:56-70`, with dispatch reference checks). These
same-session file artifacts do not meet that gate, and this is a reference-only
change. No dummy references, duplicate-session substitution, private-history
lookup or guard/schema change is used to manufacture an eligible native preview.
The actual read-only `catalog: true` operation returned 37 metadata entries,
including project-source `development-conventions`; that loader snapshot does not
prove complete filesystem/bundle freshness or bounded internal host acquisition.

## Preserved limits

An initial full preimage attempt refused the 269,766-byte local quality-audit file
at the unchanged 262,144-byte file limit. The first five completed copies remain;
the known-oversized body is not split, retried, copied or fetched through another
client. Only the previously inspected policy excerpts support the local-audit
comparison; no complete audit-file review is claimed. The continuation charges
the failed 262,144-byte allowance and earlier reads: 781,215 bytes under the
unchanged 2 MiB aggregate, with a separate 10-second deadline per read job, not a
fictional continuous two-call deadline. The source refusal and earlier empty
learning scans remain evidence, not refunded or relabelled as exhaustive success.

This candidate does not establish real skill learning/application, native
permissions, broader human review or any other consolidated-delivery outcome.
