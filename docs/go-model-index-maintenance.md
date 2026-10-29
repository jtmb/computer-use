# OpenCode Go model index maintenance

The canonical index is [`opencode-go-model-index.yaml`](../opencode-go-model-index.yaml).
Maintenance is deterministic first: a read-only checker fetches the official Go
docs source, the public Go models endpoint, the installed OpenCode CLI, and
models.dev metadata, then compares them with the index. It never calls a model.

## Quick start

```bash
# Read-only drift check; writes only state and reports.
scripts/go-model-index-maintain.sh check

# Show the last check without network access.
scripts/go-model-index-maintain.sh status

# Structural validation only.
scripts/go-model-index-maintain.sh verify

# Offline fixture tests.
scripts/go-model-index-maintain.sh selftest
```

The first invocation creates a private venv at
`${XDG_DATA_HOME:-$HOME/.local/share}/computer-use/venv-go-model-index` and
installs the pinned dependency from `requirements-go-model-index.txt`. It does
not install packages into system Python.

## Sources and authority

| Source | Used for | Authority |
|---|---|---|
| `console/go.mdx` | Model list, Go pricing, monthly allowance | Primary |
| `https://opencode.ai/inference/go/v1/models` | Remote Go model IDs | Primary for membership |
| `opencode models` | Local availability | Local evidence only |
| `https://models.dev/api.json` | Context/output limits and metadata | Secondary |
| `config/go-model-index-variants.json` | OpenCode effort variants | Versioned snapshot |

The index pins `metadata.plan: go`. Go Plus and Go Teams allowances are not
assumed. Change the plan only with an explicit user decision and a matching
reviewed proposal.

Catalogue membership is the intersection of the docs model list and the public
endpoint. A model missing from `opencode models` is reported as
`local_unavailable`, not removed. Removal requires two checks or an explicit
approved proposal.

## State and reports

Default state root:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/opencode/go-model-index/
  last-check.json
  last-check.md
  research-prompt.md
  cache/
  backups/
```

The timer and checker do not write to the repository.

## Exit codes

| Code | Meaning |
|---:|---|
| `0` | Clean or nothing to do |
| `2` | Drift: added, confirmed removed, changed, source disagreement, or pricing review |
| `3` | Partial: pending removal, local unavailability, metadata/variant warning |
| `1` | Hard failure, lock conflict, parse failure, or validation failure |

## Weekly check-only timer

The systemd user timer runs `check` only. It never runs `apply`, commits,
pushes, or opens a pull request.

```bash
# Preview.
scripts/install-go-model-index-timer.sh

# Install and enable only after approval.
scripts/install-go-model-index-timer.sh --apply

# Inspect.
systemctl --user list-timers opencode-go-model-index-check.timer
journalctl --user -u opencode-go-model-index-check.service

# Remove.
scripts/install-go-model-index-timer.sh --remove --apply
```

The timer is scheduled for Monday 09:00 with `Persistent=true` and a 15-minute
randomized delay. The service has a five-minute timeout and uses idle I/O
priority. Drift is a normal outcome (`SuccessExitStatus=0 2 3`), not a failed
unit.

## Monthly review

1. Run `scripts/go-model-index-maintain.sh status`.
2. Read `last-check.md`; inspect any `source_disagreement`, `pricing_review`,
   `metadata_changes`, and `variant_gap` entries.
3. If there is no drift, stop. Do not invoke a model.
4. If there is drift, run `research` and review only the listed models.
5. Validate the proposal with `verify`, then preview `apply` without `--apply`.
6. Apply only after approving the exact diff. Keep the backup path in the
   review record.
7. Commit or push only with separate explicit approval.

## Research packet

```bash
scripts/go-model-index-maintain.sh research
```

This reads `last-check.json` and writes `research-prompt.md` for at most three
changed models. It includes current values, sources, and the required proposal
fields. It makes no model call by default. Use official docs/model cards plus at
most one independent benchmark source. Do not invent benchmarks or token
savings.

## Apply a reviewed proposal

`apply` is a dry run unless `--apply` is present.

```bash
scripts/go-model-index-maintain.sh apply --proposal proposal.json
scripts/go-model-index-maintain.sh apply --proposal proposal.json --apply
```

Proposal shape:

```json
{
  "reason": "Reviewed monthly Go catalogue change",
  "models": {
    "opencode-go/example-model": {
      "action": "update",
      "fields": {
        "monthly_allowance_usd": 15,
        "pricing": {
          "input": 0.10,
          "output": 0.50,
          "cache_read": 0.01
        }
      },
      "guidance": "Use for bounded tasks. Escalate effort after a failed check.",
      "tags": ["coding", "cheap"],
      "confidence": "medium",
      "sources": ["go_docs"]
    }
  }
}
```

Rules:

- New models require guidance, tags, and sources; they are added as
  `provisional_unverified` and are not added to routing.
- Removal of a routed model requires `replacement_ref`.
- `change_log` is append-only.
- `metadata.catalogue.go_models` counts only `verified_go` records.
- A backup is written under `backups/` before the index is replaced. Validation
  failure restores the backup.

## Variant snapshot

`config/go-model-index-variants.json` records the variants exposed by the
installed OpenCode model API for the current `opencode --version`. The checker
compares the index against it. When the OpenCode version changes, the snapshot
is stale; the checker reports `variant_gap` and does not auto-apply effort
changes. Refresh the snapshot from the installed model API during that upgrade,
review the diff, and commit it with the next maintenance change.

This is the only semi-manual maintenance input. It prevents guessing at
provider effort controls such as Claude Haiku 5.5 (`none` plus effort values)
and MiniMax M3 (`none` / `thinking`).

## Known limitations

- The docs parser targets the official `console/go.mdx` anchors. If the docs
  layout changes, `check` fails closed instead of guessing.
- models.dev is secondary metadata; it is never allowed to overwrite Go-specific
  pricing or allowances.
- DeepSeek’s Go snapshot is not exposed by these sources; the index keeps the
  0910/1017 uncertainty explicit.
- New models are provisional until reviewed; the catalogue can be temporarily
  incomplete by design.
- The scheduler is check-only. Commit, push, and PR creation remain separate
  approval gates.
