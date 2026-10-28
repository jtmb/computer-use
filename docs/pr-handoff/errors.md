# Errors, Failures, and Resolutions

This log records errors encountered while building and onboarding this PR. It is
sanitized: no credentials, tokens, host names, addresses, or private paths.

## Onboarding and environment

| Error | Cause | Resolution | Status |
|---|---|---|---|
| `task-memory` referenced a Basic Memory MCP server and wrapper that were not installed. | Basic Memory was retired but the skill and health check still expected it. | Replaced task memory with a local Markdown store and removed the legacy health dependency. | Fixed |
| `opencode mcp list` returned no servers during the first health-check query. | MCP servers start asynchronously; the query returned before connection completed. | Added a bounded retry in `health-check.sh`; terminal `failed` states stop the retry immediately. | Fixed |
| Health check cached MCPs as failed after a cold-start simulation killed their processes. | The service keeps failed MCP state and does not automatically restart those entries. | Restarted the OpenCode service; use a mock for cold-start tests instead of killing live MCP processes. | Fixed |
| Health check passed from one directory but reported no MCPs from another. | MCP status is project/service scoped. | Run the check from the repository root and restart the service after config changes. | Mitigated |
| `Text file busy` when running `health-check.sh` immediately after writing it. | The script was executed while the file was still being replaced. | Retried after the write completed. | Transient |
| `/api/skill` discovery returned built-in skills plus repository skills. | The API reports the active service's loaded skills, not just the checkout. | Verify required IDs rather than exact list length. | Handled |

## Deployment and path handling

| Error | Cause | Resolution | Status |
|---|---|---|---|
| Global config and health check resolved different skills directories when `XDG_CONFIG_HOME` was set. | Duplicate path logic with different defaults. | Added `scripts/opencode-paths.sh`; all consumers use it. | Fixed |
| `deploy-skills.sh` symlink guard could miss symlinks in a large tree. | `find | grep -q` caused `SIGPIPE`; `pipefail` turned that into a false negative. | Replaced with `find -type l -print -quit`. | Fixed |
| `--config-dir` deployed config but wrote skills to the default directory. | Skills deployment did not receive the config target. | Pass `--target <config-dir>/skills` from `deploy-global-config.sh`. | Fixed |
| Onboarding deployed skills twice after config deployment was coupled to skills. | A separate onboarding step remained after the coupling. | Removed the duplicate step; full config deployment handles skills. | Fixed |
| `task-memory` used GNU-only `find -printf`. | The command is not available on BSD/macOS `find`. | Switched to portable `find`; added `grep -Ril` fallback documentation. | Fixed |
| Cron timestamp fallback did not run on BSD. | A pipeline masked the failing `stat` status. | Split GNU/BSD `stat` calls with explicit status checks. | Fixed |
| Repository contained hardcoded user-home and fixed interpreter paths. | Local onboarding assumptions were committed into shared files. | Removed hardcoded home paths; preserved PATH, discovered Node, honored `TMPDIR`; documented `COMPUTER_USE_ROOT`. | Fixed |

## PR and worktree handling

| Error | Cause | Resolution | Status |
|---|---|---|---|
| A patch generated on the email branch did not apply to the `main`-based PR branch. | The branches contained unrelated email/browser commits. | Transplanted only the portability/deployment changes onto PR #4; excluded PR #2 scope. | Fixed |
| Conflict blocks appeared in the catalog, AGENTS, health check, and Kubernetes references during the transplant. | Different branch bases. | Resolved by taking the portability version, preserving 24 skills, and removing email/Basic Memory entries. | Fixed |
| GitHub MCP could not read collaborator permission. | Lockdown mode or missing push permission for the authenticated account. | Used read-only PR search and the local `gh` CLI instead; no permission bypass attempted. | Mitigated |
| `session_context` and todo tools were unavailable in this session. | The expected plugin/tool catalog was not registered. | Read the local session store read-only and tracked the checklist manually. | Mitigated |
| `shellcheck` was not installed. | Optional local tool absent. | Used `bash -n`, targeted tests, and manual review. | Accepted |

## Remaining risks

- Health discovery depends on OpenCode's internal `/api/skill` endpoint.
- Fedora paths were audited but not executed on a Fedora host.
- Basic Memory code remains dormant in `scripts/mcp_runtime.py` and
  `scripts/assistant-memory.py`.
- There is no CI configured in the repository.
