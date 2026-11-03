---
name: readme-maintenance
description: Maintain a project's README against verified source and project conventions while preserving its established identity. Use when the user requests a README refresh, audits documentation drift, or changes a capability or setup step described in the README.
metadata:
  schema-version: "1"
  category: "maintenance"
  tags: "readme,documentation,branding,setup,links,verification"
---

# README Maintenance

Keep the requested project README accurate, approachable, and coherent without
turning documentation maintenance into installation or unrequested redesign.

## Auto-approve and autonomous work

For Build auto, project auto-approve, or explicitly autonomous/no-question
work, explicitly read [the shared autonomy contract](../development-conventions/references/autonomous-work.md).
Treat ask/confirm language below as interactive-mode workflow, not an added
question layer. Reuse existing authority and reversible defaults; if essential
authority or data is missing, record the blocker and continue independent work.

## Authority and scope

- Read the consumer project's applicable instructions and preserve unrelated
  staged, unstaged, and untracked work.
- Read [development-conventions](../development-conventions/SKILL.md), then
  explicitly read its mandatory references and the README-writing and
  documentation references it routes to. References are not loaded automatically.
- Identify the requested README and inspect the relevant source, docs, manifests,
  configuration, assets, and tests before changing its claims. Edit only the
  README unless the user authorizes related files; report discrepancies rather
  than silently changing their owning sources.
- For an audit-only request, return findings and proposed corrections without
  editing files; continue to edits only when requested.
- Use [skill-maintenance](../skill-maintenance/SKILL.md) for changes to skill
  bundles or their catalog when that skill is available and in scope.
- Do not rewrite project instructions, edit generated copies, install
  dependencies, run setup, or change runtime configuration merely to check
  documentation.

## Workflow

### Human-first README contract

Write for the README's intended human reader. Respect the consumer project's
existing voice, identity, layout, and any documented length or branding rules;
do not impose a universal line budget, logo, demo, section order, or product
identity. Keep the overview useful and link to existing deeper guides instead
of copying operational detail into it.

Before changing layout, explicitly read the general
[README layout reference](./references/readme-layout.md). Also read any
consumer-specific layout guidance discovered in the project. Neither reference
is loaded automatically; local project rules take precedence over generic
examples.

For a GIF request, read the `readme-gif` skill and its encoding reference when
they are available. Keep captions short, label sample data or transcript replays
honestly, and provide a static or text alternative. Follow the consumer's media
and accessibility conventions.

### Maintenance steps

1. **Establish the change.** Inspect `git status --short`, the current README,
   and relevant diffs. For an audit, enumerate suspect claims before editing.
   For a requested update, select the smallest affected sections from the
   request and evidence; do not opportunistically rebrand or restructure.
2. **Verify sources.** Read the actual source for every changed claim:
   - Find the actual setup guide and verify its prerequisites, approval
     boundaries, and verification against the source and tools it invokes.
   - Check configuration claims in their owning files. Distinguish checked-in
     defaults from portable requirements.
   - Derive capabilities from implementation and maintained instructions, not
     aspirational descriptions; inspect source before changing any counts.
   - Verify command paths and flags from project source or configuration.
     Label optional installs, network queries, previews, writes, backups, and
     replacement behavior accurately.
   - Verify any license, badge, compatibility, or status claim against an actual
     authoritative file or service. Do not invent a project license or CI badge.
3. **Update the reader's path.** Keep a concise purpose, relevant capabilities,
   and links to deeper documentation. Preserve the project's established
   identity unless a branding change is explicitly requested.
4. **Protect setup guidance.** If the README contains setup instructions or a
   model-facing setup prompt, verify it against the actual setup source and
   project policy. Keep prompts distinguishable from shell commands; preserve
   approval, credential, and verification boundaries. Never imply a prompt or
   setup grants blanket authority.
5. **Validate before delivery.** Use the checks below, review the final diff, and
   report exact changes, evidence, and any unverified runtime claims. Separate
   existing environment failures from regressions caused by the edit.

## Validation

- Resolve relative links, image sources, and heading anchors from the README's
  location; inspect external links read-only. Confirm remote links refer to the
  intended project and canonical destination.
- Render with the README's target platform when available. Check the opening
  section on light and dark backgrounds when visual review is available, along
  with alt text, wrapping, code fences, and setup prompt clarity. Do not claim an
  unobserved render was checked.
- Recount only the capabilities or items changed, using their configured source
  and existing catalog. Check that examples describe commands that actually
  exist; reading source is preferable to invoking mutating commands to validate
  their spelling.
- Run `git diff --check` and review the scoped README diff. Run only read-only
  project checks discovered in its instructions or tooling; missing dependencies
  are limitations, not permission to install them.
- If relevant script source changed, route its tests through
  `development-conventions`; a docs-only update does not prove runtime behavior.

## Publication boundary

Documentation work does not authorize commits, pushes, pull requests, or merges.
Follow the consumer's applicable instructions and any available publication
workflow for separately authorized actions. Keep commit and push authority
separate; never bypass confirmation gates or merge automatically.

## Usage guide

When explaining how to request this workflow, explicitly read
[README.md](./README.md); it is not loaded automatically with the skill.
