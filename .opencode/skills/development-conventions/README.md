# development-conventions Usage

Category: `maintenance`

Tags: `development`, `conventions`, `source-editing`, `testing`, `documentation`, `operations`

## Purpose and when to use it

Use this bundle for source editing and review, documentation, API contracts,
tests, and OpenCode v2 integration work. It supplements rather than replaces
the consumer project's applicable instructions.

## Prerequisites and setup verification

Read the consumer project's applicable instructions (for example, a root or
nearest `AGENTS.md`), inspect the working tree, and identify canonical sources,
generated targets, and available checks from that project. Read only the
relevant references before acting. Follow the project's verification and
permission rules; do not assume paths or commands from another checkout.

## How to request it

Request a convention review, focused source change, documentation guidance, or
bounded verification. Name the relevant domain when known, such as Python, API,
UI, or OpenCode integration.

## Worked workflow and expected result

1. Inspect the current source and preserve unrelated work.
2. Read the mandatory comments/testing references and the matching domain guide.
3. Make the smallest change to the source of truth identified by the consumer.
4. Run focused checks documented or configured by that project. Do not infer
   deployment flags or write behavior; use only verified tools and targets.

Expected result: a reviewable change with no stale links or unsupported path and
command assumptions, plus evidence that the affected behavior was checked.

## Verification and known limitations

Use the consumer project's documented metadata/link validator and focused test
commands when available. If the project provides deployment checks, inspect
their implementation and target-selection behavior before relying on them.

## Troubleshooting

- Missing references: inspect the bundle rather than inventing a filename.
- Missing validator or deployment tooling: report the limitation; do not invent
  a script name, flag, or target.

## Safety, confirmation, and elevation

Do not edit generated user configuration directly when project instructions
identify it as generated. Preserve unrelated files, follow established path
safety, and do not infer commit, push, or deployment approval.

## Related skills and documents

- [`SKILL.md`](./SKILL.md) — agent-facing routing and conventions.
- [`references/useful-comments/guidelines.md`](./references/useful-comments/guidelines.md)
  — comment guidance.
- [`references/testing/patterns.md`](./references/testing/patterns.md) — test
  selection and failure-focused checks.
- The consumer project's applicable instructions and configuration — source,
  safety, and verification authority.
