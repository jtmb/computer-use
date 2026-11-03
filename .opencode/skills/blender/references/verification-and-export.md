# Blender Verification and Export

Read this file in full before accepting a saved scene, render, or exported
asset. Process exit status alone is never the acceptance test.

## Save and reopen verification

1. Record the source probe and the expected structural differences.
2. Save only to a new versioned `.blend` path.
3. Confirm the new file exists, is non-empty, and did not replace the source.
4. Start a separate Blender process with factory startup and auto-execution
   disabled, load the new file, and run a fresh scene probe.
5. Compare scene names, object names and types, hierarchy, collections,
   transforms, mesh counts, materials, images, libraries, camera, frame range,
   and actions against both the baseline and requested change.
6. Treat unexpected missing externals, object loss, renamed hierarchy, or
   transform changes as failures even if the file reopens.

Use the probe command from
[background-workflows.md](./background-workflows.md), changing the input and
report paths to the versioned output. Reopening in the process that performed
the save is not independent verification.

## Render verification

Blender's render action belongs last because command-line arguments are handled
in order. Choose a new output pattern and a timeout based on scene complexity:

```bash
timeout 600s blender \
  --background \
  --factory-startup \
  --disable-autoexec \
  --python-exit-code 1 \
  "/absolute/path/scene-v002.blend" \
  --render-output "/absolute/path/render-v002-####" \
  --render-format PNG \
  --render-frame 1
```

Identify the exact newly created image, then read that image with the file Read
tool. Check framing, resolution, lighting, color management expectations,
materials, missing-texture colors, transparency, alpha edges, noise, clipping,
and obvious corruption. A non-empty PNG plus exit code zero is not visual
verification.

A render requested by the user is a retained artifact. A render made only for temporary verification belongs in the project-approved
scratch location. Follow the capture provider's verified ownership and retention
contract for screenshots; do not assume every capture is task-owned or must be
deleted.

## Export contract

Before export, record:

- destination format and consuming application
- axis, orientation, units, scale, and pivot/origin convention
- object and collection selection rules
- hierarchy and stable naming requirements
- whether transforms may be applied, especially for rigs and animation
- material, texture, UV, color-space, and image-packaging expectations
- animation clips, shape keys, cameras, lights, custom properties, LODs, and
  collision proxies that must survive

For browser delivery, use GLB by default and read the sibling
[`web-3d-asset-pipeline` skill](../../web-3d-asset-pipeline/SKILL.md) before
working. Use separate glTF files only when external resources are an intended
part of the contract.

Use the glTF export operator documented for the installed Blender version. A
task script must check that the operator returns `FINISHED` and that the unused
output path was created. Selective export must
set and verify the exact selection rather than relying on stale UI state.

## Clean reimport

An exported file passes structure only after a clean reimport:

1. Start a separate Blender process with no source `.blend`, using
   `--background --factory-startup --disable-autoexec --python-exit-code 1`
   and a bounded `timeout`.
2. In a reviewed verification script, reset to an empty factory scene and call
   the corresponding import operator, such as
   `bpy.ops.import_scene.gltf(filepath=asset_path)` for GLB/glTF.
3. Check the operator result, then inspect the imported data or save it to a
   temporary versioned `.blend` and run the generic scene probe on that file.
4. Compare hierarchy, names, transforms, bounds, mesh and material counts,
   texture resolution and availability, armatures, animations, cameras, and
   required custom data against the export contract.
5. Remove only task-created temporary reimport files after the comparison.

Reimport can prove file structure but not target-runtime compatibility. For a
web asset, load it through the project's existing loader and approved browser
integration. Inspect rendered output using an authorized visual surface. Do not
claim console or network diagnostics unless an available tool exposes them;
report required evidence as a blocker when unavailable. Do not silently switch to
an unsupported browser or desktop-control path.

## Official sources

- [Blender command-line rendering](https://docs.blender.org/manual/en/latest/advanced/command_line/render.html)
- [Blender importing and exporting](https://docs.blender.org/manual/en/latest/files/import_export.html)
- [Blender window-manager operators](https://docs.blender.org/api/current/bpy.ops.wm.html)
- [Blender export-scene operators](https://docs.blender.org/api/current/bpy.ops.export_scene.html)
