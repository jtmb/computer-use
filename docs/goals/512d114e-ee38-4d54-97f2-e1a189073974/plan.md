# Plan — `512d114e-ee38-4d54-97f2-e1a189073974`

- Goal ID: `512d114e-ee38-4d54-97f2-e1a189073974`
- Source session ID: `ses_e84662388ffeN05ssgGLQ9yh4k`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-27T08:04:26.523Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `4`
- Record: `archive`

## Goal objective

> Track only the work requested in this conversation: build and test bounded GNOME multi\-window tools for stable window IDs, verified activation, placement/tiling, and multi\-window layouts, with fresh single\-use preview tokens and no unsafe Shell evaluation, blind hotkeys, or security bypasses\. Obtain separate explicit approval before installing or enabling the GNOME compositor bridge or restarting services\. Then remake this repository's README demo from genuine simultaneous footage of a clean OpenCode session beside the applications it controls, using the inspected official OpenCode demo's deliberate zooms, transitions, and readable pacing\. Use sample email and signed\-out public browsing only; do not send mail, purchase, or publish\. Present a short composition/motion preview for approval before replacing the main demo\. Update the relevant canonical desktop and README/GIF skills and documentation, preserve this repo's branding, and keep the human\-facing root README under 170 physical lines\. Verify real outcomes and distinguish source tests from live acceptance\. Preserve unrelated dirty work and exclude work from other sessions/windows, including their handoff, goal\-docs, orchestration, and configuration changes\. Do not commit or push without separate explicit approval\.

## Persisted plan

Plan revision: `4` · updated 2026-10-27T07:27:08.000Z

> Add reliable, approval\-gated multi\-window control, then produce a polished real OpenCode\-plus\-app demo and update the relevant skills and short README\. Exclude unrelated work from other windows/sessions\.

### Completion criteria

- Typed desktop tools identify current\-workspace windows unambiguously and support verified focus, placement/tiling, and bounded multi\-window layouts through a reviewed GNOME bridge, with fresh single\-use previews, explicit permission checks, protected\-state refusals, and meaningful tests\.
- No GNOME bridge installation/activation, permission change, or service restart occurs without separate explicit user approval; live focus and geometry are verified on the approved disposable demo windows before relying on the tools\.
- The replacement demo shows a real clean OpenCode window alongside the real applications it controls, recorded simultaneously without fabricated chat/tool calls, using deliberate zooms, transitions, and readable pacing informed by the inspected OpenCode reference\.
- The user approves a short composition/motion preview before the main README demo is replaced; the final GIF decodes correctly, loops, shows completed useful actions, and has a non\-animated alternative and honest sample\-data/editing disclosures\.
- Relevant canonical skills, catalog entries, and focused documentation reflect the new tooling and demo requirements; the branded human\-facing root README remains under 170 physical lines and its links/assets are verified\.
- Source tests, real desktop acceptance, and desktop/narrow light/dark README checks are documented accurately\. Unrelated dirty work is preserved, other\-session work is not tracked or altered, and nothing is committed, pushed, or published without separate approval\.

### Phase `scope-reference` — completed

> Establish this window's scope, actual reference style, and the window\-control limitation\.

**Verification:**

> Read\-only environment/API inspection and actual screenshots verified the limitation\. User rejected the app\-only GIF and explicitly required the OpenCode window plus zooms/transitions\. No compositor bridge has been installed or enabled\.

- **`scope-confirmed` · completed:**
  > Confirm that this goal tracks only this conversation's window tooling, demo, skills, and README work, excluding other\-session changes\.
  - Evidence:
    > The user explicitly requested a new goal and said to track only this window\. Existing dirty changes were inspected and preserved\.
- **`reference-inspected` · completed:**
  > Inspect the actual official OpenCode animated demo rather than inferring motion from its README screenshot\.
  - Evidence:
    > Downloaded and decoded anomalyco/opencode commit 5f8ee0f5074f99a8b5d5cafb94126f879a274b50's opencode\-min\.mp4: 36\.534 seconds, 1920x1080\. Contact sheets show wide context, prompt/tool\-output push\-ins, result emphasis, and pull\-backs\. References are retained under Downloads/opencode\-demo\-reference\-wa3uk332\.
- **`window-gap-verified` · completed:**
  > Verify the native window\-control gap and obtain authority for source implementation without enabling integrations\.
  - Evidence:
    > GNOME Shell 50\.1; org\.gnome\.Shell\.Introspect\.GetWindows returned AccessDenied\. Existing AT\-SPI frame bounds did not reflect global placement; hotkeys tiled the wrong window\. Installed tiling\-assistant exposes no D\-Bus window\-control API\. User selected Build window tools, with separate installation/activation approval\.

### Phase `window-source` — completed

> Implement bounded, tested window\-control source without changing desktop permissions\.

**Verification:**

> 45 plugin, 4 client, 5 deployment tests pass; JS syntax, scoped links/skill structure, git diff \-\-check pass\. Normal\-PATH health check passes on v2\.1\.1\. Actual desktop\_windows returns bridge\-unavailable\. Evidence and requirement checklist: docs/demo/window\-control\-verification\.md\. No live acceptance claimed\.

- **`window-design` · completed:**
  > Define the minimal window bridge and typed tool contracts: stable compositor IDs, current\-workspace state, focus/place/tile/layout, one\-use fresh previews, readback, and failure/partial\-apply reporting\.
  - Evidence:
    > Canonical tools/gnome\-window\-control/\{metadata\.json,policy\.mjs,extension\.js\} specify current\-workspace compositor IDs, focus/place/tile/layout, logical work\-area coordinates, single\-use 30\-second previews bound to identity/focus/monitor state, protected/modal/lock refusals, and partial\-result reporting\. Nine policy tests pass\. Read\-only Mutter\-18 ABI inspection verified GNOME 50's parameterless maximize/unmaximize and get\_maximize\_flags APIs; JS syntax check passes\. Extension is not installed or live\-accepted\.
- **`window-implementation` · completed:**
  > Implement the canonical GNOME bridge, bounded client adapter, and OpenCode typed window tools while preserving existing desktop tools and unrelated dirty code\.
  - Evidence:
    > Canonical GNOME 50 extension/policy, fixed\-method Python client, three typed permission\-gated tools, and plugin registration implemented\. Reviewed installed Mutter 18 method signatures\. Readback rejects minimized/fullscreen/protected placement states; partial failures include observations\. No installation/activation performed\.
- **`window-tests` · completed:**
  > Add and run tests for identity, ambiguity, bounds and layout validation, stale/expired/replayed tokens, permission denial, lock/protected states, partial failure, and verified readback\.
  - Evidence:
    > 45 plugin tests passed, including exact IDs/bounds/layouts, stale/expired/replayed tokens, independent permission gates, lock/modal/protected refusals, partial outcomes, and three canonical\-extension tests with mocked GJS/compositor boundaries\. Four client and five deployment tests passed\. JS syntax and whitespace checks pass\. Mocked tests are not live acceptance\.
- **`window-deployment-source` · completed:**
  > Provide reviewed dry\-run\-first deployment and rollback instructions/tooling that preserve unrelated files and do not auto\-enable the extension or restart services\.
  - Evidence:
    > Explicit\-target dry\-run produced three\-file SHA\-256 manifest for /home/james/\.local/share/gnome\-shell/extensions/opencode\-window\-control@computer\-use\.local with no existing files/marker\. Deployer tests verify preservation, backups, idempotence, symlink refusal, and mandatory destination\. Bridge guide documents local\-bus capability, rollback, GNOME 50 login constraint, separate install/enable/restart gates\.

### Phase `window-live` — blocked

> Obtain explicit activation approval and verify real multi\-window behavior\.

**Blocker:**

> Bridge files are installed and verified but undiscovered by the current Shell session; fresh desktop login and activation authority are required before real focus/layout acceptance\.

- **`activation-approval` · blocked:**
  > Present exact source/deployment manifest, target path, new local\-session window\-control capability, risks, and rollback; ask immediately before installation/enablement and any required restart\.
  - Evidence:
    > Installation\-only approval executed at the reviewed explicit target\. Independent SHA\-256 readback matches all three canonical files and ownership marker; second dry\-run reports changes: \[\]\. Exactly four entries installed\. No enablement, service restart, or logout occurred\.
  - Blocker:
    > Running GNOME registry reports the UUID does not exist despite verified installed files\. GNOME 50 cannot ReloadExtension; fresh desktop login is needed for discovery\. User selected installation only, so activation/restart authority is not established\. Do not repeat routine confirmation prompts or act beyond that approval\.
- **`live-window-acceptance` · pending:**
  > On approved disposable demo windows, verify stable IDs, correct activation, side\-by\-side placement, global geometry/readback, stale\-token refusal, and preservation of unrelated windows\.

### Phase `demo-preview` — pending

> Record a genuine OpenCode\-plus\-app composition and obtain preview approval\.

- **`clean-demo-stage` · pending:**
  > Stage one clean public demo execution with OpenCode visible beside signed\-out browsing or an isolated real sample mailbox; exclude private history and unrelated windows\.
- **`simultaneous-capture` · pending:**
  > Record prompt, real tool activity, visible app actions, and completed results on one synchronized capture timeline, preserving source footage and action evidence in approved locations\.
- **`motion-preview` · pending:**
  > Produce and show a short wide\-to\-prompt/tool zoom\-to\-app\-result preview with smooth transitions and readable text; obtain user approval before replacing the main demo\.

### Phase `demo-final` — pending

> Produce and verify the approved cinematic computer\-use demo\.

- **`final-edit` · pending:**
  > Complete the approved feature cut with real email/browser task results, controlled zooms/transitions, honest timing/sample disclosures, versioned GIFs, still alternative, and recording evidence\.
- **`final-media-checks` · pending:**
  > Decode the final GIFs, verify durations/dimensions/loop and completed scenes, inspect full playback and the loop seam, and preserve source/evidence without automatic cleanup\.

### Phase `docs-acceptance` — pending

> Update only this task's canonical skills/docs and verify the short README\.

- **`skills-docs` · pending:**
  > Update desktop\-control and README/GIF skills and their focused references/catalog as needed, making real simultaneous OpenCode visibility and polished motion mandatory for this demo\.
- **`readme-update` · pending:**
  > Embed the approved demo while preserving branding and setup prompt, keeping the human\-facing README under 170 physical lines and linking to operational detail\.
- **`final-audit` · pending:**
  > Run scoped source and health checks, validate links/asset metadata and line count, review desktop/narrow light/dark rendering, and audit that unrelated work and other\-session tasks remain untouched\.

### Decisions

- Only this conversation's work is in scope\. Do not incorporate unrelated handoff, goal\-docs, orchestration, global configuration, or other\-window work\.
- The old CLI prototype and app\-only GIFs are preserved but rejected as the target design; do not mark them as completion of the new demo\.
- User authorized a clean public demo session and source implementation of window tools, but has not authorized compositor bridge installation/enablement or service restart\.
- Do not use unsafe GNOME Shell evaluation, bypass AccessDenied, disable sandboxing, or substitute blind keyboard tiling for verified window control\.
- Existing real email/browser frame sets survive in Downloads; original temporary MP4s became unavailable after the prior service restart\. A simultaneous OpenCode/app recording must be newly captured, not fabricated by placing unrelated old UI footage beside app clips\.
- Keep all save locations within approved folders, preserve user work and rejected drafts, and maintain separate gates for installation/enablement, preview acceptance, commit, push, and publication\.
- Canonical desktop\-control and readme\-gif bundle/catalog were tightened: require verified window layouts and simultaneous real OpenCode/app footage with deliberate zooms/transitions and short\-preview approval\. App\-only drafts are now explicitly labelled rejected in demo docs\. Scoped links/structure pass; final skill/docs acceptance remains in docs\-acceptance after media work\.
- User objected to repeated handholding and selected installation only with no further prompts\. Do not re\-ask routine checks or installation already approved\. Broader approval should have been offered, but do not reinterpret installation\-only selection as permission to enable, restart, or log out\. Installed reviewed bundle; current Shell registry has not discovered it\.

