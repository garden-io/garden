---
title: "`docker-compose` Provider"
tocTitle: "`docker-compose`"
---

# `docker-compose` Provider

## Description

TODO

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

    # Specify Compose projects to import. Defaults to look for one in the project root.
    projects:
      - name:

        # The path to the Compose project directory. Important: This must be within a git repository!
        path:
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

### `providers[].projects[]`

[providers](#providers) > projects

Specify Compose projects to import. Defaults to look for one in the project root.

| Type    | Default          | Required |
| ------- | ---------------- | -------- |
| `array` | `[{"path":"."}]` | No       |

### `providers[].projects[].name`

[providers](#providers) > [projects](#providersprojects) > name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].projects[].path`

[providers](#providers) > [projects](#providersprojects) > path

The path to the Compose project directory. Important: This must be within a git repository!

| Type     | Required |
| -------- | -------- |
| `string` | No       |

