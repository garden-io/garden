---
title: "`container` Provider"
tocTitle: "`container`"
---

# `container` Provider

## Description

Provides the `container` actions and module type.
_Note that this provider is currently automatically included, and you do not need to configure it in your project configuration._

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

    # **Stability: Experimental**. Subject to breaking changes within minor releases.
    #
    # Extra flags to pass to the `docker build` command. Will extend the `spec.extraFlags` specified in each container
    # Build action.
    dockerBuildExtraFlags:

    gardenCloudBuilder:
      # Enable Garden Container Builder, which can speed up builds significantly using fast machines and extremely
      # fast caching.
      #
      # by running `GARDEN_CONTAINER_BUILDER=1 garden build` you can try Garden Container Builder temporarily without
      # any changes to your Garden configuration.
      # The environment variable `GARDEN_CONTAINER_BUILDER` can also be used to override this setting, if enabled in
      # the configuration. Set it to `false` or `0` to temporarily disable Garden Container Builder.
      #
      # Under the hood, enabling this option means that Garden will install a remote buildx driver on your local
      # Docker daemon, and use that for builds. See also https://docs.docker.com/build/drivers/remote/
      #
      # If service limits are reached, or Garden Container Builder is not available, Garden will fall back to building
      # images locally, or it falls back to building in your Kubernetes cluster in case in-cluster building is
      # configured in the Kubernetes provider configuration.
      #
      # Please note that when enabling Container Builder together with in-cluster building, you need to authenticate
      # to your `deploymentRegistry` from the local machine (e.g. by running `docker login`).
      enabled: false

    gardenContainerBuilder:
      # Enable Garden Container Builder, which can speed up builds significantly using fast machines and extremely
      # fast caching.
      #
      # by running `GARDEN_CONTAINER_BUILDER=1 garden build` you can try Garden Container Builder temporarily without
      # any changes to your Garden configuration.
      # The environment variable `GARDEN_CONTAINER_BUILDER` can also be used to override this setting, if enabled in
      # the configuration. Set it to `false` or `0` to temporarily disable Garden Container Builder.
      #
      # Under the hood, enabling this option means that Garden will install a remote buildx driver on your local
      # Docker daemon, and use that for builds. See also https://docs.docker.com/build/drivers/remote/
      #
      # If service limits are reached, or Garden Container Builder is not available, Garden will fall back to building
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

### `providers[].dockerBuildExtraFlags[]`

[providers](#providers) > dockerBuildExtraFlags

**Stability: Experimental**. Subject to breaking changes within minor releases.

Extra flags to pass to the `docker build` command. Will extend the `spec.extraFlags` specified in each container Build action.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `providers[].gardenCloudBuilder`

[providers](#providers) > gardenCloudBuilder

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].gardenCloudBuilder.enabled`

[providers](#providers) > [gardenCloudBuilder](#providersgardencloudbuilder) > enabled

Enable Garden Container Builder, which can speed up builds significantly using fast machines and extremely fast caching.

by running `GARDEN_CONTAINER_BUILDER=1 garden build` you can try Garden Container Builder temporarily without any changes to your Garden configuration.
The environment variable `GARDEN_CONTAINER_BUILDER` can also be used to override this setting, if enabled in the configuration. Set it to `false` or `0` to temporarily disable Garden Container Builder.

Under the hood, enabling this option means that Garden will install a remote buildx driver on your local Docker daemon, and use that for builds. See also https://docs.docker.com/build/drivers/remote/

If service limits are reached, or Garden Container Builder is not available, Garden will fall back to building images locally, or it falls back to building in your Kubernetes cluster in case in-cluster building is configured in the Kubernetes provider configuration.

Please note that when enabling Container Builder together with in-cluster building, you need to authenticate to your `deploymentRegistry` from the local machine (e.g. by running `docker login`).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].gardenContainerBuilder`

[providers](#providers) > gardenContainerBuilder

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].gardenContainerBuilder.enabled`

[providers](#providers) > [gardenContainerBuilder](#providersgardencontainerbuilder) > enabled

Enable Garden Container Builder, which can speed up builds significantly using fast machines and extremely fast caching.

by running `GARDEN_CONTAINER_BUILDER=1 garden build` you can try Garden Container Builder temporarily without any changes to your Garden configuration.
The environment variable `GARDEN_CONTAINER_BUILDER` can also be used to override this setting, if enabled in the configuration. Set it to `false` or `0` to temporarily disable Garden Container Builder.

Under the hood, enabling this option means that Garden will install a remote buildx driver on your local Docker daemon, and use that for builds. See also https://docs.docker.com/build/drivers/remote/

If service limits are reached, or Garden Container Builder is not available, Garden will fall back to building images locally, or it falls back to building in your Kubernetes cluster in case in-cluster building is configured in the Kubernetes provider configuration.

Please note that when enabling Container Builder together with in-cluster building, you need to authenticate to your `deploymentRegistry` from the local machine (e.g. by running `docker login`).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

