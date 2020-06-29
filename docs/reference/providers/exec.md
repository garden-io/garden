---
title: "`exec` Provider"
tocTitle: "`exec`"
---

# `exec` Provider

## Description

A simple provider that allows running arbitary scripts when initializing providers, and provides the exec
module type.

_Note: This provider is always loaded when running Garden. You only need to explicitly declare it in your provider
configuration if you want to configure a script for it to run._

Below is the full schema reference for the provider configuration. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-overview.md).

The reference is divided into two sections. The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
providers:
  - # The name of the provider plugin to use.
    name:

    # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    environments:

    # An optional script to run in the project root when initializing providers. This is handy for running an
    # arbitrary
    # script when initializing. For example, another provider might declare a dependency on this provider, to ensure
    # this script runs before resolving that provider.
    initScript:
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

### `providers[].initScript`

[providers](#providers) > initScript

An optional script to run in the project root when initializing providers. This is handy for running an arbitrary
script when initializing. For example, another provider might declare a dependency on this provider, to ensure
this script runs before resolving that provider.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

