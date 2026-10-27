# Setup

Guided onboarding for this repository's OpenCode v2 configuration, skills, and
web search.

## Quick start

From the repository root:

```sh
./scripts/onboard.sh --apply
```

That deploys the tracked global configuration and, with `--apply`, verifies web
search with one live query. Add `--with-browser` to install the Playwright MCP
dependency as well; it does not enable that MCP. Omit `--apply` at any time for
a dry run that writes nothing; a dry run also skips the live search unless you
add `--search`.

## What setup needs

- OpenCode v2 (`opencode --version`)
- Node.js and npm, only for `--with-browser`
- `gh`, only for the GitHub MCP tools
- Network access for the live search verification

The script never writes credentials. It does not authenticate GitHub, connect a
search account, or store secrets; those remain interactive actions you own.

## What onboarding does

1. Confirms the CLI is OpenCode v2 and the repository layout is complete.
2. Checks the background service.
3. Deploys `global/opencode.jsonc`, `global/cli.json`, `global/commands/`, and
   `global/agents/` with `scripts/deploy-global-config.sh`. This replaces the
   tracked entries, so local-only agents or commands are removed from the active
   config; the backup keeps a copy.
4. Optionally sets the global model.
5. Reports GitHub CLI authentication.
6. Optionally installs `tools/browser` dependencies; the Playwright MCP stays
   enabled.
7. Verifies the websearch provider list and runs one live query on `--apply`.

Deployment backs up replaced files to
`<config-dir>/backup-YYYYMMDD-HHMMSS/` before writing. Use `--strict` when a
script needs a nonzero exit code for recorded warnings.

## Guided model setup

List available models:

```sh
./scripts/setup-model.sh --list
```

Choose one interactively (dry run, then apply):

```sh
./scripts/setup-model.sh
./scripts/setup-model.sh --apply
```

Or set it directly:

```sh
./scripts/setup-model.sh --model deepseek/deepseek-flash --apply
```

The script validates the ID against `opencode models`, updates only the
top-level `model` field in `global/opencode.jsonc`, supports JSONC comments,
and refuses to touch nested agent models or non-string top-level values. It
then deploys only `opencode.jsonc`, so the rest of the active config is left
alone. Use `--no-deploy` to edit the tracked file only, or `--allow-unknown`
for a custom provider that `opencode models` does not list yet.

## Web search

OpenCode v2 supports five search providers: Exa, Firecrawl, Parallel, Tavily,
and TinyFish. The deployed configuration uses:

```jsonc
"websearch": {
  "provider": "random"
}
```

`random` reuses one available provider per session and switches to another when
a provider is rate limited. To pin one provider instead, set its ID
(`exa`, `firecrawl`, `parallel`, `tavily`, or `tinyfish`).

Connect an account in the TUI with `/connect`, or export the provider key before
starting OpenCode (for example `TAVILY_API_KEY`). The `websearch` skill
documents configuration, verification, and troubleshooting in detail.

Verify search without the TUI:

```sh
opencode api get /api/websearch/provider
opencode api post /api/websearch -d '{"query":"OpenCode v2 websearch"}'
```

## Playwright MCP

`opencode.json` and `global/opencode.jsonc` both enable the `playwright` server.
It is an isolated automation Firefox with its own throwaway profile at
`~/.local/share/opencode/playwright-firefox`. It is never the user's browser:
it holds no user logins, and Google rejects sign-in from it at
`accounts.google.com/v3/signin/rejected` ("This browser or app may not be
secure").

For the user's own signed-in browser, launch the browser explicitly and drive it
with `scripts/desktop-control.py` (`browser-assistant` documents the commands).
That CLI is the real-browser path; there is no desktop-control or desktop-vision
MCP tool.

Install or repair the Playwright MCP dependency with:

```sh
npm --prefix tools/browser install
```

Enable or verify the server:

1. Keep `"disabled": false` on the `playwright` entry in `opencode.json` and
   `global/opencode.jsonc`.
2. Deploy the global config and install the dependency if needed.
3. Reload with `Ctrl+P` > `service.restart`.
4. Confirm `opencode mcp list` reports `playwright connected`.

The global entry uses the tracked launcher so the server also works outside
this repository. `scripts/health-check.sh` fails when Playwright is disabled or
not connected.

## Verification

```sh
./scripts/health-check.sh             # repository, MCP, skill, and script checks
opencode debug config                 # confirm model and websearch block
opencode models                       # confirm the selected model is offered
opencode api get /api/websearch/provider
opencode service status
```

After applying configuration, reload the TUI with `Ctrl+P`, then
`service.restart`.

## Rollback

Each deployment creates a timestamped backup directory under the active config
directory containing only the entries it replaced. To roll back, copy those
backed-up `opencode.jsonc`, `cli.json`, `commands/`, or `agents/` entries over
the active ones, then restart the service.

## Troubleshooting

- **Wrong model after setup** — rerun `./scripts/setup-model.sh --model <id> --apply`.
- **Search returns no results** — check network, run `/connect`, and confirm the
  provider list with the API command above.
- **GitHub tools fail** — run `gh auth status`; if unauthenticated, run
  `gh auth login`.
- **Playwright MCP not offered** — confirm `"disabled": false` in
  `opencode.json` and `global/opencode.jsonc`, then reload. It is an isolated
  automation browser and never signs in to the user's accounts.
- **Playwright MCP fails to start** — install the dependency
  with `npm --prefix tools/browser install` or
  `./scripts/onboard.sh --apply --with-browser`.
- **Config not picked up** — reload with `Ctrl+P` > `service.restart`.

## Safety

Onboarding is dry-run by default. `--apply` writes only tracked configuration
and creates a backup first. It does not commit, push, delete data, or store
credentials.

The tracked `global/cli.json` keeps `session.permissions` at `prompt`, so tool
approvals still appear in the TUI. Setting it to `autoaccept` accepts every
request automatically, including actions configured as `ask`, such as
`repo_commit` and `repo_push`; change it only in your local `cli.json` if you
intentionally want that behavior.

`deploy-global-config.sh --only NAME[,NAME]` restricts a deployment to selected
entries (`opencode.jsonc`, `cli.json`, `commands`, `agents`). `setup-model.sh`
uses this to leave agents and commands untouched.
