---
title: "`conftest-kubernetes` Provider"
tocTitle: "`conftest-kubernetes`"
---

# `conftest-kubernetes` Provider

## Description

This provider automatically generates [conftest modules](https://docs.garden.io/reference/module-types/conftest) for `kubernetes` and
`helm` modules in your project. A `conftest` module is created for each of those module types.

Simply add this provider to your project configuration, and configure your policies. Check out the below
reference for how to configure default policies, default namespaces, and test failure thresholds for the generated
modules.

See the [conftest example project](https://github.com/garden-io/garden/tree/v0.11.11/examples/conftest) for a simple
usage example.

Below is the full schema reference for the provider configuration. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../guides/configuration-files.md).

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

    # Path to the default policy directory or rego file to use for `conftest` modules.
    policyPath: ./policy

    # Default policy namespace to use for `conftest` modules.
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

| Type        | Default      | Required |
| ----------- | ------------ | -------- |
| `posixPath` | `"./policy"` | No       |

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

| Type     | Default   | Required |
| -------- | --------- | -------- |
| `string` | `"error"` | No       |

