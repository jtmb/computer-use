---
name: skill-maintenance
description: Create, update, audit, catalog, deploy, rename, or retire OpenCode skills in a consumer project. Use when skill coverage is missing or stale, a SKILL.md or reference bundle changes, a configured catalog drifts, deployment needs verification, or the user requests skill maintenance.
metadata:
  schema-version: "1"
  category: "skills"
  tags: "skills,documentation,deployment,catalog"
---

# Skill Maintenance

## Auto-approve and autonomous work

For Build auto, project auto-approve or explicitly autonomous/no-question work,
apply this rule to all interactive ask/confirm steps below: Do not ask routine questions,
including Git questions, clarification forms or "continue?" prompts. Use existing
authority and reasonable reversible defaults. If essential authority or data is
missing, record the blocker and continue independent work instead of asking.
Explicitly read [the shared autonomy contract](../development-conventions/references/autonomous-work.md).
Native policy, mode restrictions and task scope remain effective; do not
self-grant permissions or enable autoaccept as a workaround.

Maintain OpenCode skill bundles in the consumer project while keeping changes
bounded, reviewable, and consistent with that project's instructions and the
current OpenCode skill format.

## Authority and source discovery

- Read the consumer project's applicable instructions and inspect its current
  OpenCode configuration before choosing source, catalog, or deployment paths.
- Discover the configured skill source roots, generated/runtime destinations,
  existing catalog or index, and validation/deployment tools. Do not assume a
  particular checkout location, directory name, user-config path, script, or
  catalog format.
- Edit the source of truth identified by the consumer's instructions. Treat a
  runtime or deployed copy as generated only when project configuration or
  instructions establish that boundary; never guess a destination for writes.
- Do not assume project-specific MCP servers, databases, agents, companion
  skills, or a `learnings.md` workflow exist.

## Workflow

1. Read applicable project instructions, the existing skill catalog if any,
   and the complete target bundle.
2. Inspect current source, loader/configuration, deployment behavior when
   relevant, references, and related docs before proposing a change.
3. Define the smallest scope that solves the requested maintenance problem.
4. Read the relevant reference file below explicitly. OpenCode loads
   `SKILL.md` on demand; linked reference files are not automatically included.
5. Edit the identified source of truth only. Preserve unrelated work.
6. Validate structure, content, links, and any existing catalog. Validate
   deployment only when it is in scope and the project's tooling is understood.
7. Report unrelated opportunities without implementing them.
8. Commit only when the user explicitly requests a commit.

## Core rules

### Follow configured discovery rules

Use the discovery paths and layout supported by the consumer's loader and
configuration. Do not impose a flat directory layout or assume a project/global
source location unless the active loader or project instructions require it.

### Use valid skill frontmatter

For OpenCode skills, follow the current documented `SKILL.md` frontmatter
format and any additional schema enforced by the consumer project. Check the
loader documentation or an existing validator rather than treating this source
repository's conventions as universal.

The OpenCode format requires `name` and `description`; optional fields and
constraints must be checked against the active version's documentation. Extra
metadata, categories, tags, naming rules, and description limits may be required
by a consumer's own validator, but are not universal defaults. Do not invent
fields or claim an optional project schema is an OpenCode requirement.

### Use split bundles deliberately

Keep `SKILL.md` focused and split detailed procedures into linked references
when that improves routing and readability. Honor any line or bundle-size limit
documented by the consumer; do not present an editorial limit from another
project as an OpenCode loader restriction. State explicitly when a workflow
depends on a reference because linked files are not automatically loaded.
Create or update a user-facing usage guide only when the consumer's conventions
or request calls for one.

### Deploy the complete bundle

If deployment is explicitly in scope, inspect the actual deployment mechanism,
selected target, ownership boundaries, and write behavior first. Verify that it
handles every required bundle file, preserves unrelated target data, and has a
read-only or preview path when the project requires one. Report incomplete
tooling rather than patching generated copies. Restart or use a fresh session
only when required by the active loader/runtime; do not assume source changes
are live or that a restart proves discovery.

### Never retire automatically

For a rename or retirement, identify all affected source, catalog, routing, and
runtime references and prepare an old-to-new or deletion manifest. Require
explicit authority for destructive changes. In auto/no-question mode, do not
ask a duplicate confirmation: block the deletion if the required authority is
missing and continue independent work. Never infer deletion approval from a
general maintenance request.

## References

Read only the files needed for the current operation, but read each selected
file in full before acting.

| File | Use |
| --- | --- |
| [`references/documentation-and-metadata.md`](references/documentation-and-metadata.md) | Discover and follow project-specific documentation and metadata requirements. |
| [`references/detection.md`](references/detection.md) | Find evidence of missing, overlapping, or stale skill coverage. |
| [`references/creation.md`](references/creation.md) | Design and create a valid monolithic or split skill. |
| [`references/lifecycle.md`](references/lifecycle.md) | Update, rename, deploy, or propose retirement safely. |
| [`references/index-regeneration.md`](references/index-regeneration.md) | Reconcile an existing skill catalog or index when one is configured. |
| [`references/audit.md`](references/audit.md) | Audit source, links, catalog entries, and deployment. |
| [`references/validation-checklist.md`](references/validation-checklist.md) | Validate a new or changed bundle before completion. |

Historical imported material is retained at
[`references/sources/local-persistence/source-index.md`](references/sources/local-persistence/source-index.md)
for provenance only. It is inactive and must not be executed or reinstated.
See [`PROVENANCE.md`](PROVENANCE.md) for import details.

## Usage guide

When the user asks how to use this skill, also read
[README.md](./README.md) for request examples, prerequisites, verification,
and safety requirements.
