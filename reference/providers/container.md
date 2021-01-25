---
title: '`container` Provider'
tocTitle: '`container`'
---

# container

## Description

Provides the [container](https://docs.garden.io/reference/module-types/container) module type. _Note that this provider is currently automatically included, and you do not need to configure it in your project configuration._

Below is the full schema reference for the provider configuration. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-overview.md).

The reference is divided into two sections. The [first section](container.md#complete-yaml-schema) contains the complete YAML schema, and the [second section](container.md#configuration-keys) describes each schema key.

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
```

## Configuration Keys

### `providers[]`

| Type | Default | Required |
| :--- | :--- | :--- |
| `array[object]` | `[]` | No |

### `providers[].name`

[providers](container.md#providers) &gt; name

The name of the provider plugin to use.

| Type | Required |
| :--- | :--- |
| `string` | Yes |

Example:

```yaml
providers:
  - name: "local-kubernetes"
```

### `providers[].dependencies[]`

[providers](container.md#providers) &gt; dependencies

List other providers that should be resolved before this one.

| Type | Default | Required |
| :--- | :--- | :--- |
| `array[string]` | `[]` | No |

Example:

```yaml
providers:
  - dependencies:
      - exec
```

### `providers[].environments[]`

[providers](container.md#providers) &gt; environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type | Required |
| :--- | :--- |
| `array[string]` | No |

Example:

```yaml
providers:
  - environments:
      - dev
      - stage
```

