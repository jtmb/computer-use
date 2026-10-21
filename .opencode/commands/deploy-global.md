---
description: Deploy the tracked global OpenCode config and restart OpenCode from the TUI
agent: build
---

Deploy the tracked global config in `global/` to the active OpenCode config
directory.

1. Run `./scripts/deploy-global-config.sh` from the repository root and show the
   `source=`, `target=`, and per-entry `unchanged:`/`update:` lines.
2. If every entry is `unchanged:`, stop and report that the active global config
   already matches `global/`. Otherwise ask the user to confirm with the
   `question` tool unless `$ARGUMENTS` contains `--yes`.
3. On confirmation, run `./scripts/deploy-global-config.sh --apply` and report the
   printed `backup=` and `deployed` lines.
4. Re-run `./scripts/deploy-global-config.sh` and confirm it reports that the
   tracked config already matches the target.
5. Finish by telling the user how to restart from the TUI: press `Ctrl+P`, type
   `service.restart`, and press `Enter`. Do not restart the service from the
   shell; the TUI action keeps the session.

Pass `--config-dir DIR` in `$ARGUMENTS` to deploy to another directory.

Treat `global/` as the source of truth. Never edit tracked files to match the
host; if the user wants the tracked copy refreshed from the host, copy from the
active config directory into `global/` and show `git diff` before committing.
