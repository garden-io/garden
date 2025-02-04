---
order: 1
title: Migrating to Garden 0.14
---

# Migrating to Garden 0.14

**TODO** is the codename for Garden 0.14.

In Garden 0.14, the _modules_ are officially and completely deprecated. Any usage of module-based syntax or
`apliVersion: garden.io/v0` will result into a deprecation warning.

The only recommended way of configuration is the action-base syntax that was introduced in Garden Bonsai (0.13). If you
still use Garden Acorn (0.12), please check the [Garden Bonsai Migration Guide](./migrating-to-bonsai.md) first.

## Breaking changes first

Here is the list of breaking changes from Garden Bonsai (0.13) to TODO (0.14).

- Changes to project configuration:
  - The value `apiVersion: garden.io/v0` is no longer supported. Use `apiVersion: garden.io/v1` or
    `apiVersion: garden.io/v2` instead.
  - The deprecated multi-valued `dotIgnoreFiles` field has been replaced with single-valued `dotIgnoreFile` that only
    supports one file. The old syntax is no longer supported.
  - The `modules.*` field has been replaced with `scan.*`. The old syntax is no longer supported.
- Changes in the plugin-level commands:
  - The `cluster-init` is no longer supported. An error will be thrown if it's used.
- Changes in the action type specs:
  - Configuration field `deploymentStrategy` of the `kubernetes deploy` action type is no longer supported. Garden
    always use `"rolling"` strategy.
