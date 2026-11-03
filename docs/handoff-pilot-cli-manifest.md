# Pilot selected-session handoff client manifest

Status: **prepared, not approved or applied**. This is a new scope beyond the
earlier command-only cutover. It changes one pilot CLI settings file, not global
server discovery or upstream goal state. No command invocation follows from
approving only the wiring scope.

## Verified target and source

Target: `/home/james/.opencode-v2-pilot/config/cli.json`.

A path-filtered `strace` of one owned, normally launched pilot TUI observed that
exact file opened read-only by threads of the owned client. The separate
`/home/james/.config/opencode/cli.json` was not opened in that trace. Only opens
of those two paths were traced; no file contents or unrelated processes were
traced. Client 35532 and its tracer 35535 have exited. This verifies the pilot
target rather than inferring it from the general documentation or launch cwd.

The client entry references canonical source; it does not copy or install a
server/exporter outside the repository:

```json
{
  "package": "/home/james/repos/computer-use/.opencode/plugins/goal-docs",
  "options": { "scope": "selected-session" }
}
```

Pin source to the 21 hashes in
`docs/goals/a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7/typecheck-evidence.json`, whose
SHA-256 is
`552810b7a6495f206cea2e6b9e505562a082f103298382d4457272b4545b8f81`.
Revalidate that evidence and every referenced source immediately before apply;
stop on drift. The source passed 131 combined tests and strict checking of the
21 companion TypeScript files. Separate owned real-TUI probes verified producer
registration from home with the selected-session option, and exactly one
producer with inline plus automatic repository discovery. Those probes did not
invoke the producer or establish actual transfer/focus acceptance.

## Exact one-file delta

| Property | Required value |
|---|---|
| Original bytes | 513 |
| Original SHA-256 | `f053be32107160d139cea487435f55a6648200b13a8fbe58388f06b5fd22c700` |
| Original mode | `0600`; preserve owner and mode |
| Proposed bytes | 668 |
| Proposed SHA-256 | `33777226840a92518b2edc8838032caca9567a7f78f2ecbb49c5641b1694c862` |
| Backup, initially absent | `/home/james/.opencode-v2-pilot/config/cli.json.backup-handoff-client-20261027` |
| Untouched separate CLI SHA-256 | `92bdd6c55118938012dda5af564f06e75c164a9a08748bf749ea3b03f98a4060` |

Parse the original JSON, retain every existing key/value, and append only the
entry above to the existing `plugins` array. Retain the existing upstream goal
plugin entry and its order. Serialize with two-space indentation and one final
newline; the exact output must match the proposed hash. Do not add a wildcard,
disable any plugin, rewrite project/global server configuration, or change
permissions, models, themes, MCPs, other settings or commands.

Before writing, reject symlinked paths/ancestors, nonregular or multiply linked
files, wrong ownership, an occupied backup path, or any original/source drift.
Create the backup exclusively beside the target with mode `0600`; verify and
flush its exact original bytes before replacement. Prepare and flush an
owner-only candidate outside settings discovery. Recheck original identity and
hash immediately before atomic replacement; stop on a concurrent edit rather
than overwriting it. Keep the verified backup and receipt.

## Wiring-only acceptance and boundaries

- Verify exact installed bytes, JSON delta, owner/mode and backup after apply.
  Verify the separate config, original staging, project config, screenshot source
  and deployed continuation hashes are unchanged.
- Allow the documented settings watcher to reload the entry. Do not restart
  any client/service, close user tabs, move source sessions or change goals.
  Open an isolated normal-launch probe if needed; verify exactly one producer
  for the selected supported source. Do not submit it under wiring-only approval.
- The producer remains unavailable on a home/new-session route with no selected
  source, or when that source's exact worktree lacks an active server companion,
  has a conflicting server claimant, or has unknown inventory coverage. No
  launch-directory fallback or source/goal guessing is allowed.
- This adds pilot-wide **client availability**, not automatic server/exporter
  installation in every consumer repository. Other runtime profiles remain out
  of scope. Referencing canonical source does not authorize subsequent unrelated
  source edits, deployment, permission grants or a whole-directory setup script.

## Optional, separately explicit bounded transfer acceptance

Only if the user also approves this scope, invoke the producer once from an
owned isolated real TUI attached to source session
`ses_e85293a02ffe7Hlk5CfyoIgStT`, goal
`a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7`, in this exact repository worktree.
Verify source identity, current export consistency and exactly one palette
producer immediately before submission. Do not operate an existing user tab.

That approval permits saving the selected goal's documentation and creating
exactly one independent same-worktree destination, preserving source restrictions,
agent/model/variant and provenance; seeding the actual handoff text with
`resume:false`; and focusing that destination only in the owned initiating
client. Verify saved documents, destination and durable seeded input through
supported read APIs and the actual rendered client, and verify no destination
model/tool execution or goal binding started. A partial failure retains artifacts
and reports the last verified stage; do not create another destination or delete
sessions/documents to tidy up. Any recovery must reuse the recorded transfer.

This scope **does not** invoke `/handoff_resume`, run a model or worker, pause or
rebind the source goal, start autonomous destination work, take a screenshot,
restart anything, publish, commit or push. Explicit continuation/model behavior
acceptance remains a later separate approval gate. Screenshots remain deferred.

## Bounded failure rollback

Wiring approval includes restoring this one file on a failed apply/verification
only while it still has the exact proposed hash and no concurrent change.
Restore the verified original bytes/mode atomically from the retained backup;
verify the original hash and keep the receipt. Stop and ask on drift or an
unexpected target instead of overwriting user changes. Do not delete any source
documents, transfer destination, message, command backup or unrelated file.
Later discretionary rollback requires approval again.
