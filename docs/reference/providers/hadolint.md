---
title: Hadolint
---

# `hadolint` reference

Below is the schema reference for the `hadolint` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../guides/configuration-files.md).

The reference is divided into two sections. The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

## Complete YAML schema

The values in the schema below are the default values.

```yaml
providers:
  # The name of the provider plugin to use.
  - name:
    # If specified, this provider will only be used in the listed environments. Note that an empty
    # array effectively disables the provider. To use a provider in all environments, omit this
    # field.
    environments:
    # By default, the provider automatically creates a `hadolint` module for every `container`
    # module in your
    # project. Set this to `false` to disable this behavior.
    autoInject: true
    # Set this to `"warning"` if you'd like tests to be marked as failed if one or more warnings
    # are returned.
    # Set to `"none"` to always mark the tests as successful.
    testFailureThreshold: error
```
## Configuration keys

### `providers`

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

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

### `providers[].autoInject`

[providers](#providers) > autoInject

By default, the provider automatically creates a `hadolint` module for every `container` module in your
project. Set this to `false` to disable this behavior.

| Type      | Required | Default |
| --------- | -------- | ------- |
| `boolean` | No       | `true`  |

### `providers[].testFailureThreshold`

[providers](#providers) > testFailureThreshold

Set this to `"warning"` if you'd like tests to be marked as failed if one or more warnings are returned.
Set to `"none"` to always mark the tests as successful.

| Type     | Required | Default   |
| -------- | -------- | --------- |
| `string` | No       | `"error"` |

