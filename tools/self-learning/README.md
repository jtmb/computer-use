# Self-learning source prototype

This optional project-local plugin is **active in this checkout as observed on
2026-11-01 UTC**. The named SDK blocker is cleared: `@opencode/client@2.1.1` is now
an exact runtime dependency, installed locally with lifecycle scripts disabled;
`@opencode/plugin@2.1.1` remains host-provided, not locally installed. The additive
`"./tools/self-learning"` project entry loaded without a shared-service restart.
Native inventory retains the desktop, memory and goal plugins as active.

At the recorded checkpoint, `catalog: true` returned34loaded entries after fixing display-name versus
native-ID handling, including the native `README` entry. Catalog IDs preserve ASCII
case; actual proposal targets still require the original lowercase-only slug.
No entry, permission check, deadline, byte limit or authoring-path guard was removed.
An initial two-session/one-message-per-session analysis completed through the installed
SDK: both latest messages were ineligible, so it returned no patterns or text.
This proves that bounded host path, not semantic learning, native cancellation,
denial handling or a reviewed full-bundle application/rollback. No test suite ran.
See [current operational evidence](ACCEPTANCE.md#operational-remediation--2026-11-01-utc).

A later two-session/eight-message scan processed two eligible messages, skipped
14 and returned nine lexical leads, with truncation disclosed. Both exact
references passed the live recheck. Parent review of the two selected messages
found broad technical summaries, not nine independent lessons; no skill change
was justified or applied. This adds real eligible-evidence and reference-path
acceptance, not native denial/cancellation or full-bundle application/rollback.

Two further ordinary project-evidence reviews used `3/8` then `4/16` session/message
limits. They reported respectively two eligible/16 skipped/one heuristically
sensitive message and six eligible/40 skipped/two heuristically sensitive messages,
with no patterns in either result. Both report session/message truncation; their
overlapping counters must not be added or treated as exhaustive project coverage.
No pattern references were returned, so no private source inspection or skill
proposal was manufactured. These were requested read-only analyses, not tests or
extra model calls. See the [scoped review](ACCEPTANCE.md#further-ordinary-project-review--2026-11-01).

**Later file-backed learning candidate — 2026-11-02.** Newer clipboard and
recovery-timeout evidence exposes the same fault-driver classification mistake.
The [bounded candidate](../../docs/fault-control-learning-candidate-2026-11-02.md)
proposes one addition to the existing testing reference, requiring the intended
assertion rather than accepting an error-code label. Preserved import failures
and a surviving fault remain negative controls. This is same-session file
evidence, not two independent native references or a native proposal preview;
confidence, exact text and validation limits are recorded. No skill is applied,
no task test is repeated, and exact application/rollback approval remains separate.

The failed2026-10-30 host trial (`err_c545d820`), its additive-entry removal and
byte-identical config restoration remain [historical evidence](ACCEPTANCE.md#actual-approved-host-trial--2026-10-30),
not the current dependency/activation state. The original and latest config backups
are preserved; rollback must remove only the current additive entry, never restore
an old whole file over intervening work.

**Bootstrap dependency inventory.**

[`bootstrap-dependencies.json`](bootstrap-dependencies.json) records the exact five
observed runtime package versions, their declared dependency edges and package-
manifest hashes. All five also have exact registry download URLs and SHA-512
declarations from the [existing retained lock](../session-coordination/package-lock.json),
whose full digest is recorded in the inventory. This references source metadata,
not another package's installed runtime; its root-specific peer flags are not
copied. `@opencode/plugin@2.1.1` stays host-provided; the client's optional
`solid-js` peer is not selected. These metadata hashes are not package-content or
tarball integrity proof, an npm lockfile, installation authority or a new test run.
The inventory is **not wired into `scripts/onboard.sh`**; ordinary onboarding does
not silently install or activate this optional project plugin. Future installer
wiring must verify actual archive bytes against the recorded integrity values,
validate host/peer resolution and complete its own verification.

It is outside automatic
plugin discovery. The installed OpenCode 2.1.1 server-plugin context exposes
`session.list`, `session.get`, and unbounded `session.context`, but not the
paginated `message.list` available on the documented HTTP/client API. The source
now attempts the official client's no-start `Service.discover` and refuses unless
the registered loopback service reports the hosting process ID and version and
the exact session metadata matches. Session-list and message requests use the
client adapter; each client response is bounded to 2 MiB;
redirects and non-loopback endpoints are rejected. Waiting on discovery and
response reads is bounded by the adapter's ten-second signal; the discovery API
does not support cancellation, so timing out does not prove its underlying work
stopped. Calls share one pending discovery rather than accumulating more while it
is stuck. The registered-tool scans and exact-reference reads observed on
2026-11-01 exercise this adapter in its real plugin host. Native denial/cancellation
and the other remaining gates are still unverified; do not substitute unbounded
history or treat the earlier load failure as the current dependency state.

`core.mjs` implements the read-only analysis contract. Its historical fixtures and
dated host observations are separate. It verifies the caller's project/location,
requests read permissions,
rechecks selected session identities around reads, refuses global scope and
enforces small page and
message limits. It returns only rule names and session/message IDs for lexical
co-occurrences in at least two distinct sessions. It does not return excerpts,
write files, change skills, create memory, call a model, or infer authorization.
Output is a lead for human/agent review, not a verified lesson or proposal diff.
Supplying one to six exact `references` instead of scan limits rechecks those
session/message identities, project boundaries and permissions, returning only
fixed topic/signal labels and metadata. It is not semantic review and does not
replace an authorized bounded reader for understanding the underlying evidence.
Do not mix `references` with scan limits.

A separate `catalog: true` operation asks native read permission and checks the
caller and project location before and after `skill.list`. It returns only names,
descriptions and a lexical project-source indicator, not skill bodies or paths.
This is a host loader snapshot, not a fresh or complete source inventory. The
installed host API has no pagination or acquisition-byte limit and may acquire
full skill contents internally; the operation caps the returned entry count and
output, not that internal acquisition. A timeout bounds waiting, not necessarily
the underlying operation. Check actual canonical files and all relevant roots
before deciding overlap or freshness; loaded paths are not symlink verification.

A `proposal` input selects a separate read-only preview in source. The caller
supplies catalog entries, source snapshots, a generalized lesson, reviewer
confidence and uncertainty, validation, and two to six assessed references.
For a new project skill, the preview also requires `readmeContent` and includes
both `SKILL.md` and `README.md` in the same diff and proposal hash. Catalog edits
and usage-guide updates for existing skills are not included; they need their own
reviewable diffs and applicable approval. The preview does not validate a complete
bundle or reconcile the shared catalog.
Catalog results can inform the caller-supplied `name`/`description` entries, but
the tool re-reads the host loader and refuses a proposal if those entries differ.
It also permission-checks each exact evidence reference and refuses ineligible
messages. These are lexical identity checks, not semantic review. The hash binds
the supplied catalog to the proposal; the separately reported checks are not part
of that hash or evidence of approval. A no-change result does not perform these
checks. Neither loader comparison nor the hash verifies source-file freshness.
The result contains a full-content diff and SHA-256 hashes, with a 32 KiB output
cap. Catalog overlap is lexical and limited to the supplied list; neither it nor
the evidence, independence, confidence, source freshness or safety is verified.
Review actual source and authorized underlying evidence separately. A preview
is not approval, a permission grant, an application mechanism, or skill validation.
Never supply private excerpts or secrets; heuristic screening is incomplete.

`review.mjs` offers a separate, non-writing comparison of a reviewed proposal
hash and supplied source snapshot. It does not read the filesystem, prove user
approval, acquire write permission, validate a skill bundle, or apply changes.
With the same `proposal` plus `reviewedHash`, the tool additionally rechecks the
loader and evidence, asks native read permission for each canonical path component,
and compares the actual source or absent creation directory. Source inspection
uses Linux `/proc/self/fd` and no-follow directory handles, rejects symlinks and
hard-linked or oversized files, and verifies identities after the read. Creation
rechecks accept an absent `.opencode`, `.opencode/skills` or skill directory so a
first project skill is possible; update rechecks still require the existing file.
The result names any absent directories it observed. It is a
point-in-time check, not a lock; it does not prove approval, Git cleanliness,
semantic evidence or skill validation. Native permission waits may remain pending
and a cancelled filesystem operation may finish underneath. The plugin does not
expose a writer. A real change still requires the agent to obtain specific
approval and native edit permission, re-read the canonical target immediately
before editing and follow the consumer's validation and recovery workflow.
Review text rejects carriage returns, terminal controls, line/paragraph separators
and bidi control characters, which can make a diff or the resulting source read
differently from its bytes; tabs and newlines remain allowed.
The scan uses a 30-second deadline and accepts only bounded ASCII alphanumeric,
underscore or hyphen identifiers, refusing other session/project IDs and skipping
other message IDs; valid but unusual IDs may therefore be omitted or rejected.
Serialized analysis output is capped at 32 KiB; omitted pattern groups are
counted in `coverage.patternsTruncated`.
Native permission requests are not raced or treated as approved on timeout. If a
permission provider ignores cancellation, the call can remain pending past the
deadline, but the scan checks it before performing further reads. A timed-out
uncooperative read may also continue underneath; the result is discarded.

The lexical rules are deliberately coarse and incomplete. A heuristic skips
messages containing some sensitive terms, but cannot recognize every secret or
private conversation; no privacy guarantee is implied. User messages with
metadata, non-text tool/reasoning/attachment data, oversized text and incomplete
assistant messages are skipped. Coverage counters and pagination truncation
must be reviewed. Child and fork sessions are excluded; repeated messages from
the same session count once, but separate roots may still share a history. No text is
intentionally persisted by this source; server/plugin observability and model
transcripts remain separate runtime concerns.

Beyond the accepted bounded read/catalog slices, independently verify native
permissions, acquisition bounds, cross-project and move races,
denial, cancellation, private data, actual skill suggestions and rendered output.
PID and metadata checks are same-user consistency checks, not protection against
a hostile local process. Discovery has no start operation. Do not replace the
reader with unbounded `session.context`, a guessed listener, or an implicit CLI
service startup. Activation is a separate approval. The accepted project-only
activation is dated above; any further shared `opencode.json` edit first needs
fresh ownership reconciliation. The additive entry is `"./tools/self-learning"` in its `plugins`
array. To roll it back, inspect the current configuration and remove only that
exact entry, preserving intervening changes and every other setting; do not
restore an old whole-file snapshot over later work or restart shared services.
On 2026-10-28, this addition and byte-identical removal were rehearsed against a
disposable copy of the then-current configuration; the real file was unchanged.
That rehearsal does not prove runtime unload or host registration.

Run isolated core fixtures with `npm test` in this directory; these do not test
the real plugin SDK, live loading, permissions, or session access. The
[`self-learning` skill](../../.opencode/skills/self-learning/SKILL.md) owns
the review/approval workflow, not automatic skill updates. The
[acceptance checklist](ACCEPTANCE.md) maps the original requirements to evidence
and remaining gates.

On 2026-10-29 `npm test` passed sixty-eight offline fixtures and skipped the SDK
transport fixture because its peer dependency was still not installed in this
package. These include permission-checked
loader-catalog fixtures, read-only proposal dispatch and applying synthetic
preview diffs to disposable directories with `git apply`. A test-local simulated
reviewer gates application and exercises stale reruns and reverse-diff recovery;
its synthetic name, description, category, tags, heading and one guide-link
assertions are not full bundle validation or a real approval integration. The
new-skill fixture creates and recovers both files. A conflicting reverse diff is
refused without overwriting the synthetic conflicting change. Source-check fixtures
exercise denied reads, stale source, creation collisions, symlinks, hardlinks,
oversized files, first-skill creation with absent `.opencode`/`.opencode/skills`,
a non-directory `.opencode` and a symlinked `.opencode`, not live host permissions.
Composed synthetic session tests
exercise the adapter, proposal, simulated approval and edit denial, separate
catalog approval and recovery for creation and update. A copied repository
`shared-skill-portability.test.mjs` runs its actual catalog category/tag and
Markdown-link checks in each disposable root. Negative cases prove a missing
catalog row and broken guide link are rejected. Other portability checks, loader
discovery and semantic quality are not covered by that selected validation.
Skill-instruction contract tests check
approval, permission, validation and conflict-preservation wording, not model behavior.
Other fixtures cover same-process identity,
foreign endpoint, streamed-size refusals, stalled discovery/stream cancellation,
and pre-read location and lineage changes. An independent disposable exercise
run separately from the package suite passed thirteen checks: analysis without
text output, deterministic hashes, creation and update previews with no writes,
creation from an absent `.opencode`, evidence-permission denial, changed-proposal
hash refusal, stale-source refusal with the interfering change preserved,
cross-project and global-scope refusal, approved `git apply`, post-apply stale
rerun refusal, conflicting reverse refusal and byte-identical rollback.
A separate non-host
test harness used the real client to read one page of the current session without
printing content; it supplied the server PID itself, so this is **not** proof of
plugin-host binding. A second harness with its own different PID was refused
before a session read. The skill was actually discoverable in this session; no
session-analysis tool was loaded or tested live. A later SDK type-check attempt
was interrupted during a server restart and is inconclusive. A subsequent bounded
TypeScript 5.9.3 entrypoint check against local OpenCode 2.1.1 SDK packages passed
with `--skipLibCheck --allowJs --strict false`; it does not type-check JavaScript
bodies or prove live loading. `sdk-contract.test.mjs` passed in a scratch copy
using an existing OpenCode 2.1.1 client: synthetic HTTP responses exercise host
information, caller identity, the project-filtered session page, the bounded
message page, exact message retrieval and refusal of an oversized message
response. It skips when the peer package is not resolvable and is not a live
service or host-permission test. Native session identity reads and unpaginated
skill-list acquisition are not covered by the adapter's streaming byte cap. The earlier
shared inventory drift was resolved by parent CI integration; fresh inventory
checks pass 7/7. The repository health check passed on 2026-10-28; it does
not exercise this optional plugin or prove session analysis or skill changes work.

## Host prerequisites for a project-local trial

The following is the retained 2026-10-29/30 baseline, superseded for dependency
availability and registration by the operational evidence at the top. Its failed
loads, fixture results and limits remain history, not instructions to reinstall.

Parent verification on 2026-10-30 UTC reproduced **68 pass / 1 SDK skip** in the
package. A new private scratch copy of the exact current adapter/SDK test passed
**1/1 with zero skips**, reusing the existing authentic 2.1.1 client from the
coordination package. Only scratch links were created; this package still has no
installed client peer. The separate result does not turn the in-place skip into
a pass or prove host registration, native permissions or learning quality.

The following were verified on 2026-10-29 against the running OpenCode 2.1.1
install; none of it is native tool invocation.

- The plugin context runs in the registered background service process. The TUI
  process is the service's parent and the service owns the MCP child processes,
  so `process.pid`, the service registration PID and `GET /api/info` PID can
  match. A tool invoked from any other process would not satisfy that binding.
  The current registration is
  `$XDG_STATE_HOME/opencode/service.json`
  (`/home/james/.opencode-v2-pilot/state/opencode/service.json`), which
  `Service.discover` reads by default; a different environment for the service
  and the plugin host would silently miss it.
- **The plugin cannot load without its client peer.** The host plugin runtime
  supplies only `@opencode/plugin` and `effect`; it does not provide
  `@opencode/client`, and this package has no `node_modules`. `Host.resolve`
  finds `index.ts`, but loading it fails with
  `ERR_MODULE_NOT_FOUND: @opencode/client` (Node reproduction; the Bun host
  provides the first two modules only). Activation therefore also requires
  `@opencode/client@2.1.1` to be resolvable from this directory, and
  `@opencode/plugin` must keep coming from the host rather than a local install.
  No dependency was installed or linked by the source work.
- With the authentic 2.1.1 client and host plugin module present in a scratch
  copy, the real entrypoint loaded and `setup` registered tool id `self_learning`
  with schema keys `catalog`, `maxSessions`, `messagesPerSession`, `proposal`,
  `references`, `reviewedHash` and `additionalProperties: false`. The tool then
  refused `maxSessions: 0` with `Analysis limits out of range`, so input
  validation is wired. This proves registration code, not host loading or native
  permissions.
- The intended additive registration remains the string entry
  `"./tools/self-learning"` in the project `plugins` array. These checks did not
  change `opencode.json`, restart or reload the service, or grant permissions.

## Native-context feasibility recheck — 2026-10-31

This dated review predates the approved client provisioning and successful host
reads above. Its native-context API limits remain relevant; its missing-package
observations are not the current installation state.

The host plugin context cannot replace the absent client for this contract, so the
source is unchanged. Checked against OpenCode v2.1.1 source (tag `v2.1.1`, commit
`ba546ec`) and the already-installed 2.1.1 published packages, read read-only from
`tools/session-coordination/node_modules` (no install, link or copy):

- The host supplies only `effect` and `@opencode/plugin` to plugins
  (`packages/plugin/src/runtime-modules.ts:7`). `@opencode/client` is not on that
  list, and `@opencode/plugin` does not re-export it as a runtime value.
- The plugin `session` domain is `Pick<SessionApi, "list" | … | "context">`
  (`packages/plugin/src/promise/session.ts:154-174`; published
  `@opencode/plugin/dist/promise/session.d.ts:144`), and the promise adapter builds
  exactly those members. It has no `message` key, so neither the paginated
  `message.list` nor `session.message.get` reaches a plugin even though the client
  has both.
- `session.context` takes only `{ sessionID }` and returns the whole
  `SessionMessage.Info[]` (`packages/client/src/effect/api/api.ts:364-366`;
  `packages/core/src/session/store.ts:58`). It is neither paginated nor
  acquisition-bounded, so it is the unbounded substitute this contract already
  forbids rather than an equivalent reader.
- Native domain calls drop caller request options: `adaptApiMethod` is
  `(input) => …` with no second parameter
  (`packages/plugin/src/promise/adapter.ts:265-281`; published
  `dist/promise/adapter.js:187-198`). An `AbortSignal` passed as the client's
  promise types document (`dist/promise/client.d.ts:25-38`) is silently ignored, so
  cancellation is not satisfiable through the host context either.
- What the context does cover natively is discovery-free identity and pagination
  for session records: `session.list` accepts `project`, `directory`, `limit` and
  `cursor`, and `session.get` returns `Session.Info`, both in-process. That removes
  the PID/version binding for those two calls only; it provides no message reader.

No minimal native-context correction therefore meets the same bounded, paginated,
cancellable, project-scoped message contract. A lazy or runtime-only client
fallback was not added: it would register a tool that cannot perform its bounded
read and so weaken the current fail-closed load. The gate is unchanged —
`@opencode/client@2.1.1` must resolve from this directory under its own
installation authority. An additive `"./tools/self-learning"` entry under the
retained project-only activation approval would only permit another host trial,
not establish registration, native permission/cancellation behavior or real
evidence-backed learning. `npm test` still reproduces 68 passes and the single SDK-peer
skip; `createRequire` from this directory reports `MODULE_NOT_FOUND` for both
`@opencode/client` and `@opencode/client/service`, and `node_modules` is absent.
