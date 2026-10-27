# README Maintenance Usage

Category: `maintenance`

Tags: `readme,documentation,branding,setup,links,verification`

## Purpose and when to use it

Keep the computer-use root README aligned with verified repository changes
without losing its approved mascot, visual identity, or copyable LLM setup
prompt. Use it after setup, configuration, scripts, or skill coverage changes,
or when you want a read-only documentation audit.

The [agent workflow](./SKILL.md) defines behavior and safety. This usage guide
and linked references are not loaded automatically when that skill is loaded.

## Prerequisites and setup verification

- A checkout containing `AGENTS.md`, `README.md`, `setup.md`, and the source
  relevant to the requested update.
- A readable diff or description of the change; no OpenCode runtime is needed
  for source and link checks. Runtime health checks do need the configured tools.
- A Markdown preview for visual review; use a GitHub-rendered preview when
  available and label local previews honestly.

Check the working tree first so existing edits remain intact. This workflow
does not install or configure the project.

## How to request it

- "Audit the README against setup.md and the current scripts. Report drift only."
- "Update the README for the new skill, keeping the mascot and setup prompt."
- "Check README links and the light/dark hero before I review the diff."

Ask in ordinary language; no invented slash command or internal loader call is
needed. An audit request produces findings, not automatic edits.

## Worked workflow and expected result

After a skill is added, ask to refresh the README's skill summary. The agent
reads policy, the current README, the canonical bundles, and catalog; derives
the actual count; changes only the affected README text; checks links and
rendering; and returns the diff plus verification results. Catalog or skill
changes belong to [skill-maintenance](../skill-maintenance/README.md) and need
their own authorized scope.

## Tools and commands

These are documented representative terminal checks from the repository root,
not commands executed by loading the skill:

```sh
git status --short
find .opencode/skills -mindepth 2 -maxdepth 2 -name SKILL.md -type f | wc -l
git diff --check
git diff -- README.md
./scripts/health-check.sh
```

They inspect state; they do not apply setup changes. The agent also reads source
files and uses an available Markdown renderer or browser for previews. Read
`setup.md` and the current scripts to explain their preview/write modes; do not
run onboarding, `--apply`, or dependency installation as documentation checks.

## Verification and known limitations

Expected evidence includes resolved local links and anchors, checked external
destinations, a verified skill count, accurate command flags, a readable hero,
and a clean whitespace check. A local render is not proof of GitHub rendering.
A passing source check does not prove a working OpenCode service or MCP session.

## Troubleshooting

- **Source and setup disagree:** report both locations and the conflict; do not
  choose an unsupported promise or silently expand the edit scope.
- **Health check fails on an unconfigured machine:** report which runtime checks
  failed and which source checks passed; do not install tools to hide the result.
- **External link or renderer is unavailable:** report the unverified check
  explicitly and finish the checks that remain possible.

## Safety, confirmation, and elevation

Preserve branding unless a redesign is requested. The setup one-liner must stay
an instruction to read and follow setup with prerequisites and approval gates,
not a blind shell installer. Do not expose credentials, alter system permissions,
or elevate access to make a documentation check pass. Editing does not authorize
commit, push, PR creation, or merge; follow `AGENTS.md` and the separately approved
publication scope.

## Related skills and documents

- [Development conventions](../development-conventions/README.md)
- [Skill maintenance](../skill-maintenance/README.md)
- [GitHub operations](../github-operations/README.md)
- Repository policy: `AGENTS.md`; onboarding source: `setup.md`;
  skill catalog: `.opencode/skills/README.md`.
