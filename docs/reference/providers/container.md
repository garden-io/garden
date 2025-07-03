---
title: "`container` Provider"
tocTitle: "`container`"
---

# `container` Provider

## Description

Provides the `container` actions and module type.
_Note that this provider is currently automatically included, and you do not need to configure it in your project configuration._

Below is the full schema reference for the provider configuration..

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

    preInit:
      # A script to run before the provider is initialized. This is useful for performing any provider-specific setup
      # outside of Garden. For example, you can use this to perform authentication, such as authenticating with a
      # Kubernetes cluster provider.
      # The script will always be run from the project root directory.
      # Note that provider statuses are cached, so this script will generally only be run once, but you can force a
      # re-run by setting `--force-refresh` on any Garden command that uses the provider.
      runScript:

    # Extra flags to pass to the `docker build` command. Will extend the `spec.extraFlags` specified in each container
    # Build action.
    dockerBuildExtraFlags:

    gardenContainerBuilder:
      # Enable Remote Container Builder, which can speed up builds significantly using fast machines and extremely
      # fast caching. When the project is connected and you're logged in to https://app.garden.io the container
      # builder will be enabled by default.
      #
      # Under the hood, enabling this option means that Garden will install a remote buildx driver on your local
      # Docker daemon, and use that for builds. See also https://docs.docker.com/build/drivers/remote/
      #
      # In addition to this setting, the environment variable `GARDEN_CONTAINER_BUILDER` can be used to override this
      # setting, if enabled in the configuration. Set it to `false` or `0` to temporarily disable Remote Container
      # Builder.
      #
      # If service limits are reached, or Remote Container Builder is not available, Garden will fall back to building
      # images locally, or it falls back to building in your Kubernetes cluster in case in-cluster building is
      # configured in the Kubernetes provider configuration.
      #
      # Please note that when enabling Container Builder together with in-cluster building, you need to authenticate
      # to your `deploymentRegistry` from the local machine (e.g. by running `docker login`).
      enabled: false
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

### `providers[].dockerBuildExtraFlags[]`

[providers](#providers) > dockerBuildExtraFlags

Extra flags to pass to the `docker build` command. Will extend the `spec.extraFlags` specified in each container Build action.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `providers[].gardenContainerBuilder`

[providers](#providers) > gardenContainerBuilder

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].gardenContainerBuilder.enabled`

[providers](#providers) > [gardenContainerBuilder](#providersgardencontainerbuilder) > enabled

Enable Remote Container Builder, which can speed up builds significantly using fast machines and extremely fast caching. When the project is connected and you're logged in to https://app.garden.io the container builder will be enabled by default.

Under the hood, enabling this option means that Garden will install a remote buildx driver on your local Docker daemon, and use that for builds. See also https://docs.docker.com/build/drivers/remote/

In addition to this setting, the environment variable `GARDEN_CONTAINER_BUILDER` can be used to override this setting, if enabled in the configuration. Set it to `false` or `0` to temporarily disable Remote Container Builder.

If service limits are reached, or Remote Container Builder is not available, Garden will fall back to building images locally, or it falls back to building in your Kubernetes cluster in case in-cluster building is configured in the Kubernetes provider configuration.

Please note that when enabling Container Builder together with in-cluster building, you need to authenticate to your `deploymentRegistry` from the local machine (e.g. by running `docker login`).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |


