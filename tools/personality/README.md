# Personality tool and reminders

This optional OpenCode V2 plugin keeps a chosen explanation style available
throughout a chat. **Plain English** is the included default: everyday language,
familiar examples, and no assumed knowledge of technology. It is not a pushback
or adviser persona.

## Current status

The source, two skill bundles, tool implementation and context reminder are
present. Both skills were advertised and loaded in this repository on
2026-11-01. Owning source tests exercise selection, saving and reminder assembly.
After the user's separate approval, the narrow global declaration was applied
and loaded without a shared restart. The actual tool reports Plain English as
the default, and canonical loading is verified in two owned QA projects. Actual
DeepSeek Flash samples cover fresh, resumed and natively summarized chats; they
are sampled observations, not universal compliance. The initial generic token
answers are not accepted as tool-contract evidence; a fact-qualified follow-up
keeps freshness separate from authority. See the
[activation record](../../docs/deployments/2026-11-01-personality-cua-activation.md).

A separate installed OpenCode2.1.1 fixture now passes44 native checks across
three private-server boots and two disposable projects. It verifies real tool
registration, current/list/read/select/reset/save-preview/apply, durable selection,
chat isolation after restart and moving projects, native read denial, and the
actual `permission.assert` → `evaluate` hook path. Passive asks create no native
prompt; explicit calls still ask. Nine actual HTTP requests reached a deterministic
local model endpoint: eight primary replies and one native manual compaction.
Nine additional request checks verify the exact current reminder after fresh
requests, style changes, reset, restart, native compaction and a project move.
Native compaction keeps its own summary instructions; the next primary request
replays its completed summary alongside one current reminder. This verifies the
native delivery path, not a real model's writing or operator-global activation.

The later Plain English update adds numbered **Next steps** on task updates and
handbacks. A fresh native run verifies its complete current instruction body,
including the new rules, from the byte-verified skill copy. The earlier checker
only checked Plain English's first sentence; a genuine failing regression now
catches omitted remaining rules and added trailing instructions. Full-body
checks pass after that verifier fix. Updated rules are also observed with the
native summary after restart/project move/reset. This is request-delivery proof,
not a claim that every real model will always follow the format.

## Use

Ask naturally: "Use Plain English", "Which personality are you using?", "Give
me more detail this time", "Make that simpler", or "Save Short Answers as a personality". The parent
[skill](../../.opencode/skills/personality/SKILL.md) defines the workflow.

The `personality` tool has these operations:

| Operation | Effect |
| --- | --- |
| `current` | Read this chat's selected style or the configured default, including skill ID and revision. |
| `list` | List canonical, loader-verified personality skills. |
| `read` | Read one exact `personality-<name>` skill without selecting it. |
| `select` | Save a style choice in supported plugin storage, keyed by this exact chat ID. |
| `reset` | Clear this plugin's stored chat choice, even if the default is broken; report whether the default can be loaded. |
| `save` | Preview a new complete skill bundle and existing standard catalog update; apply only with matching `expectRevision` and native edit authority. |

`save` takes `id`, `description` and `instructions`. It never overwrites an
existing skill, selects it, changes the default, deploys or publishes anything.
The canonical skills directory is derived from this package's source location;
the model cannot supply another write root. An unrecognized existing catalog
requires manual reconciliation, not a guessed rewrite. Standard catalogs get an
append-only table addendum. Existing bytes, file mode and hand-maintained counts
are not rewritten. A concurrent edit is preserved and reported for reconciliation.

Selections use the host's documented durable plugin storage API, keyed by chat ID. They are
not copied into goal state, task memory or a transcript. The `context` hook adds
one bounded reminder to each outgoing agent-loop request. That naturally covers
requests after native compaction; it does not replace compaction or inject the
whole catalog. A fresh user request can change detail for one reply.

## Setup and approval boundary

Requires OpenCode V2 with the reviewed 2.1.1 plugin interfaces, canonical skills
registered in the active global `skills` list, and access to those skill sources.
The host supplies `@opencode/plugin`; no dependency installation is needed for
the dependency-free core/tests. `defaultID` is the only plugin option and defaults
to `personality-plain-english`. Existing same-ID source conflicts are refused.

Do not deploy the full global template over a customized profile. Discover the
active config with `opencode debug paths`, then preview only this plugin:

```bash
python3 -B scripts/deploy-personality.py \
  --source global/opencode.jsonc \
  --target /exact/discovered/config/opencode.jsonc
```

The target above is a placeholder. The preview reports hashes without printing
private configuration. Applying additionally requires separate deployment
authority, `--apply`, and `--expected-sha256` matching the current target digest.
The shared transaction layer keeps adjacent backup/receipt evidence and checks
target identity. The script neither restarts OpenCode nor changes models,
permissions, skill registrations or unrelated plugins. A customized existing
personality default is refused rather than overwritten.

Verify loaded plugin/tool/source identity in two projects, followed by new,
reopened and actually compacted-chat model replies. Use the retained transaction
receipt and exact current post-write digest for the shared transaction layer's
reviewed rollback; rollback and any required shared restart need their own
applicable approval. Do not edit deployed copies by hand.
The scratch deployment suite also exercises read-only restore preview, stale
digest refusal and byte-exact restoration from the actual transaction receipt;
that is reversible-fixture evidence, not a live global rollout or rollback.

## Tests

From the repository root:

```bash
node --test tools/personality/*.test.mjs
python3 -B scripts/test_deploy_personality.py
```

The real-host test is explicit and is **not** launched by the ordinary suite:

```bash
node tools/personality/native-host-acceptance.mjs \
  --binary /absolute/path/to/the/installed/opencode-binary
```

Use the verified actual executable, not a HOME-relative launcher shim. The
fixture gives each run a private HOME/config/data/state/cache under
`/tmp/opencode/personality-native-*`, starts only owned loopback servers, and
stops them. It never restarts the operator service or copies its credentials.
Eight source files are hash-verified into a disposable source layout, so native
save/apply creates a complete skill only in that fixture, never in this checkout.
Only fixture-owned permission requests are inspected/rejected. Reports/logs
redact generated private-server startup passwords. Initial harness attempts
failed on launcher/authentication and asynchronous registry readiness; the final
test waits for actual plugin and skill discovery, without faking either registry.
It configures an account-free loopback OpenAI-compatible provider and refuses
dispatch to any other model. The observer adds correlation headers only; it does
not inject a reminder, replace context or supply a compaction result. Raw outgoing
request bodies and the native completed-compaction record are retained in scratch
alongside the acceptance report. Only disposable sample text is sent.

The fixtures use disposable directories under `/tmp/opencode`, not real chats or
the active profile. Ordinary context unit tests simulate a cleared post-summary
request. The explicit native-host test additionally runs native compaction through
the deterministic local endpoint; it does not use a real external model. An initial
Python test invocation through `-m unittest` lacked this repository's scripts
import path; the direct file command above runs the owning suite.

## Limits

- A personality is explanation guidance, never permission or proof of authority.
  Native read/edit/external-directory/skill checks remain effective.
- Passive reminder permission checks cannot open an ask dialog: their narrowly
  marked `ask` evaluations become refusals. An explicit `personality.current`
  tool call retains normal ask/deny/allow behaviour. A missing reminder is also
  reported in model-visible context, not just the service log.
  The actual installed2.1.1 assert-to-hook path is also verified in the private
  native fixture, separately from operator-profile/model acceptance.
- Selection permissions name the exact logical plugin-storage key
  `personality/selection-v1/<chat-id>` under native `read`/`edit` actions, not a
  guessed private database path. Restart durability, chat isolation and moved-chat
  behaviour pass the actual2.1.1 native fixture; actual global activation/model
  behaviour now has the scoped observations recorded above, not a universal
  reliability guarantee.
- The installed 2.1.1 plugin session API omits instruction-entry methods present
  in newer online documentation. This implementation uses its supported storage
  API instead. The initial fake-host contract missed that gap; the corrected
  source no longer uses `session.instructions`.
- Preview tokens expire after five minutes and bind chat, exact content and
  catalog snapshot. Refused/expired/conflicting previews do not authorize writes.
- Saving is serialized locally and uses an exclusive source lock. It publishes
  the loader entry last within the bundle, then appends the catalog addendum.
  These are not one filesystem-wide transaction. An incomplete save reports the
  bundle path, catalog stage and any failed cleanup. No catalog replacement or
  automatic partial-work deletion occurs. An occupied lock is not auto-removed.
- `list` intentionally refuses an incomplete, denied or conflicting candidate
  rather than reporting a misleading complete catalog. It revalidates permissions
  and loaded source; it is not a cached permission bypass.
- Setup failures release earlier registrations, and cleanup attempts every
  registration even if one fails. Repeated unavailable notices are deduplicated.
- Same-account external writers are not an adversarial sandbox. Do not claim the
  Node filesystem checks prevent every race with a hostile source-directory owner.
- Missing, denied or conflicted styles produce a tool error; the reminder logs a
  bounded warning rather than breaking unrelated work or pretending a fallback
  was loaded. A configured reminder does not guarantee every model will obey it.
- Source checks, loaded registration, model writing and visible user acceptance
  remain separate evidence.
