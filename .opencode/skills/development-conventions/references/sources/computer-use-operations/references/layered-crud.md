# OpenCode Integration Ownership Boundaries

Inspect the consumer project's actual runtime boundary and ownership model.
Use these layers as a checklist, not as claims about a specific repository:

## Layer 1: OpenCode v2 configuration

- Declares the MCP servers, plugin packages, or skills the active loader uses.
- Applies the consumer's permission and path-resolution rules.
- Is changed only through the operation that owns the relevant configuration.

## Layer 2: Canonical repository source

- Skills, plugins, commands, examples, scripts, and checks live in paths
  discovered from the consumer's project instructions and configuration.
- Identify whether a source entry is generated, user-owned, or maintained
  before editing it.

## Layer 3: Selected runtime target

- A write target follows the consumer's explicit target-selection and
  authorization rules; do not infer it from a source path.
- Prefer the project's read-only verification path when available.
- Apply the consumer's path-safety and preservation guarantees; do not claim
  atomicity or symlink protection unless the implementation provides it.

## NEVER

- Treat a generated copy as canonical source when project policy identifies a
  separate maintained source.
- Write during a read-only verification pass.
- Assume path-safety, atomicity, or preservation guarantees that were not
  verified in the actual tooling.
- Delete unrelated target files while reconciling a bundle.
