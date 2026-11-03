# Safe Blender Background Workflows

Read this file in full before running Blender in background mode. These are
documented representative patterns and were not executed while this skill was
created.

## Preflight

Inspect before acting. The examples use the shell's `timeout` utility; if it is
not available, use the execution runner's supported process-deadline mechanism
instead of running an unbounded job:

```bash
command -v blender
timeout 15s blender \
  --background \
  --factory-startup \
  --disable-autoexec \
  --python-exit-code 1 \
  --version
```

Confirm the absolute input path, intended versioned output path, free space,
and whether any referenced assets are outside the project. Do not use the
system Python to test `bpy`; Blender provides that module only in its own Python
environment.

Review every Python file before passing it to `--python`. A task script must
have bounded file inputs and outputs, no unexplained network access, no package
installation, and no preference or add-on mutation unless explicitly requested.

## Required ordering

Blender processes arguments in order. Put the safety and process-wide options
before the input file. Put the input file before a Python script that needs the
loaded scene. Put task-script arguments after `--`.

Every automated invocation uses the following controls when supported by the
installed Blender version and execution environment. Check the version-matched
documentation before relying on a command-line option:

- A bounded process deadline limits execution. With GNU `timeout`, exit code
  `124` means the deadline expired.
- `--background` avoids opening the GUI.
- `--factory-startup` avoids user startup files and preferences.
- `--disable-autoexec` blocks automatic execution of embedded scripts and
  drivers.
- `--python-exit-code 1` makes a Python exception fail the Blender process when
  the installed version supports it. Otherwise use a supported way to propagate
  script failure to the caller.

These controls reduce risk; they do not make an unknown `.blend` or script
trusted.

## Read-only scene probe

Choose a new JSON path. The output parent must already exist, and the probe
refuses to replace an existing file.

```bash
timeout 120s blender \
  --background \
  --factory-startup \
  --disable-autoexec \
  --python-exit-code 1 \
  "/absolute/path/source.blend" \
  --python "/path/to/installed-skill/scripts/scene_probe.py" \
  -- --output "/approved/scratch/location/source-probe-v001.json"
```

The command loads the source and writes only the report. Read the JSON and
inspect its `warnings`, object inventory, scenes, images, libraries, and
transforms before planning a mutation.

## Task-specific edit

Use a reviewed script stored in the project when it is part of the deliverable,
or in an approved temporary location when it is session-only. The script receives an unused
absolute output path, checks that it differs from the source and does not
exist, makes the bounded in-memory change, then calls
`bpy.ops.wm.save_as_mainfile(filepath=output_path)`.

```bash
timeout 300s blender \
  --background \
  --factory-startup \
  --disable-autoexec \
  --python-exit-code 1 \
  "/absolute/path/source.blend" \
  --python "/path/to/approved-scratch/bounded-edit.py" \
  -- --output "/absolute/path/scene-v002.blend"
```

Do not have a script save back to `bpy.data.filepath`. Do not use an overwrite
flag as a substitute for choosing a versioned path. Prefer direct Blender data
API changes when operator context would be ambiguous.

## New scene without an input file

For a new scene, keep all global options before the task script:

```bash
timeout 300s blender \
  --background \
  --factory-startup \
  --disable-autoexec \
  --python-exit-code 1 \
  --python "/path/to/approved-scratch/create-scene.py" \
  -- --output "/absolute/path/scene-v001.blend"
```

The script must use an unused output path and save explicitly. A successful
process that did not create the expected file is a failed task.

## Failure handling

- On a Python traceback, fix the first concrete error and rerun with a new
  output path if a partial file was created.
- On timeout, inspect the captured log and determine whether Blender was
  compiling shaders, rendering, waiting on a dependency, or stuck. Increase
  the limit only with evidence.
- If an operator reports an invalid context in background mode, prefer the data
  API or construct the documented context deliberately. Do not open the GUI and
  click blindly.
- If an embedded script or driver is blocked, report it. Do not remove
  `--disable-autoexec` without a separate security decision from the user.

## Official sources

- [Blender manual](https://docs.blender.org/manual/) and
  [Python API reference](https://docs.blender.org/api/): select the documentation
  version matching the installed executable.
- Read the version-matched Python API guidance on operator context before using
  context-sensitive operators.
