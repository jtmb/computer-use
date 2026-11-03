# Native subagent row — pinned source preparation

2026-10-28. This implements the source-preparation lane in the approved
[delivery plan](consolidated-delivery-plan.md), not permission to ship a fork,
replace the running TUI, reload the shared service or publish upstream.

## Verified upstream identity

- Repository: `https://github.com/anomalyco/opencode`.
- Selected tag: `v2.1.1`, resolving through the permitted GitHub read to
  `ba546ec1598a70db2570e9c6258028d955ba8f58`.
- New isolated checkout: `/home/james/repos/opencode-native-row`; initial Git
  status was clean. The source package reports `@opencode/tui` 2.1.1, MIT.
- Root and TUI instructions, the native renderer/unit-test guidance, package
  manifest and license were inspected before patch work. No installed copy was
  edited or invoked to stand in for these sources.

## Actual native component and data boundaries

The picker is
`packages/tui/src/routes/session/composer/subagents-tab.tsx`. It builds entries
from `sessionFamily(data.session.list(), current.id)`, keyed by session ID, and
renders agent/title with a running label. Keyboard/mouse navigation and the
active/inactive toggle are existing behavior to preserve.

The separate transcript `Subagent` in
`packages/tui/src/routes/session/index.tsx` uses `subagentModelLabel(input.model)`.
That is requested dispatch input, not an attestation of the child's selection or
provider execution. A truthful picker must not inherit that inference.

`packages/schema/src/session.ts` exposes the session's optional selected model
and terminal outcome (`succeeded`, `failed`, `interrupted`). `time.idle` qualifies
the last outcome; a new running execution must not display that old outcome as
its current state. The native client data store reports current `running`/`idle`
separately. `Model.Ref.variant` is optional; the model catalog has variant
overlays, not a universal guarantee that each variant is reasoning effort.

The accepted design stays **Task · Model · Effort · Status**, with explicit
unknown/requested/selected distinctions. A header selection is not proof of the
model used by every message. Narrow layouts must preserve Task/Status and wrap
metadata; variable-height rows must not break selection or scrolling.

## Source verification and current runtime boundary

The earlier worker returned terminal and released its source scope. Parent
correction in [native-row.patch](../../tools/opencode-native-row/native-row.patch)
has SHA-256 `2825d876035054ee46f71f7d9c6815918bad32569242832e31174325633f86fe`;
the [worker original](../../tools/opencode-native-row/native-row.worker.patch)
remains separately preserved at
`bed8bbd1032b26b76a4186d42ce2a2a313bffa34fdfbf38db33c32b1ca6497e6`.
Saved terminal outcomes now require a qualifying `time.idle`; running state stays
authoritative. Without that timestamp, the row reports `Idle (outcome unknown)`.

Dated parent delivery acceptance includes 35 native cases, 350 reruns / 1,430
assertions, package `bun typecheck` and six patch previews. Production-renderer
fixtures use actual Composer/SubagentsTab at 44 and 120 columns with fake fetch/
event I/O; an intentionally wrong running label failed both native layout cases.
Canonical consolidation independently reran **6/6** previews against a disposable
clone at the exact official pin, leaving the selected upstream checkout unchanged.
It did not rerun native renderer tests or compilers and does not relabel those
historical outcomes as fresh canonical evidence.

The additional [active-session bridge](../../tools/opencode-native-row/session-active.md)
is a distinct source integration. Its public-type/runtime-fixture evidence is not
whole-host semantic acceptance: the bounded TypeScript 6 check exhausted its 2 GiB
heap, and three TypeScript 7 trials reached the unchanged 1 GiB RSS guard after
loading all 2,826 sources/four overlays. No full-host pass is claimed.

Neither patch is applied to an installed/running TUI. Actual participants, visible
native rows, loaded bridge and execution-effective model/effort remain unverified.
Header model/variant remains selected metadata, not provider execution evidence.
No deployment, activation, shared restart, upstream edit or publication occurred.

## Response observation producer follow-up — 2026-10-29

The separate [producer patch and native procedure](../../tools/opencode-native-row/provider-observation.md)
now preserve bounded final-response model/effort reports in existing native
metadata without modifying the accepted base row/bridge patches. Parent actual
protocol execution produced six unpatched failures, then33/33 patched native
cases with234 assertions. Exact session/message projection bindings were also
source-inspected. This does not identify execution-effective settings: reported
values can be absent or rewritten by transport hooks. The additive native-row
consumer remains in preparation, not accepted or loaded; full native-host
semantics and all original provider/visible acceptance remain unverified.
