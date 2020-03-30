---
title: "`kubernetes` Provider"
tocTitle: "`kubernetes`"
---

# `kubernetes` Provider

## Description

The `kubernetes` provider allows you to deploy [`container` modules](https://docs.garden.io/reference/module-types/container) to
Kubernetes clusters, and adds the [`helm`](https://docs.garden.io/reference/module-types/helm) and
[`kubernetes`](https://docs.garden.io/reference/module-types/kubernetes) module types.

For usage information, please refer to the [guides section](https://docs.garden.io/guides). A good place to start is
the [Remote Kubernetes guide](https://docs.garden.io/guides/remote-kubernetes) guide if you're connecting to remote clusters.
The [demo-project](https://docs.garden.io/getting-started/2-initialize-a-project) example project and guide are also helpful as an introduction.

Note that if you're using a local Kubernetes cluster (e.g. minikube or Docker Desktop), the [local-kubernetes provider](https://docs.garden.io/reference/providers/local-kubernetes) simplifies (and automates) the configuration and setup quite a bit.

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

    # Choose the mechanism for building container images before deploying. By default it uses the local Docker
    # daemon, but you can set it to `cluster-docker` or `kaniko` to sync files to a remote Docker daemon,
    # installed in the cluster, and build container images there. This removes the need to run Docker or
    # Kubernetes locally, and allows you to share layer and image caches between multiple developers, as well
    # as between your development and CI workflows.
    #
    # This is currently experimental and sometimes not desired, so it's not enabled by default. For example when using
    # the `local-kubernetes` provider with Docker for Desktop and Minikube, we directly use the in-cluster docker
    # daemon when building. You might also be deploying to a remote cluster that isn't intended as a development
    # environment, so you'd want your builds to happen elsewhere.
    #
    # Functionally, both `cluster-docker` and `kaniko` do the same thing, but use different underlying mechanisms
    # to build. The former uses a normal Docker daemon in the cluster. Because this has to run in privileged mode,
    # this is less secure than Kaniko, but in turn it is generally faster. See the
    # [Kaniko docs](https://github.com/GoogleContainerTools/kaniko) for more information on Kaniko.
    buildMode: local-docker

    # Configuration options for the `cluster-docker` build mode.
    clusterDocker:
      # Enable [BuildKit](https://github.com/moby/buildkit) support. This should in most cases work well and be more
      # performant, but we're opting to keep it optional until it's enabled by default in Docker.
      enableBuildKit: false

    # Configuration options for the `kaniko` build mode.
    kaniko:
      # Change the kaniko image (repository/image:tag) to use when building in kaniko mode.
      image: 'gcr.io/kaniko-project/executor:debug-v0.23.0'

      # Specify extra flags to use when building the container image with kaniko. Flags set on container module take
      # precedence over these.
      extraFlags:

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
      # Resource requests and limits for the in-cluster builder.
      #
      # When `buildMode` is `cluster-docker`, this refers to the Docker Daemon that is installed and run
      # cluster-wide. This is shared across all users and builds, so it should be resourced accordingly, factoring
      # in how many concurrent builds you expect and how heavy your builds tend to be.
      #
      # When `buildMode` is `kaniko`, this refers to _each instance_ of Kaniko, so you'd generally use lower
      # limits/requests, but you should evaluate based on your needs.
      builder:
        limits:
          # CPU limit in millicpu.
          cpu: 4000

          # Memory limit in megabytes.
          memory: 8192

        requests:
          # CPU request in millicpu.
          cpu: 200

          # Memory request in megabytes.
          memory: 512

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

        requests:
          # CPU request in millicpu.
          cpu: 200

          # Memory request in megabytes.
          memory: 512

      # Resource requests and limits for the code sync service, which we use to sync build contexts to the cluster
      # ahead of building images. This generally is not resource intensive, but you might want to adjust the
      # defaults if you have many concurrent users.
      sync:
        limits:
          # CPU limit in millicpu.
          cpu: 500

          # Memory limit in megabytes.
          memory: 512

        requests:
          # CPU request in millicpu.
          cpu: 100

          # Memory request in megabytes.
          memory: 90

    # Storage parameters to set for the in-cluster builder, container registry and code sync persistent volumes
    # (which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).
    #
    # These are all shared cluster-wide across all users and builds, so they should be resourced accordingly,
    # factoring in how many concurrent builds you expect and how large your images and build contexts tend to be.
    storage:
      # Storage parameters for the data volume for the in-cluster Docker Daemon.
      #
      # Only applies when `buildMode` is set to `cluster-docker`, ignored otherwise.
      builder:
        # Volume size in megabytes.
        size: 20480

        # Storage class to use for the volume.
        storageClass: null

      # Storage parameters for the NFS provisioner, which we automatically create for the sync volume, _unless_
      # you specify a `storageClass` for the sync volume. See the below `sync` parameter for more.
      #
      # Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.
      nfs:
        # Storage class to use as backing storage for NFS .
        storageClass: null

      # Storage parameters for the in-cluster Docker registry volume. Built images are stored here, so that they
      # are available to all the nodes in your cluster.
      #
      # Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.
      registry:
        # Volume size in megabytes.
        size: 20480

        # Storage class to use for the volume.
        storageClass: null

      # Storage parameters for the code sync volume, which build contexts are synced to ahead of running
      # in-cluster builds.
      #
      # Important: The storage class configured here has to support _ReadWriteMany_ access.
      # If you don't specify a storage class, Garden creates an NFS provisioner and provisions an
      # NFS volume for the sync data volume.
      #
      # Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.
      sync:
        # Volume size in megabytes.
        size: 10240

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

    # Exposes the `nodeSelector` field on the PodSpec of system services. This allows you to constrain
    # the system services to only run on particular nodes. [See
    # here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to
    # assigning Pods to nodes.
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
    name: kubernetes

    # The kubectl context to use to connect to the Kubernetes cluster.
    context:

    # The registry where built containers should be pushed to, and then pulled to the cluster when deploying services.
    #
    # Important: If you specify this in combination with `buildMode: cluster-docker` or `buildMode: kaniko`, you must
    # make sure `imagePullSecrets` includes authentication with the specified deployment registry, that has the
    # appropriate write privileges (usually full write access to the configured `deploymentRegistry.namespace`).
    deploymentRegistry:
      # The hostname (and optionally port, if not the default port) of the registry.
      hostname:

      # The port where the registry listens on, if not the default.
      port:

      # The namespace in the registry where images should be pushed.
      namespace: _

    # The ingress class to use on configured Ingresses (via the `kubernetes.io/ingress.class` annotation)
    # when deploying `container` services. Use this if you have multiple ingress controllers in your cluster.
    ingressClass:

    # The external HTTP port of the cluster's ingress controller.
    ingressHttpPort: 80

    # The external HTTPS port of the cluster's ingress controller.
    ingressHttpsPort: 443

    # Path to kubeconfig file to use instead of the system default. Must be a POSIX-style path.
    kubeconfig:

    # Specify which namespace to deploy services to. Defaults to `<project name>-<environment namespace>`.
    #
    # Note that the framework may generate other namespaces as well with this name as a prefix.
    namespace:

    # Set this to `nginx` to install/enable the NGINX ingress controller.
    setupIngressController: false
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

Choose the mechanism for building container images before deploying. By default it uses the local Docker
daemon, but you can set it to `cluster-docker` or `kaniko` to sync files to a remote Docker daemon,
installed in the cluster, and build container images there. This removes the need to run Docker or
Kubernetes locally, and allows you to share layer and image caches between multiple developers, as well
as between your development and CI workflows.

This is currently experimental and sometimes not desired, so it's not enabled by default. For example when using
the `local-kubernetes` provider with Docker for Desktop and Minikube, we directly use the in-cluster docker
daemon when building. You might also be deploying to a remote cluster that isn't intended as a development
environment, so you'd want your builds to happen elsewhere.

Functionally, both `cluster-docker` and `kaniko` do the same thing, but use different underlying mechanisms
to build. The former uses a normal Docker daemon in the cluster. Because this has to run in privileged mode,
this is less secure than Kaniko, but in turn it is generally faster. See the
[Kaniko docs](https://github.com/GoogleContainerTools/kaniko) for more information on Kaniko.

| Type     | Default          | Required |
| -------- | ---------------- | -------- |
| `string` | `"local-docker"` | No       |

### `providers[].clusterDocker`

[providers](#providers) > clusterDocker

Configuration options for the `cluster-docker` build mode.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].clusterDocker.enableBuildKit`

[providers](#providers) > [clusterDocker](#providersclusterdocker) > enableBuildKit

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

### `providers[].kaniko.image`

[providers](#providers) > [kaniko](#providerskaniko) > image

Change the kaniko image (repository/image:tag) to use when building in kaniko mode.

| Type     | Default                                          | Required |
| -------- | ------------------------------------------------ | -------- |
| `string` | `"gcr.io/kaniko-project/executor:debug-v0.23.0"` | No       |

### `providers[].kaniko.extraFlags[]`

[providers](#providers) > [kaniko](#providerskaniko) > extraFlags

Specify extra flags to use when building the container image with kaniko. Flags set on container module take precedence over these.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

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
> ⚠️ **Experimental**: this is an experimental feature and the API might change in the future.

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
| `object` | `{"builder":{"limits":{"cpu":4000,"memory":8192},"requests":{"cpu":200,"memory":512}},"registry":{"limits":{"cpu":2000,"memory":4096},"requests":{"cpu":200,"memory":512}},"sync":{"limits":{"cpu":500,"memory":512},"requests":{"cpu":100,"memory":90}}}` | No       |

### `providers[].resources.builder`

[providers](#providers) > [resources](#providersresources) > builder

Resource requests and limits for the in-cluster builder.

When `buildMode` is `cluster-docker`, this refers to the Docker Daemon that is installed and run
cluster-wide. This is shared across all users and builds, so it should be resourced accordingly, factoring
in how many concurrent builds you expect and how heavy your builds tend to be.

When `buildMode` is `kaniko`, this refers to _each instance_ of Kaniko, so you'd generally use lower
limits/requests, but you should evaluate based on your needs.

| Type     | Default                                                                     | Required |
| -------- | --------------------------------------------------------------------------- | -------- |
| `object` | `{"limits":{"cpu":4000,"memory":8192},"requests":{"cpu":200,"memory":512}}` | No       |

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

### `providers[].resources.builder.requests`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > requests

| Type     | Default                    | Required |
| -------- | -------------------------- | -------- |
| `object` | `{"cpu":200,"memory":512}` | No       |

### `providers[].resources.builder.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [requests](#providersresourcesbuilderrequests) > cpu

CPU request in millicpu.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `200`   | No       |

Example:

```yaml
providers:
  - resources:
      ...
      builder:
        ...
        requests:
          ...
          cpu: 200
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

### `providers[].resources.sync`

[providers](#providers) > [resources](#providersresources) > sync

Resource requests and limits for the code sync service, which we use to sync build contexts to the cluster
ahead of building images. This generally is not resource intensive, but you might want to adjust the
defaults if you have many concurrent users.

| Type     | Default                                                                  | Required |
| -------- | ------------------------------------------------------------------------ | -------- |
| `object` | `{"limits":{"cpu":500,"memory":512},"requests":{"cpu":100,"memory":90}}` | No       |

### `providers[].resources.sync.limits`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > limits

| Type     | Default                    | Required |
| -------- | -------------------------- | -------- |
| `object` | `{"cpu":500,"memory":512}` | No       |

### `providers[].resources.sync.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [limits](#providersresourcessynclimits) > cpu

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

### `providers[].resources.sync.requests`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > requests

| Type     | Default                   | Required |
| -------- | ------------------------- | -------- |
| `object` | `{"cpu":100,"memory":90}` | No       |

### `providers[].resources.sync.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [requests](#providersresourcessyncrequests) > cpu

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

Storage parameters for the data volume for the in-cluster Docker Daemon.

Only applies when `buildMode` is set to `cluster-docker`, ignored otherwise.

| Type     | Default                              | Required |
| -------- | ------------------------------------ | -------- |
| `object` | `{"size":20480,"storageClass":null}` | No       |

### `providers[].storage.builder.size`

[providers](#providers) > [storage](#providersstorage) > [builder](#providersstoragebuilder) > size

Volume size in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `20480` | No       |

### `providers[].storage.builder.storageClass`

[providers](#providers) > [storage](#providersstorage) > [builder](#providersstoragebuilder) > storageClass

Storage class to use for the volume.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `null`  | No       |

### `providers[].storage.nfs`

[providers](#providers) > [storage](#providersstorage) > nfs

Storage parameters for the NFS provisioner, which we automatically create for the sync volume, _unless_
you specify a `storageClass` for the sync volume. See the below `sync` parameter for more.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"storageClass":null}` | No       |

### `providers[].storage.nfs.storageClass`

[providers](#providers) > [storage](#providersstorage) > [nfs](#providersstoragenfs) > storageClass

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

Storage parameters for the code sync volume, which build contexts are synced to ahead of running
in-cluster builds.

Important: The storage class configured here has to support _ReadWriteMany_ access.
If you don't specify a storage class, Garden creates an NFS provisioner and provisions an
NFS volume for the sync data volume.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type     | Default                              | Required |
| -------- | ------------------------------------ | -------- |
| `object` | `{"size":10240,"storageClass":null}` | No       |

### `providers[].storage.sync.size`

[providers](#providers) > [storage](#providersstorage) > [sync](#providersstoragesync) > size

Volume size in megabytes.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `10240` | No       |

### `providers[].storage.sync.storageClass`

[providers](#providers) > [storage](#providersstorage) > [sync](#providersstoragesync) > storageClass

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

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

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

Exposes the `nodeSelector` field on the PodSpec of system services. This allows you to constrain
the system services to only run on particular nodes. [See here](https://kubernetes.io/docs/concepts/configuration/assign-pod-node/) for the official Kubernetes guide to assigning Pods to nodes.

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

| Type     | Default        | Required |
| -------- | -------------- | -------- |
| `string` | `"kubernetes"` | Yes      |

Example:

```yaml
providers:
  - name: "kubernetes"
```

### `providers[].context`

[providers](#providers) > context

The kubectl context to use to connect to the Kubernetes cluster.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - context: "my-dev-context"
```

### `providers[].deploymentRegistry`

[providers](#providers) > deploymentRegistry

The registry where built containers should be pushed to, and then pulled to the cluster when deploying services.

Important: If you specify this in combination with `buildMode: cluster-docker` or `buildMode: kaniko`, you must make sure `imagePullSecrets` includes authentication with the specified deployment registry, that has the appropriate write privileges (usually full write access to the configured `deploymentRegistry.namespace`).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].deploymentRegistry.hostname`

[providers](#providers) > [deploymentRegistry](#providersdeploymentregistry) > hostname

The hostname (and optionally port, if not the default port) of the registry.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - deploymentRegistry:
      ...
      hostname: "gcr.io"
```

### `providers[].deploymentRegistry.port`

[providers](#providers) > [deploymentRegistry](#providersdeploymentregistry) > port

The port where the registry listens on, if not the default.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `providers[].deploymentRegistry.namespace`

[providers](#providers) > [deploymentRegistry](#providersdeploymentregistry) > namespace

The namespace in the registry where images should be pushed.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"_"`   | No       |

Example:

```yaml
providers:
  - deploymentRegistry:
      ...
      namespace: "my-project"
```

### `providers[].ingressClass`

[providers](#providers) > ingressClass

The ingress class to use on configured Ingresses (via the `kubernetes.io/ingress.class` annotation)
when deploying `container` services. Use this if you have multiple ingress controllers in your cluster.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].ingressHttpPort`

[providers](#providers) > ingressHttpPort

The external HTTP port of the cluster's ingress controller.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `80`    | No       |

### `providers[].ingressHttpsPort`

[providers](#providers) > ingressHttpsPort

The external HTTPS port of the cluster's ingress controller.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `443`   | No       |

### `providers[].kubeconfig`

[providers](#providers) > kubeconfig

Path to kubeconfig file to use instead of the system default. Must be a POSIX-style path.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `providers[].namespace`

[providers](#providers) > namespace

Specify which namespace to deploy services to. Defaults to `<project name>-<environment namespace>`.

Note that the framework may generate other namespaces as well with this name as a prefix.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].setupIngressController`

[providers](#providers) > setupIngressController

Set this to `nginx` to install/enable the NGINX ingress controller.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `false` | No       |


## Outputs

The following keys are available via the `${providers.<provider-name>}` template string key for `kubernetes` providers.

### `${providers.<provider-name>.outputs.app-namespace}`

The primary namespace used for resource deployments.

| Type     |
| -------- |
| `string` |

### `${providers.<provider-name>.outputs.default-hostname}`

The default hostname configured on the provider.

| Type     |
| -------- |
| `string` |

### `${providers.<provider-name>.outputs.metadata-namespace}`

The namespace used for Garden metadata.

| Type     |
| -------- |
| `string` |
