---
title: "`local-kubernetes` Provider"
tocTitle: "`local-kubernetes`"
---

# `local-kubernetes` Provider

## Description

The `local-kubernetes` provider is a specialized version of the [`kubernetes` provider](https://docs.garden.io/reference/providers/kubernetes) that automates and simplifies working with local Kubernetes clusters.

For general Kubernetes usage information, please refer to the [guides section](https://docs.garden.io/guides). For local clusters a good place to start is the [Local Kubernetes guide](https://docs.garden.io/guides/local-kubernetes) guide. The [Getting Started](https://docs.garden.io/getting-started/0-introduction) guide is also helpful as an introduction.

If you're working with a remote Kubernetes cluster, please refer to the [`kubernetes` provider](https://docs.garden.io/reference/providers/kubernetes) docs, and the [Remote Kubernetes guide](https://docs.garden.io/guides/remote-kubernetes) guide.

Below is the full schema reference for the provider configuration. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-overview.md).

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

    # Choose the mechanism for building container images before deploying. By default your local Docker daemon is
    # used, but you can set it to `cluster-buildkit` or `kaniko` to sync files to the cluster, and build container
    # images there. This removes the need to run Docker locally, and allows you to share layer and image caches
    # between multiple developers, as well as between your development and CI workflows.
    #
    # For more details on all the different options and what makes sense to use for your setup, please check out the
    # [in-cluster building guide](https://docs.garden.io/guides/in-cluster-building).
    #
    # **Note:** The `cluster-docker` mode has been deprecated and will be removed in a future release!
    buildMode: local-docker

    # Configuration options for the `cluster-buildkit` build mode.
    clusterBuildkit:
      # Enable rootless mode for the cluster-buildkit daemon, which runs the daemon with decreased privileges.
      # Please see [the buildkit docs](https://github.com/moby/buildkit/blob/master/docs/rootless.md) for caveats when
      # using this mode.
      rootless: false

      # Exposes the `nodeSelector` field on the PodSpec of the BuildKit deployment. This allows you to constrain the
      # BuildKit daemon to only run on particular nodes.
      #
      # [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes
      # guide to assigning Pods to nodes.
      nodeSelector: {}

    # Configuration options for the `kaniko` build mode.
    kaniko:
      # Specify extra flags to use when building the container image with kaniko. Flags set on `container` modules
      # take precedence over these.
      extraFlags:

      # Change the kaniko image (repository/image:tag) to use when building in kaniko mode.
      image: 'gcr.io/kaniko-project/executor:v1.6.0-debug'

      # Choose the namespace where the Kaniko pods will be run. Set to `null` to use the project namespace.
      #
      # **IMPORTANT: The default namespace will change to the project namespace instead of the garden-system namespace
      # in an upcoming release!**
      namespace: garden-system

      # Exposes the `nodeSelector` field on the PodSpec of the Kaniko pods. This allows you to constrain the Kaniko
      # pods to only run on particular nodes.
      #
      # [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes
      # guide to assigning Pods to nodes.
      nodeSelector:

      # Specify tolerations to apply to each Kaniko Pod. Useful to control which nodes in a cluster can run builds.
      tolerations:
        - # "Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
          # allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".
          effect:

          # "Key" is the taint key that the toleration applies to. Empty means match all taint keys.
          # If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.
          key:

          # "Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal".
          # Defaults to
          # "Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
          # particular category.
          operator: Equal

          # "TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
          # otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
          # the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
          # by the system.
          tolerationSeconds:

          # "Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be
          # empty,
          # otherwise just a regular string.
          value:

    # A default hostname to use when no hostname is explicitly configured for a service.
    defaultHostname:

    # Defines the strategy for deploying the project services.
    # Default is "rolling update" and there is experimental support for "blue/green" deployment.
    # The feature only supports modules of type `container`: other types will just deploy using the default strategy.
    deploymentStrategy: rolling

    # Require SSL on all `container` module services. If set to true, an error is raised when no certificate is
    # available for a configured hostname on a `container` module.
    forceSsl: false

    # References to `docker-registry` secrets to use for authenticating with remote registries when pulling
    # images. This is necessary if you reference private images in your module configuration, and is required
    # when configuring a remote Kubernetes environment with buildMode=local.
    imagePullSecrets:
      - # The name of the Kubernetes secret.
        name:

        # The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate
        # namespace before use.
        namespace: default

    # Resource requests and limits for the in-cluster builder, container registry and code sync service. (which are
    # automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).
    resources:
      # Resource requests and limits for the in-cluster builder. It's important to consider which build mode you're
      # using when configuring this.
      #
      # When `buildMode` is `kaniko`, this refers to _each Kaniko pod_, i.e. each individual build, so you'll want to
      # consider the requirements for your individual image builds, with your most expensive/heavy images in mind.
      #
      # When `buildMode` is `cluster-buildkit`, this applies to the BuildKit deployment created in _each project
      # namespace_. So think of this as the resource spec for each individual user or project namespace.
      #
      # When `buildMode` is `cluster-docker`, this applies to the single Docker Daemon that is installed and run
      # cluster-wide. This is shared across all users and builds in the cluster, so it should be resourced
      # accordingly, factoring in how many concurrent builds you expect and how heavy your builds tend to be. **Note
      # that the cluster-docker build mode has been deprecated!**
      builder:
        limits:
          # CPU limit in millicpu.
          cpu: 4000

          # Memory limit in megabytes.
          memory: 8192

          # Ephemeral storage limit in megabytes.
          ephemeralStorage:

        requests:
          # CPU request in millicpu.
          cpu: 100

          # Memory request in megabytes.
          memory: 512

          # Ephemeral storage request in megabytes.
          ephemeralStorage:

      # Resource requests and limits for the in-cluster image registry. Built images are pushed to this registry,
      # so that they are available to all the nodes in your cluster.
      #
      # This is shared across all users and builds, so it should be resourced accordingly, factoring
      # in how many concurrent builds you expect and how large your images tend to be.
      registry:
        limits:
          # CPU limit in millicpu.
          cpu: 2000

          # Memory limit in megabytes.
          memory: 4096

          # Ephemeral storage limit in megabytes.
          ephemeralStorage:

        requests:
          # CPU request in millicpu.
          cpu: 200

          # Memory request in megabytes.
          memory: 512

          # Ephemeral storage request in megabytes.
          ephemeralStorage:

    # Storage parameters to set for the in-cluster builder, container registry and code sync persistent volumes
    # (which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).
    #
    # These are all shared cluster-wide across all users and builds, so they should be resourced accordingly,
    # factoring in how many concurrent builds you expect and how large your images and build contexts tend to be.
    storage:
      # Storage parameters for the in-cluster Docker registry volume. Built images are stored here, so that they
      # are available to all the nodes in your cluster.
      #
      # Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.
      registry:
        # Volume size in megabytes.
        size: 20480

        # Storage class to use for the volume.
        storageClass: null

    # One or more certificates to use for ingress.
    tlsCertificates:
      - # A unique identifier for this certificate.
        name:

        # A list of hostnames that this certificate should be used for. If you don't specify these, they will be
        # automatically read from the certificate.
        hostnames:

        # A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.
        secretRef:
          # The name of the Kubernetes secret.
          name:

          # The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate
          # namespace before use.
          namespace: default

        # Set to `cert-manager` to configure [cert-manager](https://github.com/jetstack/cert-manager) to manage this
        # certificate. See our
        # [cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
        managedBy:

    # cert-manager configuration, for creating and managing TLS certificates. See the
    # [cert-manager guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
    certManager:
      # Automatically install `cert-manager` on initialization. See the
      # [cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.
      install: false

      # The email to use when requesting Let's Encrypt certificates.
      email:

      # The type of issuer for the certificate (only ACME is supported for now).
      issuer: acme

      # Specify which ACME server to request certificates from. Currently Let's Encrypt staging and prod servers are
      # supported.
      acmeServer: letsencrypt-staging

      # The type of ACME challenge used to validate hostnames and generate the certificates (only HTTP-01 is supported
      # for now).
      acmeChallengeType: HTTP-01

    # Exposes the `nodeSelector` field on the PodSpec of system services. This allows you to constrain the system
    # services to only run on particular nodes.
    #
    # [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide
    # to assigning Pods to nodes.
    systemNodeSelector: {}

    # For setting tolerations on the registry-proxy when using in-cluster building.
    # The registry-proxy is a DaemonSet that proxies connections to the docker registry service on each node.
    #
    # Use this only if you're doing in-cluster building and the nodes in your cluster
    # have [taints](https://kubernetes.io/docs/concepts/configuration/taint-and-toleration/).
    registryProxyTolerations:
      - # "Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
        # allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".
        effect:

        # "Key" is the taint key that the toleration applies to. Empty means match all taint keys.
        # If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.
        key:

        # "Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal". Defaults
        # to
        # "Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
        # particular category.
        operator: Equal

        # "TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
        # otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
        # the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
        # by the system.
        tolerationSeconds:

        # "Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be
        # empty,
        # otherwise just a regular string.
        value:

    # The name of the provider plugin to use.
    name: local-kubernetes

    # The kubectl context to use to connect to the Kubernetes cluster.
    context:

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

    # Set this to null or false to skip installing/enabling the `nginx` ingress controller.
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

### `providers[].buildMode`

[providers](#providers) > buildMode

Choose the mechanism for building container images before deploying. By default your local Docker daemon is used, but you can set it to `cluster-buildkit` or `kaniko` to sync files to the cluster, and build container images there. This removes the need to run Docker locally, and allows you to share layer and image caches between multiple developers, as well as between your development and CI workflows.

For more details on all the different options and what makes sense to use for your setup, please check out the [in-cluster building guide](https://docs.garden.io/guides/in-cluster-building).

**Note:** The `cluster-docker` mode has been deprecated and will be removed in a future release!

| Type     | Default          | Required |
| -------- | ---------------- | -------- |
| `string` | `"local-docker"` | No       |

### `providers[].clusterBuildkit`

[providers](#providers) > clusterBuildkit

Configuration options for the `cluster-buildkit` build mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterBuildkit.rootless`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > rootless

Enable rootless mode for the cluster-buildkit daemon, which runs the daemon with decreased privileges.
Please see [the buildkit docs](https://github.com/moby/buildkit/blob/master/docs/rootless.md) for caveats when using this mode.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].clusterBuildkit.nodeSelector`

[providers](#providers) > [clusterBuildkit](#providersclusterbuildkit) > nodeSelector

Exposes the `nodeSelector` field on the PodSpec of the BuildKit deployment. This allows you to constrain the BuildKit daemon to only run on particular nodes.

[See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
providers:
  - clusterBuildkit:
      ...
      nodeSelector:
          disktype: ssd
```

### `providers[].clusterDocker`

[providers](#providers) > clusterDocker

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Configuration options for the `cluster-docker` build mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.enableBuildKit`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > enableBuildKit

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Enable [BuildKit](https://github.com/moby/buildkit) support. This should in most cases work well and be more performant, but we're opting to keep it optional until it's enabled by default in Docker.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].kaniko`

[providers](#providers) > kaniko

Configuration options for the `kaniko` build mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.extraFlags[]`

[providers](#providers) > [kaniko](#providerskaniko) > extraFlags

Specify extra flags to use when building the container image with kaniko. Flags set on `container` modules take precedence over these.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `providers[].kaniko.image`

[providers](#providers) > [kaniko](#providerskaniko) > image

Change the kaniko image (repository/image:tag) to use when building in kaniko mode.

| Type     | Default                                         | Required |
| -------- | ----------------------------------------------- | -------- |
| `string` | `"gcr.io/kaniko-project/executor:v1.6.0-debug"` | No       |

### `providers[].kaniko.namespace`

[providers](#providers) > [kaniko](#providerskaniko) > namespace

Choose the namespace where the Kaniko pods will be run. Set to `null` to use the project namespace.

**IMPORTANT: The default namespace will change to the project namespace instead of the garden-system namespace in an upcoming release!**

| Type     | Default           | Required |
| -------- | ----------------- | -------- |
| `string` | `"garden-system"` | No       |

### `providers[].kaniko.nodeSelector`

[providers](#providers) > [kaniko](#providerskaniko) > nodeSelector

Exposes the `nodeSelector` field on the PodSpec of the Kaniko pods. This allows you to constrain the Kaniko pods to only run on particular nodes.

[See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].kaniko.tolerations[]`

[providers](#providers) > [kaniko](#providerskaniko) > tolerations

Specify tolerations to apply to each Kaniko Pod. Useful to control which nodes in a cluster can run builds.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].kaniko.tolerations[].effect`

[providers](#providers) > [kaniko](#providerskaniko) > [tolerations](#providerskanikotolerations) > effect

"Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.tolerations[].key`

[providers](#providers) > [kaniko](#providerskaniko) > [tolerations](#providerskanikotolerations) > key

"Key" is the taint key that the toleration applies to. Empty means match all taint keys.
If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.tolerations[].operator`

[providers](#providers) > [kaniko](#providerskaniko) > [tolerations](#providerskanikotolerations) > operator

"Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal". Defaults to
"Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
particular category.

| Type     | Default   | Required |
| -------- | --------- | -------- |
| `string` | `"Equal"` | No       |

### `providers[].kaniko.tolerations[].tolerationSeconds`

[providers](#providers) > [kaniko](#providerskaniko) > [tolerations](#providerskanikotolerations) > tolerationSeconds

"TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
by the system.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].kaniko.tolerations[].value`

[providers](#providers) > [kaniko](#providerskaniko) > [tolerations](#providerskanikotolerations) > value

"Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be empty,
otherwise just a regular string.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].defaultHostname`

[providers](#providers) > defaultHostname

A default hostname to use when no hostname is explicitly configured for a service.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
providers:
  - defaultHostname: "api.mydomain.com"
```

### `providers[].deploymentStrategy`

[providers](#providers) > deploymentStrategy

{% hint style="warning" %}
**Experimental**: this is an experimental feature and the API might change in the future.
{% endhint %}

Defines the strategy for deploying the project services.
Default is "rolling update" and there is experimental support for "blue/green" deployment.
The feature only supports modules of type `container`: other types will just deploy using the default strategy.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"rolling"` | No       |

### `providers[].forceSsl`

[providers](#providers) > forceSsl

Require SSL on all `container` module services. If set to true, an error is raised when no certificate is available for a configured hostname on a `container` module.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].imagePullSecrets[]`

[providers](#providers) > imagePullSecrets

References to `docker-registry` secrets to use for authenticating with remote registries when pulling
images. This is necessary if you reference private images in your module configuration, and is required
when configuring a remote Kubernetes environment with buildMode=local.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].imagePullSecrets[].name`

[providers](#providers) > [imagePullSecrets](#providersimagepullsecrets) > name

The name of the Kubernetes secret.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - imagePullSecrets:
      - name: "my-secret"
```

### `providers[].imagePullSecrets[].namespace`

[providers](#providers) > [imagePullSecrets](#providersimagepullsecrets) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"default"` | No       |

### `providers[].resources`

[providers](#providers) > resources

Resource requests and limits for the in-cluster builder, container registry and code sync service. (which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).

| Type     | Default                                                                                                                                                                                                                                                    | Required |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `object` | `{"builder":{"limits":{"cpu":4000,"memory":8192},"requests":{"cpu":100,"memory":512}},"registry":{"limits":{"cpu":2000,"memory":4096},"requests":{"cpu":200,"memory":512}},"sync":{"limits":{"cpu":500,"memory":512},"requests":{"cpu":100,"memory":90}}}` | No       |

### `providers[].resources.builder`

[providers](#providers) > [resources](#providersresources) > builder

Resource requests and limits for the in-cluster builder. It's important to consider which build mode you're using when configuring this.

When `buildMode` is `kaniko`, this refers to _each Kaniko pod_, i.e. each individual build, so you'll want to consider the requirements for your individual image builds, with your most expensive/heavy images in mind.

When `buildMode` is `cluster-buildkit`, this applies to the BuildKit deployment created in _each project namespace_. So think of this as the resource spec for each individual user or project namespace.

When `buildMode` is `cluster-docker`, this applies to the single Docker Daemon that is installed and run cluster-wide. This is shared across all users and builds in the cluster, so it should be resourced accordingly, factoring in how many concurrent builds you expect and how heavy your builds tend to be. **Note that the cluster-docker build mode has been deprecated!**

| Type     | Default                                                                     | Required |
| -------- | --------------------------------------------------------------------------- | -------- |
| `object` | `{"limits":{"cpu":4000,"memory":8192},"requests":{"cpu":100,"memory":512}}` | No       |

### `providers[].resources.builder.limits`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > limits

| Type     | Default                      | Required |
| -------- | ---------------------------- | -------- |
| `object` | `{"cpu":4000,"memory":8192}` | No       |

### `providers[].resources.builder.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [limits](#providersresourcesbuilderlimits) > cpu

CPU limit in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `4000`  | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        limits:
          ...
          cpu: 4000
```

### `providers[].resources.builder.limits.memory`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [limits](#providersresourcesbuilderlimits) > memory

Memory limit in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `8192`  | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        limits:
          ...
          memory: 8192
```

### `providers[].resources.builder.limits.ephemeralStorage`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [limits](#providersresourcesbuilderlimits) > ephemeralStorage

Ephemeral storage limit in megabytes.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        limits:
          ...
          ephemeralStorage: 8192
```

### `providers[].resources.builder.requests`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > requests

| Type     | Default                    | Required |
| -------- | -------------------------- | -------- |
| `object` | `{"cpu":100,"memory":512}` | No       |

### `providers[].resources.builder.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [requests](#providersresourcesbuilderrequests) > cpu

CPU request in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `100`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        requests:
          ...
          cpu: 100
```

### `providers[].resources.builder.requests.memory`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [requests](#providersresourcesbuilderrequests) > memory

Memory request in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `512`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        requests:
          ...
          memory: 512
```

### `providers[].resources.builder.requests.ephemeralStorage`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [requests](#providersresourcesbuilderrequests) > ephemeralStorage

Ephemeral storage request in megabytes.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        requests:
          ...
          ephemeralStorage: 8192
```

### `providers[].resources.registry`

[providers](#providers) > [resources](#providersresources) > registry

Resource requests and limits for the in-cluster image registry. Built images are pushed to this registry,
so that they are available to all the nodes in your cluster.

This is shared across all users and builds, so it should be resourced accordingly, factoring
in how many concurrent builds you expect and how large your images tend to be.

| Type     | Default                                                                     | Required |
| -------- | --------------------------------------------------------------------------- | -------- |
| `object` | `{"limits":{"cpu":2000,"memory":4096},"requests":{"cpu":200,"memory":512}}` | No       |

### `providers[].resources.registry.limits`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > limits

| Type     | Default                      | Required |
| -------- | ---------------------------- | -------- |
| `object` | `{"cpu":2000,"memory":4096}` | No       |

### `providers[].resources.registry.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [limits](#providersresourcesregistrylimits) > cpu

CPU limit in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `2000`  | No       |

Example:

```yaml
providers:
  - resources:
      ...
      registry:
        ...
        limits:
          ...
          cpu: 2000
```

### `providers[].resources.registry.limits.memory`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [limits](#providersresourcesregistrylimits) > memory

Memory limit in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `4096`  | No       |

Example:

```yaml
providers:
  - resources:
      ...
      registry:
        ...
        limits:
          ...
          memory: 4096
```

### `providers[].resources.registry.limits.ephemeralStorage`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [limits](#providersresourcesregistrylimits) > ephemeralStorage

Ephemeral storage limit in megabytes.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
providers:
  - resources:
      ...
      registry:
        ...
        limits:
          ...
          ephemeralStorage: 8192
```

### `providers[].resources.registry.requests`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > requests

| Type     | Default                    | Required |
| -------- | -------------------------- | -------- |
| `object` | `{"cpu":200,"memory":512}` | No       |

### `providers[].resources.registry.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [requests](#providersresourcesregistryrequests) > cpu

CPU request in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `200`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      registry:
        ...
        requests:
          ...
          cpu: 200
```

### `providers[].resources.registry.requests.memory`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [requests](#providersresourcesregistryrequests) > memory

Memory request in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `512`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      registry:
        ...
        requests:
          ...
          memory: 512
```

### `providers[].resources.registry.requests.ephemeralStorage`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [requests](#providersresourcesregistryrequests) > ephemeralStorage

Ephemeral storage request in megabytes.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
providers:
  - resources:
      ...
      registry:
        ...
        requests:
          ...
          ephemeralStorage: 8192
```

### `providers[].resources.sync`

[providers](#providers) > [resources](#providersresources) > sync

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Resource requests and limits for the code sync service, which we use to sync build contexts to the cluster
ahead of building images. This generally is not resource intensive, but you might want to adjust the
defaults if you have many concurrent users.

| Type     | Default                                                                  | Required |
| -------- | ------------------------------------------------------------------------ | -------- |
| `object` | `{"limits":{"cpu":500,"memory":512},"requests":{"cpu":100,"memory":90}}` | No       |

### `providers[].resources.sync.limits`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > limits

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

| Type     | Default                    | Required |
| -------- | -------------------------- | -------- |
| `object` | `{"cpu":500,"memory":512}` | No       |

### `providers[].resources.sync.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [limits](#providersresourcessynclimits) > cpu

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

CPU limit in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `500`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        limits:
          ...
          cpu: 500
```

### `providers[].resources.sync.limits.memory`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [limits](#providersresourcessynclimits) > memory

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Memory limit in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `512`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        limits:
          ...
          memory: 512
```

### `providers[].resources.sync.limits.ephemeralStorage`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [limits](#providersresourcessynclimits) > ephemeralStorage

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Ephemeral storage limit in megabytes.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        limits:
          ...
          ephemeralStorage: 8192
```

### `providers[].resources.sync.requests`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > requests

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

| Type     | Default                   | Required |
| -------- | ------------------------- | -------- |
| `object` | `{"cpu":100,"memory":90}` | No       |

### `providers[].resources.sync.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [requests](#providersresourcessyncrequests) > cpu

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

CPU request in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `100`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        requests:
          ...
          cpu: 100
```

### `providers[].resources.sync.requests.memory`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [requests](#providersresourcessyncrequests) > memory

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Memory request in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `90`    | No       |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        requests:
          ...
          memory: 90
```

### `providers[].resources.sync.requests.ephemeralStorage`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [requests](#providersresourcessyncrequests) > ephemeralStorage

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Ephemeral storage request in megabytes.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        requests:
          ...
          ephemeralStorage: 8192
```

### `providers[].storage`

[providers](#providers) > storage

Storage parameters to set for the in-cluster builder, container registry and code sync persistent volumes
(which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).

These are all shared cluster-wide across all users and builds, so they should be resourced accordingly,
factoring in how many concurrent builds you expect and how large your images and build contexts tend to be.

| Type     | Default                                                                                                                                                              | Required |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `object` | `{"builder":{"size":20480,"storageClass":null},"nfs":{"storageClass":null},"registry":{"size":20480,"storageClass":null},"sync":{"size":10240,"storageClass":null}}` | No       |

### `providers[].storage.builder`

[providers](#providers) > [storage](#providersstorage) > builder

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Storage parameters for the data volume for the in-cluster Docker Daemon.

Only applies when `buildMode` is set to `cluster-docker`, ignored otherwise.

| Type     | Default                              | Required |
| -------- | ------------------------------------ | -------- |
| `object` | `{"size":20480,"storageClass":null}` | No       |

### `providers[].storage.builder.size`

[providers](#providers) > [storage](#providersstorage) > [builder](#providersstoragebuilder) > size

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Volume size in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `20480` | No       |

### `providers[].storage.builder.storageClass`

[providers](#providers) > [storage](#providersstorage) > [builder](#providersstoragebuilder) > storageClass

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Storage class to use for the volume.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `null`  | No       |

### `providers[].storage.nfs`

[providers](#providers) > [storage](#providersstorage) > nfs

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Storage parameters for the NFS provisioner, which we automatically create for the sync volume, _unless_
you specify a `storageClass` for the sync volume. See the below `sync` parameter for more.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"storageClass":null}` | No       |

### `providers[].storage.nfs.storageClass`

[providers](#providers) > [storage](#providersstorage) > [nfs](#providersstoragenfs) > storageClass

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Storage class to use as backing storage for NFS .

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `null`  | No       |

### `providers[].storage.registry`

[providers](#providers) > [storage](#providersstorage) > registry

Storage parameters for the in-cluster Docker registry volume. Built images are stored here, so that they
are available to all the nodes in your cluster.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type     | Default                              | Required |
| -------- | ------------------------------------ | -------- |
| `object` | `{"size":20480,"storageClass":null}` | No       |

### `providers[].storage.registry.size`

[providers](#providers) > [storage](#providersstorage) > [registry](#providersstorageregistry) > size

Volume size in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `20480` | No       |

### `providers[].storage.registry.storageClass`

[providers](#providers) > [storage](#providersstorage) > [registry](#providersstorageregistry) > storageClass

Storage class to use for the volume.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `null`  | No       |

### `providers[].storage.sync`

[providers](#providers) > [storage](#providersstorage) > sync

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Storage parameters for the code sync volume, which build contexts are synced to ahead of running
in-cluster builds.

Important: The storage class configured here has to support _ReadWriteMany_ access.
If you don't specify a storage class, Garden creates an NFS provisioner and provisions an
NFS volume for the sync data volume.

Only applies when `buildMode` is set to `cluster-docker`, ignored otherwise.

| Type     | Default                              | Required |
| -------- | ------------------------------------ | -------- |
| `object` | `{"size":10240,"storageClass":null}` | No       |

### `providers[].storage.sync.size`

[providers](#providers) > [storage](#providersstorage) > [sync](#providersstoragesync) > size

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Volume size in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `10240` | No       |

### `providers[].storage.sync.storageClass`

[providers](#providers) > [storage](#providersstorage) > [sync](#providersstoragesync) > storageClass

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Storage class to use for the volume.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `null`  | No       |

### `providers[].tlsCertificates[]`

[providers](#providers) > tlsCertificates

One or more certificates to use for ingress.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].tlsCertificates[].name`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > name

A unique identifier for this certificate.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - tlsCertificates:
      - name: "www"
```

### `providers[].tlsCertificates[].hostnames[]`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > hostnames

A list of hostnames that this certificate should be used for. If you don't specify these, they will be automatically read from the certificate.

| Type              | Required |
| ----------------- | -------- |
| `array[hostname]` | No       |

Example:

```yaml
providers:
  - tlsCertificates:
      - hostnames:
          - www.mydomain.com
```

### `providers[].tlsCertificates[].secretRef`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > secretRef

A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

Example:

```yaml
providers:
  - tlsCertificates:
      - secretRef:
            name: my-tls-secret
            namespace: default
```

### `providers[].tlsCertificates[].secretRef.name`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > [secretRef](#providerstlscertificatessecretref) > name

The name of the Kubernetes secret.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - tlsCertificates:
      - secretRef:
            name: my-tls-secret
            namespace: default
          ...
          name: "my-secret"
```

### `providers[].tlsCertificates[].secretRef.namespace`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > [secretRef](#providerstlscertificatessecretref) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"default"` | No       |

### `providers[].tlsCertificates[].managedBy`

[providers](#providers) > [tlsCertificates](#providerstlscertificates) > managedBy

Set to `cert-manager` to configure [cert-manager](https://github.com/jetstack/cert-manager) to manage this
certificate. See our
[cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
providers:
  - tlsCertificates:
      - managedBy: "cert-manager"
```

### `providers[].certManager`

[providers](#providers) > certManager

cert-manager configuration, for creating and managing TLS certificates. See the
[cert-manager guide](https://docs.garden.io/advanced/cert-manager-integration) for details.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].certManager.install`

[providers](#providers) > [certManager](#providerscertmanager) > install

Automatically install `cert-manager` on initialization. See the
[cert-manager integration guide](https://docs.garden.io/advanced/cert-manager-integration) for details.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `providers[].certManager.email`

[providers](#providers) > [certManager](#providerscertmanager) > email

The email to use when requesting Let's Encrypt certificates.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - certManager:
      ...
      email: "yourname@example.com"
```

### `providers[].certManager.issuer`

[providers](#providers) > [certManager](#providerscertmanager) > issuer

The type of issuer for the certificate (only ACME is supported for now).

| Type     | Default  | Required |
| -------- | -------- | -------- |
| `string` | `"acme"` | No       |

Example:

```yaml
providers:
  - certManager:
      ...
      issuer: "acme"
```

### `providers[].certManager.acmeServer`

[providers](#providers) > [certManager](#providerscertmanager) > acmeServer

Specify which ACME server to request certificates from. Currently Let's Encrypt staging and prod servers are supported.

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `string` | `"letsencrypt-staging"` | No       |

Example:

```yaml
providers:
  - certManager:
      ...
      acmeServer: "letsencrypt-staging"
```

### `providers[].certManager.acmeChallengeType`

[providers](#providers) > [certManager](#providerscertmanager) > acmeChallengeType

The type of ACME challenge used to validate hostnames and generate the certificates (only HTTP-01 is supported for now).

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"HTTP-01"` | No       |

Example:

```yaml
providers:
  - certManager:
      ...
      acmeChallengeType: "HTTP-01"
```

### `providers[].systemNodeSelector`

[providers](#providers) > systemNodeSelector

Exposes the `nodeSelector` field on the PodSpec of system services. This allows you to constrain the system services to only run on particular nodes.

[See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
providers:
  - systemNodeSelector:
        disktype: ssd
```

### `providers[].registryProxyTolerations[]`

[providers](#providers) > registryProxyTolerations

For setting tolerations on the registry-proxy when using in-cluster building.
The registry-proxy is a DaemonSet that proxies connections to the docker registry service on each node.

Use this only if you're doing in-cluster building and the nodes in your cluster
have [taints](https://kubernetes.io/docs/concepts/configuration/taint-and-toleration/).

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].registryProxyTolerations[].effect`

[providers](#providers) > [registryProxyTolerations](#providersregistryproxytolerations) > effect

"Effect" indicates the taint effect to match. Empty means match all taint effects. When specified,
allowed values are "NoSchedule", "PreferNoSchedule" and "NoExecute".

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].registryProxyTolerations[].key`

[providers](#providers) > [registryProxyTolerations](#providersregistryproxytolerations) > key

"Key" is the taint key that the toleration applies to. Empty means match all taint keys.
If the key is empty, operator must be "Exists"; this combination means to match all values and all keys.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].registryProxyTolerations[].operator`

[providers](#providers) > [registryProxyTolerations](#providersregistryproxytolerations) > operator

"Operator" represents a key's relationship to the value. Valid operators are "Exists" and "Equal". Defaults to
"Equal". "Exists" is equivalent to wildcard for value, so that a pod can tolerate all taints of a
particular category.

| Type     | Default   | Required |
| -------- | --------- | -------- |
| `string` | `"Equal"` | No       |

### `providers[].registryProxyTolerations[].tolerationSeconds`

[providers](#providers) > [registryProxyTolerations](#providersregistryproxytolerations) > tolerationSeconds

"TolerationSeconds" represents the period of time the toleration (which must be of effect "NoExecute",
otherwise this field is ignored) tolerates the taint. By default, it is not set, which means tolerate
the taint forever (do not evict). Zero and negative values will be treated as 0 (evict immediately)
by the system.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].registryProxyTolerations[].value`

[providers](#providers) > [registryProxyTolerations](#providersregistryproxytolerations) > value

"Value" is the taint value the toleration matches to. If the operator is "Exists", the value should be empty,
otherwise just a regular string.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type     | Default              | Required |
| -------- | -------------------- | -------- |
| `string` | `"local-kubernetes"` | Yes      |

Example:

```yaml
providers:
  - name: "local-kubernetes"
```

### `providers[].context`

[providers](#providers) > context

The kubectl context to use to connect to the Kubernetes cluster.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
providers:
  - context: "my-dev-context"
```

### `providers[].namespace`

[providers](#providers) > namespace

Specify which namespace to deploy services to (defaults to the project name). Note that the framework generates other namespaces as well with this name as a prefix.

| Type              | Required |
| ----------------- | -------- |
| `object | string` | No       |

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

### `providers[].namespace.labels`

[providers](#providers) > [namespace](#providersnamespace) > labels

Map of labels to apply to the namespace when creating it.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].setupIngressController`

[providers](#providers) > setupIngressController

Set this to null or false to skip installing/enabling the `nginx` ingress controller.

| Type     | Default   | Required |
| -------- | --------- | -------- |
| `string` | `"nginx"` | No       |

