## Canonical checkout interpretation — 2026-10-29

This is a retained delivery report/proposal, originally authored in
`/home/james/repos/computer-use-delivery` on `consolidated-delivery` at
`c71b8cc57004a65ed4198cf0e5ae8f256e56f532`. The canonical checkout is now
`/home/james/repos/computer-use`, with `main` selected. Treat every date, path,
branch/index digest, status, and count below as historical evidence for that
delivery checkpoint, not as a current fact about the canonical tree.

**The separate release-branch procedure below is a prior proposal, not a current
instruction to leave `main`, create a branch, commit, or merge.** This consolidation
does not authorize Git mutations. The old worktree remains intact; its complete
archive/restore was verified, but removal remains conditional on the parent
preserving and reviewing all remaining work. Do not infer permission to remove it.

The current parent checkpoint and scoped evidence are maintained in
[`main-consolidation.md`](main-consolidation.md) and [`features.md`](../features.md).
They record 120 connector, 81 browser/benchmark/dependency, 42 runtime, 29
held-capture, 27 fallback, 27 monitor, and six native-preview checks; coordination
is 104/105 because local AJV is missing, with four readiness cases not run.
Runtime strict-library and base-browser checks pass; benchmark strict checking
fails for missing local SDK declarations; connector strict checking fails for
missing local JSON-Schema declarations, while the unchanged full source graph
passes only with authentic SHA-512 declarations mapped in scratch. Fifty-five
adjacent checks and fresh health pass. These scoped results are not full
goal/native/model/visible acceptance.

Do not read historical “no activation” statements below as denying newer,
separately scoped canonical pilot observations. The current feature inventory
records a ChatGPT image-generation pilot, resource-monitor activation, and
desktop capture/Calculator observations. Those observations do not turn this
proposal into current release authority or establish full acceptance.

# Delivery preservation and branch-release workflow

This guide defines a **read-only** audit and a proposal-only route from verified
Git commits to a separate release branch and, later, `main`. It does not create
baselines on disk, stage files, create commits or branches, merge, push, fetch,
repair an archive, or authorize release.

The implementation is [`scripts/delivery-preservation.py`](../../scripts/delivery-preservation.py);
its real-file fixtures are [`scripts/delivery-preservation.test.py`](../../scripts/delivery-preservation.test.py).

## Evidence and limits at this delivery boundary

- The assigned worktree is `/home/james/repos/computer-use-delivery`, branch
  `consolidated-delivery`. At task entry, `HEAD` was the actual Git commit
  `c71b8cc57004a65ed4198cf0e5ae8f256e56f532`.
- The task supplied these **original-worktree** anchors: index SHA-256
  `330084167186bc557a9311ce9d891e55f80127747ac0c077324e79cd2d61b15b` and
  staged binary-patch SHA-256
  `91d6022a66f661ad993f27b3d2c1ee1997dd8ac2261c2830ef213e22ccb1c805`.
  They are not a complete path/content baseline. The original 637-path scratch
  baseline was lost and must not be reconstructed or claimed as verified.
- This linked delivery worktree has its own Git index. At task entry its index
  SHA-256 was `f830a1aee3d05d5ac06230b11f449585d21246cc9db1ef54b809a7e259ac47ae`;
  its staged patch was empty (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`).
  Those values describe this worktree only and are not evidence that the
  original worktree changed. Git index hashes are worktree-local.
- A goal checkpoint, goal export, report, or task completion is **not** a Git
  commit. The current Git commit is established from `HEAD^{commit}`; a supplied
  goal-checkpoint label is reported separately and is never resolved through
  goal state or counted as a commit.
- No commit, merge, or push has occurred for this delivery. The branch head at
  task entry remained `c71b8cc…`; new source files remain ordinary worktree data
  until an independently authorized Git operation records them.
- A same-state, read-only preflight during verification found `consolidated-delivery`
  zero commits ahead of and one behind local `main`; there is no source commit
  waiting to be merged. Current uncommitted work is not a Git checkpoint.
- Keep the known `483f6755-70a7-4912-aee3-816fbe0b7546/plan.md` archive
  mismatch intact. The existing audit found a timestamp-only byte difference:
  manifest/snapshot expected SHA-256
  `96ef0de60816e811f1fbc81ebc8c893658013d8115552deb3789246d67dd9891`, current
  plan SHA-256 `ee9de7a6fec9d148bdee2c938b7e396afd18aba4a21b05296533196f26239808`.
  The bytes' author/cause remain unknown. The ordinary goal-docs writer's
  manual-edit guard remains in force; this auditor never rehashes, repairs,
  restores, or applies an archive. The accepted `source19focused` /
  `142companion` archive set is retained as-is; no rebuild is part of this work.
- No complete per-path content baseline was captured for this task before edits.
  A baseline captured now is a new observation, not retroactive proof for the
  lost original baseline or for earlier work.

## Read-only commands

Use Python's standard library only; no package installation is needed. The
auditor disables Git optional locks and configured fsmonitor execution, uses
fixed argument arrays (not a shell), and bounds status, output, path, and file
sizes. It refuses ambiguous Git repository-override environment variables,
symlink traversal, unsupported dirty directories/submodules, and over-budget
input rather than claiming complete coverage. Capture takes two matching
read-only samples and refuses detected concurrent changes; it takes no lock, so
rerun immediately before any later operation if another writer may be active.

Run the real-file Git fixtures with:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/delivery-preservation.test.py
```

Capture writes JSON to **stdout only**. If retaining it, direct stdout to a new
file outside the worktree; never put the baseline inside the tree being audited:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/delivery-preservation.py capture --repo .
```

Compare a later state to an independently retained baseline. `--allow-path` is
an exact path exception for a newly added file; it cannot exempt or mask a path
that existed in the baseline. Supply every owned new file separately:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/delivery-preservation.py audit \
  --repo . --baseline /tmp/opencode/delivery-before.json \
  --allow-path docs/codex-parity/branch-release-workflow.md \
  --allow-path scripts/delivery-preservation.py \
  --allow-path scripts/delivery-preservation.test.py
```

The audit compares exact worktree identity, branch and `HEAD`, raw index bytes,
staged patch bytes, porcelain-v2 status scope, and hashes/modes for every dirty
or untracked non-ignored file. The staged-patch digest is over the exact bytes
from:

```text
git diff --cached --binary --full-index --no-ext-diff --no-textconv --no-renames --no-color
```

Ignored paths are not inventoried. Neither a snapshot nor a matching comparison
authenticates who created the baseline; preserve its source and custody
separately. A missing, incomplete, or reconstructed path list cannot prove
unrelated-file preservation.

Check a local target branch without contacting a remote:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/delivery-preservation.py audit \
  --repo . --baseline /tmp/opencode/release-branch-before.json \
  --target main --goal-checkpoint '<label-only>'
```

The optional checkpoint argument is just caller-supplied text. The report shows
the actual `HEAD` commit independently. Exit code `0` means no discrepancy was
detected in the requested checks; it is **not** a merge approval or a claim that
conflicts were simulated. Exit code `1` reports a preservation/archive or
structural preflight blocker. Exit code `2` means invalid input, unsafe state,
or an incomplete bounded read.

To audit a goal-docs archive, select its existing root containing
`.goal-docs-manifest.json`:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/delivery-preservation.py archive --root docs/goals
```

This independently checks manifest integrity, owned-file hashes, the README's
managed block, bundle identity and snapshot-to-manifest generated-file hashes.
It rereads the owned bytes to detect changes during the audit, but takes no
archive lock; another writer can still change data after the second sample. It
makes no supported goal-state query, so freshness stays unverified. A mismatch
remains a mismatch; do not route around the writer guard or infer provenance
from this report.

## Separate release-branch proposal

The intended flow keeps the delivery/integration work separate from the branch
used to present an exact release into `main`:

1. **Preserve the current branch.** Record an external baseline before any
   authorized operation. Review the combined tree (including untracked source),
   the exact staged patch, and all existing dirt. Do not stage the whole tree.
2. **Establish actual Git checkpoints.** A goal checkpoint is not a Git object.
   Only independently authorized commits on the selected source branch create
   Git checkpoints. Record their commit IDs and exact file scope; do not infer a
   commit from a goal status, saved plan, export, or passing test.
3. **Prepare a distinct release branch.** After parent review and a separate
   authorization for the branch operation, create/use a dedicated
   `release/<delivery-id>` branch from the intended local `main` base. Transfer
   only the specifically approved commits into that branch. This auditor does
   not create the branch, cherry-pick, stage, or merge into it.
4. **Preflight toward `main`.** On the clean release branch, capture a baseline
   and run `audit --target main`. The proposal verifies a local target ref, a
   common ancestor, source/target commit counts, committed path scope, unchanged
   baseline, and a clean index/worktree. It does not fetch, read remote state,
   or create merge objects.
5. **Parent review, then separately authorized release.** A
   `structural_candidate_for_parent_review` is not a merge-ready claim. The
   auditor deliberately leaves conflict detection unknown: Git's full
   `merge-tree --write-tree` path can write objects, so it is outside this
   read-only contract. Review the exact target/source diff and conflict status
   by an independently approved method. Commit, merge into `main`, push, PR
   publication, and deployment each retain their own applicable authority.

The report always sets `final_merge_ready` and `merge_authorized` to false and
records whether a real merge, commit, push, release-branch creation, or remote
check occurred. A structural candidate only says that the read-only local graph
and preservation checks found no prerequisite blocker; it is not evidence that
the merge will succeed.
