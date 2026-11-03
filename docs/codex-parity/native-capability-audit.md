# Native capability audit — OpenCode 2.1.1

2026-10-28. DeepSeek returned a read-only factual audit; the parent independently
checked the declarations below and fetched the official V2 plugin guides. All four
selected `@opencode/{plugin,client,schema,protocol}` packages report 2.1.1 and
resolve within this checkout, without following another repository's dependency
tree. No runtime configuration, session messages, model dispatch or UI was read
or changed for this audit. Public API absence is not proof about uninspected core.

## Supported metadata does not expose the built-in child row

Declaration root: `tools/opencode-plugins/resource-monitor/node_modules/@opencode/`.

| Capability | Inspected declaration | Finding |
| --- | --- | --- |
| Session hierarchy and current state | `plugin/dist/tui/context.d.ts:38–57` | `data.session.list/get/root/family/status` and message sync/read exist; status is `idle` or `running`. |
| Session title, model and terminal outcome | `client/dist/promise/generated/types.d.ts:2911–2937` | `title`, `metadata`, `agent`, `model`, `outcome` and location exist; outcome is succeeded/failed/interrupted. |
| Model selection | Same file, `ModelRef:498–502` | Provider/model IDs plus optional `variant`; variant is not universally a reasoning-effort field, nor proof of the model used by every message. |
| Custom panel/sidebar placement | `plugin/dist/tui/context.d.ts:137–178` | `PanelInput` and `SlotMap` include `session.panel`, `sidebar.content`, footer and composer slots. |
| Built-in child-row extension | Same complete `SlotMap` | No child-row or header-row slot. Host renderables are not public plugin API. Replacing the whole sidebar is not decorating a native row. |

The [official TUI guide](https://opencode.ai/v2/docs/build/plugins/cli/)
documents those session APIs, placement and host-renderable limits. A plugin can
render a custom component from available session data. That does **not** satisfy
the requested built-in Task · Model · Effort · Status row, expose canonical task/
effort headers, or prove effective model selection. Implementing that native row
requires the actual upstream component and a supported core integration boundary;
neither core source nor live row behavior was inspected in that API audit. The
subsequent [pinned upstream inspection](native-row-patch.md) locates the actual
composer picker and separates its data from requested transcript labels. A bounded
native patch was then in preparation; its bounded source preparation is now
accepted as recorded in that guide, but it is not loaded. Do not
reinterpret launch labels as native-row acceptance.

## Model observation channel — pinned source follow-up, 2026-10-29

The returned read-only metadata audit was independently checked against source
at `ba546ec1598a70db2570e9c6258028d955ba8f58`:

- `core/src/model-resolver.ts:232` uses `modelID ?? id` for the protocol model;
  selected `Model.Ref.id` can therefore differ from the wire alias.
- `core/src/session/model-request.ts:304–376` permits HTTP/WS hooks to rewrite
  transport requests/responses. A selection or pre-hook configuration is not
  evidence of the final request, let alone provider execution.
- `core/src/session/runner/step.ts:77–84` passes the selected ref to the event
  publisher; `publish-llm-event.ts:135–153,577–584` binds it and native provider
  metadata to the exact assistant message, not an effective-model field.
- `core/src/session/message-updater.ts:217–274` and
  `client/src/solid/data.ts:889–938` retain `Step.Ended.native` on that assistant
  message, scoped by session/message IDs; a new attempt clears the prior native
  record. `schema/src/session-message.ts:215–239` retains selection separately.
- Unpatched `ai/src/protocols/open-responses.ts:1346–1358` emits response ID/tier
  but not reported model/effort. The separate
  [producer follow-up](../../tools/opencode-native-row/provider-observation.md)
  now passes33 actual offline native protocol cases after six unpatched failures.
  It must not promote response reports to execution proof or infer absent effort.

Paths above are relative to the pinned checkout's `packages/` directory. These
are source findings, not a real request, provider response, loaded row or model
measurement; the original effective-metadata and visible acceptance remain open.

## Compaction has a summary hook, not a verified veto

`plugin/dist/promise/session.d.ts:29–46,130–146` exposes
`session.hook("compaction", callback)`. `SessionCompaction` has the outgoing model
context plus optional `result: {summary, native?, metadata?, tokens?}`. The callback
returns void/Promise<void> (`promise/registration.d.ts:8–11`), not cancel/defer.
The [server guide](https://opencode.ai/v2/docs/build/plugins/server) confirms this
is a checkpoint-summary request; supplying a result skips its model call.

No pre-decision cancel/defer/transfer guarantee is present in the inspected hook
surface. Throwing or interrupting from a summary hook is not a documented safe
handoff boundary. Preserve supported best-effort normal-context and OFF/manual
behavior; do not disable native compaction or claim a guaranteed transfer.

## Location scoping exists, but not on each plugin entry

`schema/dist/config/plugin.d.ts` defines a string or `{package, options?}` entry,
without a per-entry location selector. Project config/discovery and plugin-side
`ctx.location` provide scoping. `client/dist/promise/generated/types.d.ts:3726–3735`
defines `plugin.list({location:{directory}})` and a location-qualified result.
See the [plugin loading guide](https://opencode.ai/v2/docs/build/plugins) and
[server context](https://opencode.ai/v2/docs/build/plugins/server).

These are source/API findings, not registration, runtime isolation, participant,
settings, model-exposure or visible-UI acceptance. The separate benchmark and
coordination preflights must establish their own actual loaded contracts.
