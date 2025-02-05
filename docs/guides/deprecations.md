---
order: 1
title: Deprecations and major-version updates
---

# Deprecations and major-version updates

The next major version of Garden, 0.14, will contain breaking changes. To make the update as seamless as possible for your team, avoid functionality that has been deprecated in Garden 0.13.

When using `apiVersion: garden.io/v1` in your project configuration file, Garden will warn you if your configuration depends on features that will be removed in Garden 0.14.

**EXPERIMENTAL**: You can opt-in to the new behaviour in Garden 0.14 by using `apiVersion: garden.io/v2`. This setting will make Garden throw errors whenever it detects usage of deprecated functionality. Please note that as of today, not all warnings are in place, so we will still add new error conditions. Once the list of breaking changes is final, we will make this known here.

## Breaking changes

### Kubernetes provider configuration

#### <a id="containerDeploymentStrategy">The deploymentStrategy config field</a>

This field has no effect as the experimental support for blue/green deployments (via the "blue-green" strategy) has been removed.

### Project configuration

#### <a id="dotIgnoreFiles">The dotIgnoreFiles config field</a>

Use the dotIgnoreFile field instead. It only allows specifying one filename.

#### <a id="apiVersionV0">apiVersion: garden.io/v0 in the project config</a>

Use apiVersion: garden.io/v1 or higher instead.

#### <a id="projectConfigModules">modules config field</a>

Please use the scan field instead.

### Garden Commands

#### <a id="kubernetesClusterInitCommand">Kubernetes plugin command cluster-init</a>

Do not use this command.