# Setup

How to use the computer-use plugin: the `desktop`, `web` and `cua` tools that let
OpenCode v2 see and operate GNOME applications and a session-isolated browser.

See [docs/features.md](docs/features.md) for what is implemented, its prerequisites
and what is still unverified.

## What you need

- OpenCode v2 (`opencode --version`).
- TypeScript-capable Node.js (22.18+ or 24+ LTS) for the plugin and its tests.
- Python 3 for the desktop helpers in `scripts/`.
- For `desktop`: a native GNOME session with accessibility (AT-SPI) enabled.
  Screenshots and pointer/keyboard input need the optional GNOME bridge below.
  WSL has no GNOME desktop, so these tools cannot drive Windows apps from WSL.
- For `web`: a Chromium-family, Firefox or WebKit browser that Playwright can launch.

## Turn it on

OpenCode loads `.opencode/plugins/computer-use/` automatically for sessions opened
in this checkout. Nothing else needs to be registered for that.

To use the tools from another project, add the plugin folder to that project's or
your global OpenCode config, then reload with **Ctrl+P → `service.restart`**:

```json
"plugins": [{ "package": "/home/brajam/repos/veyra-monorepo/libs/computer-use/.opencode/plugins/computer-use" }]
```

The browser backend needs its own pinned dependency once:

```sh
npm --prefix tools/computer-use-browser ci --omit=dev --ignore-scripts
```

## Optional GNOME window-control bridge

Window listing, focus, layout, capture and input go through a small GNOME Shell
extension in [`tools/gnome-window-control/`](tools/gnome-window-control/README.md).
Preview first; applying copies the bundle but never enables it or restarts GNOME:

```sh
python3 scripts/deploy-window-control.py --extension-dir "$HOME/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local"
python3 scripts/deploy-window-control.py --extension-dir "$HOME/.local/share/gnome-shell/extensions/opencode-window-control@computer-use.local" --apply
```

Enabling the extension and logging out or in are your choice.
[RESTORE.md](tools/gnome-window-control/RESTORE.md) covers rollback with
`scripts/restore-window-control.py`.

## Verify

```sh
node scripts/run-plugin-suites.mjs        # plugin, browser, runtime and bridge suites
node scripts/ci-offline.mjs --no-git      # the same offline checks CI runs
./scripts/health-check.sh                 # live: OpenCode service and active plugin
```

Source tests use fixtures and never touch your desktop or browser. The health
check reads the running service. It doesn't prove every desktop or browser
workflow works on your machine.

## Moved out of this repository (2026-11-19)

These pieces are no longer part of computer-use:

- **Plugins:** goal-docs, copy-session-id, personality, self-learning, chatgpt,
  provider-fallback, resource-monitor and tailscale, each its own repository under
  `~/repos/plugins/`. The memory plugin is archived in `~/repos/plugins/archive/memory`.
- **MCPs:** the GitHub and Playwright launchers, in `~/repos/veyra-monorepo/mcp-servers/`.
- **Removed:** the global deploy and onboarding scripts, the voice-assistant
  submodule, the OpenCode source patches and the retired inbox. They remain in
  Git history at the `pre-split` tag.

None of them were installed or registered anywhere by the move.

## Safety

Actions follow **observe → preview → act → verify**. `desktop.act` and
`web.act` mutations need a fresh preview token. Password and protected fields are
refused, and sign-ins stay with you. Tool approvals stay enabled.

With **Build auto**/auto-approve selected, authorized work must not stop for
agent-authored "continue?" questions. The agent picks reversible defaults or
records a blocker and keeps going; see [the autonomy contract](docs/autonomous-work.md).
That doesn't change your permission mode or authorize publishing, commits or pushes.
