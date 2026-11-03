## Canonical checkout interpretation — 2026-10-29

This is a retained delivery report, originally authored in
`/home/james/repos/computer-use-delivery` at the dated checkpoint identified
below. The canonical checkout is now `/home/james/repos/computer-use` on
`main`. Historical paths, runtime observations, counts, and “not loaded” claims
below apply to the delivery snapshot and its inspected runtime only; they are
not current canonical runtime facts.

The canonical tree contains [`global/commands/checkout.md`](../../global/commands/checkout.md)
and [`scripts/checkout-preflight.mjs`](../../scripts/checkout-preflight.mjs).
Their source presence and this guide do not establish current native command
discovery, model compliance, a successful runtime audit, or worktree creation.
No such runtime/API preflight or worktree action was performed for this
consolidation. The old worktree remains intact; its fully restored archive does
not authorize removal.

Current parent checkpoint and scoped checks are recorded in
[`main-consolidation.md`](main-consolidation.md) and [`features.md`](../features.md).
The dependency failures/counts in the initial canonical paragraph below are now
historical: coordination109/full strict, connector120+2/full603-file strict and
browser46+35/full strict package checks subsequently pass with authentic local
dependencies. No checkout command discovery, model compliance or worktree
creation follows from those repairs; that original outcome remains unverified.
The 120 connector, 81 browser/benchmark/dependency, 42 runtime, 29 capture,
27 fallback, 27 monitor, and six native-preview results are scoped checks, not
checkout-command or full native/model/visible acceptance. Coordination remains
104/105 because AJV is absent, with four readiness cases unrun. Runtime strict
library and base-browser checks pass; benchmark strict checking is blocked by
missing SDK declarations; connector strict checking is blocked by local
JSON-Schema declarations, although the unchanged source graph passes with
authentic SHA-512 declarations mapped in scratch. Fifty-five adjacent checks
and fresh health pass.

The feature inventory records newer, separate canonical pilot observations,
including a ChatGPT image-generation pilot, resource-monitor activation, and
desktop capture/Calculator results. They are not denied by the dated “no
activation” statements below and do not establish checkout acceptance.

# Checkout command readiness

## Current local continuation — 2026-10-30

### Raw-index refresh correction — 2026-10-31

The additional actual-model branch case exposed an unresolved raw-index byte
change. A new **no-model** mechanism investigation keeps that historical failure
intact and tests fresh isolated Git2.53.0 fixtures with raw index bodies saved
before and after each operation. Guarded status reads preserve the index; an
unguarded status positive control changes only stat fields/checksum while retaining
staged entries and worktree content. Crucially, subsequent porcelain `git diff`
changes the raw index even with `--no-optional-locks` or `GIT_OPTIONAL_LOCKS=0`.
These local controls do not identify which actor changed the earlier model fixture.

The new stale-stat regression also reproduces this defect in the **actual local
preflight**: it reports ready but changes the raw index. Its process-local Git
arguments now include `-c diff.autoRefreshIndex=false`; the regression passes
without changing saved Git configuration, filters/hooks, output caps, timeouts,
staged content or the required file set. Removing only that option in scratch
fails at the exact raw-index assertion. The checkout prompt now carries the same
separate-diff warning, after an independently failing wording contract. All old
assertions remain. This is a source preflight correction, not deployment or real
worktree-creation acceptance.

Git's [diff configuration reference](https://git-scm.com/docs/diff-config) describes
the default silent `update-index --refresh` for matching worktree contents. That
page reports its last revision as2.19.0; local2.53.0 controls separately establish
the observed behavior here. The inspected frozen native provider has optional-lock
suppression but not this additional option; neither its source nor installed
runtime is changed, and no native VCS method is executed by these controls.
Loaded source identity and native strategy/creation gates therefore remain open.

Documents`index-refresh-controls-EUoLf1`retains the status controls
(`facts.json`,SHA`5a0de0fe…0433a`), two protected-but-mutating diff controls
(`diff-followup.json`,SHA`8bba61ca…36c94`), fixed diff
(`fixed-diff.json`,SHA`614cbaa8…df450`) and the scratch-negative receipt
(`preflight-negative.json`,SHA`aefdf8e6…1b30b`). The first observer attempt failed
on unsupported`Buffer.flatMap`after one local control, before a complete receipt;
the corrected helper is checked before setup and saves each baseline before the
tested operation. Its failure remains history, not a completed control set.
None of these new baselines supplies the missing old raw-index body or turns the
earlier actual-model outcome into a pass.
Final required offline CI passes11/11in94.136s, including59checkout cases,
194repository contracts,145corpus and248title-stage cases, zero skips/cancellations
in those suites; full health then passes. Raw110437-byte CIJSONSHA
`fe0137d60c9abf76874c0f9e5f9f443d9e56c462a94a0a89f26c854f6e616ac3`
is retained beside the controls. The changed canonical checkout prompt is now
6451bytes/SHA`646a3976d84de030186d523dcc975445189f4eb3b33b1b8730075236c7522e28`;
the earlier6205-byte/267159da…identity is historical, not its current deployment
input. No profile copy or command deployment is performed. The inspected26732-byte
native Git provider matches blob`d44ba281…46d4`at frozen`ba546ec…`, unchanged;
its identity is not proof which bytes the installed runtime loaded.

**Committed attribute observation — 2026-10-31:** an actual read-only query now
checks all214committed paths at`70e0477496e25655911341a07e00d55b2a5a61d9`, using
`check-attr --source=<exact HEAD> --all --stdin -z`. It completes with zero
attribute/filter records; the complete tree inventory is24184bytes/SHA
`74cefacd…231e0`and NUL path input12840bytes/SHA`f0f9f6b1…b3353`. Sampled native
PID12584/start1198646and HEAD remain stable. Key-only system/global/local review
again observes4/6/10keys, four system filter keys, and no includes, per-worktree
config or attribute-file override. Git's own`var GIT_ATTR_GLOBAL/SYSTEM`and
`rev-parse --git-path info/attributes`resolve the default/private files; all three
are absent before and after. There are no`.gitattributes`entries in that commit.
No global/system attribute-disable option is used for this actual observation.

The sanitized receipt is Documents`checkout-attribute-observation-6rNDeq/facts.json`,
SHA`32c80697…c43111`,29490acquired bytes/103ms under1MiB/15s. It retains hashes/
counts, not raw config/environment/attribute values or tracked path lists.
The initial collector instead exits13with unsettled top-level await before a
complete result; no success or factual receipt is inferred. Corrected draining
uses available readable length and destroys failed streams; a separate74-byte
collection smoke passes before the actual query. That failed attempt's aggregate
acquisition is not independently established by its missing result.

Two new real isolated Git controls pass: exact-source attributes override staged/
dirty attributes, and default-global/private-info sources still apply with an
explicit source commit, without running a configured filter. `--all`also retains
literal`filter=unspecified`; an absent attribute emits no record, avoiding the
ambiguous value-only interpretation. A scratch-only control dropping`--source`
fails exactly on`dirty-only`versus committed`unspecified`; canonical files stay
unchanged. The controls isolate their HOME/XDG/system configuration; that test
isolation is **not** applied to the actual native-context query above.

This accepts sampled filter-selection evidence only for this exact committed
tree and config context, not arbitrary dirty/future paths, a new linked worktree,
atomic source/config preservation or transitive submodule initialization. Source
or context changes require a fresh review. Deployment and actual creation remain
separately gated.
Supplemental strict UTF-8 decoding/re-encoding and NUL inventory reconstruction
matches both exact saved tree/input digests without repeating the attribute query;
`inventory-encoding.json`SHA`c1374e2c…23c92`retains that check, not raw path lists.
Final required CI passes11/11; its checkout step reports **57/57**, zero skips/
cancellations,73.58s. Full health then passes. The105079-byte raw offline report
is hash-readback preserved as`ci-after-controls.json`SHA`a6422c9b…8d974`beside the
attribute facts; it is source/fixture evidence, not hosted/model/live creation.

**Plugin review qualification:** the sole read-only Flash child has returned.
Parent independently matches all70manifest identities(551442source bytes), but
does **not** accept the child's six-complete-closures wording. The report itself
discloses pattern-only reachable connector files and partial goal-plugin source;
the manifest omits direct runtime imports of`mcp.ts`,`image-tool.ts`,`backend.ts`
and`rpc.ts`confirmed in parent source reads. The43-byte goal entry re-exports
`dist/server.js`; that321325-byte target exceeds the256KiB review ceiling and
remains unreviewed, not split or acquired under a larger cap. Parent separately
confirms the tool-editor proxy forwards other methods; this does not make it a
worktree editor or establish strategy registration. Parent-preserved manifests/
qualified facts are Documents`checkout-strategy-review-parent-61FOCs/facts.json`,
SHA`3a43dc73…8d5d0`,611290acquired bytes/21ms under2MiB/5s. Physical identities
are not semantic reading, full import closure or installed/loaded bytes. Child
startup and its full/repeated pattern-scan acquisition totals remain reported,
not independently trace-audited. Full strategy selection remains unresolved.

**Native-effects follow-up — 2026-10-31:** canonical-scoped reads on service
PID12584/v2.1.1 again bind project`3e1e6f73…`to the canonical checkout, absent
startup metadata, two document sources with no worktree-directory or JSON checkout
override, seven active local plugin entrypoints and three saved worktrees. Four
API responses total18,923bytes/1697ms under a shared1MiB/15s bound; raw config
values are not emitted or retained. Two initial requests used the unsupported
`directory`query key and returned the service's`/home/james`location; they are
excluded from canonical evidence. The reviewed request middleware accepts
`location[directory]`or an encoded`x-opencode-directory`header. The corrected
header response is checked before using location-scoped results. These GETs do
not establish strategy selection or exact loaded source bytes.

Current read-only review of the frozen`ba546ec…`source confirms:
`worktree/strategies.ts`starts with the bundled Git strategy and selects the last
registered strategy;`config/plugin/worktree.ts`only configures its destination
directory, **not a new strategy**. `worktree.ts`loads canonical plugins, creates
the suggested parent, invokes the selected strategy once, records its returned
directory, then can run`Project.Commands.start`with inherited environment. The
Git strategy delegates to`git worktree add --detach -- <directory> <ref>`with
inherited environment and no hook-disabling options. This narrows the earlier
config-adapter wording below; active local/transitive plugin registration review
and exact installed-byte identity are still not established by these source reads.

A separate sampled review binds PID12584/start1198646before/after, resolves its
Git executable to`/usr/bin/git`(2.53.0), and observes no inherited`GIT_*`names.
Key-only`--no-includes`reads using the service's config-resolution inputs find
four system filter keys; system/global/local key counts are4/6/10. All three
scopes have zero include, hook-path, fsmonitor, worktree-config or attributes-file
keys, and global/local have no filter keys. The review acquires5118bytes/18ms
under1MiB/15s, exports no config/environment values, does not execute filters,
and is not a native-creation safety verdict or atomic process/config attestation.

**Correction to the old filter-selection inference:** absent root`.gitattributes`
and unset`core.attributesFile`do not establish that configured filters are unused.
Git also reads`$GIT_DIR/info/attributes`, nested/index attributes and default global/
system attribute files. The [official attribute manual](https://git-scm.com/docs/gitattributes)
documents those sources and checkout's index-first fallback. The versioned2.53.0
documentation URL returns a redirect page pointing to2.50.0; the opened current
manual is marked2.56.0, so that web read alone is not a2.53implementation proof.
A new real Git2.53fixture has no root attribute file, yet`check-attr`reports its
private info-file filter selection without executing the filter. The existing
production local guard correctly refuses it before source status/diff. The new
command contract initially fails on the three missing attribute-review clauses;
the canonical prompt now names all sources and refuses unknown selection evidence.
This is source/guidance coverage, not a demonstrated native filter execution or
global attribute review. The old sanitized audit/receipts remain unchanged, but
their stronger filter-safety inference is not carried forward. Deployment,
loaded-template identity, current complete strategy/attribute review and actual
creation/preservation remain open; no checkout or profile write occurs.

The initial focused command check fails on those three missing clauses; its real
info-attributes fixture already passes the existing production refusal. The first
full invocation is cancelled by an accidentally supplied45s suite-wide timeout
after51passes, not by a production resource guard. With that erroneous test-only
flag removed, the same unchanged production limits complete54/54cases in42.978s.
Before registering the suite in CI, a separate real fixture proves that its setup
helper inherited`GIT_CONFIG_COUNT`and executed a fixture-owned injected pre-commit
hook. Stripping inherited`GIT_*`from **fixture setup** fixes that red; production
`checkout-preflight.mjs`already strips those variables and is unchanged.

The first new required-CI run then fails54/55on the old deadline test's immediate
descendant-state assertion: it advances mocked timers while real processes receive
signals. The corrected test uses the real30s deadline/grace, retains descendant
termination within a500ms observation window and additionally requires no
cleanup-close failure. No production timeout, output bound, termination policy or
asserted refusal is removed. The second actual CI run passes all11required steps;
the complete checkout step exits0in73.58s. Full health subsequently passes. These
source/isolated-fixture observations do not exercise native creation, a real
project hook/filter, hosted enforcement or command-model compliance. All earlier
timeout/CI failures remain part of this record.

**Fresh read-only identity recheck — 2026-10-31:** supported `/api/info` confirms
OpenCode2.1.1/servicePID5799. Inspection of only the service's config-path
environment keys identifies `/home/james/.opencode-v2-pilot/config`; no private
environment values or template content are reproduced. Bounded no-follow reads
again observe canonical5794bytes/`5abcd145…` versus that profile's4837bytes/
`72af752c…`. Thus the source/profile gap below is still current, not merely a
dated receipt. This does not prove which exact template the client has cached.
No profile write, reload, command/model execution or native creation occurred.
Exact deployment authority and a fresh native strategy/Git-effect review remain
separate gates. The inherited PR-first dependency stays superseded.

The user's later correction explicitly removes GitHub PR fetching/importing and
the inherited PR-first dependency; it does not approve profile deployment or
native creation with unreviewed effects. A fresh location-scoped native catalogue
still discovers `checkout`. Read-only no-follow comparison confirms the pilot
candidate remains stale: source5794bytes/SHA256
`5abcd14540c8c43ab0622978fdaeccf118d89fc5388311c1b465f95e4f55a8c0`,
candidate4837bytes/SHA256
`72af752c19b96ceb9ee2f323e3189dc7131ce2661c939e35767cde7b52caa536`.
No profile write, reload, command/model execution or worktree creation was used
to hide that identity gap. Exact deployment authority and refreshed native Git/
strategy preflight remain prerequisites for actual command/creation acceptance;
they do not block independent voice/source work.

This records the checkout command's source and native OpenCode v2 readiness
boundary. A present prompt or a passing source-contract test is not proof that
the command is discovered, loaded, followed by a model, or successfully creates
a worktree.

## Native command discovery

The checked-in prompt is `global/commands/checkout.md`. That is this repository's
global-template source location; the active OpenCode v2 loader does not discover
that path directly. The published [v2 command guide](https://opencode.ai/v2/docs/commands/)
documents Markdown commands under the global `commands/` directory and project
`.opencode/commands/` directory, with JSON commands under the `commands` config
key. Only Markdown files are discovered, nested directories become slash-separated
command names, and project definitions override global ones. Deployment to a
discovery location is a separate operation and was not performed here.

Read-only runtime evidence gathered on 2026-10-28:

- `opencode --version` reported `opencode v2.1.1`.
- The already-running server's OpenAPI document exposed `GET /api/command`
  (`command.list`, “Retrieve currently registered commands”). A query scoped to
  the loaded delivery location returned its registered command names; `checkout`
  was absent. This establishes **not loaded in that runtime**, not a model failure.
- The native `Project` record for the saved canonical project had no
  `commands.start` entry. The location-scoped config documents also had no
  `worktree.directory` override. These are observations of that runtime/project,
  not defaults that can be assumed for another consumer.
- The native saved worktree inventory contained the existing canonical checkout
  and linked checkouts. No worktree was created or refreshed.

Later canonical observation (2026-10-29, goal `94b75188…`): the location-scoped
command catalogue now contains **13 commands including `checkout`**. The own
session's `projectID` and `/api/location` agree on native project
`3e1e6f73bded105bf412f16b6aea04e05f44d605`; path matching alone was ambiguous
because a separate `global` project record reported the same canonical path.
That exact project had no `Project.Commands.start`; the two config documents
had no `worktree.directory` or JSON `checkout` override. Command-name discovery
does not prove loaded template bytes: `Command.Info` exposes only name and
description. The profile candidate matched the then-canonical command hash at that
observation; it no longer does. On a later check the profile candidate was still
4,837 bytes / SHA-256 `72af752c…`, while current canonical source was 5,794 bytes
/ `5abcd145…`. The name is discovered, but the deployed template is stale relative
to the source changes below. Deployment and loaded-template identity remain
separately gated and unperformed; the inherited `EACCES` candidate was not
bypassed.

An actual preflight against the canonical source with an honestly **unverified**
strategy audit returned exit1, `ready: false`, `worktreeCreated: false`, blocked
on selected-strategy/source evidence. Durable sanitized records are under
`~/Documents/computer-use-checkout-readiness-rI8SK3/` (`native-observations.json`,
`runtime-audit-unverified.json`, `real-preflight-command.json`). This observation
preceded the local execution guard below; it is not a post-hardening pass,
template-identity proof, model-compliance result or creation acceptance. No
command invocation, deployment or worktree creation was performed by this work.

A later reviewed, sanitized audit did pass the local readiness path: exit0,
`ready: true`, no blockers, `worktreeCreated: false`, with only the existing
dirty-source warning. This was not a self-asserted guess. The pinned v2.1.1 source
shows `WorktreeStrategies` initialising the bundled `WorktreeGit` strategy
(`id: "git"`) as selected; the config worktree plugin adds only strategies from
configuration documents that contain a `worktree` entry, and neither effective
document does; no active local plugin registers a worktree strategy. Native
service inspection showed no inherited `GIT_*` variables, no system/global
`core.hooksPath`, `core.fsmonitor`, include, worktree-config or attributes-file
override, and no executable-hook trigger. System Git does define the standard
`filter.lfs.*` keys, but this repository has no `.gitattributes`, no LFS attribute
line and no LFS metadata, so those filters are not selected for this checkout.
The results are in `runtime-audit-reviewed.json`,
`native-git-environment-reviewed.json`, `preflight-reviewed.json` and
`deployed-command-comparison.json` with manifest
`656dbf8f7c34f288305370c4c66fbf3901327f4220ae1ab21be64b85dd96023d`.
`ready: true` is still a local projection, not native creation, exact installed-
byte, model-compliance or preservation acceptance. No worktree was created.

The prompt's source-level Markdown contract is covered by
[`scripts/checkout-command.test.mjs`](../../scripts/checkout-command.test.mjs).
That test deliberately does not claim native loader or model acceptance.

## Native worktree boundary

The running v2.1.1 OpenAPI document described these operations:

- `GET /api/worktree?projectID=…` lists the saved inventory without loading
  configuration or running filesystem discovery.
- `POST /api/worktree` (`worktree.create`) requires `projectID`; `from`, `branch`,
  `directory`, and `name` are optional in the API schema. This prompt requires
  them explicitly for safety. The operation loads the project's canonical
  configuration, uses its selected strategy, and runs the project's setup script.

The [v2 configuration guide](https://opencode.ai/v2/docs/config/) defines
`worktree.directory` as a destination default. The [v2 plugin worktree guide](https://opencode.ai/v2/docs/build/plugins/server/)
documents custom strategies registered by plugins; an active registration can
become the selected strategy. The [project API](https://opencode.ai/v2/docs/api)
defines `Project.Commands.start` as the startup script run when creating a new
workspace. This is project metadata, not a prompt command named `start`.

The read-only plugin list reports active plugin identities, not which plugin
registered the selected worktree strategy. There is no read-only endpoint in the
observed API that returns the selected strategy owner. A source review of the
canonical project's active plugin sources is therefore required before claiming
“bundled Git”; do not infer it from a plugin name or from the absence of a config
field. `worktree.create` itself is not a readiness probe: it can load plugins and
run startup/setup effects.

Bundled Git is not intrinsically free of execution effects. The separately pinned
upstream `packages/core/src/git.ts` worktree implementation (lines 1222–1255 at
the reviewed checkpoint) invokes environment-inheriting `git worktree add` without
disabling hooks. The [Git hook reference](https://git-scm.com/docs/githooks#_post_checkout)
explicitly describes `post-checkout` execution for `git worktree add`. Filters
can also run during checkout or source status/diff acquisition. This is a source
finding, not proof of exact installed native bytes or its effective environment.

Before creation, separately establish safe native-service Git system/global/
environment configuration, includes, hook paths and executable hooks, clean/
smudge/process filters, filesystem monitor and per-worktree configuration through
permitted evidence. Do not dump private config/environment into receipts or
execute a hook/filter to test it. Unknown effects or denied evidence block
creation; do not change settings or disable hooks to manufacture readiness.
Neither absent project startup metadata nor the helper's local guard replaces
this native-process review. Recheck after relevant source/environment changes.

The installed runtime is a bundled executable; this checkout does not contain a
matching v2.1.1 OpenCode source tree. Native runtime facts above were checked via
the supported read-only API, with loader/worktree semantics cross-checked against
the published v2 documentation. This is not a source checkout of the exact
installed release.

## Read-only preflight

Parent follow-up (2026-10-28): independently inspected bounded file/process code
and passed the 16 helper tests plus four command contracts. Added a real
unfinished-stdin case: the production 30-second deadline terminates the read,
returns exit 2, emits no result and starts no Git process. **21/21** combined
cases pass. Removing the stdout-limit guard only in a test loader makes the
overflow test fail; production source remains unchanged. This is source behavior,
not command discovery, model compliance or native worktree creation.

Canonical execution-guard follow-up (2026-10-29): the full preflight/command
suites pass **53/53**, zero skips/failures, including actual 30-second unfinished
stdin and Git output/lifetime bounds. The original pre-guard helper still fails
the real clean-filter nonexecution regression in an isolated scratch copy. A
separate scratch mutation skipping nested audits fails the nested filter marker
and unsafe-hook/marker assertions. The adjacent inventory/command suites pass
**11/11**, and repository health passes; none is native creation/model acceptance.
Exact test-time source identities and raw results are retained under
`~/Documents/computer-use-checkout-guard-jP4BRS/` in `full-suite.json`,
`original-clean-filter-red.json` and `nested-audit-mutation-red.json`. The quality
review retained distinct positive, execution-order, path/type, scan/depth/count,
timeout/overflow and text-contract coverage; no production mutation or test
deletion was used. This supersedes only earlier source-suite counts above.
The post-hardening real canonical preflight also returned exit1/`ready: false`,
still blocked only on the honestly unverified strategy/source review, without
creating a worktree. `post-hardening-preflight-preservation.json` retains that
result and exact unchanged staged-patch/config hashes. All six edited files
retain mode0664. This is a real local refusal, not a successful native audit.

[`scripts/checkout-preflight.mjs`](../../scripts/checkout-preflight.mjs) captures
the local source baseline and validates the proposed destination without calling
OpenCode or creating a directory. It uses Git read commands with optional index
locks disabled, turns off filesystem-monitor/untracked-cache hooks, and hashes
the status listing, staged and unstaged binary diffs, index entries/flags, and
untracked path listing. It emits no file names or diff contents. Dirty state is
allowed but reported as a warning: a new worktree starts from the captured
commit, and the dirty source is not copied.

Before any status or diff command, the helper inspects **local key names only**
with `git config --local --no-includes`. It refuses configured hook paths,
includes/conditional includes, clean/smudge/process filters, filesystem monitor
and per-worktree config, even if a value appears inactive. It does not echo
values or open included files for this audit. It scans default common-directory
hook metadata without reading hook contents: absent hooks and inactive regular
files are accepted; executable non-sample entries, symlinks, special files,
unsafe directories and more than 128 entries block. Initialized indexed gitlinks
are audited recursively before parent status (maximum depth 8 and 64 repositories);
unsafe markers/paths and over-limit audits fail closed. Uninitialized or absent
gitlinks do not trigger initialization. Existing source snapshot semantics remain
unchanged.

These are sampled local checks, not an atomic lock against concurrent edits and
not attestation of Git executable identity or native-service global/environment
configuration. Stop on detected changes and obtain a fresh review after relevant
changes; `ready: true` alone never authorizes native execution. The helper strips
inherited `GIT_*` variables and excludes system/global configuration for its own
Git children; the native service may inherit a different environment.

Every Git command has a 30-second deadline, an 8 MiB stdout limit (including
digest-only diff streams), and a 64 KiB stderr limit. On timeout or overflow,
the helper terminates only that command's process group on POSIX, first with
SIGTERM and then SIGKILL after a short grace period; on Windows it terminates
only the direct child. JSON audit/snapshot input is capped at 1 MiB. File inputs
must be regular non-symlink files; the helper opens them
without following a final symlink or blocking on a FIFO, and rejects growth,
replacement, or metadata/path changes during the bounded read. Stdin has the
same byte cap and must finish within 30 seconds. Exceeding any limit blocks the
preflight; these limits do not make an input audit independently trustworthy.

The source snapshot binds:

- canonical worktree root, Git common directory, full HEAD, and full symbolic
  branch ref or detached state;
- porcelain-v2 dirty/untracked/conflict status;
- staged and unstaged binary-diff byte counts and SHA-256 digests;
- index entry and index-flag digests; and
- the untracked-path inventory digest.

It does **not** read or hash untracked file contents or ignored files. Thus
`--expected-snapshot` detects changes to tracked diffs, index, branch, HEAD, and
the Git-visible dirty/untracked listing, but is not a byte-for-byte content proof
for untracked or ignored files. It never prints or stores the staged/unstaged diff
bytes; Git streams those bytes into an in-memory digest. Do not run it where even
that in-process diff read is prohibited. `--expected-snapshot` accepts a prior
full JSON report (the script does not persist reports itself).

Destination checks require an existing canonical parent under `~/repos`, reject
symlink traversal, reject a parent inside any Git or native-saved checkout, and
reject target collisions or ancestry overlap. The final name must be a lowercase
repository-prefixed leaf of at most 40 characters. The CLI has no override for
the approved root; tests inject an isolated fixture root through the exported
function.

The CLI also requires a sanitized runtime audit. This is a small projection of
read-only native evidence, not a raw config dump or a permission grant:

```json
{
  "schema": "checkout-runtime-audit/v1",
  "project": {
    "id": "<native Project.ID>",
    "canonical": "/absolute/canonical/checkout",
    "startupCommand": null
  },
  "configuration": {
    "sources": ["/absolute/config/source/opencode.json"],
    "worktreeDirectory": null
  },
  "strategy": {
    "id": "git",
    "origin": "bundled",
    "sourceReviewed": true,
    "customRegistrations": []
  },
  "savedWorktrees": [
    { "directory": "/absolute/canonical/checkout", "strategy": null },
    { "directory": "/absolute/source/worktree", "strategy": "git" }
  ]
}
```

`startupCommand: null` means the native project metadata explicitly showed no
`Project.Commands.start`; `configuration` is a sanitized projection of the
effective native config sources; and `savedWorktrees` comes from the read-only
native inventory. `strategy.sourceReviewed` and `customRegistrations` require an
actual source review of the canonical plugin sources. The script cannot
independently authenticate these assertions, so missing, custom, or unreviewed
strategy evidence blocks readiness. Never copy credentials or raw provider/MCP
configuration into this record.

Example invocation (replace placeholders only with independently verified,
absolute values; `--runtime-audit -` reads a sanitized JSON record from stdin):

```bash
node scripts/checkout-preflight.mjs \
  --source /absolute/source/worktree \
  --parent "$HOME/repos" \
  --name project-slug-checkout-test \
  --runtime-audit /tmp/opencode/checkout-runtime-audit.json
```

Exit 0 means the supplied evidence passed the local checks; exit 1 means a
readiness blocker; exit 2 means invalid invocation/input. The report always says
`readOnly: true` and `worktreeCreated: false`. This is not native API/model
acceptance.

## Verification state and limits

Verified source/tests:

- The command source specifies explicit `projectID`, source `from`, captured HEAD
  as `branch`, approved parent `directory`, and final `name`; it does not invoke
  shell expansion or move the current session.
- The isolated preflight fixtures cover a dirty source, staged binary data,
  untracked paths, snapshot drift, startup and custom-strategy blocks, missing
  evidence, source descendants, outside-root parents, symlink parents, target
  collisions, native-inventory ancestry, canonical-project mismatch, bounded
  regular-file/stdin reads, FIFO/symlink/oversize/growing/replaced JSON inputs,
  and real sleeping/oversized fake Git processes for command lifetime, process-
  group cleanup, stdout/stderr caps and digest-stream bounds.
- Local execution-effect regressions use real fixture repositories, including a
  clean-filter marker that the old preflight actually executed. Guarded root and
  nested filters must leave that marker absent; normal/inactive-hook, absent-hook,
  separate-Git-directory and uninitialized-gitlink controls remain usable. Tests
  also cover configuration keys, hook/marker symlinks and FIFOs, marker size,
  hook scan bounds and recursive depth. These are source/fixture outcomes only.

Not verified / still blocked:

- Command-name registration is now observed as described above; exact loaded
  template identity and the source changes in this follow-up remain unverified
  in the native loader. The profile candidate is currently stale relative to
  canonical source. No deploy, reload, model invocation or command execution was
  performed by this work.
- The supplied runtime audit is an input projection, not independent native
  attestation. The strategy source review was completed against the pinned
  v2.1.1 tree and the active plugin inventory, not proven byte-for-byte against
  the installed bundled executable.
- The native service's Git environment and system/global config were reviewed
  read-only (no values exposed); that is sampled metadata evidence, not an atomic
  guarantee for every future process or config change.
- No native `worktree.create` call or startup/setup script was invoked. There is no
  evidence here for live worktree creation, model behavior, or post-create
  preservation.

Proposed parent integration (outside this lane's write scope): link this guide
from the existing documentation index and decide whether the new preflight should
be included in the repository's health/feature inventory. No shared index,
health-check, or deployment files were changed here.
