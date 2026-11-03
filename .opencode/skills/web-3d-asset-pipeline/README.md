# Web 3D Asset Pipeline Usage

This guide explains how to request `web-3d-asset-pipeline`. Agent operating
rules remain in [SKILL.md](./SKILL.md). OpenCode loads `SKILL.md` on demand;
this README, provenance, and license are not loaded automatically.

Category: `files`

Tags: `3d`, `gltf`, `glb`, `assets`, `web`

## Purpose and when to use it

Use this skill to turn an editable 3D source into a predictable browser asset,
or to diagnose a GLB/glTF that loads with the wrong scale, pivot, hierarchy,
materials, textures, animation, collision, or performance characteristics. It
owns the asset pipeline, not engine selection or runtime scene architecture.

The workflow is adapted from OpenAI's public Game Studio guidance. See
[PROVENANCE.md](./PROVENANCE.md) and [LICENSE.txt](./LICENSE.txt).

## Prerequisites and setup verification

The agent checks:

- the exact source and current runtime asset paths
- the target engine/loader and its existing package lockfile
- the project's asset conventions and budgets
- the installed DCC/exporter version when a DCC is needed
- the browser integration and evidence surfaces actually approved in the current
  session
- an isolated headless runtime only when explicitly requested
- any existing, approved, pinned optimization command

Do not assume a DCC MCP, browser bridge, browser engine, or project-specific
helper. Do not install missing optimization tools or download undeclared
packages.

## How to request it

- "Prepare this Blender prop for the project loader as a GLB and preserve the
  source."
- "Find why this model imports at the wrong scale and rotates around the wrong
  point."
- "Reduce this GLB if our existing toolchain supports it, then verify the exact
  shipping artifact in the browser."
- "Check the hierarchy, materials, textures, animation names, and runtime load
  of this glTF."

Name the source, target project or loader, output location, quality constraints,
and required animation, collision, or LOD behavior.

## Worked workflow and expected result

1. Record units, orientation, pivot, stable names, hierarchy, materials,
   textures, animations, collisions, LODs, and size budget.
2. Inventory and preserve the source files and existing shipping asset.
3. Clean only the necessary scene data and export a new versioned asset.
4. Reimport it into a clean scene and compare structure and transforms.
5. Run the project's existing local server on loopback and load the exact asset
   through the project's approved browser integration.
6. Capture visual evidence when canvas/WebGL output requires it. Inspect console
   and network activity only when an approved tool exposes it; otherwise report
   the diagnostic gap.
7. Report measured size and load behavior plus structural and visual findings.

Expected result: a new runtime asset that meets the explicit contract, reimports
without unexpected loss, and loads visibly through the target loader. These are
documented representative steps; they were not executed while creating the skill.

## Verification and known limitations

- Export must be followed by clean reimport and structural comparison.
- Browser verification must load the exact shipping file through the actual
  project loader, not a DCC preview.
- Accessibility snapshots do not describe canvas geometry; use authorized visual
  evidence for WebGL output.
- Console and network-diagnostic access depends on the approved tool.
- A desktop/mobile viewport pass does not replace testing on real mobile GPU,
  memory, touch input, or network conditions.
- Compression is tested only when a compatible approved tool and decoder already
  exist.
- Reimport may normalize representation while retaining appearance; compare
  against the runtime contract rather than requiring byte-identical data.

## Troubleshooting

- Wrong scale/orientation: compare source units, exporter conversion, root and
  child transforms, and runtime loader transforms before editing geometry.
- Wrong pivot: inspect the authored origin and parent hierarchy.
- Missing or flat materials: inspect supported PBR nodes, texture existence,
  color spaces, UV sets, alpha mode, and browser requests.
- Renamed nodes or clips: stabilize source names and exporter settings, then
  reimport and compare before changing runtime selectors.
- GLB works locally but not through the app: inspect exact URL, status, MIME,
  CORS, base path, decoder availability, and diagnostics when exposed; otherwise
  leave that part of validation incomplete.
- Optimized asset fails: restore the preserved baseline and identify the
  incompatible optimization before considering another attempt.

## Safety

Preserve sources and prior shipping assets, write unused versioned outputs,
preview batch path changes, and obtain required authority before deletion or
replacement. Never upload an asset without an exact file and destination from the
user. Do not install add-ons, packages, decoders, or system components
implicitly. Do not run GUI tools as root or weaken security controls.

## Related skills

- [`blender`](../blender/README.md) provides safe Blender CLI, `bpy`, rendering,
  and save/reopen procedures.
- [`game-playtest`](../game-playtest/README.md) verifies interactive game states.
- [`browser-assistant`](../browser-assistant/README.md) governs visible browser
  work through an available supported integration.
- [`browser-headless`](../browser-headless/README.md) governs explicitly
  requested non-interactive validation.
- [`files-and-documents`](../files-and-documents/README.md) governs local
  artifact preservation and organization.
- [PROVENANCE.md](./PROVENANCE.md) records the upstream and adaptation boundary.
- [LICENSE.txt](./LICENSE.txt) contains the applicable license.
