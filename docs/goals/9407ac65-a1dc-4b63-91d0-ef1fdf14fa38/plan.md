# Plan — `9407ac65-a1dc-4b63-91d0-ef1fdf14fa38`

- Goal ID: `9407ac65-a1dc-4b63-91d0-ef1fdf14fa38`
- Source session ID: `ses_e7bc63eaeffeOdexMk6GFp6VE7`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-29T03:38:21.943Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `complete`
- Plan revision: `7`
- Record: `current`

## Goal objective

> Make the existing ChatGPT connector work end\-to\-end from ordinary chat: a natural\-language image request uses the user's existing OpenAI OAuth connection to generate a real ChatGPT image and brings the actual image back as a viewable attachment in the same chat, not merely a file path, link, base64 text, or mock\. Preserve existing chat/search, settings, unrelated work, and the CPU/RAM monitor\. Use supported OpenCode plugin/tool APIs only; never modify the OpenCode binary or core, weaken permissions, or enable the known unsafe image\-save path\. Resolve and verify the output\-directory rename regression before enabling the image\-saving route\. Include discoverable, source\-maintained guidance for generating and using these images\. The sole final product acceptance gate is verified live chat\-to\-generation\-to\-in\-chat\-image operation; passing source tests or configuration checks alone never closes the goal\. Open Rig remains read\-only reference material: no clone, install, or wholesale import\. Execution waits for explicit implementation approval in Build mode\.

## Persisted plan

Plan revision: `7` · updated 2026-10-29T03:38:05.000Z

> Finish safe image generation and native image delivery through the existing ChatGPT plugin, add narrowly scoped image\-use/generation guidance, and close only after a real image requested in this chat is generated and visibly available here\. Planning is complete; execution remains paused in Plan mode\. Source checks and unit tests are supporting work, never substitutes for the single live product acceptance gate\.

### Completion criteria

- In this same chat, a normal\-language image request successfully invokes the active ChatGPT connector using the existing OpenAI OAuth connection, generates a real image, and returns the actual validated image as a viewable in\-chat attachment that is inspected for correspondence to the request; existing chat/search remain operational\. A saved path, external link, base64 text, mock, backend\-only response, passing tests, or a configured tool does not satisfy this gate\. If account access or this client's image delivery/rendering prevents the full workflow, the gate stays unmet and the limitation is reported rather than silently narrowing acceptance\.

### Phase `contract` — completed

> Establish the smallest supported plugin\-only path from a chat request to a native image attachment, preserving the actual working tree and runtime identity\.

**Verification:**

> Active source/config identity verified read\-only\. Native file content was returned through this chat's Code Mode and rendered as an inspectable image\. Existing image request contract is mapped, with live account support explicitly unproven\.

- **`inspect-source-and-skills` · completed:**
  > Inspect the present image backend, disabled registration, output safety regression, native attachment pattern, and available image skills\.
  - Evidence:
    > Read backend\.ts generateImage, effect\-tools\.ts, mcp\.ts image result handling, output\.ts, output\.test\.ts, and direct/server\.ts\. Image is filtered out, the rename regression is skipped, and the handler returns text paths\. Installed Tool\.FileContent supports uri/mime/name; local capture\-tool\.ts and browser\-tools\.ts return PNG file content and warn that structured output can drop attachments\. Local skill search found no ChatGPT generator\. GitHub read\-only trees were not truncated: Open Rig main 5684045d has 16 skill files and migration b17182cd has 20, with no dedicated image\-generator skill path\. Git status shows extensive existing dirty/untracked work, including both connector packages\.
- **`verify-runtime-and-client-contract` · completed:**
  > At Build start recheck Git/source ownership and effective plugin/config identity; prove the actual current client and Code Mode route can carry and expose a small synthetic PNG attachment using supported APIs\. Inspect pixels/client presentation, not only serialized schemas; record an early blocker if this cannot work without forbidden core changes\.
  - Evidence:
    > Fresh scoped Git status preserved dirty/untracked source\. opencode debug config resolves the pilot profile and canonical skill root; /api/plugin reports chatgpt\.direct active at this checkout's tools/chatgpt\-direct/server\.ts\. A temporary static probe returned a 512x384 native PNG through tools\.chatgpt\_probe\.png in Code Mode, and its red/green/blue vertical bands were visually inspected in this conversation\. Probe source was removed afterward; no generation quota or core changes\.
- **`confirm-image-backend-contract` · completed:**
  > Review the existing ChatGPT OAuth image endpoint and fixed image\-model request against supported evidence; define bounded image response/error handling without changing accounts, adding API\-key billing, or speculative repeated paid generations\. Live entitlement/model support remains unproven until final acceptance\.
  - Evidence:
    > Inspected backend\.ts and backend\.test\.ts: existing OAuth image route posts a fixed gpt\-image\-2 request, reads bounded JSON/base64, and has fake\-backed contract coverage\. This is an account\-dependent backend route, not proof of current entitlement; no live image request has been made\. Error handling will retain only bounded allowlisted diagnostics, and final acceptance must verify endpoint/model support\.

### Phase `safe-generation` — completed

> Enable no image\-saving route until its safety regression is resolved, and retain Effect\-native permissions, cancellation, and session isolation\.

**Verification:**

> 97 connector tests pass with the previously skipped safety case enabled; npm run typecheck:host passes against the installed host SDK using a checked\-in reproducible config\. Boundary audit added missing decode\-bomb/undecodable\-IDAT and replacement\-preservation cases; no distinct tests were removed or weakened\. Image exposure remains off\.

- **`repair-output-directory-race` · completed:**
  > Fix the directory\-rename/replacement failure in output\.ts, retaining no\-follow descriptor traversal, exact\-path authorization, private exclusive files, validation, and request\-owned cleanup\. Unskip the known regression and add deterministic parent/output rename or replacement cases around authorization and writing\. Do not treat a realpath check alone as proof of an atomic race guarantee\.
  - Evidence:
    > Unskipped the rename regression and added real filesystem cases for parent/project moves, replacement directories, moves during writing, exact planned\-name collisions, cancelled writes, and replacement\-file preservation\. The original source failed all four initial rename/move tests before the fix; all now pass\. Directory bindings are reopened no\-follow and dev/ino compared before writes and before success, with request\-owned cleanup\. Checkpoints detect moves; they are not claimed as an atomic guarantee against hostile concurrent renames\.
- **`wire-effect-image-tool` · completed:**
  > Wire generate\_image through effect\-tools\.ts and chatgpt\-direct/server\.ts with service permission and exact output edit permissions evaluated inside the call's Effect\. Propagate denial, interrupt pending permissions/network/save work, recheck invoking\-session location, and prevent late images or unauthorized leftovers on cancellation/unload\.
  - Evidence:
    > New image\-tool\.ts is called by effect\-tools\.ts behind explicit enableImages; direct/server\.ts wires the images option but the active unconfigured profile still leaves it off\. Service and three exact edit\-path permissions run in the tool fiber before generation\. The saver observes the call signal, checks session location, waits for cancellation cleanup, and returns no late attachment on unload\.
- **`cover-generation-failures` · completed:**
  > Cover successful image decoding plus malformed/oversized data, account or model rejection, timeout, rate limits, denied permission, session moves, concurrent calls, and partial\-save cleanup\. Preserve chat/search behavior and avoid credential/prompt/image\-byte leakage in diagnostics\.
  - Evidence:
    > npm run check: 97 pass, 0 fail, 0 skipped\. Includes permission denial/pending interruption, backend abort, save cleanup drainage, session moves, unload, concurrent output, malformed PNG/zlib/decode bounds, spoofed save paths/receipts, HTTP status/allowlisted\-code redaction, bounded error streams, and no automatic image retries\. Images get a bounded 180\-second deadline; existing chat deadlines remain 45 seconds\.

### Phase `chat-delivery` — completed

> Bring the real image into the same conversation through native image content rather than a text\-only save report\.

**Verification:**

> Native attachment content is preserved through the implemented Effect branch, source tests verify saved/attached identity, and this client's Code Mode PNG rendering was visually demonstrated with a synthetic image\. Live account\-image acceptance is still explicitly outstanding\.

- **`return-native-image-content` · completed:**
  > Preserve validated image bytes/metadata through mcp\.ts and the Effect adapter; return native Tool\.FileContent with image/png and a bounded image URI plus concise text, following the existing local attachment pattern\. Do not flatten file parts into text or use structured output that masks them\. Ensure any saved file and attached image identify the same generated result\.
  - Evidence:
    > The Effect image branch validates RPC output and PNG bytes, safely saves those bytes under its preauthorized unique name, checks the receipt, and returns native text\+image/png FileContent without structured output or text flattening\. Tests compare attached base64 and on\-disk bytes and verify output is absent\. SHA\-256 metadata identifies the exact image\.
- **`verify-attachment-roundtrip` · completed:**
  > Add regression coverage for file\-part retention through tool results, Code Mode delivery, and the current client/session history\. Verify that the attachment is actually viewable and inspectable here; a text path, external browser page, or schema\-only test is not an equivalent fallback\.
  - Evidence:
    > New effect\-image\.test\.ts exercises the active adapter's image branch with fake network and real files; it checks PNG MIME/URI/name, exact bytes, permission provenance, and no attachment on failures\. The earlier real Code Mode native\-PNG probe rendered in this same client\. Real ChatGPT generation through this exact connector remains the final acceptance task, not claimed from these fixtures\.

### Phase `guidance-and-regressions` — completed

> Make ordinary image requests route correctly and verify the integrated implementation without claiming live acceptance from source tests\.

**Verification:**

> The new skill is live\-discovered and loaded, all targeted code and skill checks pass, and health passes\. One broad inventory check still flags a separate worker's native\-row\.worker\.patch; it is preserved and not treated as an image regression\. Docs do not claim real image generation\.

- **`author-image-workflow-skill` · completed:**
  > Proposed new bundle: \.opencode/skills/chatgpt\-images/SKILL\.md and README\.md\. Teach prompt\-to\-generation\-to\-attachment, inspecting the returned image, using the generated asset, permissions/allowance/cancellation, unsupported edits/reference\-image operations, and truthful error reporting\. Reuse files\-and\-documents for ordinary image reading and desktop\-vision only for screen capture; update the existing source catalog and verify discovery without wholesale upstream imports\.
  - Evidence:
    > Added canonical chatgpt\-images/SKILL\.md and README\.md, and additive catalog/feature entries\. The live /api/skill reports the exact source path, and functions\.skill loaded chatgpt\-images in this chat\. Guidance covers native attachment delivery, pixel inspection, quota/cancellation, unsupported edits, safe use of assets, and no fake/path\-only acceptance\. Catalog count is 31: an already\-existing self\-learning bundle was missing its metadata row; only its index entry was reconciled, not its source\.
- **`run-checks-and-document` · completed:**
  > Run connector package\-owned npm run check, reproducible typechecks against the installed host declarations, relevant attachment/plugin regressions, skill/catalog checks, git diff \-\-check, and the harness health check where integration changes require it\. Review test quality at the integration boundary\. Update source docs/features with separate source, deployed, and observed status; preserve unrelated work\.
  - Evidence:
    > Connector npm run check: 97/97 pass, zero skips\. Direct npm run typecheck:host passes; health\-check\.sh passes with v2\.1\.1, service/plugins, both MCPs and skill source\. Skill/feature contracts: 13/14 pass; the sole failure is unrelated pre\-existing tools/opencode\-native\-row/native\-row\.worker\.patch missing from inventory\. All skill metadata/portability/link checks pass\. Scoped git diff \-\-check passes\. Updated owning connector/direct guides and features; explicitly separated source, synthetic rendering and pending real image acceptance\.

### Phase `live-acceptance` — completed

> Satisfy the single final product gate with a real ChatGPT image generated from this chat and actually brought into this chat\.

**Verification:**

> The sole final product gate passed through the actual chat tool, not a mock, path\-only report, external viewer or Read\-tool substitute\. The image rendered in the generation result and matched the prompt; saved bytes/hash/mode were independently verified\. Final npm run check: 97 pass, 0 fail, 0 skips; host SDK check and whitespace checks pass\. /api/plugin remains active at the canonical source and the refreshed chat catalog exposes all three tools\. Owning docs/features now record real acceptance; the separate pre\-existing native\-row\.worker\.patch inventory failure remains disclosed and untouched\.

- **`activate-targeted-image-capability` · completed:**
  > With applicable implementation/activation authority, enable only the verified source changes in the intended runtime, preserving existing plugin entries and rollback\. Verify a fresh chat tool snapshot exposes image generation and the skill; no shared restart, permission broadening, or binary/core change is implicit\.
  - Evidence:
    > The already\-active canonical direct plugin now enables its tested image branch unless images:false is explicitly configured\. The refreshed catalog in this same chat exposes tools\.chatgpt\_direct\.generate\_image alongside chat and web\_search; chatgpt\-images was loaded through the native skill tool\. Host SDK typecheck passes after activation; no deployed config, security rule, account, shared restart or binary was changed\. Eighteen changed/added source/test/guide files, including untracked files, pass whitespace checks\.
- **`prove-chat-generation-and-delivery` · completed:**
  > Run one approved real image\-generation acceptance request from this chat using the existing OAuth account\. Verify successful backend generation, validated bytes/safe save, actual attachment delivery in this conversation, and visible/inspectable correspondence to the prompt; smoke\-test existing chat/search\. Record the prompt, tool/result evidence and image identity without secrets\. Close only when the complete live workflow passes; account/quota/client failures remain explicit blockers, not a reason to accept tests alone\.
  - Evidence:
    > Exactly one real tools\.chatgpt\_direct\.generate\_image request in this conversation asked for a watercolor red\-and\-white lighthouse on a rocky island at sunset\. Existing OAuth returned an actual native PNG attachment through Code Mode; visually inspected here: striped lighthouse, rocky island, blue sea, orange sunset, no lettering/border\. Saved assets/generated/generated\-38a95ec83c7a79b6684cc87e26208cfe\.png: 1536x1024, 3,071,997 bytes, regular file, mode 0600; independent readback SHA\-256 412f1d7e7009e9b2d55a69f398f5e2af046a03b683eae09cefd25d6eb191bf97 matches the tool receipt\. Fresh chat returned connector online; fresh web\_search returned sourced results\. No retry/new account/billing/core modification\.

### Decisions

- One final product completion criterion: a real chat request produces a real ChatGPT image that is actually brought back into the same chat\. Safety, tests, documentation, and skills are implementation obligations, not alternative ways to declare success\.
- Use existing ChatGPT OAuth and supported plugin/tool APIs only\. Preserve working chat/search, CPU/RAM monitor, settings, and unrelated dirty/staged/untracked work\. No OpenCode binary/core changes, permissions bypass, new API\-key billing, commit, or push authority is inferred\.
- Image saving stays disabled until the directory\-rename regression is fixed and exercised\. Open Rig's safety code is reference material, not proof that its checks remove every TOCTOU race\.
- Use native PNG file content, following the local desktop/browser attachment pattern\. Verify the actual Code Mode and client presentation early; never downgrade the required image to a path or link without explicit scope change\.
- No dedicated ChatGPT image\-generation skill is exposed in this chat or found in the inspected local/Open Rig skill catalogs\. Plan one focused source\-maintained generation/use skill rather than unrelated image\-editing or asset\-pipeline expansion\.
- Open Rig access remains read\-only: no clone, install, downloaded source bundle, or wholesale import\. This request creates a paused goal and persisted goal plan, not implementation approval, activation approval, or a live account\-generation request\.
- No token, duration, or auto\-turn limit was requested, so none is set\. No standalone plan file is requested or written by this planning action\.
- 2026\-10\-29: User switched to Build and explicitly requested resume and implementation\. Active server plugin and effective config both resolve chatgpt\.direct to this checkout\. A temporary, static, no\-network/no\-filesystem attachment\-probe plugin is used to test native PNG delivery before any image\-generation allowance; it will be removed after verification\.
- Authorize exact output directories and a preallocated unique filename inside the tool's Effect before contacting the image backend\. The async saver then revalidates those already\-authorized paths and observes the call AbortSignal; it must not start detached permission assertions\.
- Active direct image generation has its own Effect\-native branch rather than flattening the legacy text\-only MCP image handler\. The legacy adapter remains unchanged for compatibility\. Image activation is held until source/host checks and guidance are complete\.
- User's explicit request to resume and implement this end\-to\-end goal is being applied to its named image activation and single real acceptance request\. Only the already\-active canonical direct plugin is updated; no deployed config, accounts, billing, security rules, shared service restart, commits or pushes are changed\. Native tool permissions remain effective\. If a request's completion is uncertain, it will not be automatically repeated\.
- Final audit: ordinary chat successfully generated and received an actual ChatGPT image in this same conversation\. One image generation was used; chat/search remain live\. The new image skill is discoverable/loadable\. No commit/push, upstream download/import, deployed\-config edit, permission/account/billing change, OpenCode binary/core patch, or agent\-initiated shared service restart occurred\. Source packages and the generated image remain uncommitted/untracked as observed\.

