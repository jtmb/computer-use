# F02 — Goal archive integrity finding (2026-10-28)

## Finding

Ownership-aware audit of all 13 directories under `docs/goals/` found **1 real mismatch among 53 manifest-owned entries** (52 match): `483f6755-70a7-4912-aee3-816fbe0b7546/plan.md`. It is a **header-only export-time difference**, not a substantive plan-body difference. The README index's managed block matches its manifest digest. A separate, historical raw-store comparison raised a lifecycle-freshness question for one README row, but that is not a checksum mismatch or supported live-status finding.

No generated file, manifest, lock, or live goal-store file was changed during this audit. No repair, rehash, lock deletion, or force overwrite was performed.

## Complete manifest-to-file audit

The manifest lists four generated files for each of 13 goal bundles plus the managed section of `README.md` (53 owned entries). Bundle-file hashes are SHA-256 of exact file bytes. For `README.md`, the writer hashes only the inclusive managed block from `<!-- goal-docs:managed:start -->` through `<!-- goal-docs:managed:end -->`; `MATCH` means the applicable owned bytes equal the manifest entry. The README's whole-file SHA-256 is not comparable to its recorded managed-block digest.

| Generated file | Manifest SHA-256 | Actual SHA-256 | Result |
|---|---|---|---|
| `0d966462-9d3a-4194-b518-e3eeaed60644/HANDOFF.md` | `5eafec1c2e730cae360ca0e47a3ec8d9f498a902b1cd6c533c48719251236f61` | `5eafec1c2e730cae360ca0e47a3ec8d9f498a902b1cd6c533c48719251236f61` | MATCH |
| `0d966462-9d3a-4194-b518-e3eeaed60644/plan.md` | `f9166bf081ac40862384105dad7d7f8739e7adb1922f16dfc58ce42d82002ab7` | `f9166bf081ac40862384105dad7d7f8739e7adb1922f16dfc58ce42d82002ab7` | MATCH |
| `0d966462-9d3a-4194-b518-e3eeaed60644/snapshot.json` | `23fb446a6d5207b8a556a5c83984e3e052e34ebfb40c054e8208c1e2652b0ff8` | `23fb446a6d5207b8a556a5c83984e3e052e34ebfb40c054e8208c1e2652b0ff8` | MATCH |
| `0d966462-9d3a-4194-b518-e3eeaed60644/work-history.md` | `14470272e6b917c1a7c8c8672679c4e5597ed95157be3f0b2664592fc54e5503` | `14470272e6b917c1a7c8c8672679c4e5597ed95157be3f0b2664592fc54e5503` | MATCH |
| `313b3d97-c8ff-480e-81aa-3ef2095727c0/HANDOFF.md` | `8fa66e6ae5c9c65cc5549f32cd2317620e3295c762dfc67133f5ba23e42f625a` | `8fa66e6ae5c9c65cc5549f32cd2317620e3295c762dfc67133f5ba23e42f625a` | MATCH |
| `313b3d97-c8ff-480e-81aa-3ef2095727c0/plan.md` | `243a2e181040c7db1cef76b43c04561c1ee2f38cc040d45f7a2bc4009bd7ceef` | `243a2e181040c7db1cef76b43c04561c1ee2f38cc040d45f7a2bc4009bd7ceef` | MATCH |
| `313b3d97-c8ff-480e-81aa-3ef2095727c0/snapshot.json` | `5cbc6ad9d6bbfc83e6a89f697d7d7af10d3ee65784ba9f6f84be54aadeb5ccea` | `5cbc6ad9d6bbfc83e6a89f697d7d7af10d3ee65784ba9f6f84be54aadeb5ccea` | MATCH |
| `313b3d97-c8ff-480e-81aa-3ef2095727c0/work-history.md` | `5d0af726875dd14b1d1954d13da98444e3546a8118b9d7fde3c834f13719bff4` | `5d0af726875dd14b1d1954d13da98444e3546a8118b9d7fde3c834f13719bff4` | MATCH |
| `464c3066-1eb6-452a-bbe5-4c138dc9e899/HANDOFF.md` | `a8b5b621e869bb162dc2fd99ae7173c28cdf4aec0294c635bd2f864a38e5a90f` | `a8b5b621e869bb162dc2fd99ae7173c28cdf4aec0294c635bd2f864a38e5a90f` | MATCH |
| `464c3066-1eb6-452a-bbe5-4c138dc9e899/plan.md` | `3dfc4eaf351dcf198bc68ee278959aa8122986aebb6b0477bfb1c9ffae43eabe` | `3dfc4eaf351dcf198bc68ee278959aa8122986aebb6b0477bfb1c9ffae43eabe` | MATCH |
| `464c3066-1eb6-452a-bbe5-4c138dc9e899/snapshot.json` | `d0f40d6148f9803149e691e1b04d5d58bf18d9d0f02657540abba0c70b6e0944` | `d0f40d6148f9803149e691e1b04d5d58bf18d9d0f02657540abba0c70b6e0944` | MATCH |
| `464c3066-1eb6-452a-bbe5-4c138dc9e899/work-history.md` | `9d54d4181d180059c0ecc59d3a3bb2d074f7fe6287c134b454b8ec686e53f68c` | `9d54d4181d180059c0ecc59d3a3bb2d074f7fe6287c134b454b8ec686e53f68c` | MATCH |
| `46f3f7e1-a5eb-4b84-b392-016ece39e46b/HANDOFF.md` | `5df312d4c5eff13137d9e4558e1e661d61728d6c5112944f1ed0ae6ad2886e2f` | `5df312d4c5eff13137d9e4558e1e661d61728d6c5112944f1ed0ae6ad2886e2f` | MATCH |
| `46f3f7e1-a5eb-4b84-b392-016ece39e46b/plan.md` | `75215f718f3f0f032d50e578a182ced8d1512359e9ec1ea6e7826ec5ed12965a` | `75215f718f3f0f032d50e578a182ced8d1512359e9ec1ea6e7826ec5ed12965a` | MATCH |
| `46f3f7e1-a5eb-4b84-b392-016ece39e46b/snapshot.json` | `adb9bab35b3842984de3d5268cb1357fe8ea42b4ea5f2cabc10cd36182c70c86` | `adb9bab35b3842984de3d5268cb1357fe8ea42b4ea5f2cabc10cd36182c70c86` | MATCH |
| `46f3f7e1-a5eb-4b84-b392-016ece39e46b/work-history.md` | `f338c346d7117b7e8651fd6ee12ab881a4236583b85ac13fb550a19fe99866c8` | `f338c346d7117b7e8651fd6ee12ab881a4236583b85ac13fb550a19fe99866c8` | MATCH |
| `483f6755-70a7-4912-aee3-816fbe0b7546/HANDOFF.md` | `c61c4e51af14c90ed7fea462b268e97ac315a5013f17897f00f11880b38584ac` | `c61c4e51af14c90ed7fea462b268e97ac315a5013f17897f00f11880b38584ac` | MATCH |
| `483f6755-70a7-4912-aee3-816fbe0b7546/plan.md` | `96ef0de60816e811f1fbc81ebc8c893658013d8115552deb3789246d67dd9891` | `ee9de7a6fec9d148bdee2c938b7e396afd18aba4a21b05296533196f26239808` | **MISMATCH** |
| `483f6755-70a7-4912-aee3-816fbe0b7546/snapshot.json` | `c0f1d41bfe91fc30d432b502193b061391aaaeb54b435c197fe9752e7768785d` | `c0f1d41bfe91fc30d432b502193b061391aaaeb54b435c197fe9752e7768785d` | MATCH |
| `483f6755-70a7-4912-aee3-816fbe0b7546/work-history.md` | `7fef4c84d7582d5b2d5bddf893c8e89702564c283110dd55b1032f5f954467dc` | `7fef4c84d7582d5b2d5bddf893c8e89702564c283110dd55b1032f5f954467dc` | MATCH |
| `4e35a9a5-2527-4681-8715-4e480ee95a8d/HANDOFF.md` | `5d3e611ddaae612d8b8a27a7d12f6eb577ff8a9a07f2d5493c251d6899c24120` | `5d3e611ddaae612d8b8a27a7d12f6eb577ff8a9a07f2d5493c251d6899c24120` | MATCH |
| `4e35a9a5-2527-4681-8715-4e480ee95a8d/plan.md` | `432e8546cd37ad20abc4b6a17b16ee0abe734f4c1ec24e44c221a169123b437f` | `432e8546cd37ad20abc4b6a17b16ee0abe734f4c1ec24e44c221a169123b437f` | MATCH |
| `4e35a9a5-2527-4681-8715-4e480ee95a8d/snapshot.json` | `5e911edeaac961f8b39f4f271607a84bd08d65e6d1d3d11effea2f40dd066449` | `5e911edeaac961f8b39f4f271607a84bd08d65e6d1d3d11effea2f40dd066449` | MATCH |
| `4e35a9a5-2527-4681-8715-4e480ee95a8d/work-history.md` | `b5903d3dea6eb4147b9c263d7bcc713f1bae1c11b104d69ba2a92e2435b2d9d6` | `b5903d3dea6eb4147b9c263d7bcc713f1bae1c11b104d69ba2a92e2435b2d9d6` | MATCH |
| `512d114e-ee38-4d54-97f2-e1a189073974/HANDOFF.md` | `73ae171a769cbec9302e5b6fa99df0de4f7a61fbb75244f05a52712e1eb38b6f` | `73ae171a769cbec9302e5b6fa99df0de4f7a61fbb75244f05a52712e1eb38b6f` | MATCH |
| `512d114e-ee38-4d54-97f2-e1a189073974/plan.md` | `caa051252f094163c58e8e6aea0733f8253d92d4fa6f11b83e9036f46ee05f53` | `caa051252f094163c58e8e6aea0733f8253d92d4fa6f11b83e9036f46ee05f53` | MATCH |
| `512d114e-ee38-4d54-97f2-e1a189073974/snapshot.json` | `6f26e7ada082080b63248ee1b169da64198aa6889b665d0f7362077f3a916cfd` | `6f26e7ada082080b63248ee1b169da64198aa6889b665d0f7362077f3a916cfd` | MATCH |
| `512d114e-ee38-4d54-97f2-e1a189073974/work-history.md` | `a5e1999495d273668cb6386235c6fcbf1e3834b7699d466b6a04d75ab5b1eee4` | `a5e1999495d273668cb6386235c6fcbf1e3834b7699d466b6a04d75ab5b1eee4` | MATCH |
| `53eacb15-7fd9-4c20-b4d4-038111b68e6f/HANDOFF.md` | `9c0177256c3be2346259053ba1b67ce42dabd2f89264fca0f0dd88dcacdea3a3` | `9c0177256c3be2346259053ba1b67ce42dabd2f89264fca0f0dd88dcacdea3a3` | MATCH |
| `53eacb15-7fd9-4c20-b4d4-038111b68e6f/plan.md` | `3c99583d64b5e074aa9ce13b7351dfccec6544fb80c1793ffb9c12fa86e4c435` | `3c99583d64b5e074aa9ce13b7351dfccec6544fb80c1793ffb9c12fa86e4c435` | MATCH |
| `53eacb15-7fd9-4c20-b4d4-038111b68e6f/snapshot.json` | `3201d57d7465657b912dffe8453d74858b2c8c792ffa743d360acefc6e55c413` | `3201d57d7465657b912dffe8453d74858b2c8c792ffa743d360acefc6e55c413` | MATCH |
| `53eacb15-7fd9-4c20-b4d4-038111b68e6f/work-history.md` | `999f7fb43db46b670d86f362c60f28116c7a6807a9ce8b84728a3b257bbce301` | `999f7fb43db46b670d86f362c60f28116c7a6807a9ce8b84728a3b257bbce301` | MATCH |
| `55f4842e-6b49-4507-bc5f-7d045dc92798/HANDOFF.md` | `d1d68a7bb5aa2eae661a8d984b42b0f9b44b555ab4ecab3ea2b68d62d626e967` | `d1d68a7bb5aa2eae661a8d984b42b0f9b44b555ab4ecab3ea2b68d62d626e967` | MATCH |
| `55f4842e-6b49-4507-bc5f-7d045dc92798/plan.md` | `6287944e95320919d590d2f2a415e4dc620631b2b318247e7719d01fd8ee5416` | `6287944e95320919d590d2f2a415e4dc620631b2b318247e7719d01fd8ee5416` | MATCH |
| `55f4842e-6b49-4507-bc5f-7d045dc92798/snapshot.json` | `23df471b4de2dd1440bf2374e11f00e20905a58b70a99ba9622c06de6a137a6f` | `23df471b4de2dd1440bf2374e11f00e20905a58b70a99ba9622c06de6a137a6f` | MATCH |
| `55f4842e-6b49-4507-bc5f-7d045dc92798/work-history.md` | `bc9e8d275b09c2553761e197c91549a09767831dc38d3bd82c8ab6538b88bef9` | `bc9e8d275b09c2553761e197c91549a09767831dc38d3bd82c8ab6538b88bef9` | MATCH |
| `69b8f91d-1051-4445-808b-2778748de8db/HANDOFF.md` | `174f712a02594676d44a4d0dd3f6a1c8e8263486bc6ea983eaf0fbc599ea05c0` | `174f712a02594676d44a4d0dd3f6a1c8e8263486bc6ea983eaf0fbc599ea05c0` | MATCH |
| `69b8f91d-1051-4445-808b-2778748de8db/plan.md` | `d2454f33bddcba362029c91bcc661636ef5c23efe2503d9712b10314aaf7d008` | `d2454f33bddcba362029c91bcc661636ef5c23efe2503d9712b10314aaf7d008` | MATCH |
| `69b8f91d-1051-4445-808b-2778748de8db/snapshot.json` | `cb2d4bb9d68e3ffdb5a0ce709bd27493c2cd7fca8f907bb7912c872e72e5adf2` | `cb2d4bb9d68e3ffdb5a0ce709bd27493c2cd7fca8f907bb7912c872e72e5adf2` | MATCH |
| `69b8f91d-1051-4445-808b-2778748de8db/work-history.md` | `5275ef7e3c6c26a63228ae68bd1b8c3199a9c12a062d7c11fc12a1fe82183bcd` | `5275ef7e3c6c26a63228ae68bd1b8c3199a9c12a062d7c11fc12a1fe82183bcd` | MATCH |
| `a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7/HANDOFF.md` | `e2430d8304dd332d3c74c2232f3ccdfa1d04d3388ae1618d93ad9b13f79641ea` | `e2430d8304dd332d3c74c2232f3ccdfa1d04d3388ae1618d93ad9b13f79641ea` | MATCH |
| `a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7/plan.md` | `9a7cd0ac260c4b5d2935d77a7733fc56c0835d5ddf6bf851da47c9b440b31636` | `9a7cd0ac260c4b5d2935d77a7733fc56c0835d5ddf6bf851da47c9b440b31636` | MATCH |
| `a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7/snapshot.json` | `028f590d3d541711589520784f783d99c9e4259c9a4501f32e247365e96c321d` | `028f590d3d541711589520784f783d99c9e4259c9a4501f32e247365e96c321d` | MATCH |
| `a0ce8b0f-91fe-413a-9c4e-8ce4da5d40d7/work-history.md` | `61fb5b2934af859b5bc0051956137fad11caef7931fec71a13f17fee265939d3` | `61fb5b2934af859b5bc0051956137fad11caef7931fec71a13f17fee265939d3` | MATCH |
| `d1ff47da-5c16-409d-997c-4478cd6737ae/HANDOFF.md` | `5e72fbc35227e184bd9015539441bdf393c9acc5b1c32eec428c48c393b29236` | `5e72fbc35227e184bd9015539441bdf393c9acc5b1c32eec428c48c393b29236` | MATCH |
| `d1ff47da-5c16-409d-997c-4478cd6737ae/plan.md` | `972e187595a90e3d4487fa49845bb31ebb70d5f34c2c3f91e404f1e26dc5ab90` | `972e187595a90e3d4487fa49845bb31ebb70d5f34c2c3f91e404f1e26dc5ab90` | MATCH |
| `d1ff47da-5c16-409d-997c-4478cd6737ae/snapshot.json` | `ac4e74870facd87d168329a72acebaec37d12a968876f92ee602bf35b1c4ddc5` | `ac4e74870facd87d168329a72acebaec37d12a968876f92ee602bf35b1c4ddc5` | MATCH |
| `d1ff47da-5c16-409d-997c-4478cd6737ae/work-history.md` | `8ac8c7c82794e7ad340b686e6ee844d0193543effd66cc83004090ce1140eb68` | `8ac8c7c82794e7ad340b686e6ee844d0193543effd66cc83004090ce1140eb68` | MATCH |
| `ec2a347f-8071-4358-bc93-a223a846247d/HANDOFF.md` | `fc340240d41f4d24efa46b41a62af8fe8c2b72a0308b5c2a05d900e14fc6cde2` | `fc340240d41f4d24efa46b41a62af8fe8c2b72a0308b5c2a05d900e14fc6cde2` | MATCH |
| `ec2a347f-8071-4358-bc93-a223a846247d/plan.md` | `940ed380a2185a5573b553230a6cdb922922270ba420bd5e68effceeaebcfff4` | `940ed380a2185a5573b553230a6cdb922922270ba420bd5e68effceeaebcfff4` | MATCH |
| `ec2a347f-8071-4358-bc93-a223a846247d/snapshot.json` | `2feb840c184d38fd935848a3ac6c17231dd520f1db01bc34fa735fb959e08869` | `2feb840c184d38fd935848a3ac6c17231dd520f1db01bc34fa735fb959e08869` | MATCH |
| `ec2a347f-8071-4358-bc93-a223a846247d/work-history.md` | `c31ba3ebbf0c23d5c932e90307a82a1b3f780a5353b9aeaf1956019fe5005f11` | `c31ba3ebbf0c23d5c932e90307a82a1b3f780a5353b9aeaf1956019fe5005f11` | MATCH |
| `README.md` (managed block only) | `9b5ef6cd6bfef923db6dbee88d46fb14aa26819d54c1307e02465b8b77dad179` | `9b5ef6cd6bfef923db6dbee88d46fb14aa26819d54c1307e02465b8b77dad179` | MATCH |

The README whole-file SHA-256 is `f689df7e3ef5f862207f3034f5c23989b71b4add416919e401ec178f169d15a0`; it includes unmanaged surrounding bytes and is **not comparable** to the manifest's managed-block digest. The canonical writer's `extractManagedReadme`/`mergeReadme` logic in `writer.ts:515-572` defines this ownership boundary.

## 483f plan: renderer contract and concrete diff

I invoked the repository's actual `buildGoalDocBundle` in `.opencode/plugins/goal-docs/render.ts`, passing `source` and `goal` read from that bundle's `snapshot.json`. It rendered `plan.md` with SHA-256 `96ef0de60816e811f1fbc81ebc8c893658013d8115552deb3789246d67dd9891`, exactly the manifest and `snapshot.generatedFiles` value. Comparing those renderer bytes to the current plan produced only this hunk:

```diff
--- render.ts(snapshot inputs)
+++ actual plan.md
@@
-- Exported at: `2026-10-28T03:58:34.686Z`
+- Exported at: `2026-10-28T03:59:00.586Z`
```

The current file's hash is `ee9de7a6fec9d148bdee2c938b7e396afd18aba4a21b05296533196f26239808`. No summary, criterion, phase, task, decision, evidence, blocker, status, revision, or plan-update timestamp differs from the renderer output based on the snapshot.

Replacing **only** `2026-10-28T03:59:00.586Z` with `2026-10-28T03:58:34.686Z` in the current plan makes it byte-identical to the renderer result: the substituted SHA-256 is `96ef0de60816e811f1fbc81ebc8c893658013d8115552deb3789246d67dd9891` (`after_only_timestamp_substitution_byte_identical=True`). This establishes the content difference, not its author or cause.

This conclusion follows the code contract:

- `state.ts:134-162` reads the configured shared goal-state JSON, selects it by session ID, validates it, and returns the current goal plus retained archives. `model.ts:274-308` parses current/archive records; `semanticFingerprint` at `model.ts:311-328` fingerprints goal semantics, not `ExportSource.exportedAt`.
- `render.ts:43-58` renders metadata including `Exported at`, status, and plan revision. `render.ts:61-113` renders plan content from the persisted summary, criteria, phases/tasks, evidence/blockers, and decisions. `render.ts:202-226` hashes `plan.md`, `HANDOFF.md`, and `work-history.md` into `snapshot.generatedFiles`; the snapshot does not hash itself.
- Therefore the self-consistent `snapshot.generatedFiles` and manifest record the snapshot-time plan bytes, while the current plan has only a different export-time header.

## Cross-file consistency and live index

### Bundle 483f6755-70a7-4912-aee3-816fbe0b7546

| Field | `plan.md` | `HANDOFF.md` | `snapshot.json` / manifest | Result |
|---|---|---|---|---|
| Status | `active` | `active` | `active` | Agrees |
| Plan revision | `5` | `5` | `5` (`goal.planRevision` and `goal.plan.revision`) | Agrees |
| Exported at | `2026-10-28T03:59:00.586Z` | `2026-10-28T03:58:34.686Z` | `2026-10-28T03:58:34.686Z` | Plan header differs by 25.900 s |
| `snapshot.generatedFiles` | current plan bytes do **not** match | matches | expected plan hash `96ef…9891`; HANDOFF `c61c…84ac`; work-history `7fef…67dc` | Snapshot map agrees with manifest; only plan bytes disagree |
| `contentFingerprint` | n/a | n/a | `f78eeaf1ee8a63b9d586960af454304fd847fc68f1261627203ac30c718e8a67`, equal to manifest goal index | Intact for this recorded snapshot |
| `planFingerprint` | n/a | n/a | `c29530a3777632dfa7332cf274788c9519f58edbe43b27f1909536e738949f70`, equal to the renderer result and manifest goal index | Intact for this recorded snapshot |

The manifest's own integrity digest also validates: stored and recomputed `integrity` are both `e2f657c86a56a75f31dc4c07c71659f109d7d85a2ec4e93a98dad7a5c5336fef`. This validates the manifest payload's checksum, **not** that every file still matches its `files` map.

### README lifecycle freshness (historical, untrusted context)

An earlier audit turn directly parsed `/home/james/.opencode-v2-pilot/data/opencode-goal-plugin/goals.json` and reported one apparent status/revision discrepancy for the README row `483f6755-70a7-4912-aee3-816fbe0b7546` (`active`, revision `5`). That earlier parser appeared to show a retained record `cancelled`, revision `13`, and a different current record `unmet`, revision `14`. These values are preserved only as **unverified historical observations**, not live/source-bound authority; the raw store was not reread for this correction. The earlier reported comparison of 13 rows (12 apparent matches, one apparent discrepancy) must not be treated as a verified current status inventory.

Accordingly, the README row is a **distinct freshness question**, not a second integrity mismatch. No claim that it is currently stale relative to an authoritative live record is made here. A supported source-qualified lookup/export for the exact source session and goal is still required before selecting an authoritative lifecycle state or refreshing the index.

## Publication mechanics, mtimes, and cause assessment

### What the writer does

- `writer.ts:303-327` is **temp-file plus rename**, not truncate-in-place: create a unique same-directory `.<name>.goal-docs-<uuid>.tmp` with exclusive create, write, `sync()` the file, close, then rename over the target. A caught failure removes the temp file. This makes an individual replacement atomic; it does not make a four-file bundle and manifest one transaction.
- `writer.ts:637-772` acquires the root/process locks, builds and preflights all desired files, then processes outputs in insertion order (bundle order starts with `plan.md`, then `HANDOFF.md`, `work-history.md`, `snapshot.json`; README follows). After each file it persists the manifest, then persists the final goal index. A crash between a file rename and its following manifest persist can leave that file ahead of the manifest; a crash later can leave a partially published bundle.
- `writer.ts:594-635` reuses exact verified bytes for unchanged semantic content. A mismatched retained file causes `manual_edit` refusal on reuse; preflight also refuses a differing managed file unless its current bytes already equal the desired output. Thus an ordinary same-content retry is **not** a guaranteed self-heal for this mismatch.
- `process-lock.ts:17-53` takes a nonblocking Linux `flock` on a persistent, empty, singly linked regular guard file, held by its open descriptor. The separate owner/recovery locks in `writer.ts:397-513` serialize stale-lock recovery and writing; do not delete or replace the persistent process-lock inode.

### Observed ordering (UTC)

| Path / datum | Observed time |
|---|---|
| 483 snapshot `source.exportedAt` | `2026-10-28T03:58:34.686Z` |
| 483 `HANDOFF.md` mtime | `2026-10-28T03:58:34.965070Z` |
| 483 `work-history.md` mtime | `2026-10-28T03:58:35.414072Z` |
| 483 `snapshot.json` mtime | `2026-10-28T03:58:35.536073Z` |
| 483 current `plan.md` header export time / mtime | `03:59:00.586Z` / `2026-10-28T03:59:01.643227Z` |
| `README.md` mtime | `2026-10-28T03:55:26.131957Z` |
| Manifest mtime | `2026-10-28T13:42:36.518452Z` |
| Persistent `.goal-docs-process.lock` | empty, mode `0600`, device/inode `2050/5380069`, mtime `2026-10-27T05:47:43.888490Z` |

At inspection there was no `.goal-docs.lock`, `.goal-docs.lock.recovery`, or `*.goal-docs-*.tmp` under `docs/goals/`; `lslocks` had no row for `.goal-docs-process.lock`. This is only a point-in-time observation, not evidence about which process last wrote the plan. The manifest's later mtime is also not decisive: `writer.ts:802-820` can persist transfer-record changes without changing generated-file hashes or rewriting exports.

### What the evidence supports—and cannot distinguish

The exact timestamp-only diff, the plan's later mtime than its bundle siblings, and the renderer's expected hash matching both manifest and snapshot are consistent with either (a) a deliberate/manual header-only rewrite, or (b) a later publication attempt that atomically replaced `plan.md` and stopped before the next output/manifest update. The existing writer's per-file sequence makes (b) technically possible; because the writer reuses unchanged bundles and fails closed on hash divergence, it is not evidence that a normal unchanged export would silently repair or produce this state. A later semantic change outside plan text could also yield a new export timestamp with unchanged plan body before interruption.

No editor-local history, process crash log, writer trace, or equivalent provenance tying the `03:59:00.586Z` value to a human save or a specific writer run was collected in this audit. The current empty temp/owner-lock state cannot distinguish the hypotheses: a completed rename leaves no temp file, and locks are released on normal exit or process death. A captured editor undo/local-history record would support manual editing; a contemporaneous writer log or process/crash record showing the plan rename followed by failure before manifest persistence would support interrupted publication. Without such evidence, **manual edit and interrupted/partial publication remain indistinguishable**. There is no evidence of substantive plan-body loss.

## Recommendation / not performed

**Do not blindly restore the manifest hash or run the normal exporter expecting it to repair the file.** Frozen-snapshot versus refreshed-state selection alone does not establish provenance or recovery authority. First obtain a supported, source-qualified lookup/export for the exact source session and goal; only then can the operator choose which verified source state the archive should represent. This audit has not established an authoritative live status or an existing supported repair path for a manifest-divergent generated file.

Proposed reversible contract, not executed:

1. **Establish source authority (read-only):** use a supported source-qualified lookup/export interface to verify the exact source session ID, goal ID, repository/worktree identity, and returned current/archive record. Compare its status, revision, and content to the archived snapshot. Do not hand-parse raw goal storage or rely on the earlier untrusted raw-file observation. If this exact lookup is unavailable, stop; the state-selection question remains unresolved.
2. **Establish a supported recovery path:** determine whether an existing supported exporter/recovery interface can handle this exact owned-file divergence without bypassing its manual-edit guard. None is established by this report. If none exists, obtain separate explicit approval for a **source-only** recovery-path implementation and isolated verification first; do not deploy, activate, or restart anything.
3. **Prepare without writing:** render the candidate bundle/index through the canonical renderer from the verified source-qualified record; show the per-file diff, hashes, and exact targets. For the frozen-snapshot option, the snapshot-derived expected `plan.md` hash is `96ef0de60816e811f1fbc81ebc8c893658013d8115552deb3789246d67dd9891`. For a refreshed record, rebuild all affected bundle files and the README managed block; do not assume the change is timestamp-only.
4. **Exact recovery approval:** obtain explicit approval for the verified source state and exact replacement scope, including preservation and rollback. Frozen-versus-refreshed selection alone is not this approval and does not resolve provenance. No backup-only approval is required for this ordinary nonsecret in-scope work.
5. **Preserve originals, then apply:** within that approved scope, record original hashes/mtimes and make byte-exact copies of the manifest, README, and all four 483 bundle files before any replacement. Stop if any target changes during capture. Then apply only through the supported recovery interface under the process lock; never force overwrite, hand-edit generated bytes, or rehash the manifest directly. If the supported interface refuses the divergence, stop rather than bypassing it.
6. **Verification gate:** require every owned entry to hash-match using the writer's scope (whole-byte hashes for bundle files; managed-block hash for README); recompute manifest integrity; require snapshot `generatedFiles` to agree with manifest; require plan/status/revision/exportedAt and fingerprints to agree for the selected source; and, after a live refresh, require README rows to match supported source-qualified records. Confirm temporary files are absent, the process lock is released, and all preserved originals still match their recorded hashes.
7. **Rollback:** if verification fails and rollback was included in the exact recovery approval, reacquire the same lock and restore preserved originals only through the supported recovery path and only when its preconditions still hold. Verify original owned hashes and manifest integrity. If any file changed concurrently or supported rollback is unavailable, stop without overwriting it. Backup cleanup is outside this recovery and requires its own authorization if requested.

The exact remaining blocker is that no supported source-qualified lookup/export result for the exact source session and goal, and no supported recovery path for this divergence, have been established. If no recovery path exists, explicit source-only implementation/verification approval must come first, followed by separate exact recovery approval. No recovery was performed; the report is the only authorized new file.

## Commands and observed exits

All audit commands below were read-only. Successful commands exited `0`; counts are included with the relevant output. The ownership-aware scan found `owned_entries=53 owned_matches=52 owned_mismatches=1` and identified only the 483 plan. The whole-file README digest is expressly excluded from that comparison.

```bash
python3 - <<'PY'
import hashlib, json, pathlib
g=pathlib.Path('docs/goals')
m=json.loads((g/'.goal-docs-manifest.json').read_text())
start='<!-- goal-docs:managed:start -->'
end='<!-- goal-docs:managed:end -->'
readme=(g/'README.md').read_text()
assert readme.count(start)==1 and readme.count(end)==1
block=readme[readme.index(start):readme.index(end)+len(end)].encode()
bad=[]
for rel,want in sorted(m['files'].items()):
    p=g/rel
    content=block if rel=='README.md' else p.read_bytes()
    got=hashlib.sha256(content).hexdigest()
    if got!=want: bad.append((rel,want,got))
print(f'owned_entries={len(m["files"])} owned_matches={len(m["files"])-len(bad)} owned_mismatches={len(bad)}')
for row in bad: print('\t'.join(row))
PY
```

The renderer comparison command exited `0`; its unified diff contained exactly one changed line and both hashes are recorded above:

```bash
set -o pipefail
node --experimental-strip-types --input-type=module -e 'import { readFileSync } from "node:fs"; import { buildGoalDocBundle } from "./.opencode/plugins/goal-docs/render.ts"; const s = JSON.parse(readFileSync("docs/goals/483f6755-70a7-4912-aee3-816fbe0b7546/snapshot.json", "utf8")); const b = buildGoalDocBundle(s.source, s.goal, s.historyNotice); process.stdout.write(b.files["plan.md"]);' | python3 -c 'import sys,hashlib,pathlib,difflib; expected=sys.stdin.read(); actual=pathlib.Path("docs/goals/483f6755-70a7-4912-aee3-816fbe0b7546/plan.md").read_text(); print("renderer_plan_sha256="+hashlib.sha256(expected.encode()).hexdigest()); print("actual_plan_sha256="+hashlib.sha256(actual.encode()).hexdigest()); print("same_bytes="+str(actual==expected)); print("unified_diff:"); print("".join(difflib.unified_diff(expected.splitlines(True),actual.splitlines(True),fromfile="render.ts(snapshot inputs)",tofile="actual plan.md")),end="")'
```

The exact timestamp-substitution comparison also exited `0` and printed `after_only_timestamp_substitution_byte_identical=True` with substituted hash `96ef0de60816e811f1fbc81ebc8c893658013d8115552deb3789246d67dd9891`:

```bash
set -o pipefail
node --experimental-strip-types --input-type=module -e 'import { readFileSync } from "node:fs"; import { buildGoalDocBundle } from "./.opencode/plugins/goal-docs/render.ts"; const s=JSON.parse(readFileSync("docs/goals/483f6755-70a7-4912-aee3-816fbe0b7546/snapshot.json","utf8")); const b=buildGoalDocBundle(s.source,s.goal,s.historyNotice); process.stdout.write(b.files["plan.md"]);' | python3 -c 'import sys,hashlib,pathlib; rendered=sys.stdin.read(); actual=pathlib.Path("docs/goals/483f6755-70a7-4912-aee3-816fbe0b7546/plan.md").read_text(); fixed=actual.replace("- Exported at: `2026-10-28T03:59:00.586Z`", "- Exported at: `2026-10-28T03:58:34.686Z`", 1); print("renderer_sha256="+hashlib.sha256(rendered.encode()).hexdigest()); print("actual_sha256="+hashlib.sha256(actual.encode()).hexdigest()); print("after_only_timestamp_substitution_byte_identical="+str(fixed==rendered)); print("substituted_sha256="+hashlib.sha256(fixed.encode()).hexdigest())'
```

Other read-only checks and results:

- `python3 -c 'import json,hashlib,pathlib; m=json.loads(pathlib.Path("docs/goals/.goal-docs-manifest.json").read_text()); p={k:m[k] for k in ("version","owner","files","goals","transfers")}; h=hashlib.sha256(json.dumps(p,separators=(",",":"),ensure_ascii=False).encode()).hexdigest(); print("valid={} computed={} stored={}".format(h==m["integrity"],h,m["integrity"]))'` — exit `0`, manifest integrity valid.
- Historical raw-store observation only: the earlier direct parser reported 13 README rows, 12 apparent matches and one apparent discrepancy (the 483 row). It exited `0`, but because it hand-parsed raw state it is untrusted context, not live authority; that read was not repeated and its parser command is intentionally not presented as a supported lookup.

- `stat -c '%n\t%y\t%s bytes\tmode %a' docs/goals/.goal-docs-manifest.json docs/goals/README.md docs/goals/483f6755-70a7-4912-aee3-816fbe0b7546/plan.md docs/goals/483f6755-70a7-4912-aee3-816fbe0b7546/HANDOFF.md docs/goals/483f6755-70a7-4912-aee3-816fbe0b7546/work-history.md docs/goals/483f6755-70a7-4912-aee3-816fbe0b7546/snapshot.json docs/goals/.goal-docs-process.lock` — exit `0`; UTC conversions are tabulated above.
- `find docs/goals -type f \( -name '*.goal-docs-*.tmp' -o -name '.goal-docs.lock' -o -name '.goal-docs.lock.recovery' \) -print` — exit `0`, no paths printed.
- `lslocks -o PID,COMMAND,TYPE,MODE,PATH` — exit `0`; no matching goal-docs process-lock row.
- `date -u +%Y-%m-%dT%H:%M:%SZ` — exit `0`, audit date `2026-10-28`.
- `git status --short -- docs/codex-parity/archive-integrity-finding.md` — exit `0`, no pre-existing target file/status before this report was added.

One attempted compact integrity-check command exited `1` due to Python quoting syntax; it made no changes. Exact failed command:

```bash
python3 -c 'import json,hashlib,pathlib; m=json.loads(pathlib.Path("docs/goals/.goal-docs-manifest.json").read_text()); p={k:m[k] for k in ("version","owner","files","goals","transfers")}; h=hashlib.sha256(json.dumps(p,separators=(",",":"),ensure_ascii=False).encode()).hexdigest(); print(f"valid={h==m[\"integrity\"]} computed={h} stored={m[\"integrity\"]}")'
```

The corrected integrity-check command above exited `0` and produced the valid digest reported above.
