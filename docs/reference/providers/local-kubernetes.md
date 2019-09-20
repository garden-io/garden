---
title: Local Kubernetes
---

# `local-kubernetes` reference

Below is the schema reference for the `local-kubernetes` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

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

| Type     | Required | Default          |
| -------- | -------- | ---------------- |
| `string` | No       | `"local-docker"` |

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

### `providers[].defaultUsername`

[providers](#providers) > defaultUsername

Set a default username (used for namespacing within a cluster).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].deploymentStrategy`

[providers](#providers) > deploymentStrategy
> ⚠️ **Experimental**: this is an experimental feature and the API might change in the future.  

Defines the strategy for deploying the project services.
Default is "rolling update" and there is experimental support for "blue/green" deployment.
The feature only supports modules of type `container`: other types will just deploy using the default strategy.

| Type     | Required | Default     |
| -------- | -------- | ----------- |
| `string` | No       | `"rolling"` |

### `providers[].forceSsl`

[providers](#providers) > forceSsl

Require SSL on all `container` module services. If set to true, an error is raised when no certificate is available for a configured hostname on a `container` module.

| Type      | Required | Default |
| --------- | -------- | ------- |
| `boolean` | No       | `false` |

### `providers[].imagePullSecrets[]`

[providers](#providers) > imagePullSecrets

References to `docker-registry` secrets to use for authenticating with remote registries when pulling
images. This is necessary if you reference private images in your module configuration, and is required
when configuring a remote Kubernetes environment with buildMode=local.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

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

| Type     | Required | Default     |
| -------- | -------- | ----------- |
| `string` | No       | `"default"` |

### `providers[].resources`

[providers](#providers) > resources

Resource requests and limits for the in-cluster builder, container registry and code sync service. (which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).

| Type     | Required | Default                                                                                                                                                                                                                                                    |
| -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `object` | No       | `{"builder":{"limits":{"cpu":4000,"memory":8192},"requests":{"cpu":200,"memory":512}},"registry":{"limits":{"cpu":2000,"memory":4096},"requests":{"cpu":200,"memory":512}},"sync":{"limits":{"cpu":500,"memory":512},"requests":{"cpu":100,"memory":64}}}` |

### `providers[].resources.builder`

[providers](#providers) > [resources](#providersresources) > builder

Resource requests and limits for the in-cluster builder.

When `buildMode` is `cluster-docker`, this refers to the Docker Daemon that is installed and run
cluster-wide. This is shared across all users and builds, so it should be resourced accordingly, factoring
in how many concurrent builds you expect and how heavy your builds tend to be.

When `buildMode` is `kaniko`, this refers to _each instance_ of Kaniko, so you'd generally use lower
limits/requests, but you should evaluate based on your needs.

| Type     | Required | Default                                                                     |
| -------- | -------- | --------------------------------------------------------------------------- |
| `object` | No       | `{"limits":{"cpu":4000,"memory":8192},"requests":{"cpu":200,"memory":512}}` |

### `providers[].resources.builder.limits`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > limits

| Type     | Required | Default                      |
| -------- | -------- | ---------------------------- |
| `object` | No       | `{"cpu":4000,"memory":8192}` |

### `providers[].resources.builder.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [limits](#providersresourcesbuilderlimits) > cpu

CPU limit in millicpu.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `4000`  |

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

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `8192`  |

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

| Type     | Required | Default                    |
| -------- | -------- | -------------------------- |
| `object` | No       | `{"cpu":200,"memory":512}` |

### `providers[].resources.builder.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [builder](#providersresourcesbuilder) > [requests](#providersresourcesbuilderrequests) > cpu

CPU request in millicpu.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `200`   |

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

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `512`   |

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

| Type     | Required | Default                                                                     |
| -------- | -------- | --------------------------------------------------------------------------- |
| `object` | No       | `{"limits":{"cpu":2000,"memory":4096},"requests":{"cpu":200,"memory":512}}` |

### `providers[].resources.registry.limits`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > limits

| Type     | Required | Default                      |
| -------- | -------- | ---------------------------- |
| `object` | No       | `{"cpu":2000,"memory":4096}` |

### `providers[].resources.registry.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [limits](#providersresourcesregistrylimits) > cpu

CPU limit in millicpu.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `2000`  |

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

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `4096`  |

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

| Type     | Required | Default                    |
| -------- | -------- | -------------------------- |
| `object` | No       | `{"cpu":200,"memory":512}` |

### `providers[].resources.registry.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [registry](#providersresourcesregistry) > [requests](#providersresourcesregistryrequests) > cpu

CPU request in millicpu.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `200`   |

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

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `512`   |

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

| Type     | Required | Default                                                                  |
| -------- | -------- | ------------------------------------------------------------------------ |
| `object` | No       | `{"limits":{"cpu":500,"memory":512},"requests":{"cpu":100,"memory":64}}` |

### `providers[].resources.sync.limits`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > limits

| Type     | Required | Default                    |
| -------- | -------- | -------------------------- |
| `object` | No       | `{"cpu":500,"memory":512}` |

### `providers[].resources.sync.limits.cpu`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [limits](#providersresourcessynclimits) > cpu

CPU limit in millicpu.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `500`   |

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

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `512`   |

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

| Type     | Required | Default                   |
| -------- | -------- | ------------------------- |
| `object` | No       | `{"cpu":100,"memory":64}` |

### `providers[].resources.sync.requests.cpu`

[providers](#providers) > [resources](#providersresources) > [sync](#providersresourcessync) > [requests](#providersresourcessyncrequests) > cpu

CPU request in millicpu.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `100`   |

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

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `64`    |

Example:

```yaml
providers:
  - resources:
      ...
      sync:
        ...
        requests:
          ...
          memory: 64
```

### `providers[].storage`

[providers](#providers) > storage

Storage parameters to set for the in-cluster builder, container registry and code sync persistent volumes
(which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).

These are all shared cluster-wide across all users and builds, so they should be resourced accordingly,
factoring in how many concurrent builds you expect and how large your images and build contexts tend to be.

| Type     | Required | Default                                                                                                                                                              |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `object` | No       | `{"builder":{"size":20480,"storageClass":null},"nfs":{"storageClass":null},"registry":{"size":20480,"storageClass":null},"sync":{"size":10240,"storageClass":null}}` |

### `providers[].storage.builder`

[providers](#providers) > [storage](#providersstorage) > builder

Storage parameters for the data volume for the in-cluster Docker Daemon.

Only applies when `buildMode` is set to `cluster-docker`, ignored otherwise.

| Type     | Required | Default                              |
| -------- | -------- | ------------------------------------ |
| `object` | No       | `{"size":20480,"storageClass":null}` |

### `providers[].storage.builder.size`

[providers](#providers) > [storage](#providersstorage) > [builder](#providersstoragebuilder) > size

Volume size in megabytes.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `20480` |

### `providers[].storage.builder.storageClass`

[providers](#providers) > [storage](#providersstorage) > [builder](#providersstoragebuilder) > storageClass

Storage class to use for the volume.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `null`  |

### `providers[].storage.nfs`

[providers](#providers) > [storage](#providersstorage) > nfs

Storage parameters for the NFS provisioner, which we automatically create for the sync volume, _unless_
you specify a `storageClass` for the sync volume. See the below `sync` parameter for more.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type     | Required | Default                 |
| -------- | -------- | ----------------------- |
| `object` | No       | `{"storageClass":null}` |

### `providers[].storage.nfs.storageClass`

[providers](#providers) > [storage](#providersstorage) > [nfs](#providersstoragenfs) > storageClass

Storage class to use as backing storage for NFS .

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `null`  |

### `providers[].storage.registry`

[providers](#providers) > [storage](#providersstorage) > registry

Storage parameters for the in-cluster Docker registry volume. Built images are stored here, so that they
are available to all the nodes in your cluster.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type     | Required | Default                              |
| -------- | -------- | ------------------------------------ |
| `object` | No       | `{"size":20480,"storageClass":null}` |

### `providers[].storage.registry.size`

[providers](#providers) > [storage](#providersstorage) > [registry](#providersstorageregistry) > size

Volume size in megabytes.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `20480` |

### `providers[].storage.registry.storageClass`

[providers](#providers) > [storage](#providersstorage) > [registry](#providersstorageregistry) > storageClass

Storage class to use for the volume.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `null`  |

### `providers[].storage.sync`

[providers](#providers) > [storage](#providersstorage) > sync

Storage parameters for the code sync volume, which build contexts are synced to ahead of running
in-cluster builds.

Important: The storage class configured here has to support _ReadWriteMany_ access.
If you don't specify a storage class, Garden creates an NFS provisioner and provisions an
NFS volume for the sync data volume.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type     | Required | Default                              |
| -------- | -------- | ------------------------------------ |
| `object` | No       | `{"size":10240,"storageClass":null}` |

### `providers[].storage.sync.size`

[providers](#providers) > [storage](#providersstorage) > [sync](#providersstoragesync) > size

Volume size in megabytes.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `10240` |

### `providers[].storage.sync.storageClass`

[providers](#providers) > [storage](#providersstorage) > [sync](#providersstoragesync) > storageClass

Storage class to use for the volume.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `null`  |

### `providers[].tlsCertificates[]`

[providers](#providers) > tlsCertificates

One or more certificates to use for ingress.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

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
      - name: "wildcard"
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

| Type     | Required | Default     |
| -------- | -------- | ----------- |
| `string` | No       | `"default"` |

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type     | Required | Default              |
| -------- | -------- | -------------------- |
| `string` | Yes      | `"local-kubernetes"` |

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

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].setupIngressController`

[providers](#providers) > setupIngressController

Set this to null or false to skip installing/enabling the `nginx` ingress controller.

| Type     | Required | Default   |
| -------- | -------- | --------- |
| `string` | No       | `"nginx"` |


## Complete YAML schema

The values in the schema below are the default values.

```yaml
providers:
  - environments:
    buildMode: local-docker
    defaultHostname:
    defaultUsername:
    deploymentStrategy: rolling
    forceSsl: false
    imagePullSecrets:
      - name:
        namespace: default
    resources:
      builder:
        limits:
          cpu: 4000
          memory: 8192
        requests:
          cpu: 200
          memory: 512
      registry:
        limits:
          cpu: 2000
          memory: 4096
        requests:
          cpu: 200
          memory: 512
      sync:
        limits:
          cpu: 500
          memory: 512
        requests:
          cpu: 100
          memory: 64
    storage:
      builder:
        size: 20480
        storageClass: null
      nfs:
        storageClass: null
      registry:
        size: 20480
        storageClass: null
      sync:
        size: 10240
        storageClass: null
    tlsCertificates:
      - name:
        hostnames:
        secretRef:
          name:
          namespace: default
    name: local-kubernetes
    context:
    namespace:
    setupIngressController: nginx
```

## Outputs

The following keys are available via the `${providers.<provider-name>}` template string key for `local-kubernetes` providers.

### `${providers.<provider-name>.outputs}`

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

### `${providers.<provider-name>.outputs.app-namespace}`

[outputs](#outputs) > app-namespace

The primary namespace used for resource deployments.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `${providers.<provider-name>.outputs.default-hostname}`

[outputs](#outputs) > default-hostname

The default hostname configured on the provider.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `${providers.<provider-name>.outputs.metadata-namespace}`

[outputs](#outputs) > metadata-namespace

The namespace used for Garden metadata.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |
