# Public-source verification — 2026-10-30 UTC

Parent agent read, not human review, independent replication or model evaluation.
This checks the material claims in the 12 previously reported public references.
The [catalog](index.json) keeps original reported retrieval dates separately from
the new check date and passage locators. All corpus/exemplar manifests remain
candidate/unreviewed. No performance statistic is adopted as a local result.

## Acquisition and findings

Known public URLs were opened directly with `webfetch`, not accepted from search
snippets. Both studies' pinned full-text methods/results/limitations were read;
the efficiency paper's abstract alone was insufficient for the correctness claim.
Mutable vendor/practice pages are dated reads, not immutable snapshots or proof
of installed-version behavior. No private repository content was sent to a public
search or model service. No source examples were executed or imported.

| ID / primary source | Passage supporting the catalog scope | Limit that affects use here |
| --- | --- | --- |
| REF-006 — [OpenAI, Harness engineering](https://openai.com/index/harness-engineering/), published 2026-02-11 | “We made repository knowledge the system of record” describes a short map, deeper repository documentation and mechanical feedback. “What we're still learning” qualifies generalization. | One team's engineering report, not a controlled comparison or optimal instruction-size rule. Its merge/autonomy practices do not override this project's approvals. |
| REF-007 — [Anthropic, Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), published 2025-09-29 | “The anatomy of effective context,” retrieval/search and compaction sections discuss selective context, progressive disclosure, latency and high-recall preservation. | Vendor recommendations; extra retrieval can cost time or miss requirements. Not local improvement evidence or authority to delegate. |
| REF-008 — [Gloaguen et al., Evaluating AGENTS.md, v3](https://arxiv.org/html/2602.11988v3), dated 2026-09-29 | Sections 3 and 4 describe Python issue/feature benchmarks, generated versus developer files, test-based resolution, agent/model settings and costs. Sections 5–6 limit conclusions. | Author-reported higher cost without significant overall success improvement versus no file in tested settings. Developer/generated files differ; neither security outcomes nor this harness were evaluated. No independent rerun performed. |
| REF-009 — [Lulla et al., Efficiency of AI Coding Agents, v2 abstract](https://arxiv.org/abs/2601.20404v2) and [full HTML](https://arxiv.org/html/2601.20404v2), revised 2026-03-30 | Sections 3.1.1–3.1.8 specify one Codex model, root-only instruction files, small code-changing PRs, paired conditions and metrics. Section 5 discusses generalization. | Efficiency improvement is author-reported; section 3.1.8 explicitly excludes comprehensive semantic/functional correctness. A manual sanity check is not full correctness acceptance. |
| REF-010 — [OpenCode V2 instructions](https://opencode.ai/v2/docs/instructions/) | Scope/order combine instruction sources without resolving conflicts. Discovery/updates distinguish already-loaded nested guidance from ambient updates. | Mutable V2 guide, not a pinned 2.1.1 execution trace. No invented nearest-file-wins rule. |
| REF-011 — [OpenCode V2 skills](https://opencode.ai/v2/docs/skills/) | IDs/loading describe path-derived exact IDs, permission checks and explicitly read supporting files. Frontmatter describes optional native metadata. | Local schema requirements may be stricter than native runtime. A catalog entry or valid source does not establish actual skill selection. |
| REF-012 — [Git worktree](https://git-scm.com/docs/git-worktree), manual identifies 2.56.0 update (2026-09-28) | Description/add/refs/config/details distinguish per-worktree HEAD/index from shared repository state/config/refs; bugs note submodule limits. | No installed-version equivalence claimed. “Not a security sandbox” is our inference from sharing and lack of OS confinement, not a quoted guarantee from Git. No worktree mutation performed. |
| REF-013 — [GitHub CODEOWNERS](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners) | Owner eligibility, base-branch file location, required review through protections/rulesets, and ownership of CODEOWNERS itself. | Source routing alone is not enforced review; same-account agents do not provide independent GitHub approval. Hosted settings/eligibility remain unobserved. |
| REF-014 — [GitHub merge queues](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/managing-a-merge-queue) | Merge-group validation includes latest base and preceding queued changes; Actions must trigger on `merge_group` for required queue checks. | An integration alternative, not a configured queue or authority to enable it. Current offline workflow does not claim queue support. |
| REF-015 — [GitHub Actions secure use](https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions), retained historical URL now serves “Secure use reference” | Least privilege, untrusted checkout, third-party action identity and source review sections support the safety boundary. | Current guidance favors dependency lockfiles where supported; full SHA pins are an alternative, not full transitive identity verification. No lockfile adoption, hosted configuration or source audit of third-party action dependencies is claimed. |
| REF-016 — [OWASP prompt-injection prevention](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) | Structured prompts/tool-boundary checks, secure pipeline and smoke-test grading distinguish authority/effects from text labels, refusal wording or keyword filters. | Illustrative smoke cases do not establish population rates or adversarial resistance. No helper code copied, no generic security certification. |
| REF-017 — [Google small CLs](https://google.github.io/eng-practices/review/developer/small-cls.html) | Self-contained changes, related tests, dependency-aware splitting and keeping each submitted step working. | Conceptual focus is not a rigid line quota. Guidance does not authorize merging, staging or publication. |

## Conflicting evidence and decision

REF-008 and REF-009 are not interchangeable experiments. The former examines
test-based task resolution and cost across selected Python benchmarks and agent
settings; the latter focuses on efficiency for small changes with one model and
explicitly defers comprehensive correctness. Their differing results do not
establish a universal “instructions help” or “instructions hurt” conclusion.
Vendor practice reports provide design motivations, not an independent causal
replication of either study.

Retain required authority, preservation and verification rules. Keep routing
selective and evaluate the actual local behavior, correctness, overhead and
required evidence layer before claiming improvement. Do not remove safety rules,
weaken gates or tune the grader to achieve a favorable performance number.

Available alternatives were considered: accept the historical report without
reading (rejected as insufficient); use abstract-only study conclusions (rejected
for material methods/correctness claims); fetch the pinned full studies (done);
run a local controlled comparison (separate unfinished isolation/model gate);
require hosted ownership/queue enforcement (separate authority/operational gate).

## Evidence boundary

`public_read` is declared source-review metadata with a date, passage locator
and finding. Offline validation checks its structure; it cannot authenticate that
a web read happened or that a finding is sound. It does not satisfy human corpus
review, gold promotion, actual model-effect collection, held-out evaluation,
installed-runtime acceptance or hosted enforcement. Public answers remain
readable, and no authentic model evaluation was run in this source-review unit.
