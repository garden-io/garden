---
title: "`ephemeral-kubernetes` Provider"
tocTitle: "`ephemeral-kubernetes`"
---

# `ephemeral-kubernetes` Provider

## Description

{% hint style="warning" %}
This feature is still experimental and only available in Garden `>=0.13.14`. Please let us know if you have any questions or if any issues come up!
{% endhint %}

The `ephemeral-kubernetes` provider is a specialized version of the [`kubernetes` provider](./kubernetes.md) that allows to deploy applications to one of the ephemeral Kubernetes clusters provided by Garden.

Below is the full schema reference for the provider configuration..

The reference is divided into two sections. The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

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
    name: ephemeral-kubernetes

    # The container registry domain that should be used for pulling Garden utility images (such as the
    # image used in the Kubernetes sync utility Pod).
    #
    # If you have your own Docker Hub registry mirror, you can set the domain here and the utility images
    # will be pulled from there. This can be useful to e.g. avoid Docker Hub rate limiting.
    #
    # Otherwise the utility images are pulled directly from Docker Hub by default.
    utilImageRegistryDomain: docker.io

    # Specify which namespace to deploy services to (defaults to the project name). Note that the framework generates
    # other namespaces as well with this name as a prefix.
    namespace:
      # A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters,
      # numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63
      # characters.
      name:

      # Map of annotations to apply to the namespace when creating it.
      annotations:

      # Map of labels to apply to the namespace when creating it.
      labels:

    # Set this to null or false to skip installing/enabling the `nginx` ingress controller. Note: if you skip
    # installing the `nginx` ingress controller for ephemeral cluster, your ingresses may not function properly.
    setupIngressController: nginx
```
## Configuration Keys

### `providers[]`

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

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

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type     | Default                  | Required |
| -------- | ------------------------ | -------- |
| `string` | `"ephemeral-kubernetes"` | Yes      |

Example:

```yaml
providers:
  - name: "ephemeral-kubernetes"
```

### `providers[].utilImageRegistryDomain`

[providers](#providers) > utilImageRegistryDomain

The container registry domain that should be used for pulling Garden utility images (such as the
image used in the Kubernetes sync utility Pod).

If you have your own Docker Hub registry mirror, you can set the domain here and the utility images
will be pulled from there. This can be useful to e.g. avoid Docker Hub rate limiting.

Otherwise the utility images are pulled directly from Docker Hub by default.

| Type     | Default       | Required |
| -------- | ------------- | -------- |
| `string` | `"docker.io"` | No       |

### `providers[].namespace`

[providers](#providers) > namespace

Specify which namespace to deploy services to (defaults to the project name). Note that the framework generates other namespaces as well with this name as a prefix.

| Type               | Required |
| ------------------ | -------- |
| `object \| string` | No       |

### `providers[].namespace.name`

[providers](#providers) > [namespace](#providersnamespace) > name

A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].namespace.annotations`

[providers](#providers) > [namespace](#providersnamespace) > annotations

Map of annotations to apply to the namespace when creating it.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

Example:

```yaml
providers:
  - namespace: ''
      ...
      annotations:
          cluster-autoscaler.kubernetes.io/safe-to-evict: 'false'
```

### `providers[].namespace.labels`

[providers](#providers) > [namespace](#providersnamespace) > labels

Map of labels to apply to the namespace when creating it.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].setupIngressController`

[providers](#providers) > setupIngressController

Set this to null or false to skip installing/enabling the `nginx` ingress controller. Note: if you skip installing the `nginx` ingress controller for ephemeral cluster, your ingresses may not function properly.

| Type     | Default   | Required |
| -------- | --------- | -------- |
| `string` | `"nginx"` | No       |


## Outputs

The following keys are available via the `${providers.<provider-name>}` template string key for `ephemeral-kubernetes` providers.

### `${providers.<provider-name>.outputs.app-namespace}`

The primary namespace used for resource deployments.

| Type     |
| -------- |
| `string` |

### `${providers.<provider-name>.outputs.default-hostname}`

The dynamic hostname assigned to the ephemeral cluster automatically, when an ephemeral cluster is created.

| Type     |
| -------- |
| `string` |

