# `terraform` reference

Below is the schema reference for the `terraform` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

The reference is divided into two sections. The [first section](#configuration-keys) lists and describes the available schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

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

### `providers[].autoApply`

[providers](#providers) > autoApply

If set to true, Garden will automatically run `terraform apply -auto-approve` when a stack is not up-to-date. Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing entirely.

| Type      | Required | Default |
| --------- | -------- | ------- |
| `boolean` | No       | `false` |

### `providers[].initRoot`

[providers](#providers) > initRoot

Specify the path to a Terraform config directory, that should be resolved when initializing the provider.
This is useful when other providers need to be able to reference the outputs from the stack.

See the [Terraform guide](../../using-garden/terraform.md) for more information.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].variables`

[providers](#providers) > variables

A map of variables to use when applying Terraform stacks. You can define these here, in individual `terraform` module configs, or you can place a `terraform.tfvars` file in each working directory.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].version`

[providers](#providers) > version

The version of Terraform to use.

| Type     | Required | Default    |
| -------- | -------- | ---------- |
| `string` | No       | `"0.12.7"` |


## Complete YAML schema

The values in the schema below are the default values.

```yaml
providers:
  - name:
    environments:
    autoApply: false
    initRoot:
    variables:
    version: 0.12.7
```
