---
title: "`terraform` Provider"
tocTitle: "`terraform`"
---

# `terraform` Provider

## Description

This provider allows you to integrate Terraform stacks into your Garden project. See the [Terraform guide](https://docs.garden.io/bonsai-0.13/advanced/terraform) for details and usage information.

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

    # If set to true, Garden will run `terraform destroy` on the project root stack when calling `garden delete env`.
    allowDestroy: false

    # If set to true, Garden will automatically run `terraform apply -auto-approve` when a stack is not up-to-date.
    # Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing entirely.
    #
    # **Note: This is not recommended for production, or shared environments in general!**
    autoApply: false

    # Specify the path to a Terraform config directory, that should be resolved when initializing the provider. This
    # is useful when other providers need to be able to reference the outputs from the stack.
    #
    # See the [Terraform guide](https://docs.garden.io/bonsai-0.13/advanced/terraform) for more information.
    initRoot:

    # A map of variables to use when applying Terraform stacks. You can define these here, in individual
    # `terraform` action configs, or you can place a `terraform.tfvars` file in each working directory.
    variables:

    # The version of Terraform to use. Set to `null` to use whichever version of `terraform` that is on your PATH.
    version: 1.4.6

    # Use the specified Terraform workspace.
    workspace:

    # Set to `true` to make logs from Terraform Deploy actions visible in Garden Cloud/Enterprise. Defaults to `false`
    streamLogsToCloud: false

    # Configure the Terraform backend.
    #
    # The key-value pairs defined here are set as the `-backend-config` options when Garden
    # runs `terraform init`.
    #
    # This can be used to dynamically set a Terraform backend depending on the environment.
    #
    # If Garden sees that the backend has changes, it'll re-initialize Terraform and set the new values.
    backendConfig:
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

### `providers[].allowDestroy`

[providers](#providers) > allowDestroy

If set to true, Garden will run `terraform destroy` on the project root stack when calling `garden delete env`.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].autoApply`

[providers](#providers) > autoApply

If set to true, Garden will automatically run `terraform apply -auto-approve` when a stack is not up-to-date. Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing entirely.

**Note: This is not recommended for production, or shared environments in general!**

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].initRoot`

[providers](#providers) > initRoot

Specify the path to a Terraform config directory, that should be resolved when initializing the provider. This is useful when other providers need to be able to reference the outputs from the stack.

See the [Terraform guide](https://docs.garden.io/bonsai-0.13/advanced/terraform) for more information.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `providers[].variables`

[providers](#providers) > variables

A map of variables to use when applying Terraform stacks. You can define these here, in individual
`terraform` action configs, or you can place a `terraform.tfvars` file in each working directory.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].version`

[providers](#providers) > version

The version of Terraform to use. Set to `null` to use whichever version of `terraform` that is on your PATH.

| Type     | Allowed Values                                                 | Default   | Required |
| -------- | -------------------------------------------------------------- | --------- | -------- |
| `string` | "0.12.26", "0.13.3", "0.14.7", "1.0.5", "1.2.9", "1.4.6", null | `"1.4.6"` | Yes      |

### `providers[].workspace`

[providers](#providers) > workspace

Use the specified Terraform workspace.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].streamLogsToCloud`

[providers](#providers) > streamLogsToCloud

Set to `true` to make logs from Terraform Deploy actions visible in Garden Cloud/Enterprise. Defaults to `false`

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].backendConfig`

[providers](#providers) > backendConfig

Configure the Terraform backend.

The key-value pairs defined here are set as the `-backend-config` options when Garden
runs `terraform init`.

This can be used to dynamically set a Terraform backend depending on the environment.

If Garden sees that the backend has changes, it'll re-initialize Terraform and set the new values.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

Example:

```yaml
providers:
  - backendConfig:
        "bucket: ${environment.name\\}-bucket\nkey: tf-state/${local.username\\}/terraform.tfstate"
```

