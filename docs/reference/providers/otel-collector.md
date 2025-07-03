---
title: "`otel-collector` Provider"
tocTitle: "`otel-collector`"
---

# `otel-collector` Provider

## Description

This provider enables gathering and exporting [OpenTelemetry](https://opentelemetry.io/) data for the Garden execution.

It provides detailed insights into what a Garden command is doing at any given time and can be used for alerting on performance regressions or debugging performance issues.

It does that by running an [OpenTelemetry Collector](https://github.com/open-telemetry/opentelemetry-collector) on the local machine for the duration of the command execution, which then exports the gathered data to the desired service.

Currently supported exporters are [Datadog](https://www.datadoghq.com/), [Newrelic](https://newrelic.com/), [Honeycomb](https://www.honeycomb.io/) and 'OTLP HTTP'.

Below is the full schema reference for the provider configuration..

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

    preInit:
      # A script to run before the provider is initialized. This is useful for performing any provider-specific setup
      # outside of Garden. For example, you can use this to perform authentication, such as authenticating with a
      # Kubernetes cluster provider.
      # The script will always be run from the project root directory.
      # Note that provider statuses are cached, so this script will generally only be run once, but you can force a
      # re-run by setting `--force-refresh` on any Garden command that uses the provider.
      runScript:

    exporters:
      - name:

        enabled:

        verbosity: normal
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

### `providers[].preInit`

[providers](#providers) > preInit

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].preInit.runScript`

[providers](#providers) > [preInit](#providerspreinit) > runScript

A script to run before the provider is initialized. This is useful for performing any provider-specific setup outside of Garden. For example, you can use this to perform authentication, such as authenticating with a Kubernetes cluster provider.
The script will always be run from the project root directory.
Note that provider statuses are cached, so this script will generally only be run once, but you can force a re-run by setting `--force-refresh` on any Garden command that uses the provider.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].exporters[]`

[providers](#providers) > exporters

| Type    | Required |
| ------- | -------- |
| `array` | Yes      |

### `providers[].exporters[].name`

[providers](#providers) > [exporters](#providersexporters) > name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].exporters[].enabled`

[providers](#providers) > [exporters](#providersexporters) > enabled

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `providers[].exporters[].verbosity`

[providers](#providers) > [exporters](#providersexporters) > verbosity

| Type     | Allowed Values                | Default    | Required |
| -------- | ----------------------------- | ---------- | -------- |
| `string` | "detailed", "normal", "basic" | `"normal"` | No       |


