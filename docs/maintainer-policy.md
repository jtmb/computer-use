# Maintainer policy

Repository-specific operations; reusable skills must discover consumer equivalents.
Read the root [AGENTS.md](../AGENTS.md) first. This file owns layout/commands and
external-work locators, not native OpenCode behavior or a deployment approval.

## Canonical source and scope

- Checkout: `~/repos/computer-use`; validate actual worktree with `git rev-parse --show-toplevel`.
- Project configuration: [opencode.json](../opencode.json); global templates: [global/](../global/).
- Skill source/catalog: [.opencode/skills/](../.opencode/skills/README.md).
- Local plugin source: [.opencode/plugins/](../.opencode/plugins/); tool inventory and
  source/deployed/live limitations belong to [features](features.md), not a duplicated tool list.
- AT-SPI implementation: [desktop-control.py](../scripts/desktop-control.py).
  Native bridge: [GNOME package](../tools/gnome-window-control/README.md);
  browser backend: [computer-use-browser](../tools/computer-use-browser/README.md).
  [tools/browser/](../tools/browser/package.json) instead pins the external Playwright MCP.
- Wrappers: [scripts/](../scripts/); pins: [mcp-versions.json](../config/mcp-versions.json).
  Source config registers GitHub and Playwright wrappers; declaration is not live connection.
- Do not edit deployed copies under `~/.config/opencode/` or another runtime profile.
  [Setup](../setup.md) and [onboarding](../onboarding.md) own preview/apply/backup/rollback.

Parent `/home/james/AGENTS.md` describes `~/scripts/skills/` while this checkout's
instructions/config select `.opencode/skills/`. This conflict is recorded, not
resolved by invented nesting precedence or an unrequested parent edit. The user
explicitly approved this repository's canonical source changes; no global-source
relocation or deployment follows. Surface any operation requiring unresolved scope.

## Verification commands

From the verified checkout, run only checks relevant to changed behavior:

```bash
./scripts/health-check.sh
./scripts/health-check.sh --status-only
opencode --version
opencode service status
opencode mcp list
opencode debug config
git --no-optional-locks status --short
git diff --check
```

For shell syntax use `bash -n` on each selected script. For Python syntax use
`ast.parse` or a bounded test harness without writing bytecode to source trees.
Use package-owned test/typecheck commands after reading their actual manifests;
do not install dependencies or trigger live GUI/network tests as a hidden check.
Health should report v2, responsive service, required local plugins, connected
GitHub/Playwright, canonical skills and supporting scripts. A health pass is not
live input, rendered settings, human sign-in or a successful model handoff.
Audit at the [required cadence](test-quality-audit.md#when-to-review).

`--status-only` performs service/configuration/file-presence diagnostics without
launching test suites. Its result is explicitly **not full acceptance**; the
default command retains both plugin test batches. If the service is unavailable,
status-only stops before API discovery rather than requesting a service start.
Use it for an authorized no-tests diagnostic, not to bypass required verification
or reclassify earlier CI/test results.

For contribution/task evidence use [CONTRIBUTING.md](../CONTRIBUTING.md).
`node scripts/ci-offline.mjs` runs the reviewed credential-free contracts and
candidate corpus validator/tests/controls; it does not replace relevant package
checks or operational health. Extra command hooks require their own offline-safety
review. Hosted CI, human corpus review and real model evaluation remain distinct.

## Research and evidence

Read for research, architecture/workflow recommendations and version-sensitive
technical claims; ordinary local questions do not require automatic web searches.
Start with current code, tests, manifests and owning guides. For API/SDK/config
or security claims use version-matched official documentation and relevant source.
Open primary sources supporting material claims, record checked date/version and
consider contradictory evidence and alternatives. Search snippets are discovery
aids, not verification; repeated accounts of one source are not corroboration.

Separate observations, inferences, proposals and unknowns. A filtered, denied,
timed-out or incomplete result does not establish absence; report its limit and
continue independent work without widening authority. Never send private
repository content, conversations or secrets to public research services.

Keep three verification lanes separate:

- **Credential-free offline checks:** source contracts, syntax/types, fixtures and
  deterministic tests that need no personal profile, live service or desktop.
- **Authorized model evaluations:** actual isolated task outcomes, policy/skill
  routing, evidence quality, token classes and latency; use comparable conditions.
- **Operational acceptance:** deployed/loaded identities, real GUI/human outcomes,
  service health and rollback. A green source suite is not proof of model behavior
  or operational acceptance. Record command, directory, revision, result and limits.

Do not turn same-account agents' agreement into independent GitHub approval or
promote caller-reported metadata to measured execution facts. Source instruction
checks verify discoverability/wording only; the behavioral corpus and actual
model/operational runs must establish behavior separately. See the retained
[research lane](session-consolidation-2026-10-29.md#researchprcorpus-lane-explicitly-recovered-scope)
for source provenance, not automatic authority or newly verified research claims.

## Source, archive and approval boundaries

Review the combined tree including added/untracked files; cloud main may omit
the actual implementation. Preserve exact index entries/staged patch and unrelated
source work; a stat-cache change alone is not proof content was staged differently.
No blanket staging, destructive cleanup or unrequested source reformatting.

Goal records live through supported tools. Generated [goal bundles](goals/) contain
plan, HANDOFF, work-history and snapshot, indexed with an ownership manifest.
They are bounded historical exports, not every transcript/revision or proof all
work is complete. Validate source identity, status/revision/freshness and the
writer's checksum semantics; the README hash covers only its managed block.
Preserve mismatching bytes before diagnosis. Never edit generated files/raw goal
state, delete a persistent lock inode or rewrite a manifest just to make it green.
Use only supported validated recovery; unknown provenance is an explicit blocker.

Sending/publication, deletion, account/security/permission changes, reboot,
deployment/extension activation/shared restart/logout, commit and push keep their
separate applicable authority. Reuse exact existing approval; auto mode does not
create missing authority. [Autonomy contract](../.opencode/skills/development-conventions/references/autonomous-work.md).

## External cluster history (not current-host commands)

Historical plan: `/home/shak/audits/k8s-cve-20261026T225036Z/plan.md`;
handoff: `/home/shak/audits/k8s-cve-20261026T225036Z/HANDOFF.md`.
The former `/home/shak/repos/computer-use/scripts/health-check.sh` is a historical
host path, not this machine's invocation. Do not create these paths or import
cluster work automatically. If that source is explicitly selected, use its
handoff skill, preserve prompt/live-state structure and keep plan/backup state
with its audit evidence, not this repo. Its recovery gate stays open until a
**fresh Longhorn backup and tested restore** are observed; a schedule is not proof.
