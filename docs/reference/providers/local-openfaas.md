# `local-openfaas` reference

Below is the schema reference for the `local-openfaas` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

The reference is divided into two sections. The [first section](#configuration-keys) lists and describes the available schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

## Configuration keys

### `providers`

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

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

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type     | Required | Default      |
| -------- | -------- | ------------ |
| `string` | Yes      | `"openfaas"` |

Example:

```yaml
providers:
  - name: "openfaas"
```

### `providers[].hostname`

[providers](#providers) > hostname

The hostname to configure for the function gateway.
Defaults to the default hostname of the configured Kubernetes provider.

Important: If you have other types of services, this should be different from their ingress hostnames,
or the other services should not expose paths under /function and /system to avoid routing conflicts.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
providers:
  - hostname: "functions.mydomain.com"
```


## Complete YAML schema

The values in the schema below are the default values.

```yaml
providers:
  - environments:
    name: openfaas
    hostname:
```
