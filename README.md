<p align="center">
  <img src="assets/splice.png" width="224" height="224" alt="Splice, the computer-use mascot: an ink-drawn cyborg with a cable braid and red accents">
</p>

<h1 align="center">computer-use</h1>

<p align="center">
  <strong>A practical workspace for computer-using agents.</strong><br>
  OpenCode v2 configuration, reusable skills, and local MCP tooling<br>
  for desktop, browser, and GitHub workflows.
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="setup.md">Setup guide</a> ·
  <a href=".opencode/skills/README.md">Explore the skills</a> ·
  <a href="#configuration">Configuration</a>
</p>

---

## Quick start

### Let your LLM handle setup

**Copy this one line into your coding assistant** with repository and terminal
access. It is a prompt, not a shell command:

```text
Read https://github.com/jtmb/computer-use/blob/main/setup.md and follow it alongside AGENTS.md: check prerequisites and local paths, dry-run first, ask before writes or installs, let me handle credentials, then verify the setup.
```

### Prefer the terminal?

Start with **OpenCode v2**, Bash, Python 3, and a checkout of this repository.
Node.js/npm are needed for the optional browser dependency; `gh` and an existing
login are needed for GitHub MCP. Live search verification needs network access
and an available search provider. See [all setup steps](setup.md).

> **Before applying:** this is a tracked personal configuration, not a universal
> installer. Review the paths, model IDs, and provider settings in
> [`global/opencode.jsonc`](global/opencode.jsonc) for your machine. A full
> deployment replaces the tracked `commands/` and `agents/` directories,
> including local-only entries, after backing them up.

From the repository root, preview the changes first:

```sh
./scripts/onboard.sh
```

After reviewing the preview, apply the configuration:

```sh
./scripts/onboard.sh --apply
```

Add `--with-browser` to install the Playwright MCP dependency as well. Onboarding
does not install OpenCode, authenticate accounts, or store credentials. Reload a
running OpenCode TUI with **Ctrl+P → `service.restart`** after applying.

## What is inside?

| Workflow | Building blocks |
| --- | --- |
| **See and operate the desktop** | [Desktop vision](.opencode/skills/desktop-vision/README.md) and [desktop control](.opencode/skills/desktop-control/README.md), with observe → act → verify workflows. |
| **Work in the browser** | [Visible browser assistance](.opencode/skills/browser-assistant/README.md), [opt-in headless work](.opencode/skills/browser-headless/README.md), and a local Playwright MCP launcher. |
| **Research and work with GitHub** | [Web search](.opencode/skills/websearch/README.md) guidance and [GitHub operations](.opencode/skills/github-operations/README.md) through the existing `gh` login. |
| **Keep work moving** | [Task memory](.opencode/skills/task-memory/README.md), [session handoffs](.opencode/skills/handoff/README.md), and the configured goal plugin. |
| **Build, maintain, and verify** | Skills for app setup, troubleshooting, documents, Blender, game playtesting, repository onboarding, and development conventions. |

**[Browse all 24 skills →](.opencode/skills/README.md)** Each skill has its own
usage guide, prerequisites, and safety requirements; onboarding does not install
every skill's dependencies.

## Everyday commands

| Task | Command |
| --- | --- |
| Preview onboarding without writes or a live search | `./scripts/onboard.sh` |
| Apply configuration and verify live search | `./scripts/onboard.sh --apply` |
| Also install the browser MCP dependency | `./scripts/onboard.sh --apply --with-browser` |
| List available models | `./scripts/setup-model.sh --list` |
| Choose a model interactively, then apply | `./scripts/setup-model.sh --apply` |
| Check the repository and running setup | `./scripts/health-check.sh` |

For model selection, search providers, verification, troubleshooting, and
rollback, use **[setup.md](setup.md)** as the source of truth.

## Configuration

Two layers keep project wiring separate from the tracked global setup:

| Location | Purpose |
| --- | --- |
| [`opencode.json`](opencode.json) | Project skills, the goal plugin, and local GitHub/Playwright MCP launchers. |
| [`global/`](global/) | Global model/provider settings, CLI preferences, commands, and agents. |
| [`.opencode/skills/`](.opencode/skills/) | Skill source bundles, loaded directly from this checkout. |
| [`config/mcp-versions.json`](config/mcp-versions.json) | Pinned MCP runtime versions. |
| [`scripts/`](scripts/) | Onboarding, deployment, MCP wrappers, and supporting utilities. |
| [`tools/browser/`](tools/browser/) | Playwright MCP dependency manifest and lockfile. |

Credentials and generated runtime files are not tracked. The deployment script
does not deploy a global `skills/` directory; the tracked global configuration
points to `~/repos/computer-use/.opencode/skills` instead.

<details>
<summary><strong>Advanced: deploy only the configuration you need</strong></summary>

Preview a deployment, or apply it after reviewing the target and changes:

```sh
./scripts/deploy-global-config.sh
./scripts/deploy-global-config.sh --apply
```

The script validates the tracked JSON, refuses symlinked paths, backs up replaced
entries to `<target>/backup-YYYYMMDD-HHMMSS/`, and verifies the copy. Use
`--only opencode.jsonc` (or a comma-separated list of entries) to avoid replacing
unrelated CLI preferences, commands, or agents:

```sh
./scripts/deploy-global-config.sh --only opencode.jsonc
./scripts/deploy-global-config.sh --only opencode.jsonc --apply
```

`--config-dir DIR` overrides the target. Otherwise it resolves in this order:

1. `$OPENCODE_GLOBAL_CONFIG_DIR`
2. `$OPENCODE_V2_CONFIG_DIR`
3. `$OPENCODE_V2_PILOT_DIR/config`
4. The `config` path reported by `opencode debug paths`
5. `~/.opencode-v2-pilot/config`

After applying, restart the TUI with **Ctrl+P → `service.restart`**. The same
deployment flow is available through the `/deploy-global` command. See the
[rollback guide](setup.md#rollback) to restore backed-up entries.

</details>

## Verify and continue

```sh
./scripts/health-check.sh
```

This read-only check looks for OpenCode v2, a responding background service,
connected GitHub/Playwright MCPs, the effective skill path, and required local
files. Run it on the machine you configured; a source checkout alone is not a
working runtime.

Tool approvals remain enabled in the tracked CLI configuration. Setup does not
authorize commits, pushes, or other consequential actions. Read
[`AGENTS.md`](AGENTS.md) for repository rules and maintainer context, and use the
[`handoff` skill](.opencode/skills/handoff/README.md) to refresh the working
directory's `HANDOFF.md` without committing or pushing.

Keep this page current with the
[`readme-maintenance` skill](.opencode/skills/readme-maintenance/README.md):
verify the repository first, update only what changed, and check the result.

---

<p align="center">
  <a href="setup.md">Set up your workspace</a> ·
  <a href=".opencode/skills/README.md">Find a skill</a> ·
  <a href="setup.md#troubleshooting">Troubleshoot</a>
</p>
