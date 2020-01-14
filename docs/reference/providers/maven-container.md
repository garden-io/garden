---
title: maven-container
---

# `maven-container` Provider



## Reference

Below is the schema reference for the `maven-container` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../guides/configuration-files.md).

The reference is divided into two sections. The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

### Complete YAML Schema

The values in the schema below are the default values.

```yaml
providers:
  # The name of the provider plugin to use.
  - name:
    # If specified, this provider will only be used in the listed environments. Note that an empty
    # array effectively disables the provider. To use a provider in all environments, omit this
    # field.
    environments:
```
### Configuration Keys

#### `providers`

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

#### `providers[].name`

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

#### `providers[].environments[]`

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

