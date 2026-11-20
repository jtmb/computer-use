# Handoff — computer-use split, 2026-11-20

## State

The split is complete and pushed. `computer-use` is now the home of the
`desktop`, `web` and `cua` plugin, the three backends it imports
(`tools/computer-use-browser`, `tools/computer-use-runtime`,
`tools/gnome-window-control`), its desktop helper scripts, the skills and the
repository checks.

- Working branch: `restructure/computer-use-only`; GitHub: <https://github.com/jtmb/computer-use/tree/restructure/computer-use-only>
- Split commit: `0d64789`; it sits on GitHub's old `main` (`c2ef96a`).
- `pre-split` tag stays available locally for rollback.
- Nothing from the split was installed or registered. `~/.config/opencode` is unchanged.

## Repositories created and pushed

All new repositories are **private** on GitHub; change visibility only after
reviewing what each contains. Each keeps its history from `computer-use`.

| Repository | Local path | Contents |
| --- | --- | --- |
| <https://github.com/jtmb/goal-docs> | `~/repos/plugins/goal-docs` | Goal-docs companion |
| <https://github.com/jtmb/copy-session-id> | `~/repos/plugins/copy-session-id` | `/copy-session-id` TUI command |
| <https://github.com/jtmb/personality> | `~/repos/plugins/personality` | Personality plugin; needs `options.skillsRoot` when installed |
| <https://github.com/jtmb/self-learning> | `~/repos/plugins/self-learning` | Self-learning plugin |
| <https://github.com/jtmb/chatgpt> | `~/repos/plugins/chatgpt` | Direct plugin + connector + `legacy/chatgpt-mcp.sh` |
| <https://github.com/jtmb/provider-fallback> | `~/repos/plugins/provider-fallback` | Provider fallback plugin |
| <https://github.com/jtmb/resource-monitor> | `~/repos/plugins/resource-monitor` | Resource monitor plugin |
| <https://github.com/jtmb/computer-use-tailscale> | `~/repos/plugins/tailscale` | Tailscale gateway + `plugin/` TUI command |
| <https://github.com/jtmb/computer-use-memory-archived> | `~/repos/plugins/archive/memory` | Archived memory plugin — do not install |

`jtmb/tailscale` already exists with unrelated history, so this repository was
named `computer-use-tailscale`. The MCP launchers went into the Veyra monorepo
instead of new repos; the import receipt is
`~/repos/veyra-monorepo/docs/operations/2026-11-19-computer-use-mcp-import.md`.

## Verification

- `computer-use`: 257/257 repository contract tests pass at the split commit.
- Offline CI: 11 of 14 steps pass. The three failures (plugin suites, Python
  suites, type check) fail identically before the split because this WSL host
  has no GNOME desktop, TypeScript is not installed, and a fixture still points
  at a stale `/home/james` path. Plugin, browser, runtime and bridge suite
  results are byte-for-byte the same before and after.
- New plugin repos: goal-docs 227 tests, personality 38, self-learning 66
  (1 skipped), copy-session-id 1, tailscale 91 Node and 40 Python (3 Docker-only
  skips), archived memory 49 — all pass. chatgpt, provider-fallback and
  resource-monitor have pre-existing failures when dependencies are not installed.
- MCP folders: GitHub 62 Python and 4 Node tests pass. Playwright 18 of 20 pass;
  the other two fail identically in `computer-use` at `pre-split`.
- No MCP launcher was started and no plugin was registered.

## Still to decide or do

1. Merge <https://github.com/jtmb/computer-use/pull/new/restructure/computer-use-only>
   into `main` when you are ready. This handoff commit is on the branch too.
2. `global/` still declares plugins and MCPs that moved out, using old
   `/home/james` paths. It is recorded as held/blocked in `docs/features.md`.
3. `evals/agent-rules/` and the remaining `global/` template need a separate
   decision; they were left in `computer-use` for now.
4. Install only the plugins and MCPs you actually want, from the new locations.
   `setup.md` and each repository's README show the config entries.
5. Pushing any later work from the monorepo or these repositories needs its own
   explicit go-ahead.

## Notes and limits

- Most extracted folders arrived in one or two commits, so the new repositories
  have short histories (1–7 commits).
- The memory and chatgpt repos each carry a copied helper from a patch folder
  that was removed; personality and self-learning carry test fixtures copied
  from this repository. These copies can drift from the originals.
- The old 2,233-line features inventory is preserved in
  `docs/history/features-2026-11-19-pre-split.md`; dated history docs were not rewritten.
- Rollback before publishing: `git reset --hard pre-split` in `computer-use`,
  then delete the new repositories. After publishing, revert the split commit
  instead of rewriting public history.
