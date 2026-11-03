# Optional ChatGPT connector

Shared backend and safety helpers for the optional ChatGPT integration. The
active Effect-native route is the sibling [direct plugin](../chatgpt-direct/README.md),
not the legacy stdio adapter. Its chat/search tools were exercised live in the
pilot profile on 2026-10-29. A real image was also generated and returned as a
native attachment in that conversation; see the [image acceptance evidence](../chatgpt-direct/README.md#live-image-acceptance--2026-10-29).

## Architecture

- `server.ts` exports the OpenCode V2 server plugin. When explicitly loaded in
  its default mode, it registers the `chatgpt.execute` RPC.
- `src/mcp.ts` is the local stdio MCP adapter. It discovers and authenticates
  only to the local OpenCode V2 service, resolves the invoking session there,
  reads the documented `ai.opencode/sessionID` call metadata, and calls the
  plugin RPC. It requires the companion plugin to be loaded.
- `scripts/chatgpt-mcp.sh` resolves the already-provisioned profile-pinned
  Node.js, verifies the package's exact runtime dependencies, removes unrelated
  inherited environment variables, and starts the adapter. It does not install
  runtimes or dependencies.
- `src/effect-tools.ts` registers the direct tools through the sibling plugin.
  Service permission assertions run inside the tool Effect. Interruption aborts
  the request; `src/permission-refresh.ts` reconciles cached TUI permission state
  without approving or rejecting another request.
- `src/image-tool.ts` preallocates one unique filename and evaluates exact
  directory/file `edit` permissions before generation. It checks session location,
  waits for save cleanup on interruption, and returns the validated PNG as native
  image content plus its saved path and SHA-256. It has no structured `output`
  field, which could hide image content in Code Mode.
  Its read-only `show_image` branch reattaches an existing generated PNG using
  exact read permission, no-follow bounded reading, and session/file identity
  checks, without contacting the image service or spending allowance.
- `src/output.ts` pins no-follow directories and reopens approved absolute
  bindings to compare device/inode identity before writes and success. The
  formerly skipped directory-rename regression now runs, with parent/root moves,
  replacement directories, moves during writing, and cancellation cases.
  Checkpoints and request-owned cleanup detect tested changes; this is **not an
  atomic filesystem transaction** against a hostile concurrent writer. Cleanup
  refuses to delete another writer's replacement file.
- `src/image-preview.ts` binds the sibling TUI's original-file action to a
  completed native PNG attachment and the current session/project. It revalidates
  the local PNG and its SHA-256 before clicking the image opens its file URI with
  the existing Linux image viewer. It does not generate, upload, serve, copy, or
  automatically open images. The [preview guide](../chatgpt-direct/README.md#open-the-original-from-the-connector-preview)
  distinguishes this custom card from OpenCode's unchanged native image dialog
  and documents terminal block-rendering limits and live verification gaps.
- `src/in-process-tools.ts` is the older Promise direct adapter. Its image tool
  remains filtered out at registration; use the Effect entry for cancellable
  saving and image attachments. The legacy MCP image handler returns saved-file
  metadata, not a native in-chat attachment.

Direct mode does not register the legacy RPC, preventing an extra route around
its permission checks. Existing setup scripts target the legacy MCP route, not
the sibling Effect plugin. Runtime loading, source tests, account generation,
and client rendering are distinct verification layers. Text/search model
rejection can trigger bounded account-model discovery; image generation never
automatically loops over models or repeats a quota-using call. HTTP diagnostics
retain status and allowlisted codes, not provider bodies that might echo private
data. Image requests have a 180-second deadline; chat/search retain 45 seconds.

### Response acquisition and cancellation — source correction, 2026-10-31

`src/bounded-response.ts` now bounds bytes delivered to its reader **before** each
BYOB request: at most 64 KiB and the remaining allowance. Existing ceilings stay
16 MiB JSON, 2 MiB chat stream, 24 MiB local RPC, 256 KiB session and 4 KiB HTTP
error. This does not bound buffering inside fetch, decompression or the network
stack. Unsupported non-byte streams fail closed; there is no default-reader
fallback. UTF-8 is decoded strictly. Abort cancels/releases the reader without
waiting forever on a stuck cancellation promise; late fetch responses are also
cancelled without reading their bodies.

At the exact ceiling, EOF must be independently confirmed through `reader.closed`;
there is no extra-byte EOF probe and a size header is not treated as proof. The
synthetic byte stream closes successfully at the cap, but the tested Node 22.22.2
HTTP fetch can require another pull to expose EOF. That case waits for cancellation
or the existing deadline and refuses rather than accepting unconfirmed data.
Below-cap synthetic loopback length/chunked responses pass. This limitation and
the earlier failed exact-cap HTTP expectation remain recorded; universal fetch
or loaded-runtime compatibility is **not** claimed.

The legacy MCP adapter now forwards SDK request cancellation through session
lookup, discovery waiting, authenticated fetch and body reads. Caller abort is
combined with the unchanged 10-second session / 120-second RPC deadlines, including
discovery time. A late session result cannot dispatch RPC, and a late RPC result
cannot begin image saving after abort. Existing local-only endpoint, authentication,
redirect, invoking-session and safe-output checks remain in place.

The current package passes **173 tests**, plus the separate **two readiness
cases**. Tests include real SDK in-memory cancellation through the concrete
transport, not only an injected handler. A current full 606-file strict/library
check first found a test annotation error; after correction it printed no compiler
diagnostics, but the process monitor failed during exit, so this is **not a passing
typecheck**. The final coverage addition's attempt was not spawned: available
memory was 2765.8125 MiB, below the unchanged 2816-MiB admission floor. No guard
was relaxed. The historical 603-file pass does not check these edits. No account
call, dependency installation, activation, deployment or shared restart occurred.

The connector does not start an OAuth flow, accept or fall back to an API key,
or store credentials in this repository. The plugin resolves an existing
OpenCode OpenAI OAuth connection only when a ChatGPT tool is invoked and rejects
API-key credentials. The MCP adapter does not receive account credentials; it
uses the local service's own authenticated RPC boundary. Chat history is
in-memory, bounded, and isolated by account, project, and session. Chat requests
capture reset epochs when queued: session deletion invalidates older queued chat
before backend dispatch, and an in-flight reply cannot restore cleared history.
This is local source behavior verified with a fake backend, not backend erasure.
Chat requests set `store: false`. Web search and image generation contact ChatGPT only after
an explicit tool invocation. On use, prompts, search queries, and the active
OpenAI OAuth credential leave the machine for these undocumented/nonpublic
ChatGPT backend routes:

- `https://chatgpt.com/backend-api/codex/responses`
- `https://chatgpt.com/backend-api/codex/alpha/search`
- `https://chatgpt.com/backend-api/codex/images/generations`

`store: false` is sent for chat requests but is not a guarantee about backend
retention. An explicit image-generation call writes its returned PNG under
`assets/generated` in the verified invoking project. PNG validation checks
structure, chunk CRCs, bounded zlib decoding, scanline size/filter bytes, and
dimension limits before saving or attaching. Visual correctness still requires
inspection of the returned image.

## Install and check

From the repository root, `./scripts/onboard.sh --with-chatgpt --no-search`
previews the optional source merge without installation or account access.
The approved apply counterpart adds `--apply`: package-local locked install,
launcher `--verify-only`, source backup/merge/readback, then normal global bundle
deployment. A preflight failure stops before config changes/deployment; npm may
already have changed package-local dependencies. The normal full-bundle deploy
has its own replacement/backup scope—review it separately from this additive
source merge. No default config includes this package.

For source-only preview, use `python3 scripts/setup-chatgpt.py`. Its explicit
apply/install flags and conflict/path/strict-JSON/rollback boundaries are in the
[full onboarding workflow](../../onboarding.md). User sign-in and actual sends
are separate from all setup and fake-backed checks below.

Install from the package-local lockfile, then run the fake-backed checks:

```bash
npm --prefix tools/chatgpt-connector ci
npm --prefix tools/chatgpt-connector run check
```

The direct runtime dependencies are pinned to
`@modelcontextprotocol/sdk` 1.30.0, `@opencode/client` 2.0.7, and
`@opencode/plugin` 2.0.7. `package-lock.json` locks their transitive dependency
closure. The launcher fails closed if any direct dependency is absent or does
not match the package and lockfile pins.

The install reported upstream transitive deprecation warnings, including
`glob@10.5.0` under `@opencode/plugin`'s dependency tree. The exact upstream
direct pins are retained; no overrides or security-audit claim are made here.
Review that transitive closure before enabling the connector.

The tests use fake backend/transport dependencies and synthetic OAuth-shaped
fixtures. They exercise real in-memory MCP handshake/cancellation and the
concrete transport with injected discovery/fetch—not actual OpenCode service
discovery/authentication or a live plugin RPC. The shared-reader suite also owns
a temporary loopback-only HTTP server with synthetic bytes to check Node fetch;
it closes its server/connections afterward. PNG-output tests use isolated
temporary directories. Tests do not read real credentials, sign in, send
ChatGPT requests, search the web, or generate images. The direct-tool tests cover
cancellation, permission denial, project identity, validation, registration,
cleanup, and native image content. On 2026-10-29 the package typecheck and all
112 tests passed, with zero skipped cases. The direct plugin's reproducible
host-declaration check and eight original-action/layout tests also pass. Its
separate two-case native-renderer suite is blocked by unavailable native FFI in
the shell's Node runtime, not silently skipped. A synthetic PNG reached the model
through Code Mode before account use; the later real generated-image attachment
and native block thumbnail have separate evidence. None proves the new card's
click-to-viewer flow, a real TUI permission prompt clearing, or a
signed-out call.
The registration test also verifies that a whitespace-only probe returns before
fake permission, credential or backend calls. None proves a live signed-out call.

On 2026-10-27, `scripts/chatgpt-mcp.sh --verify-only` failed because the
profile-pinned MCP Node runtime was unavailable through the runtime helper. The
wrapper intentionally does not fall back to the unrelated `~/.opencode/bin/node`
or another arbitrary Node executable; no live runtime handshake was performed.

## Source and license provenance

The imported implementation and tests are from
[`jtmb/opencode-rig`](https://github.com/jtmb/opencode-rig), migration branch
`migration/opencode-v2`, commit
[`b17182cd5bcd55c282a94ea18f87a16460813c35`](https://github.com/jtmb/opencode-rig/tree/b17182cd5bcd55c282a94ea18f87a16460813c35/platforms/linux/ubuntu/computer-use/plugins-v2/chatgpt-connector).
The implementation and test baseline comes from that exact commit.
`src/mcp.ts` and `test/mcp.test.ts` are adapted to the documented V2
`ai.opencode/sessionID` metadata key; the in-memory MCP protocol test and
dependency-verifier tests are local additions. Package metadata, this README,
and the launcher are adapted for this repository.

That upstream commit has no repository `LICENSE` file, and the connector's
upstream package manifest declares no license. Its license is therefore
**unspecified** here; no license or redistribution grant is inferred. Review
and resolve that status before publishing or redistributing this package.
