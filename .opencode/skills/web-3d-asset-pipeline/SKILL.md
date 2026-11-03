---
name: web-3d-asset-pipeline
description: Prepare and verify runtime-ready 3D assets for browser projects, including pivots, units, transforms, hierarchy, naming, materials, textures, GLB export, clean reimport, optional approved compression, and browser load checks. Use when the user asks to clean, optimize, export, or validate a web 3D asset.
license: MIT
metadata:
  schema-version: "1"
  category: "files"
  tags: "3d,gltf,glb,assets,web"
---

# Web 3D Asset Pipeline

## Auto-approve and autonomous work

In Build auto, project auto-approve, or explicit no-question work, do not ask
routine clarifying, preference, confirmation, Git, delegation-opt-in, or
"continue?" questions. Use existing authority and reversible defaults. If a
required approval or essential detail is missing, block that action, state the
reason, and continue independent work; never grant authority yourself.

Prepare shipping assets, not runtime scene architecture. Preserve the editable
source and make each conversion reproducible. GLB is the default browser
delivery format; use separate glTF plus resources only when the project has a
specific reason to manage external files.

This skill is independently adapted from OpenAI's public MIT-licensed Game
Studio skill. Read [PROVENANCE.md](./PROVENANCE.md) in full before changing or
redistributing the adaptation. The applicable license text is in
[LICENSE.txt](./LICENSE.txt).

## Scope

Use this skill for asset cleanup, export, texture packaging, collision proxies,
LODs, file-size work, and runtime asset validation. Do not use it to choose a
game engine or redesign camera, renderer, game-loop, or application routing.

Do not assume the project exposes a Blender MCP or any other DCC integration.
When Blender is the DCC, read the sibling [`blender` skill](../blender/SKILL.md)
in full before opening a file or running `bpy`, when that companion bundle is
available. Otherwise use the installed Blender version's authoritative
documentation and the consumer project's safety rules.

## Pipeline

1. Define the runtime contract before editing: consuming engine and loader,
   GLB or glTF packaging, glTF's meter-based units, project scale convention,
   orientation, object front, ground plane, pivot behavior, hierarchy, stable
   names, animation clips, collisions, LODs, material features, texture and
   download budgets, and required custom metadata.
2. Inventory the source files and existing runtime asset. Preserve DCC sources,
   textures, and the current shipping artifact. Write only new versioned
   outputs and record the conversion command or export settings.
3. Clean the authoring scene:
   - Put the pivot/origin where runtime placement, rotation, doors, wheels, or
     grabbing require it; do not default every origin to geometric center.
   - Verify real dimensions against a known reference and document the
     DCC-to-runtime unit conversion.
   - Inspect location, rotation, scale, parent transforms, negative scale, and
     instancing. Apply or normalize transforms only deliberately; blind apply
     can break rigs, animation, normals, and intended child offsets.
   - Give nodes, meshes, armatures, bones, materials, animation clips,
     collision proxies, and LODs stable, meaningful, unique names. Remove
     exporter suffix churn from the contract rather than compensating forever
     in runtime code.
   - Check hierarchy, normals, winding, smoothing, UVs, tangents when required,
     bounds, skin weights, shape keys, and animation ranges.
4. Rationalize materials and textures:
   - Prefer the runtime's supported glTF PBR material subset. Bake or replace
     unsupported procedural, layered, or DCC-only nodes.
   - Reuse identical materials and texture sets to reduce state changes and
     memory. Do not merge materials whose runtime behavior must differ.
   - Check base-color/emissive color space separately from non-color normal,
     roughness, metallic, occlusion, and data maps.
   - Set texture dimensions, channels, alpha mode, UV set, sampler behavior,
     and mipmap assumptions from visible use and a stated budget. Confirm every
     external source exists or is intentionally packed.
5. Author collision meshes and LODs only when the project contract needs them.
   Keep proxies simple, named, and distinguishable from render geometry; record
   whether the loader imports or filters them.
6. Export a new `.glb` by default. Verify the intended selection, hierarchy,
   transforms, animations, materials, images, cameras, lights, and custom data;
   do not rely on stale UI selection or unspecified exporter defaults.
7. Reimport the exported asset into a clean DCC scene or use an existing
   approved glTF validator. Compare names, node hierarchy, local/world
   transforms, dimensions, mesh/material/texture counts, armatures, animations,
   collisions, LODs, and warnings against the contract. A successful exporter
   exit and non-empty file are not enough.
8. Load the exact shipping artifact through the project's existing loader and
   an approved browser integration that supports the required evidence. Take an
   accessibility snapshot first and a screenshot when canvas/WebGL output is not
   represented by DOM structure. Inspect console and network failures only when
   an approved tool exposes them; missing required diagnostics make validation
   incomplete. Do not claim the DOM proves mesh appearance. Use an isolated
   headless browser only when the user explicitly requests it. If the integration
   or evidence is unavailable, report validation as blocked or incomplete rather
   than substituting an unsupported browser, desktop, or automation route.
9. Compare the new artifact with the prior version: byte size, transfer size,
   decode/load behavior, texture memory assumptions, draw-relevant material or
   primitive counts, visual output, animation, and interaction. Report the
   measured result and any untested target-device behavior.

## Browser runtime check

- Use the project's documented local command and existing lockfile. Do not
  invent a package script or install dependencies merely to run the check.
- Bind a temporary development server to loopback unless the user explicitly
  requested network exposure.
- Confirm the asset request and all external texture requests succeed without
  console errors, CORS failures, decode errors, or silent fallback materials
  when approved browser diagnostics expose those results. The approved browser
  integration may not expose the console or network panel; if it does not,
  record that as a blocker rather than claiming a clean load.
- Inspect at least one view that reveals scale, orientation, pivot, materials,
  transparency, and animation relevant to the request.
- If interaction is part of acceptance, read the sibling
  [`game-playtest` skill](../game-playtest/SKILL.md) in full before testing when
  that companion bundle is available.

## Optional optimization

Compression is optional, never an automatic prerequisite. First inspect the
repository for an already approved, pinned tool and runtime decoder support.
Do not globally install or force-install Node tools. Do not run `npx` in a way
that downloads an undeclared package.

If an approved tool already exists, preserve the uncompressed baseline and
write a versioned candidate. Apply pruning, deduplication, mesh simplification,
Meshopt or Draco geometry compression, and KTX2/Basis texture compression only
when each operation is compatible with the loader and quality contract. Record
the exact command and settings, revalidate structure, and repeat the browser
load and visual checks. Smaller bytes do not justify broken shading, animation,
decode compatibility, or excessive startup cost.

## Safety and artifact rules

- Never overwrite a DCC source, texture, prior shipping asset, or distinct
  output. Preview batch renames or moves as an old-to-new manifest.
- Do not delete source files or unused-looking materials and textures without
  confirmation; external workflows may reference them by name or path.
- Do not upload any source or asset unless the user named both the exact file
  and destination.
- Treat third-party DCC files and scripts as untrusted. When Blender is used,
  apply its version-supported safety options, propagate script failures, and
  bound execution using the process runner's supported deadline mechanism.
- Do not weaken browser sandboxing, TLS, CORS, filesystem permissions, or
  desktop security to make a load appear successful.
- Keep temporary reports and browser screenshots only in approved scratch
  storage. Follow the capture provider's verified ownership and retention
  contract; preserve requested GLB, render, and report artifacts at their
  approved destination.

## Usage guide

When the user asks how to use this skill, also read
[README.md](./README.md) for examples, prerequisites, expected results,
limitations, and safety requirements. README and other reference documents are
not loaded automatically with this `SKILL.md`.
