# Handoff cutover and acceptance

**Status: selected pilot wiring and producer verified; continuation and broader goal incomplete.**
This guide is not permission to deploy, retire a command, restart a service, or
change a source goal. The checked-in source and the currently deployed commands
can differ. A successful API fixture or unit suite does not establish that the
replacement `/handoff` works in a real client.

The selected pilot profile has since completed a separately approved bounded
command cutover; see the [execution receipt](handoff-pilot-cutover-receipt.json)
and [approved manifest](handoff-pilot-cutover-manifest.md). This is not a global
companion rollout or proof of a complete transfer or focus. Agent-owned isolated
clients have since verified command registration as described below. The
procedure below remains the gate for other targets and subsequent live testing.

## Source layout and authority

- The project-local companion is under
  [`.opencode/plugins/goal-docs/`](../.opencode/plugins/goal-docs/README.md).
  Its server is RPC-only; the intended initiating TUI owns one command with both
  palette and `/handoff` access. Colocated `index.ts` and `tui.ts` are discovered
  together. Do not add competing CLI/project registrations; any separately
  approved CLI-only registration must be checked for duplicate command IDs.
- The former global Markdown command is preserved verbatim in the
  [legacy archive](legacy-commands/README.md), outside command discovery. It is
  historical, not fallback execution guidance.
- [`global/commands/handoff_resume.md`](../global/commands/handoff_resume.md)
  remains the explicit continuation command. Seeding or opening a destination
  must not invoke it, start autonomous work, or create/rebind/reactivate a goal.
- The new TUI must not register or execute its handoff while a server command
  already claims `handoff`, or while the scoped command inventory is unknown.
  Do not rely on slash-command precedence or guess another command's provenance.
- Project-local discovery does not install this feature in every consumer
  repository. Do not remove a global workflow on the assumption that an absent
  project companion will replace it.
- Retiring a selected profile's global `/handoff` or `/resume` also affects its
  other repositories. Obtain an explicit scope decision: a temporary,
  rollback-verified test is not approval for permanent retirement or global
  companion rollout. Preserve other profiles/config trees, and never use a
  historical source archive as a substitute for backing up the actual live file.

## Before asking for cutover approval

### Home-launched client scope

The agent reproduced a real scope mismatch after the command-only pilot cutover:
the repository-launched palette exposed the producer, but a home-launched client
attached to the same repository session showed `No results found`. Selecting a
project session alone did not load that project's companion in the home client.

The TUI now supports an explicit CLI-only `scope: "selected-session"` option.
An isolated home-launched probe with this inline plugin entry displayed
`Handoff current session` under `Goal documentation` in its actual palette:

```json
{
  "package": "/home/james/repos/computer-use/.opencode/plugins/goal-docs",
  "options": { "scope": "selected-session" }
}
```

This is a verified local entry for this installation, not portable repository
identity or an approved persistent configuration edit. The mode resolves the
selected session's exact directory, verifies its active server companion and
command inventory, and passes that location explicitly on every RPC. It does
not install a server/exporter outside this repository. A home/new-session view
has no transfer source and exposes no producer; unavailable or conflicting
coverage remains disabled rather than falling back to the launch directory.

The probe used only `OPENCODE_CLI_CONFIG_CONTENT` in its own process, was closed
after inspection, and did not submit a command or change a persistent file.
An additional isolated repository-launched probe with the same inline entry and
automatic project discovery displayed exactly one producer in its palette.
Permanent CLI wiring and actual transfer/focus acceptance remain separate gates.
Do not infer approval for them from this example or the earlier command manifest.

The bounded [pilot CLI manifest](handoff-pilot-cli-manifest.md) now records the
verified settings path, exact one-file hashes, backup, rollback and an optional
separately explicit non-executing transfer test. The user subsequently approved
both scopes; the [CLI receipt](handoff-pilot-cli-receipt.json) records the applied
wiring and the incomplete initial transfer attempt. After the cache correction,
the user separately approved one retry. Its [acceptance record](handoff-live-acceptance.json)
verifies one independent destination, full pending seed and actual local focus.
A subsequent read-only preview correction was verified in that same destination
without another producer invocation. `/handoff_resume` and model execution were
not invoked or approved. Future producer invocations remain separately gated.

### Source and target checks

1. Select the exact repository, worktree, source session and goal. Inspect dirty
   and staged changes; preserve them rather than restoring an earlier snapshot.
   Keep upstream goal-plugin storage, MCP settings, native desktop registration
   and normal coding tools unchanged.
2. Finish source review and the focused export, writer, permission, observer,
   transfer and TUI-registration regressions. Verify real installed API shapes,
   not only fake session responses. Unknown source restrictions must fail
   closed, not become an unrestricted destination.
   Verify Linux `/usr/bin/flock` is available for the writer's kernel lock. Do
   not run old/new companion writer versions concurrently during activation.
   The persistent `docs/goals/.goal-docs-process.lock` inode must not be deleted
   or replaced while writers may run; a stale owner/recovery file is not a
   reason to remove that kernel-lock file. Any required client/service refresh
   remains part of the separately approved runtime change.
3. Run the [verification commands](../setup.md#verification). The health checker
   requires active plugins at this checkout's location; missing, duplicated or
   failed plugins block cutover. Passing health is still not live UI acceptance.
4. Read both plugin and command inventories for that same location. From the
   selected Git checkout, these commands are read-only:

   ```sh
   root="$(git rev-parse --show-toplevel)"
   for endpoint in plugin command; do
     route="$(python3 -c 'import sys, urllib.parse; print("/api/" + sys.argv[1] + "?location%5Bdirectory%5D=" + urllib.parse.quote(sys.argv[2], safe=""))' "$endpoint" "$root")"
     opencode api get "$route"
   done
   ```

   An unscoped inventory can describe the service's default directory rather
   than this checkout. Record the returned location and exact command names.
5. Identify the actual deployed legacy command and continuation-command paths,
   their hashes/modes, local modifications and any conflicting claimant. Present
   the exact bounded change, backup location and rollback procedure for approval.
   Do not write a runtime copy or broaden permissions during inspection.

## Deployment is a separate gate

Obtain explicit approval immediately before the exact runtime changes. Preserve
the legacy command and local modifications in a backup beside the target before
any approved retirement or replacement. Retain unrelated runtime commands.

**Do not use a whole-directory deployment as an implicit one-command cutover.**
[`deploy-global-config.sh`](../scripts/deploy-global-config.sh) with
`--only commands --apply` replaces the entire deployed commands directory. It can
remove unrelated local entries; this guide does not authorize that operation.

After approved changes, use only the separately approved client/service refresh
needed to load them. Reinspect actual inventories and the initiating TUI: there
must be exactly one `/handoff`, plus the intended `/handoff_resume`. If the
legacy command still exists, the replacement must remain unavailable rather
than shadow it. Source edits alone are not evidence of this transition.

## Live acceptance after approval

Invoke `/handoff` once in the supported, initiating TUI and verify all of these:

- The selected goal package was saved under `docs/goals/<goal-id>/` with a
  consistent snapshot, portable repository/worktree identity, relative scope,
  source session/goal IDs, status, revision and UTC export time. The handoff has
  substantive `## Plan` and `## Historical documentation` sections. Existing
  manual edits and legacy root handoffs were not overwritten.
- Exactly one standalone destination was created in the source's exact
  worktree, without a parent/fork relationship. Intended agent, model variant
  and applicable restrictions were preserved through supported APIs.
- The destination contains the actual saved, self-contained handoff text and
  provenance, not merely a path or summary. Its durable initial prompt was
  admitted with `resume:false`; no model/tool execution or new goal binding
  started as a consequence of transfer.
- The initiating TUI visibly selected that destination. Verify the rendered
  client and its route/tab state; `session.view` is only a read receipt. Another
  client must not be navigated by an unscoped broadcast.
- Repeating an unchanged transfer after an interrupted stage reuses the correct
  destination and prompt ID, without duplicate input. Report source changes
  separately; do not label a different snapshot an identical retry.
- `/handoff_resume` remains a later explicit action. Its source identity must
  not be substituted by an unrelated current-session goal; contradictory
  records stop, inactive goal status is preserved, and overlapping edits require
  verified inactive source/worker status or a user decision.

API-only or unsupported clients may complete export/create/seed but must report
**open pending**, with the destination ID. They cannot claim that a window or
tab opened. Visible acceptance must use an approved observation method; do not
invoke the deferred unsafe screenshot backend as a shortcut.

## Partial failure and rollback

Retain source documents and the source session on every failure. Report the last
confirmed stage, any destination/message IDs, and the stage still pending.
Permission denial, unavailable restrictions, stale snapshots and manual edits
must not be hidden by a success toast. A failed focus does not require reseeding.

If cutover fails, stop using the replacement and present a bounded rollback from
the preserved runtime backup for approval. Do not delete destination sessions,
exports or unrelated commands to tidy up. Restoring a legacy claimant must cause
the new command to stand down, not create a second `/handoff`.

Commit, push, remote PR merge, screenshot interaction changes and global rollout
all retain their own approval gates. None follows from source verification or
from approving one handoff test.
