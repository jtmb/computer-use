---
name: ingenium-kubernetes-deploy
description: Deploy or migrate Ingenium to James's production Kubernetes cluster using the existing Helm and Flux publisher, preserving installation data, credentials and models. Agent/operator workflow only; do not add deployment controls to Ingenium.
---

# Deploy Ingenium to Kubernetes

Use this for actual deployment work, not a product feature. Read the sibling [deploying-to-prd skill](../deploying-to-prd/SKILL.md), then verify its target live. Keep Ingenium development in the user's current Codex window and never develop through OpenCode. Preserve the exact provider/model/default configuration; a permitted response-test override is not authorization to change defaults.

## Delivery owners

Ingenium source is `jtmb/ingenium`, canonical WSL `/home/brajam/repos/ingenium`. Preserve dirty work; capture source through the repository's reviewed source-snapshot procedure rather than sweeping a dirty checkout into a build. The runtime image must identify its exact Git revision, source repository and source snapshot hash.

Charts are private `jtmb/branconet-charts`, app path `charts/ingenium`, release `flux/releases/ingenium.yaml`, target/storage namespace `ingenium`, HelmRelease `flux-system/ingenium`. The shared Windows checkout is `C:/Users/james/AppData/Local/BORTUS/repos/branconet-charts`; use Windows Git and inspect concurrent dirt/owner before edits. Use an isolated checkout for Ingenium. Read that repository's AGENTS.md, README.md, docs/OPERATIONS.md and docs/INGENIUM.md before changing deployment behavior.

The current publisher is main -> the running local exact-source validation service -> validated plus immutable commit tag -> Flux. GitHub Actions is disabled. Never enable/dispatch Actions, bypass successful validation, manually advance validated, or create a second Helm/kubectl application publisher. Native Secret provisioning through the existing operator and stdin is separate from Git-managed deployment intent. No Secret values, keys, databases, kubeconfigs or credentials may enter Git, values, arguments or logs.

Use the existing Docker Hub account/repository `jtmb92/ingenium`. Ingenium's `ops/publish-image.py` verifies the existing pull/push grant and source labels before publishing an already built image, then reads the registry digest/config back. Its Windows credential helper consumes the existing Credential Manager entry; never run it with stdout exposed. A source commit, image build, publication or zero-replica HelmRelease is not deployment acceptance.

## Preserve the installation

Inventory the actual local container's mounts and environment names without dumping values. Preserve core data/attachments/skills/vault/authentication and backup-signing keys, OpenCode configuration/data/sign-ins/Goal state, VS Code state, all required workspaces/path aliases and the legacy readonly OpenCode store. Inspect localhost-only provider endpoints, iframe aliases and OAuth callbacks before migration. Measure required content and check external symlinks; do not drop source or unique evidence to make storage fit.

The existing paired SQLite checkpoint is useful but incomplete. Obtain a coordinated full cold backup after source writers are quiesced. Verify encrypted archive/manifest and an independent restore. Preserve originals and data-compatible rollback. Provision native bootstrap and model-config Secrets by copying the existing values, never generating replacement keys. Mount credential files by readonly subPath to satisfy no-symlink bootstrap checks. Kubernetes projects native Secret files as root-owned, while this image's strict reader requires its baked installation-user ownership: use the chart's bounded bootstrap init to copy the four unchanged inputs into private memory with the checked image UID/GID and mode0600. Keep the original reader intact and the public mail CA on its original readable0444 Secret item. This init mounts no state claim and has no API token. Preserve numeric ownership/modes/ACLs of installation data. Vault passphrase stays in operator recovery storage; unseal through the normal authenticated API after startup when authorized.

Mounting memory storage over `/run/ingenium-secrets` also hides the image's private Cloudflare directory. Preserve the immutable image's empty directory hierarchy and exact numeric ownership/modes with the bounded init before the main container starts. Do not loosen process-isolation validation or make the directory shared. The chart refuses unexpected image files, symlinks and writable image directories; the exact-image fixture verifies the full directory metadata and an idempotent second run.

## State-transfer helpers

For cold transfer or independent restoration, read [state-transfer.md](references/state-transfer.md). The tested helpers preserve file contents/owners/modes/ACLs/xattrs/links, authenticate encrypted archives, and snapshot the separate readonly host-history SQLite store without stopping host OpenCode. The readonly writer audit matches device/inode identities across container path aliases and shared writable mappings; the caller still verifies the actual stopped-container fence. These helpers never stop services, deploy or delete source files. Keep their outputs under the task's already declared output root.

Measure image download, unpacked node allocation, runtime state and developer artifacts separately. Preserve original PC workspaces and evidence; record explicit runtime-transfer exclusions for reproducible builds/dependencies and unrelated test artifacts. Do not copy all host development trees merely to run the image. Recheck Longhorn logical reservations and actual post-write filesystem/eviction headroom before choosing a claim; clearing its scheduling floor alone does not prove capacity.

## Storage and single-writer gate

Recheck Longhorn's actual disk conditions, replica placement, headroom and original PVC/PV identities. Its default class uses Retain and redundant replicas. Do not lower replica counts, scheduling floors, or admission controls to force the deployment through, and do not prune node images or migration artifacts owned by another task. On October 27 only worker1 was schedulable; that observation must be refreshed rather than assumed permanent.

The chart starts as a preparation release: zero replicas and no route. Measured sizing and explicit storage-provisioning approval permit creation of the retained claim; actual healthy redundant placement is a separate observation required before any data transfer or application writer starts. Consistent restored data, imported credentials and a verified quiesced source are also required before starting the application. Do not call a staged release a migrated application. Use one writer, Recreate strategy and retained storage. Never start both original and target mail/jobs/synthesis writers.

When the empty Ingenium claim lands on an unqualified node, prefer a volume-specific selector over whole-node eviction. Verify live tag semantics first: adding a tag to workers must not exclude unrelated selectorless volumes. The qualified worker pair uses the `ingenium-runtime` Longhorn tag. Preserve at least two healthy copies while relocating: a temporary third copy can be rebuilt and observed RW before UID-conditioned removal of only the unwanted empty replica and restoration of the original desired count. Never reduce redundancy below the original two copies or apply this empty-volume procedure to populated volumes without a new recovery review. Record exact identities, placement, engine RW states and actual filesystem headroom afterwards.

After a graceful final restore-Pod shutdown, Longhorn1.12.1 normally reports a detached volume's robustness as unknown while stopping its engine/replicas. Bind the previous attached healthy/two-RW observation and successful complete restoration to the same claim/volume/replica UIDs, unchanged last-healthy evidence, empty failure markers and clean detachment. Do not mistake this expected offline state for a new storage failure, or classify an attached unknown/degraded/faulted volume as healthy. Recheck both RW replicas and actual healthy robustness immediately after application attachment. See the [versioned volume controller](https://github.com/longhorn/longhorn-manager/blob/v1.12.1/controller/volume_controller.go).

## Access profile

The full existing administrative UI keeps localhost origins through an operator-authenticated SSH forward to the cluster's ClusterIP Service, including the callback-only port. This moves the server/state off the computer without publishing auth-none OpenCode/CLI/VS Code roots. Retain SSH host verification. Do not expose private upstream ports or add private services to the info-only Cloudflare tunnel.

After actual application acceptance, the localhost production profile uses migration.verified=true, applicationChecksPassed=true and staging=false while routingReviewed=false keeps optional Ingress/Certificate resources absent. Confirm the rendered Deployment spec and resource set before promotion. If chart tests are added, inspect the publisher and publication-observation verifier's exact expected suite count together; preserve all checks and failed attempts, then use a new reviewed main commit through the running singleton watcher.

The optional dashboard LAN route uses Traefik and a namespace-local Certificate from branconet-local-ca. Validate DNS and certificate trust separately; never bypass browser warnings. Keep public homepage/privacy/terms on the existing dedicated information tunnel, with its encrypted run token preserved. Follow docs/operations/kubernetes.md in Ingenium and docs/INGENIUM.md in charts for the effective configuration.

For the standard localhost administrative profile, read [private-access.md](references/private-access.md). The tested SSH supervisor reconnects both ports after a Pod replacement, uses the existing identity/strict host verification, and closes its remote port-forward on heartbeat loss. Install/start the Windows login task only after target readiness and the original source fence; never replace an unrelated task or take ports from the local source.

## Verify and finish

After the exact reviewed publication, verify Flux source/release revision, actual Pod image digest, readiness/restarts, Service/endpoints, intended routes and preserved Secret/PVC identities. Verify original account/data fingerprints, fresh inference, full synthesis proposal/approval/activation/persistence, real mail send/receive, vault access, docs/jobs/backups, and Goal behavior outside /chat. Repeat persistence and application checks after a Pod replacement.

Keep the local source available for rollback and stop it only in the controlled single-writer cutover. Fence target writers before rollback and retain any target changes. Report real blockers plainly; do not mark the deployment complete at a chart, source, image, zero-replica or Ready-only checkpoint. Reconcile task-owned build/cache/temp outputs while retaining active runtime, required recovery material and unique evidence.
