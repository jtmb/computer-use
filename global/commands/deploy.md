---
description: Refresh the tracked OpenCode v2 global configuration.
agent: build
---

Refresh the global OpenCode v2 configuration from this repository.

1. Read `AGENTS.md`, `README.md`, and `setup.md` first. Preserve unrelated dirty
   work.
2. Work from the repository root (the checkout containing `AGENTS.md`).
3. Preview the deployment:

   ```bash
   ./scripts/deploy-global-config.sh
   ```

   Preview with no flags; add `--apply` to write. Run from the repository root.

4. Review the preview, then apply after explicit approval:

   ```bash
   ./scripts/deploy-global-config.sh --apply
   ```

5. Restart OpenCode from the TUI with `Ctrl+P` > `service.restart`.
6. Do not commit, push, or edit deployed copies. Commit approval and push
   approval are separate.

When `opencode.jsonc` is included in the deployment (the default), the script
also deploys the repository skill bundles to the active global skills directory.
