# Plan — `1db89531-6b9a-4205-a310-e18320834cfe`

- Goal ID: `1db89531-6b9a-4205-a310-e18320834cfe`
- Source session ID: `ses_e7bc63eaeffeOdexMk6GFp6VE7`
- Source directory: `/home/james/repos/computer-use`
- Exported at: `2026-10-28T23:15:02.939Z`
- Repository identity: `github.com/jtmb/computer-use`
- Worktree identity: `main`
- Relative scope: `.`
- Repository metadata status: `git`
- Repository metadata gaps: `none`
- Status: `unmet`
- Plan revision: `11`
- Record: `archive`

## Goal objective

> Get the CPU/RAM resource monitor and ChatGPT connector working and verified in this OpenCode chat, preserving existing settings and respecting the user's no\-subprocess, no\-sign\-in, and no\-real\-ChatGPT\-message constraints; perform live activation only with the required explicit authority\.

## Persisted plan

Plan revision: `11` · updated 2026-10-28T22:54:30.000Z

> Determine and implement the smallest safe path to make the monitor and connector usable in this chat without subprocesses, then perform only explicitly authorized, additive live activation and verify actual behavior\.

### Completion criteria

- The CPU/RAM monitor is demonstrably loaded in this chat and produces valid CPU and memory observations while respecting the user's subprocess restriction\.
- The ChatGPT connector is demonstrably available to this chat and passes an appropriate signed\-out, non\-message verification without accessing credentials or sending real requests\.
- Existing settings and unrelated work are preserved; any live runtime/configuration changes have the required explicit authorization and do not restart shared services without separate approval\.
- Relevant implementation and regression checks are verified, and documentation clearly distinguishes source, isolated, and actual live results\.

### Phase `investigate` — completed

> Establish current source, runtime, ownership, authority, and a feasible no\-subprocess route before changes\.

**Verification:**

> Source, bounded process restriction, documented Linux unit interfaces, exact SDK declaration differences, and live activation/verification gates have been reviewed\. No runtime, credentials, configuration, or shared services were changed\.

- **`baseline` · completed:**
  > Inspect relevant source, existing changes, ownership, current integration and prior evidence without starting subprocesses\.
  - Evidence:
    > Read both package manifests, the monitor's src/proc\.ts and src/tui\.tsx, connector src/server\.ts/src/mcp\.ts and existing tests\. Previous scoped status showed both package trees untracked; the delivery worktree registry confines its writers to that separate worktree\. Earlier live checks found neither plugin active, and ChatGPT's pinned\-runtime preflight failed\.
- **`design` · completed:**
  > Evaluate supported no\-subprocess loading, signed\-out connector verification, safe runtime/configuration preview and exact authority gates; choose the smallest evidence\-based approach\.
  - Evidence:
    > Linux proc\_pid\_auxv\(5\), elf\(5\), getauxval\(3\), and proc\_pid\_stat\(5\) describe the required units and ELF layout; a 13\-case confined in\-memory arithmetic prototype passed, not repository code or a live proc read\. OpenCode's documented in\-process tools exist; the connector's pinned plugin 2\.0\.7 declarations lack context\.signal and permission\.assert, both present in the installed 2\.1\.1 declarations, so preserving cancellation and permission requires an explicit compatibility gate\. Existing local MCP requires a separate process\.

### Phase `implement` — blocked

> Prepare the minimal compatible source and verification path without modifying live settings or starting subprocesses\.

**Blocker:**

> The monitor's descendant traversal can miss children and needs a bounded accuracy fix and honest limitations; the connector cannot yet preserve pending\-permission cancellation; and no permitted in\-process runner for current source checks has been identified\.

- **`monitor` · blocked:**
  > Implement and document a safe no\-subprocess monitor path if required and feasible, with meaningful regression coverage\.
  - Blocker:
    > The current tree can undercount processes spawned by non\-leader threads, and unsynchronized proc child lists are not reliable snapshots\. A bounded, accurately documented traversal and meaningful tests are needed\. Scoped Git status/diff and execution of the changed tests cannot currently be performed with an identified no\-subprocess route\.
- **`connector` · blocked:**
  > Implement or identify a supported no\-subprocess, signed\-out connector path if feasible, with meaningful regression coverage\.
  - Evidence:
    > Prepared default\-off direct chat/search in src/in\-process\-tools\.ts and src/server\.ts with session identity, native permission requests, backend cancellation checks and lifecycle cleanup; direct mode does not register legacy RPC\. Image registration remains disabled\. Additional source review: Permission\.assert interruption deletes the pending request without publishing permission\.replied; the Solid client removes cached prompts on that event, and execution interruption does not refresh permissions\. A reject reply publishes an event but also rejects other pending requests in the session\. No updated tests or typechecks have run\.
  - Blocker:
    > The 2\.1\.1 Promise adapter does not pass tool cancellation to permission\.assert\. Effect interruption alone may leave a stale TUI prompt, while rejecting to clean up can reject unrelated session permissions\. The package is pinned to plugin 2\.0\.7; no selective end\-to\-end fix has been verified\. Keep experimental direct mode off\.
- **`verify-source` · blocked:**
  > Run permitted behavior\-relevant checks and independently review source and documentation; record any verification that cannot run under the restriction\.
  - Evidence:
    > Reviewed monitor proc/ELF/auxv code, TUI setup, representative fixtures and direct connector permission, cancellation, lifecycle, output and server tests\. Earlier 17 monitor tests, 45 connector tests and isolated rendering predate the latest edits; the 13\-case auxv arithmetic prototype did not execute repository code\. The exposed desktop apps/tree/find tools use Python execFile per request, and windows uses execFile too; the capture bridge may spawn a Python daemon, so none is a guaranteed no\-subprocess verification route\.
  - Blocker:
    > No supported in\-process TypeScript test/typecheck runner or no\-subprocess TUI observation has been identified\. Current source tests, typechecks and real live\-proc/TUI verification remain unrun\.

### Phase `live` — blocked

> Perform authorized additive activation and verify both integrations in this specific chat\.

**Blocker:**

> Verified compatible source, an exact target and selective rollback, and separate activation authority are required\. If the candidate TUI config is active, adding the monitor would reinitialize voice\-assistant and may spawn its audio worker, conflicting with the no\-subprocess constraint\.

- **`preview` · blocked:**
  > Prepare and inspect exact additive configuration/runtime changes and rollback, preserving existing entries and respecting path and activation gates\.
  - Evidence:
    > After the reported restart, the candidate /home/james/\.opencode\-v2\-pilot/config/cli\.json has goal, goal\-docs with selected\-session options, and voice\-assistant entries\. In inspected OpenCode 2\.1\.1 source, membership changes deactivate and reactivate the generation\. voice\-assistant/src/tui\.tsx constructs AudioWorker at setup and src/worker\.ts starts scripts/audio\-worker\.sh with spawn, regardless of its enabled preference; cleanup closes the worker\. No config was changed\. Future rollback must remove only the monitor addition after re\-reading current state\.
  - Blocker:
    > The effective TUI config identity and active plugin set are unconfirmed\. If this candidate is active, adding the monitor causes voice\-assistant reinitialization and can spawn a subprocess, violating the explicit restriction; it also disrupts audio\. Updated source and a compatible activation/reload path need verification, followed by separate exact activation authority\.
- **`activate` · blocked:**
  > Only with the required exact authority and a compatible no\-subprocess route, apply minimal live changes without sign\-in, real ChatGPT requests or shared restart\.
  - Blocker:
    > Neither updated integration has passed current verification, the direct connector has a pending\-approval cancellation defect, and separate exact live activation authority has not been established\. Shared restart is not authorized\.
- **`verify-live` · blocked:**
  > Verify actual CPU/RAM output and signed\-out connector availability in this chat, then audit the complete goal against concrete evidence\.
  - Evidence:
    > After the reported restart, exact Code Mode namespace lookups for chatgpt\_direct and chatgpt returned no tools\. Source inspection indicates a whitespace\-only chat prompt is rejected by parseToolInput in in\-process\-tools\.ts before session resolution, permission checks, credential resolution or backend dispatch; this is only a proposed non\-message probe, not an executed or verified live test\.
  - Blocker:
    > No verified, authorized activation occurred; the monitor has not been observed in the TUI and connector namespaces are absent\. Any future invalid\-input probe requires the actual loaded version and rejection\-before\-credential behavior to be verified first\.

### Decisions

- No goal token, time, or auto\-turn budget was requested\.
- Do not launch subprocesses, send real ChatGPT messages, sign in, or infer live deployment authority from peer advice\.
- Contact the named coordinator only if useful guidance is needed and an authorized direct non\-subprocess interface is available\.
- Read ELF class/endianness from /proc/self/exe and only required AT\_PAGESZ/AT\_CLKTCK values from a bounded /proc/self/auxv; fail closed without recording auxiliary\-vector contents\. The earlier arithmetic test is a prototype only\.
- An in\-process ChatGPT route must preserve session identity, native permissions and cancellation; installed 2\.0\.7 connector declarations lack the 2\.1\.1 APIs, so do not treat registration alone as safe compatibility\.
- Linux kernel /proc auxv is kernel\-word\-sized; 32\-bit executable layouts on a 64\-bit kernel are documented as potentially unavailable rather than guessed\. Synthetic mismatch cases were added but are not yet run\.
- The 2\.1\.1 Promise adapter passes tool cancellation signals but starts permission\.assert without forwarding one; a cancelled pending prompt may remain\. Do not enable the experimental direct connector on this evidence; an Effect\-native interruption path is a candidate, not a verified fix\.
- Keep direct generate\_image unregistered: descriptor\-relative output can follow a directory moved during path authorization\. The explicit rename\-race regression is skipped and must not be counted as a pass\.
- A candidate monitor entry is additive in JSON but not necessarily inert: the inspected 2\.1\.1 TUI reconciler can reinitialize existing plugins after membership changes\. Confirm the effective target and impact before any separate live\-activation approval; never replace or restore the whole config over intervening changes\.
- OpenCode 2\.1\.1 source review suggests Effect interruption alone is not end\-to\-end permission cleanup: assert removes the server entry without a replied event, the TUI caches permission requests, and reject replies cascade to other requests in the same session\. Do not manufacture approval/rejection or claim a fix without a selective cleanup and real client verification\.
- The post\-restart candidate CLI configuration contains a voice\-assistant plugin in addition to the previously observed goal and goal\-docs entries\. Earlier two\-entry previews are stale; preserve all present settings and re\-read before any separately authorized change\.
- Treat candidate monitor activation as no\-subprocess\-incompatible if voice\-assistant is active: the inspected 2\.1\.1 structural reconciler reruns plugin setup, and voice\-assistant/src/worker\.ts spawns an audio worker on construction\. Do not disable or modify the unrelated voice plugin to work around this\.
- Reopen monitor source work: Linux documents /proc/&lt;pid&gt;/task/&lt;tid&gt;/children per thread and warns concurrent exits can omit children\. The current leader\-only read cannot justify an all\-descendants accuracy claim\. Preserve bounded traversal, avoid scanning unrelated processes or freezing them, and report unavoidable sampling limitations\.
- If a verified direct connector is eventually activated, a whitespace\-only chat prompt is a candidate non\-message probe: the current source rejects it before session lookup, permission, credential access or backend dispatch\. Confirm the loaded code and schema behavior before using it; catalog visibility alone does not prove signed\-out execution\.

