---
title: '`openfaas` Provider'
tocTitle: '`openfaas`'
---

# openfaas

## Description

This provider adds support for [OpenFaaS](https://www.openfaas.com/). It adds the [`openfaas` module type](https://docs.garden.io/reference/module-types/openfaas) and \(by default\) installs the `faas-netes` runtime to the project namespace. Each `openfaas` module maps to a single OpenFaaS function.

See the reference below for configuration options for `faas-netes`, and the [module type docs](https://docs.garden.io/reference/module-types/openfaas) for how to configure the individual functions.

Also see the [openfaas example project](https://github.com/garden-io/garden/tree/0.12.15/examples/openfaas) for a simple usage example.

Below is the full schema reference for the provider configuration. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-overview.md).

The reference is divided into two sections. The [first section](openfaas.md#complete-yaml-schema) contains the complete YAML schema, and the [second section](openfaas.md#configuration-keys) describes each schema key.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
providers:
  - # List other providers that should be resolved before this one.
    dependencies: []

    # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    environments:

    # The name of the provider plugin to use.
    name: openfaas

    # The external URL to the function gateway, after installation. This is required if you set `faasNetes.values`
    # or `faastNetes.install: false`, so that Garden can know how to reach the gateway.
    gatewayUrl:

    # The ingress hostname to configure for the function gateway, when `faasNetes.install: true` and not
    # overriding `faasNetes.values`. Defaults to the default hostname of the configured Kubernetes provider.
    #
    # Important: If you have other types of services, this should be different from their ingress hostnames,
    # or the other services should not expose paths under /function and /system to avoid routing conflicts.
    hostname:

    faasNetes:
      # Set to false if you'd like to install and configure faas-netes yourself.
      # See the [official instructions](https://docs.openfaas.com/deployment/kubernetes/) for details.
      install: true

      # Override the values passed to the faas-netes Helm chart. Ignored if `install: false`.
      # See the [chart docs](https://github.com/openfaas/faas-netes/tree/master/chart/openfaas) for the available
      # options.
      #
      # Note that this completely replaces the values Garden assigns by default, including `functionNamespace`,
      # ingress configuration etc. so you need to make sure those are correctly configured for your use case.
      values:
```

## Configuration Keys

### `providers[]`

| Type | Default | Required |
| :--- | :--- | :--- |
| `array[object]` | `[]` | No |

### `providers[].dependencies[]`

[providers](openfaas.md#providers) &gt; dependencies

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

[providers](openfaas.md#providers) &gt; environments

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

### `providers[].name`

[providers](openfaas.md#providers) &gt; name

The name of the provider plugin to use.

| Type | Default | Required |
| :--- | :--- | :--- |
| `string` | `"openfaas"` | Yes |

Example:

```yaml
providers:
  - name: "openfaas"
```

### `providers[].gatewayUrl`

[providers](openfaas.md#providers) &gt; gatewayUrl

The external URL to the function gateway, after installation. This is required if you set `faasNetes.values` or `faastNetes.install: false`, so that Garden can know how to reach the gateway.

| Type | Required |
| :--- | :--- |
| `string` | No |

Example:

```yaml
providers:
  - gatewayUrl: "https://functions.mydomain.com"
```

### `providers[].hostname`

[providers](openfaas.md#providers) &gt; hostname

The ingress hostname to configure for the function gateway, when `faasNetes.install: true` and not overriding `faasNetes.values`. Defaults to the default hostname of the configured Kubernetes provider.

Important: If you have other types of services, this should be different from their ingress hostnames, or the other services should not expose paths under /function and /system to avoid routing conflicts.

| Type | Required |
| :--- | :--- |
| `string` | No |

Example:

```yaml
providers:
  - hostname: "functions.mydomain.com"
```

### `providers[].faasNetes`

[providers](openfaas.md#providers) &gt; faasNetes

| Type | Default | Required |
| :--- | :--- | :--- |
| `object` | `{"install":true}` | No |

### `providers[].faasNetes.install`

[providers](openfaas.md#providers) &gt; [faasNetes](openfaas.md#providersfaasnetes) &gt; install

Set to false if you'd like to install and configure faas-netes yourself. See the [official instructions](https://docs.openfaas.com/deployment/kubernetes/) for details.

| Type | Default | Required |
| :--- | :--- | :--- |
| `boolean` | `true` | No |

### `providers[].faasNetes.values`

[providers](openfaas.md#providers) &gt; [faasNetes](openfaas.md#providersfaasnetes) &gt; values

Override the values passed to the faas-netes Helm chart. Ignored if `install: false`. See the [chart docs](https://github.com/openfaas/faas-netes/tree/master/chart/openfaas) for the available options.

Note that this completely replaces the values Garden assigns by default, including `functionNamespace`, ingress configuration etc. so you need to make sure those are correctly configured for your use case.

| Type | Required |
| :--- | :--- |
| `object` | No |

