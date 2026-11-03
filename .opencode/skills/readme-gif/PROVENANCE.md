# Provenance

## Upstream inspected

- Repository: https://github.com/jtmb/tend
- Branch inspected: `main`
- Pinned commit: `06a6aae00e5eeff3dffcc01325a84bcd59b420a0`
- Recording workflow:
  https://github.com/jtmb/tend/blob/06a6aae00e5eeff3dffcc01325a84bcd59b420a0/docs/demo/README.md
- Fixture preparation and preservation checks:
  https://github.com/jtmb/tend/blob/06a6aae00e5eeff3dffcc01325a84bcd59b420a0/docs/demo/prepare.py
- Encoder:
  https://github.com/jtmb/tend/blob/06a6aae00e5eeff3dffcc01325a84bcd59b420a0/docs/demo/encode.py
- README embedding and static alternatives:
  https://github.com/jtmb/tend/blob/06a6aae00e5eeff3dffcc01325a84bcd59b420a0/README.md
- MIT license:
  https://github.com/jtmb/tend/blob/06a6aae00e5eeff3dffcc01325a84bcd59b420a0/LICENSE

The complete tracked tree at this commit contains no standalone `SKILL.md`.
This bundle adapts the documented demo workflow into an OpenCode skill rather
than claiming to copy an existing upstream skill.

## Adaptation

Retained the core techniques: actual completed actions, isolated public sample
inputs, production preview/filter logic, blocked dangerous operations, input
fingerprints, fresh frame sets, action/result evidence, truthful captions,
target-derived pointer overlays, shared palettes with reserved chart colors,
duration-preserving optimization, decoded-scene inspection, and README-size review
with a static alternative.

Removed Tend-only assumptions: Cargo features, GTK/Xvfb environment and renderer,
specific fonts, source helpers, event counts, frame count, chart hues, and fixed
duration. The upstream recording commands are not portable and are not provided
as executable scripts here. Tend's design matrix and panel/bus QA helpers are
outside this skill's scope.

Added this repository's canonical skill metadata, usage guide, output-location
policy, supported-tool boundaries, approval gates, versioned asset preservation,
and explicit unverified-check reporting. No MCP, runtime configuration, or
dependency installation is required merely to discover the skill.

The upstream license notice is preserved in [LICENSE.txt](./LICENSE.txt).
