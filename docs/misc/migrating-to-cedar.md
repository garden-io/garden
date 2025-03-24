---
order: 5
title: Migrating to Cedar
---

# Migrating to Cedar

Big news! We’re releasing Garden 0.14 and launching the **next generation of Garden Cloud**—the first step in a huge evolution for Garden.

### What’s new

- [**Remote Container Builder general access**](../features/remote-container-builder.md) – No more slow local builds! Now, every Garden Cloud user gets access to powerful remote build acceleration, previously only available on our Enterprise plan.
- **The new Garden Team Tier** – A dedicated, collaborative experience for teams scaling with Garden.
- [**Team-wide caching**](../features/team-caching.md) – Cache test results across clusters and environments with team-wide caching in Garden Cloud.
- **A new Builds UI** – Get deep visibility into your builds' performance and optimize with ease.

### What’s changed

In 0.14, we're changing the cache backend we use for our Kubernetes-based Test and Run actions (i.e. `kubernetes-pod`, `helm-pod` and `container` Runs and Tests).

In 0.13 and earlier, results for these action types were cached using ConfigMaps created in the Kubernetes cluster being used. This has worked well for a long time, but came with certain problems and limitations. ConfigMaps would pile up over time, requiring administrators to periodically clean them up. Also, tests couldn't be cached across Kubernetes clusters, which made it impossible to get cache hits for tests in CI that had already been successfully run e.g. on a local Kubernetes cluster during development.

Our solution to this is to use Garden Cloud as the caching backend. This means zero maintenance for our users, and more importantly, opens the door to fully shared caching across environments.
For situations when you can't log in right now, Garden falls back to a local file-based cache storage.

Our free tier includes a certain maximum number of monthly cache hits, and our Team and Enterprise tiers have higher limits. Please see our pricing page for more details.

0.14 also contains several breaking changes that are intended to make Garden easier to adopt and use.

These changes will help users configure and use Garden in the recommended way from the start. Garden is a powerful system, but it can also become as complex as the use cases it supports. We periodically streamline its configuration APIs and features to emphasize best practices and ease of use while deprecating those that have newer and better alternatives.

For users who are still on 0.13, you can prepare for upgrading to 0.14 by setting `apiVersion: garden.io/v2` in your project config, running your Garden commands and addressing any warnings and errors that come up.

For a complete overview of the breaking changes in Garden 14 (Cedar), please refer to the [Deprecations and migrating to Cedar guide](https://docs.garden.io/bonsai-0.13/guides/deprecations).

## How to update

If you are using Garden 0.12 (Acorn), please complete the [migration guide for Garden 0.13 (Bonsai)](./migrating-to-bonsai.md) first.

If you're using 0.13 Bonsai, follow these steps:

1. Make sure to update to the latest release using `garden self-update` (At least to `0.13.56`).
2. From version `0.13.56`, whenever Garden detects usage of deprecated functionalities, it will print a warning message accompanied by an explainer link. To fix all the warnings, please follow all the steps as needed.
3. In order to resolve some of the warnings, for example when we introduced new defaults or a different behaviour, you'll need to change the `apiVersion` setting in the project-level configuration to `apiVersion: garden.io/v2`.
4. After updating the `apiVersion`, you can verify that your configuration still works as expected since Garden will reject use of deprecated functionalities.

Once you completed these steps, you can safely update to Garden 0.14 (Cedar) by running `garden self-update`.
