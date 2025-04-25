---
title: "`conftest-kubernetes` Provider"
tocTitle: "`conftest-kubernetes`"
---

# `conftest-kubernetes` Provider

## Description

This provider automatically generates [conftest Test actions](../action-types/Test/conftest.md) for `kubernetes` and
`helm` Deploys in your project. A `conftest` Test is created for each of those action types.

Simply add this provider to your project configuration, and configure your policies. Check out the below
reference for how to configure default policies, default namespaces, and test failure thresholds for the generated
actions.

See the [conftest example project](https://github.com/garden-io/garden/tree/0.13.59/examples/conftest) for a simple
usage example.

Below is the full schema reference for the provider configuration. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-overview.md).

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

    # Path to the default policy directory or rego file to use for `conftest` actions.
    policyPath: ./policy

    # Default policy namespace to use for `conftest` actions.
    namespace:

    # Set this to `"warn"` if you'd like tests to be marked as failed if one or more _warn_ rules are matched.
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

### `providers[].policyPath`

[providers](#providers) > policyPath

Path to the default policy directory or rego file to use for `conftest` actions.

| Type        | Default      | Required |
| ----------- | ------------ | -------- |
| `posixPath` | `"./policy"` | No       |

### `providers[].namespace`

[providers](#providers) > namespace

Default policy namespace to use for `conftest` actions.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].testFailureThreshold`

[providers](#providers) > testFailureThreshold

Set this to `"warn"` if you'd like tests to be marked as failed if one or more _warn_ rules are matched.
Set to `"none"` to always mark the tests as successful.

| Type     | Default   | Required |
| -------- | --------- | -------- |
| `string` | `"error"` | No       |

