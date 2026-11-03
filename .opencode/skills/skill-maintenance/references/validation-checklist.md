# Validation Checklist

Read this file explicitly before completing any new or changed skill bundle.

## Structure and frontmatter

- [ ] Source location, discovery layout, and entry file match the active loader
      and consumer configuration.
- [ ] Required names, description fields, limits, and optional frontmatter follow
      the active loader's documented format.
- [ ] Additional metadata matches only the consumer's actual validator or
      documented project policy.
- [ ] A separate usage guide or catalog is included only when the consumer
      maintains or requests one.
- [ ] No unverified license claim was introduced.

## Content

- [ ] Applicable project instructions were read and remain authoritative for
      this work.
- [ ] Claims match current implementation and authoritative documentation.
- [ ] Safety and confirmation gates match repository policy.
- [ ] Scope is bounded and unrelated opportunities are only reported.
- [ ] No automatic commit or learning-log requirement exists.
- [ ] Rename or retirement does not delete anything without an immediate
      pre-deletion confirmation.
- [ ] Any documented bundle-size or line limit is met; no limit was invented.

## Split bundles and links

- [ ] Every linked reference exists at the resolved relative path.
- [ ] Workflows explicitly instruct the agent to read needed references.
- [ ] No reference is described as automatically loaded.
- [ ] Historical material is clearly marked inactive.
- [ ] All text is ASCII unless the repository has a concrete need otherwise.

## Catalog and deployment

- [ ] Any existing catalog or index is consistent with the consumer's source
      and schema; no parallel index was added without need.
- [ ] Only canonical source was edited.
- [ ] If deployment was authorized and performed, the actual tooling and target
      were verified, including all required files and preservation behavior.
- [ ] Runtime discovery was checked through an available consumer workflow;
      source presence is not reported as live acceptance.

## Completion

- [ ] Relevant repository checks pass.
- [ ] Git diff contains only intended authorized changes.
- [ ] Exact files changed and any unresolved caveat are reported.
- [ ] No commit was created unless explicitly requested.
