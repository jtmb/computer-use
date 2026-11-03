# Direct ChatGPT plugin

Effect-native OpenCode v2 server plugin plus TUI companion for the ChatGPT
connector in `../chatgpt-connector/`.

- `server.ts` builds a promise facade over the Effect plugin context, runs the
  existing connector service, and registers tools whose permission
  assertion runs inside the tool's own Effect. Interrupting a call therefore
  interrupts its pending permission request, aborts the in-flight read and
  reports cancellation.
- `tui.tsx` reconciles the client's cached permission prompts after an
  interrupted execution by re-reading server state. It never approves or rejects.
  It also registers the supported `chatgpt-image` Markdown preview renderer,
  with an image-only, click-to-open-original preview.
- Images are enabled when this optional plugin is loaded with no `images`
  option, or with `images: true`. `images: false` (or an invalid value) disables
  the route. The route
  validates PNG bytes, preauthorizes a unique project output, saves it under
  `assets/generated`, and returns the same image as native PNG attachment
  content. Generation is not implemented by the text-chat tool.
- `show_image` takes only a saved PNG filename under the invoking project's
  `assets/generated`, checks exact `read` permission and session location, and
  returns it as native image content. It does not contact ChatGPT, regenerate,
  edit the saved file, or consume image allowance. Traversal, symlinks, oversized
  or changed files, and invalid PNGs are refused.

Activate by adding this directory to `plugins` in the active `opencode.jsonc`.
The package's TUI companion is loaded with that entry; a TUI-only entry cannot
register its server tools. Existing settings and plugins must be preserved.

The image tool evaluates `chatgpt.generate_image` against `chatgpt.com`, then
exact project-relative `edit` resources for the directories and preallocated
file **before generation**. It uses existing OAuth only; it does not add API-key
billing. A call can consume the account's image allowance. Timeout is 180 seconds;
there is no automatic image-generation retry. File content, not a path or raw
base64 text, is required for in-chat delivery. The client must preserve it.

## Development checks

```bash
npm --prefix tools/chatgpt-connector run check
npm --prefix tools/chatgpt-direct run typecheck:host
npm --prefix tools/chatgpt-direct test
# Source-only focus/card lifecycle checks; uses the existing connector TypeScript install:
npm --prefix tools/chatgpt-direct run test:focus
# Separate native-renderer integration check; requires working OpenTUI native FFI:
npm --prefix tools/chatgpt-direct run test:render
```

The host check uses the connector's existing TypeScript install and the monitor
package's installed 2.1.1 SDK/Effect declarations. These are repo development
inputs, not runtime dependencies of this plugin. It creates no declaration shims
and does not install anything. OpenCode supplies its own plugin/Effect runtime.

Verified 2026-10-29 in the pilot profile: a real ChatGPT reply and real Codex
search results. The updated connector suite has 112 passing tests, zero failures
or skipped tests, plus pinned- and host-SDK typechecks. The image-directory rename
test was reproduced failing before the fix, alongside three added rename/move
cases. Tests exercise real temporary files and native content with fake network
and permission boundaries. Decode-bomb, HTTP error redaction, cancellation,
replacement preservation, session moves, and receipt mismatch remain distinct
failure coverage. No tests were deleted or weakened.

A synthetic native PNG reached the model through Code Mode before account use;
that alone did not verify the human terminal display.
Cancellation and prompt-refresh paths are tested with fakes, not a live cancelled
call. Filesystem rechecks detect the tested moves and clean request-owned partial
files; they are not an atomic transaction against a hostile concurrent writer.

## Live image acceptance — 2026-10-29

One real `chatgpt_direct.generate_image` call through the existing OAuth account
requested a watercolor red-and-white lighthouse on a rocky island at sunset.
The actual PNG returned through Code Mode and was inspected by the model in the
same conversation: striped lighthouse, rocky island, blue sea, orange sky, no lettering
or border. This was not a mock, external viewer, path-only result, or Read-tool
substitute for the generation response.

The same file is saved at
`assets/generated/generated-38a95ec83c7a79b6684cc87e26208cfe.png` in the project:
1536x1024, 3,071,997 bytes, regular file, mode 0600, SHA-256
`412f1d7e7009e9b2d55a69f398f5e2af046a03b683eae09cefd25d6eb191bf97`.
Fresh chat returned `connector online`; search returned source links. This is
observed acceptance for this account/client, not a guarantee of other accounts'
entitlements, future endpoint availability, or every terminal's rendering.

## Showing the image in the human chat UI

OpenCode 2.1.1 supports native image tool previews. In **Ctrl+P -> Open
settings -> Session -> Transcript images**, turn previews on
(`session.image_preview: true`). Click a thumbnail for the larger native preview;
this is the native UI, not a connector-specific renderer. Model access to image
content alone is not proof that the operator's terminal displayed it.

On 2026-10-29 the running pilot TUI's configuration already had that setting on,
with no inline override. The original generation message retained the PNG as
native file content. A live `chatgpt_direct.show_image` call then reattached the
same 3,071,997 bytes and SHA-256 in this conversation without another generation.
An earlier operator screenshot showed no thumbnail, invalidating the initial
human-display claim. A later request-owned capture of this exact session's
Ptyxis window showed the lighthouse thumbnail directly below `show_image`
(capture SHA-256 `285438087b319eecd7f23f962a0cbfbcb19949e4659007f0439239b8c4b891de`).
It is a small, blocky terminal preview, not full-resolution inline rendering.
No binary, plugin source, or configuration change was needed for this observed
reattachment; the earlier missing-preview cause remains unknown. The operator's
later screenshot also showed the enlarged native preview, still blocky.

### Terminal graphics limitation

**Transcript images enables previews, not high-resolution terminal graphics.**
OpenTUI selects Kitty graphics or Sixel when supported, otherwise colored
character blocks. The tested Ptyxis 50.1 / VTE 0.84 session showed the block
fallback, including in the enlarged preview. This does not mean the saved PNG
was downsampled or damaged. Enlarging that terminal preview cannot recover
detail beyond its character-cell grid.

For sharper in-terminal images, use a graphics-capable terminal such as Kitty
or Ghostty; that alternative was not live-tested here. Do not force an
unsupported graphics protocol, regenerate the image, or disable security checks
to work around this limitation.

### Open the original from the connector preview

After generating or reattaching an image, include this fenced block in the
assistant's reply, using the **returned filename**, not a path or URL:

````markdown
```chatgpt-image
generated-38a95ec83c7a79b6684cc87e26208cfe.png
```
````

The TUI companion renders only the image, sized to its aspect ratio and available
width, without a frame, padding, caption, grey text, or separate button.
**Click the image** to open the unchanged full-resolution PNG in the system
image viewer; use that viewer's
zoom/actual-size controls. No viewer is launched just by rendering the preview.
Once the image already has focus, Enter/Space invokes the same action. The current
source adds **Focus image preview** to the native command palette, without a new
shortcut, button or composer change. It retains one card for the current session
and directory, clears it on navigation/destruction, and checks cancellation,
modal state, terminal bounds and ancestor visibility before focusing. Recovered
cards register through the same path. The command only focuses; it does not open
the original automatically.

At the2026-11-01source checkpoint, no automated regression or type verification
covered this new command. On2026-11-02seven new injected-renderer lifecycle cases
pass and seven exact source faults fail, covering deferred focus, route/directory
changes, teardown, stale/multiple targets and recovered-card registration.
Production code and older renderer/action tests are unchanged. See the
[source evidence and limits](../../docs/image-focus-source-verification-2026-11-02.json).
This is not a fresh full typecheck or actual Solid/OpenTUI/GUI acceptance. The
single deferred attempt follows the pinned native palette's deferred restoration;
`renderer.idle()` is not a focus barrier. The live keyboard outcome below still
does not establish original pointer-click or the full native lifetime matrix.
A separate whole-package strict/library request on2026-11-02uses the existing
owner config with`--skipLibCheck false`, preserving every include. Its real
prelaunch guard refuses at2815.1875MiBavailable versus2816: no worker or diagnostic
executes. This is not a type pass, and no unchanged retry or limit change follows.
Six additional controlled-timeout cases pass, with seven new exact faults detected:
expired late results cannot publish or gain focus, current owners receive an
unavailable status after settlement, and navigation/disposal suppress stale
feedback. A completed preview stays usable after its recovery deadline. These are
source checks, not real timer timing or original-pointer acceptance; see the
[timeout evidence and limits](../../docs/image-recovery-timeout-verification-2026-11-02.json).
Do not press Enter in an unfocused composer or infer that Tab reaches the card.
During opening the image briefly dims; failures use a toast, not permanent text
under the image. Right-clicks and drag releases do not open the original.
The action uses Linux `/usr/bin/xdg-open` and the user's existing PNG association
(Loupe in the inspected desktop). It does not install an app, upload/serve the
image, create a temporary copy, or spend image allowance.

The card only selects an already-completed native PNG attachment in the current
session. If it is outside the latest cached messages, the companion uses the
authenticated public message API to scan up to 40 pages of 50 assistant messages.
It shows a temporary loading status, rejects malformed/cyclic pagination and
conflicting same-name attachments, and cancels on session/project change,
disposal or a 30-second recovery deadline. Only one selected image URI is retained;
history is not persisted or copied into the host cache. Incomplete or failed
recovery shows an unavailable/retry status, never an arbitrary local-file action.
On activation it rechecks session/project identity, validates the
bounded no-follow local file, and compares SHA-256 with the attachment before
launching the exact file URI without shell interpolation. Missing/changed files,
symlinks and session moves are refused; concurrent activations are coalesced.
The local original must exist and match; remote-only files are not downloaded.
Filesystem rechecks are not an atomic guarantee against a hostile writer
changing the path after validation and before the external viewer opens it.

OpenCode's native image dialog has no documented plugin hook for changing its
click action. It remains unchanged: **click-to-open belongs to the connector's
Markdown preview**, not the native thumbnail popup. If the companion is absent,
or images are disabled, the fence remains ordinary code instead of offering an
unsafe file action.

Verification on 2026-10-30: 127 connector tests and eight action/layout tests pass;
host SDK typechecking and the harness health check pass. An in-memory mutation
removing only the hash guard made the mismatch regression fail, without a real
viewer launch or a production source edit. All five native-renderer cases pass
using checksum-verified scratch Node26.4.0 with its supported FFI flag; system
Node/OpenCode were not changed. The production recovery function found the real
lighthouse attachment across 15 authenticated history pages, with unchanged
SHA-256. A request-owned capture then verified both image-only cards in the
reopened original image chat, without a model submission or new generation.
Actual click-to-viewer remains unverified: GNOME input refused the deliberate
image click with `POINTER_CONSTRAINED` before a button event. No blind retry or
alternate input backend was used. Character-cell pixelation is unchanged.

On 2026-10-31, a source-only review of `image-preview.ts`, `tui.tsx` and the
existing renderer cases confirmed the conditional keyboard behavior above. No
new test, focus/input action, generation, file launch or runtime change was made;
this documentation correction does not establish an actual card or viewer action.

The later2026-11-01UTC source addition supersedes that no-command source finding,
not its operational limits. Source readback confirms that the original card's
layout, mouse/key activation handlers and guarded original-file path are unchanged.
That source-only unit ran no tests, new image, file launch or GUI input. Before the
reported server restart, GNOME reported its screensaver active and the enabled
bridge inactive with no bus owner; no capture, input, activation or unlock followed.
Live work remained blocked until the desktop was unlocked.

**Actual keyboard opening — 2026-11-01 UTC:** after unlock, the native palette
shows **Focus image preview**. The first activation reports no visible preview;
no opening key follows. After bounded Page Up navigation reveals the reattached
lighthouse card, activation reports it focused. Enter through that card opens
Loupe; request-owned capture shows the lighthouse and Image Properties reports
1536×1024 PNG. `show_image` returned the unchanged3,071,997B/SHA`412f1d7e…1bf97`,
without generation. No direct file launch, pointer retry, test suite or new worker
is used. Input is released; the viewer is left open for inspection.

The original image chat instead shows both historical cards unavailable in this
run; their recovery failure/cause remains open. Reattachment in this chat is not
recovered-card acceptance. Ctrl+1 also inserted a literal1 rather than changing
tabs; that task-created character was removed without submission, and the native
session chooser was used. Keyboard opening does **not** pass the original pointer
click requirement. Metadata-only live evidence is retained in
`Documents/computer-use-native-host-20261029/direct-blockers-parent-tz3RSN/image-focus-live-facts.json`.
