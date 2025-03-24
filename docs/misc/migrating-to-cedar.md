---
order: 6
title: Migrating to Bonsai
---

# Migrating to Cedar

**Cedar** is the codename for the latest version of Garden, 0.14.

## New features and major changes

<!-- TODO: Marketing copy? -->

For a complete overview of the breaking changes in Garden Cedar, please refer to the [Garden 0.13 (Bonsai) deprecations guide](https://docs.garden.io/bonsai-0.13/guides/deprecations)

## How to update

In case you used Garden 0.12 (Acorn) before, please first complete the [migration guide for Garden 0.13 (Bonsai)](./migrating-to-bonsai.md).

If you're using 0.13 Bonsai, follow these steps:

1. Make sure to update to the latest release using `garden self-update` (At least to `0.13.56`).
2. When using this version, Garden will print warnings whenever it detects use of deprecated functionality, with a link that explains what to do. Follow the steps in the warnings, to resolve them.
3. To resolve some of the warnings, where we introduced new defaults or different behaviour, you need to change the `apiVersion` setting in the project-level configuration to `apiVersion: garden.io/v2`.
4. Verify that your configuration still works with the updated `apiVersion` setting. With that setting, Garden will reject use of deprecated functionality.

Once you completed these steps, you can safely update to Garden 0.14 (Cedar) by running `garden self-update`.
