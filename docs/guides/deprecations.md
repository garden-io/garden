---
order: 1
title: Deprecations and major-version updates
---

# Deprecations and major-version updates

The next major version of Garden, 0.14, will contain breaking changes. To make the update as seamless as possible for your team, avoid functionality that has been deprecated in Garden 0.13.

When using `apiVersion: garden.io/v1` in your project configuration file, Garden will warn you if your configuration depends on features that will be removed in Garden 0.14.

**EXPERIMENTAL**: You can opt-in to the new behaviour in Garden 0.14 by using `apiVersion: garden.io/v2`. This setting will make Garden throw errors whenever it detects usage of deprecated functionality. Please note that as of today, not all warnings are in place, so we will still add new error conditions. Once the list of breaking changes is final, we will make this known here.

## Breaking changes

Summary of the breaking changes (TODO: Can we auto-generate this from `deprecations.ts`?)
