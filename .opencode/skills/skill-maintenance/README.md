# Skill Maintenance Usage

**Auto-approve means no interactive questions** for authorized goal work, including
routine Git. Existing ask/confirm steps are interactive-mode guidance: under auto,
reuse authority/defaults or record blockers and continue, without asking.
See [the shared autonomy contract](../development-conventions/references/autonomous-work.md).

This guide explains how to use the `skill-maintenance` skill. The agent-facing
operating rules remain in [SKILL.md](./SKILL.md); OpenCode does not
automatically load this usage guide when the skill is loaded.

Category: `skills`

Tags: `skills`, `documentation`, `deployment`, `catalog`

## Purpose and when to use it

Use `skill-maintenance` when skill coverage, documentation, metadata,
catalogs, deployment, names, or retirement needs controlled maintenance.

Appropriate requests include:

- "Audit all skills for stale paths and unsafe instructions."
- "Create a skill for this repeated workflow."
- "Update this skill and verify its references."
- "Deploy this updated split skill and verify every reference file."
- "Propose retirement for a skill whose behavior is gone."

Do not use it as a shortcut for unrelated edits or automatic repository-wide
rewrites.

## Prerequisites and setup verification

Before maintaining a skill, inspect the consumer project's applicable
instructions and current OpenCode configuration. Then identify:

- The configured skill source and discovery locations.
- Any existing catalog, index, schema validator, or deployment workflow.
- The complete target bundle and relevant references.
- Related files affected by the request and the project's available checks.

Follow the source-of-truth and generated-copy boundaries documented by that
project. Do not infer paths, configuration roots, or runtime status from this
guide. Bound the work from the user's request; do not require a second scope
selection for ordinary implementation choices.

## How to request it

Ask in ordinary language and name the affected skill when possible.

Example requests:

- "Detect missing or overlapping skill coverage for browser work."
- "Create a focused new skill without duplicating app-setup."
- "Update this skill's outdated installation command."
- "Reconcile the skill catalog after changing count or routing."

The agent should treat detection as evidence gathering, not authorization for
unrelated edits.

## Worked workflow and expected result

A representative agent workflow is:

1. Read applicable project instructions, any existing catalog, and the entire
   target bundle.
2. Define the smallest scope that solves the maintenance problem.
3. Explicitly read only the relevant maintenance reference:
   - Read [detection](./references/detection.md) for missing, overlapping, or
     stale coverage.
   - Read [creation](./references/creation.md) before creating a skill.
   - Read [lifecycle](./references/lifecycle.md) before updating, renaming,
     deploying, or proposing retirement.
   - Read [catalog reconciliation](./references/index-regeneration.md) when
     the consumer maintains a catalog or index affected by the change.
   - Read [audit](./references/audit.md) when auditing one skill or the
     complete catalog.
   - Read [validation](./references/validation-checklist.md) before completing
     a new or changed bundle.
   - Read [documentation and metadata](./references/documentation-and-metadata.md)
     before adding guides or changing metadata.
4. Edit only the source of truth identified by the consumer project.
5. Run its documented validators and focused tests. For example, read-only Git
   checks such as `git status --short` and `git diff --check` can help inspect a
   local change; do not invent project-specific commands.
6. Deploy only when deployment is explicitly in scope, the actual mechanism and
   target are verified, and the necessary authority exists. Then verify the
   relevant files and runtime discovery using the consumer's real workflow.
7. Validate frontmatter, links, documentation, and any affected catalog; report
   unavailable deployment or runtime checks as limitations.
8. Report unrelated findings without implementing them.

Expected result: a bounded, reviewable skill change consistent with the
consumer's configured loader, documentation, metadata, catalog, and deployment
conventions, with verified status clearly separated from source presence.

## Verification and known limitations

The agent should verify:

- Loader requirements and any additional metadata rules enforced by the
  consumer project; do not assume a category/tag schema.
- Every linked reference exists and resolves from the containing file.
- Any existing catalog agrees with canonical source and local routing.
- When authorized deployment is performed, the actual target contains the
  required files and matches the intended source.
- Runtime discovery is checked only through an available, appropriate consumer
  workflow; source or deployment checks alone do not prove it.

Known limitations:

- Linked references are not loaded automatically.
- Loader caching or session behavior may require a fresh context; verify the
  active runtime rather than promising a universal restart behavior.
- Provenance and historical files must remain clearly inactive.
- A deployment utility can have side effects beyond copying skills; read its
  implementation before presenting it as documentation-only.

## Troubleshooting

- Missing reference: inspect the bundle rather than inventing a path or
  filename.
- Ambiguous trigger overlap: document the evidence and safe routing boundary
  rather than merging skills automatically; if essential information is missing
  in auto/no-question mode, record the blocker without asking.
- Catalog drift: follow the project's existing source and catalog conventions.
- Incomplete deployment: report the concrete mismatch; do not patch around it
  by editing generated targets directly.
- Rename or retirement uncertainty: prepare an old-to-new or deletion
  manifest and require appropriate authority before destructive changes. In
  auto/no-question mode, record missing authority without asking.

## Safety, confirmation, and elevation

The agent must:

- Do not edit generated copies when consumer instructions identify them as
  generated.
- Never commit automatically.
- Require explicit authority for deletion or retirement; in auto/no-question
  mode, block when authority is missing instead of prompting.
- Preserve unrelated staged, unstaged, and untracked work.
- Follow the consumer's applicable security, publication, and other consequential
  action gates.

Do not request elevation merely to maintain a skill. If the consumer's workflow
requires elevated access, follow its explicit authority and security policy;
never change permissions to bypass a restriction.

## Related skills and documents

- The consumer project's applicable instructions govern source, safety, and
  available tools.
- Consult the catalog or index discovered in that project's configuration, if
  one exists.
- [PROVENANCE.md](./PROVENANCE.md) records the upstream source for this
  imported bundle.
