---
name: readme-maintenance
description: Maintain the computer-use root README against verified setup, configuration, scripts, and skill changes while preserving its approved branding. Use when the user requests a README refresh, audits documentation drift, or changes a capability or setup step described in the README.
metadata:
  schema-version: "1"
  category: "maintenance"
  tags: "readme,documentation,branding,setup,links,verification"
---

# README Maintenance

Keep the root `README.md` accurate, approachable, and visually coherent without
turning documentation maintenance into installation or redesign work.

## Authority and scope

- Read repository-root `AGENTS.md` first; preserve unrelated dirty work.
- Read [development-conventions](../development-conventions/SKILL.md), then
  explicitly read its mandatory references and the README-writing and
  documentation references it routes to. References are not loaded automatically.
- Edit the root README only unless the user authorizes related files. Report
  discrepancies in `setup.md`, scripts, configuration, or assets rather than
  silently changing them to make the README true.
- For an audit-only request, return findings and proposed corrections without
  editing files; continue to edits only when requested.
- Use [skill-maintenance](../skill-maintenance/SKILL.md) for changes to skill
  bundles or their catalog; this skill owns the README summary, not the catalog.
- Do not rewrite `AGENTS.md`, edit deployed copies, install dependencies, run
  onboarding, or change runtime configuration merely to check documentation.

## Workflow

1. **Establish the change.** Inspect `git status --short`, the current README,
   and relevant diffs. For an audit, enumerate suspect claims before editing.
   For a requested update, agree on the smallest affected sections; do not
   opportunistically rebrand or restructure the whole document.
2. **Verify sources.** Read the actual source for every changed claim:
   - `setup.md` is the onboarding entry point; check its prerequisites, approval
     boundaries, and verification against `scripts/onboard.sh` and the scripts
     it invokes. Flag disagreements instead of guessing.
   - Check configuration paths, models, and MCP registrations in their owning
     tracked files. Distinguish checked-in defaults from portable requirements.
   - Derive capabilities from existing skills and implementation, not aspirational
     descriptions. Count direct `.opencode/skills/*/SKILL.md` bundles and compare
     the catalog before changing a skill total.
   - Verify command paths and flags from source. Label optional installs,
     network queries, previews, writes, backups, and replacement behavior accurately.
   - Verify any license, badge, compatibility, or status claim against an actual
     authoritative file or service. Do not invent a root license or CI badge.
3. **Update the reader's path.** Keep a concise purpose, quick start, capabilities,
   and links to deeper documentation. Link to `setup.md` rather than duplicating
   onboarding. Preserve the approved mascot, palette, asset paths, alt text,
   and identity unless a branding change is explicitly requested.
4. **Protect the setup prompt.** Retain a single-line, copyable instruction for an
   LLM to read the real `setup.md` and `AGENTS.md`, check prerequisites and local
   paths, preview first, ask before writes or installs, leave credentials to the
   user, and verify results. Make clear it is an LLM prompt, not a shell command.
   Never pipe fetched Markdown into a shell or imply setup grants blanket approval.
5. **Validate before delivery.** Use the checks below, review the final diff, and
   report exact changes, evidence, and any unverified runtime claims. Separate
   existing environment failures from regressions caused by the edit.

## Validation

- Resolve relative links, image sources, and heading anchors from the README's
  location; inspect external links read-only. Confirm the setup URL points to
  this repository and the intended branch, not a stale fork or temporary preview.
- Render GitHub-compatible Markdown. Inspect the hero at README size on light
  and dark backgrounds, readable alt text, table wrapping, code fences, and the
  setup prompt's copyability. Do not claim an unobserved render was checked.
- Recount skills and compare README totals to canonical bundles and catalog.
  Check that examples describe commands that actually exist; reading scripts is
  preferable to invoking mutating commands just to validate their spelling.
- Run `git diff --check` and review the scoped `git diff -- README.md`. Run the
  repository's read-only `./scripts/health-check.sh` when available; missing
  OpenCode, service, or MCP dependencies are limitations, not permission to install.
- If relevant script source changed, route its tests through
  `development-conventions`; a docs-only update does not prove runtime behavior.

## Publication boundary

Documentation work does not authorize commits, pushes, PR creation, or merges.
Follow `AGENTS.md` and [github-operations](../github-operations/SKILL.md) for any
separately authorized publication. Commit and push approvals remain separate;
never bypass confirmation gates or merge automatically.

## Usage guide

When explaining how to request this workflow, explicitly read
[README.md](./README.md); it is not loaded automatically with the skill.
