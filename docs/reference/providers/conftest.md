---
title: Conftest
---

# `conftest` reference

Below is the schema reference for the `conftest` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../guides/configuration-files.md).

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
    # Path to the default policy directory or rego file to use for `conftest` modules.
    policyPath: ./policy
    # Default policy namespace to use for `conftest` modules.
    namespace:
    # Set this to `"warn"` if you'd like tests to be marked as failed if one or more _warn_ rules
    # are matched.
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

### `providers[].policyPath`

[providers](#providers) > policyPath

Path to the default policy directory or rego file to use for `conftest` modules.

| Type     | Required | Default      |
| -------- | -------- | ------------ |
| `string` | No       | `"./policy"` |

### `providers[].namespace`

[providers](#providers) > namespace

Default policy namespace to use for `conftest` modules.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].testFailureThreshold`

[providers](#providers) > testFailureThreshold

Set this to `"warn"` if you'd like tests to be marked as failed if one or more _warn_ rules are matched.
Set to `"none"` to always mark the tests as successful.

| Type     | Required | Default   |
| -------- | -------- | --------- |
| `string` | No       | `"error"` |

