---
description: Refresh the tracked OpenCode v2 global configuration.
agent: build
---

Refresh the global OpenCode v2 configuration from this repository.

1. Read `AGENTS.md`, `README.md`, and `setup.md` first. Preserve unrelated dirty
   work.
2. Work from `~/repos/computer-use`.
3. Preview the deployment:

   ```bash
   /home/shak/repos/computer-use/scripts/deploy-global-config.sh
   ```

4. Review the preview, then apply after explicit approval:

   ```bash
   /home/shak/repos/computer-use/scripts/deploy-global-config.sh --apply
   ```

5. Restart OpenCode from the TUI with `Ctrl+P` > `service.restart`.
6. Do not commit, push, or edit deployed copies. Commit approval and push
   approval are separate.
