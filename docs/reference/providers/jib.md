---
title: "`jib` Provider"
tocTitle: "`jib`"
---

# `jib` Provider

## Description

**EXPERIMENTAL**: Please provide feedback via GitHub issues or our community forum!

Provides support for [Jib](https://github.com/GoogleContainerTools/jib) via the [jib action type](../action-types/Build/jib-container.md).

Use this to efficiently build container images for Java services. Check out the [jib example](https://github.com/garden-io/garden/tree/0.14.15/examples/jib-container) to see it in action.

Below is the full schema reference for the provider configuration..

The reference is divided into two sections. The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
providers:
  - # The name of the provider plugin to use.
    name:

    # List other providers that should be resolved before this one.
    dependencies: []

    # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    environments:

    preInit:
      # A script to run before the provider is initialized. This is useful for performing any provider-specific setup
      # outside of Garden. For example, you can use this to perform authentication, such as authenticating with a
      # Kubernetes cluster provider.
      # The script will always be run from the project root directory.
      # Note that provider statuses are cached, so this script will generally only be run once, but you can force a
      # re-run by setting `--force-refresh` on any Garden command that uses the provider.
      runScript:
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

Example:

```yaml
providers:
  - name: "local-kubernetes"
```

### `providers[].dependencies[]`

[providers](#providers) > dependencies

List other providers that should be resolved before this one.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

Example:

```yaml
providers:
  - dependencies:
      - exec
```

### `providers[].environments[]`

[providers](#providers) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
providers:
  - environments:
      - dev
      - stage
```

### `providers[].preInit`

[providers](#providers) > preInit

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].preInit.runScript`

[providers](#providers) > [preInit](#providerspreinit) > runScript

A script to run before the provider is initialized. This is useful for performing any provider-specific setup outside of Garden. For example, you can use this to perform authentication, such as authenticating with a Kubernetes cluster provider.
The script will always be run from the project root directory.
Note that provider statuses are cached, so this script will generally only be run once, but you can force a re-run by setting `--force-refresh` on any Garden command that uses the provider.

| Type     | Required |
| -------- | -------- |
| `string` | No       |


