# Reference sources — candidate provenance catalog

[`index.json`](index.json) is the machine-readable catalog consumed by
`evals/agent-rules/validate.mjs`. It is a provenance baseline, not an approved
reading list and not a fresh web-research result.

## Verification statuses

- `local_read` — the file exists in this repository and was read on the stated
  date. The validator checks existence, but existence is not agreement with the
  source’s claims.
- `reported_unverified` — a public source was reported in the source research
  session and was **not** re-fetched for this corpus. It remains a lead to
  re-open, not current evidence.

Every entry sets `statisticsCopied: false`. The original research report’s
statistics are therefore not promoted into cases or exemplars as established
truth. Where public sources conflict, the catalog keeps both and marks the
conflict rather than choosing a convenient winner.

## What each entry can and cannot do

Every entry has `scope`, `limits` and `versionScope`. A source can support a
design question or a failure mode; it cannot by itself prove:

- the installed version of a tool;
- this repository’s runtime or deployed behavior;
- a model’s compliance with a rule;
- hosted review or CI enforcement.

Use the companion behavioral cases under
[`evals/agent-rules`](../../../evals/agent-rules/README.md) for observable-outcome
checks, and re-open primary sources before relying on a public claim.

## Promotion

The catalog is `candidate` and `unreviewed`. A future human review may mark a
source as locally approved, but this starting set makes no such claim. External
links were not fetched by the validator, tests, or this lane.
