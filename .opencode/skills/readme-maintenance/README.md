# README Maintenance Usage

**Auto-approve means no interactive questions** for authorized work, including
routine Git. Treat ask/confirm wording as interactive-mode guidance; reuse
existing authority and reversible defaults or record blockers and continue.
See [the shared autonomy contract](../development-conventions/references/autonomous-work.md).

Category: `maintenance`

Tags: `readme,documentation,branding,setup,links,verification`

## Purpose and when to use it

Use this skill to keep a project's README aligned with verified source and
local conventions. It supports focused updates after changes to setup,
configuration, capabilities, or docs, and read-only documentation audits.

There is no universal line limit, required demo, brand, or README layout. Follow
the consumer project's instructions and established identity. Use the generic
[layout reference](./references/readme-layout.md) only as guidance; it is not
automatically loaded and does not replace local rules.

The [agent workflow](./SKILL.md) defines behavior and safety. This usage guide
and linked references are not loaded automatically when that skill is loaded.

## Prerequisites and source inspection

- The requested README, applicable consumer instructions, and source relevant
  to the changed claims.
- Existing setup docs, manifests, tests, assets, and project tools as relevant;
  do not assume specific files or scripts exist.
- A Markdown preview when available for visual review; label local previews
  honestly. Source and link checks do not prove runtime behavior.

Inspect the working tree first and preserve unrelated staged, unstaged, and
untracked work. This workflow does not install or configure the project.

## How to request it

- "Audit this README against the current setup documentation and source. Report drift only."
- "Update the README for the new capability without changing its established voice."
- "Check this README's local links and rendered layout before I review the diff."
- "Make the requested README update and preserve the existing setup safety guidance."

Ask in ordinary language; no invented slash command or internal loader call is
needed. An audit request produces findings, not automatic edits.

## Worked workflow and expected result

For a requested README update, the agent reads project instructions, the current
README, and the authoritative source for each changed claim; changes only the
affected text; checks local links and available rendering; then reports the
diff and verification. Changes to skill bundles or their catalog belong to
[skill-maintenance](../skill-maintenance/README.md) and need their own scope.

## Tools and commands

These are read-only, generally available Git checks, not commands executed by
loading the skill:

```sh
git status --short
git diff --check
```

They inspect state; they do not apply setup changes. Discover project-specific
test, validation, and rendering commands from its instructions and manifests.
Read the actual setup source before describing preview/write modes; do not run
setup or install dependencies merely to check documentation.

## Verification and known limitations

Expected evidence includes resolved local links and anchors, checked external
destinations when available, accurate commands, a readable rendered result, and
a clean whitespace check. A local render is not proof of a remote renderer's
output. A passing source check does not prove runtime behavior. Report line
counts only when the consumer has a documented limit. For GIF work, use the
`readme-gif` skill when available, verify genuine results and decoded playback,
and keep a static or text alternative.

## Troubleshooting

- **Source and setup disagree:** report both locations and the conflict; do not
  choose an unsupported promise or silently expand the edit scope.
- **A project check is unavailable:** report which source checks passed and
  which runtime checks could not be performed; do not install tools to hide the result.
- **External link or renderer is unavailable:** report the unverified check
  explicitly and finish the checks that remain possible.

## Safety, confirmation, and elevation

Preserve the consumer's established identity unless a redesign is requested.
Keep setup prompts distinguishable from shell installers and retain the project's
credential, approval, and verification boundaries. Do not alter system
permissions or elevate access to make a documentation check pass. Editing does
not authorize commit, push, pull request, or merge; follow project policy and
separately authorized publication scope.

## Related skills and documents

- [Development conventions](../development-conventions/README.md)
- [Skill maintenance](../skill-maintenance/README.md)
- [GitHub operations](../github-operations/README.md)
- Consumer project instructions and the setup, configuration, and docs discovered
  in that project.
