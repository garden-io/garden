---
title: "`hadolint` Provider"
tocTitle: "`hadolint`"
---

# `hadolint` Provider

## Description

This provider creates a [`hadolint`](../action-types/Test/hadolint.md) Test action type, and (by default) generates one such action for each `container` Build that contains a Dockerfile in your project. Each Test runs [hadolint](https://github.com/hadolint/hadolint) against the Dockerfile in question, in order to ensure that the Dockerfile is valid and follows best practices.

To configure `hadolint`, you can use `.hadolint.yaml` config files. For each Test, we first look for one in the relevant action's root. If none is found there, we check the project root, and if none is there we fall back to default configuration. Note that for reasons of portability, we do not fall back to global/user configuration files.

See the [hadolint docs](https://github.com/hadolint/hadolint#configure) for details on how to configure it, and the [hadolint example project](https://github.com/garden-io/garden/tree/0.13.56/examples/hadolint) for a usage example.

Below is the full schema reference for the provider configuration. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-overview.md).

The reference is divided into two sections. The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
providers:
  - # The name of the provider plugin to use.
    name:

    # List other providers that should be resolved before this one.
    #
    # Example: `["exec"]`
    dependencies: []

    # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    #
    # Example: `["dev","stage"]`
    environments:

    # By default, the provider automatically creates a `hadolint` Test for every `container` Build in your
    # project. Set this to `false` to disable this behavior.
    autoInject: true

    # Set this to `"warning"` if you'd like tests to be marked as failed if one or more warnings are returned.
    # Set to `"none"` to always mark the tests as successful.
    testFailureThreshold: error
```
## Configuration Keys

### `providers[]`

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `providers[].dependencies[]`

[providers](#providers) > dependencies

List other providers that should be resolved before this one.

Example: `["exec"]`

| Type    | Default | Required |
| ------- | ------- | -------- |
| `array` | `[]`    | No       |

### `providers[].environments[]`

[providers](#providers) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

Example: `["dev","stage"]`

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].autoInject`

[providers](#providers) > autoInject

By default, the provider automatically creates a `hadolint` Test for every `container` Build in your
project. Set this to `false` to disable this behavior.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `providers[].testFailureThreshold`

[providers](#providers) > testFailureThreshold

Set this to `"warning"` if you'd like tests to be marked as failed if one or more warnings are returned.
Set to `"none"` to always mark the tests as successful.

| Type     | Allowed Values             | Default   | Required |
| -------- | -------------------------- | --------- | -------- |
| `string` | "error", "warning", "none" | `"error"` | No       |

