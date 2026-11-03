# Blender Usage

This guide explains how to request the `blender` skill. Agent operating rules
remain in [SKILL.md](./SKILL.md). OpenCode loads `SKILL.md` on demand; this
README and the linked references are not loaded automatically.

Category: `applications`

Tags: `blender`, `3d`, `bpy`, `rendering`, `export`

## Purpose and when to use it

Use this skill to inspect or modify `.blend` scenes, run bounded Blender Python
jobs, create renders, and import or export 3D data on a supported target. It
supports safe background workflows and interactive GUI work through an
available, approved desktop integration. It does not assume a Blender MCP server.

Use documentation and Python API references matching the installed Blender
version. This is an independently maintained skill, not a product-provided
Blender integration.

## Prerequisites and setup verification

The agent first checks the installed executable and version without launching
the GUI. Bound the command with the current shell or execution runner's supported
deadline mechanism. For POSIX-like shells that provide `timeout`, a representative
command is:

```bash
command -v blender
timeout 15s blender \
  --background \
  --factory-startup \
  --disable-autoexec \
  --python-exit-code 1 \
  --version
```

Use the installed Blender version and its matching documentation. Background
Python runs inside Blender; `python3 -c 'import bpy'` is not a valid setup
test. For GUI work, use the desktop-control and visual-verification integrations
only when available. Installation or repair belongs to an explicitly authorized
setup workflow and is not performed implicitly.

Some exporter versions require additional Python modules. Verify imports
inside Blender's Python environment and follow the project's approved package
management workflow if a requirement is missing.

## How to request it

Ask for the outcome and name the source, destination, and important checks.

- "Inspect `/path/to/scene.blend` without changing it and report missing
  textures."
- "Create a versioned copy with the camera moved, render frame 24, and verify
  the image."
- "Export this collection to GLB, reimport it cleanly, and compare the object
  hierarchy."
- "Open Blender and help me adjust this material interactively."

## Worked workflow and expected result

For a representative read-only scene inspection, the agent:

1. Confirms the installed Blender version and exact source path.
2. Reads
   [the background workflow](./references/background-workflows.md).
3. Runs the optional [bundled scene probe](scripts/scene_probe.py) through Blender
   with safe global options and a bounded timeout.
4. Reads the new JSON report and checks objects, transforms, materials, images,
   libraries, cameras, animation, and missing external files.
5. Leaves the `.blend` unchanged and reports the JSON path or removes the
   task-created report if it was only temporary.

Expected result: a concrete structural inventory and warnings with no source
mutation. For an edit, the expected result is instead a new versioned `.blend`,
a clean-process reopen comparison, and any requested render or export. The
commands in this guide are documented representative invocations; they were
not executed while creating the skill.

## Verification and known limitations

Read [verification and export](./references/verification-and-export.md) before
accepting a save, render, or export.

- Exit status alone does not verify a Blender result.
- Reopen a saved file in a separate Blender process and rerun the scene probe.
- Read the actual rendered image to verify visual output.
- Reimport an export into a clean scene and compare its hierarchy, transforms,
  materials, textures, animation, and bounds.
- `--disable-autoexec` blocks automatic Python execution but does not prove an
  unknown `.blend` is safe.
- Blender's custom 3D viewport may not expose useful accessibility nodes.
- Background mode cannot verify interactive tool behavior or viewport-only
  appearance.

## Troubleshooting

- `blender` missing or wrong version: inspect package/source state, then use an
  available application-setup workflow; do not install a second package format
  silently.
- `ModuleNotFoundError: bpy`: run the script with Blender's `--python`, not
  system Python.
- A missing exporter module: verify the requirement for the installed Blender
  version and use only the project's approved package-management route.
- Draco library warning: verify whether this Blender build includes optional
  Draco support. Export uncompressed unless the project already has an approved
  compatible compressor and runtime decoder.
- Deadline expired: inspect logs and narrow the job before increasing the bound.
- Python error but Blender exits zero: verify whether the installed version
  supports `--python-exit-code 1`; otherwise use another documented way to
  propagate the failure.
- Embedded driver or script warning: keep `--disable-autoexec`; do not enable
  auto-run merely to complete the task.
- Missing texture: inspect packed state and Blender-resolved absolute paths
  before remapping anything.
- GUI action cannot be targeted: stop blind interaction, use an available
  approved visual-inspection integration, and use a deterministic background
  script when practical.

## Safety, confirmation, and elevation

Source `.blend` files are preserved. Writes use unused versioned paths. The
agent asks before overwrite, deletion, add-on installation, package or
permission changes, and any upload. Blender is not run with elevated privileges
unless a separately authorized task requires it. If an approved package
operation needs elevation, the user completes the operating system's trusted
authentication flow; the agent does not observe or type into it.

Handle desktop screenshots according to the capture provider's verified
ownership, privacy, and retention contract. Requested renders and exports are
retained as user artifacts; only task-created temporary verification output is
cleaned up.

## Related skills and documents

- [Background workflows](./references/background-workflows.md) defines safe
  Blender CLI ordering and script execution.
- [Verification and export](./references/verification-and-export.md) defines
  save/reopen, render, and reimport checks.
- The [`web-3d-asset-pipeline`](../web-3d-asset-pipeline/README.md),
  [`desktop-control`](../desktop-control/README.md),
  [`desktop-vision`](../desktop-vision/README.md), browser, and file-management
  companion skills may provide related workflows when they are included in the
  consumer's configured skill set.
- Use the [official Blender manual](https://docs.blender.org/manual/) and
  [Python API reference](https://docs.blender.org/api/) for the version matching
  the installed executable; do not assume that the latest docs match it.
- Follow the consumer project's configured skill catalog, if one exists.
