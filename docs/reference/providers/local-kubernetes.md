# `local-kubernetes` reference

Below is the schema reference for the `local-kubernetes` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

The reference is divided into two sections. The [first section](#configuration-keys) lists and describes the available schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

## Configuration keys

### `apiVersion`

The schema version of this project's config (currently not used).

| Type | Required | Allowed Values |
| ---- | -------- | -------------- |
| `string` | Yes | "garden.io/v0"
### `kind`



| Type | Required | Allowed Values |
| ---- | -------- | -------------- |
| `string` | Yes | "Project"
### `name`

The name of the project.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
name: "my-sweet-project"
```
### `defaultEnvironment`

The default environment to use when calling commands without the `--env` parameter.

| Type | Required |
| ---- | -------- |
| `string` | No
### `environmentDefaults`

DEPRECATED - Please use the `providers` field instead, and omit the environments key in the configured provider to use it for all environments, and use the `variables` field to configure variables across all environments.

| Type | Required |
| ---- | -------- |
| `object` | No

Example:
```yaml
environmentDefaults:
  providers: []
  variables: {}
```
### `environmentDefaults.providers[]`
[environmentDefaults](#environmentdefaults) > providers

DEPRECATED - Please use the top-level `providers` field instead, and if needed use the `environments` key on the provider configurations to limit them to specific environments.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `environmentDefaults.providers[].name`
[environmentDefaults](#environmentdefaults) > [providers](#environmentdefaults.providers[]) > name

The name of the provider plugin to use.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
environmentDefaults:
  providers: []
  variables: {}
  ...
  providers:
    - name: "local-kubernetes"
```
### `environmentDefaults.providers[].environments[]`
[environmentDefaults](#environmentdefaults) > [providers](#environmentdefaults.providers[]) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
environmentDefaults:
  providers: []
  variables: {}
  ...
  providers:
    - environments:
      - dev
      - stage
```
### `environmentDefaults.variables`
[environmentDefaults](#environmentdefaults) > variables

A key/value map of variables that modules can reference when using this environment. These take precedence over variables defined in the top-level `variables` field.

| Type | Required |
| ---- | -------- |
| `object` | No
### `providers`

A list of providers that should be used for this project, and their configuration. Please refer to individual plugins/providers for details on how to configure them.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `providers[].name`
[providers](#providers) > name

The name of the provider plugin to use.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
providers:
  - name: "local-kubernetes"
```
### `providers[].environments[]`
[providers](#providers) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
providers:
  - environments:
    - dev
    - stage
```
### `sources`

A list of remote sources to import into project.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `sources[].name`
[sources](#sources) > name

The name of the source to import

| Type | Required |
| ---- | -------- |
| `string` | Yes
### `sources[].repositoryUrl`
[sources](#sources) > repositoryUrl

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
sources:
  - repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```
### `variables`

Variables to configure for all environments.

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments`



| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `environments[].providers[]`
[environments](#environments) > providers



| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `environments[].providers[].environments[]`
[environments](#environments) > [providers](#environments[].providers[]) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
environments:
  - providers:
      - environments:
        - dev
        - stage
```
### `environments[].providers[].buildMode`
[environments](#environments) > [providers](#environments[].providers[]) > buildMode

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

| Type | Required |
| ---- | -------- |
| `string` | No
### `environments[].providers[].defaultHostname`
[environments](#environments) > [providers](#environments[].providers[]) > defaultHostname

A default hostname to use when no hostname is explicitly configured for a service.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
environments:
  - providers:
      - defaultHostname: "api.mydomain.com"
```
### `environments[].providers[].defaultUsername`
[environments](#environments) > [providers](#environments[].providers[]) > defaultUsername

Set a default username (used for namespacing within a cluster).

| Type | Required |
| ---- | -------- |
| `string` | No
### `environments[].providers[].forceSsl`
[environments](#environments) > [providers](#environments[].providers[]) > forceSsl

Require SSL on all `container` module services. If set to true, an error is raised when no certificate is available for a configured hostname on a `container` module.

| Type | Required |
| ---- | -------- |
| `boolean` | No
### `environments[].providers[].imagePullSecrets[]`
[environments](#environments) > [providers](#environments[].providers[]) > imagePullSecrets

References to `docker-registry` secrets to use for authenticating with remote registries when pulling
images. This is necessary if you reference private images in your module configuration, and is required
when configuring a remote Kubernetes environment with buildMode=local.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `environments[].providers[].imagePullSecrets[].name`
[environments](#environments) > [providers](#environments[].providers[]) > [imagePullSecrets](#environments[].providers[].imagepullsecrets[]) > name

The name of the Kubernetes secret.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
environments:
  - providers:
      - imagePullSecrets:
          - name: "my-secret"
```
### `environments[].providers[].imagePullSecrets[].namespace`
[environments](#environments) > [providers](#environments[].providers[]) > [imagePullSecrets](#environments[].providers[].imagepullsecrets[]) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type | Required |
| ---- | -------- |
| `string` | No
### `environments[].providers[].resources`
[environments](#environments) > [providers](#environments[].providers[]) > resources

Resource requests and limits for the in-cluster builder, container registry and code sync service. (which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.builder`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > builder

Resource requests and limits for the in-cluster builder.

When `buildMode` is `cluster-docker`, this refers to the Docker Daemon that is installed and run
cluster-wide. This is shared across all users and builds, so it should be resourced accordingly, factoring
in how many concurrent builds you expect and how heavy your builds tend to be.

When `buildMode` is `kaniko`, this refers to _each instance_ of Kaniko, so you'd generally use lower
limits/requests, but you should evaluate based on your needs.

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.builder.limits`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [builder](#environments[].providers[].resources.builder) > limits



| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.builder.limits.cpu`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [builder](#environments[].providers[].resources.builder) > [limits](#environments[].providers[].resources.builder.limits) > cpu

CPU limit in millicpu.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          builder:
            ...
            limits:
              ...
              cpu: 2000
```
### `environments[].providers[].resources.builder.limits.memory`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [builder](#environments[].providers[].resources.builder) > [limits](#environments[].providers[].resources.builder.limits) > memory

Memory limit in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          builder:
            ...
            limits:
              ...
              memory: 4096
```
### `environments[].providers[].resources.builder.requests`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [builder](#environments[].providers[].resources.builder) > requests



| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.builder.requests.cpu`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [builder](#environments[].providers[].resources.builder) > [requests](#environments[].providers[].resources.builder.requests) > cpu

CPU request in millicpu.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          builder:
            ...
            requests:
              ...
              cpu: 200
```
### `environments[].providers[].resources.builder.requests.memory`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [builder](#environments[].providers[].resources.builder) > [requests](#environments[].providers[].resources.builder.requests) > memory

Memory request in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          builder:
            ...
            requests:
              ...
              memory: 512
```
### `environments[].providers[].resources.registry`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > registry

Resource requests and limits for the in-cluster image registry. Built images are pushed to this registry,
so that they are available to all the nodes in your cluster.

This is shared across all users and builds, so it should be resourced accordingly, factoring
in how many concurrent builds you expect and how large your images tend to be.

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.registry.limits`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [registry](#environments[].providers[].resources.registry) > limits



| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.registry.limits.cpu`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [registry](#environments[].providers[].resources.registry) > [limits](#environments[].providers[].resources.registry.limits) > cpu

CPU limit in millicpu.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          registry:
            ...
            limits:
              ...
              cpu: 2000
```
### `environments[].providers[].resources.registry.limits.memory`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [registry](#environments[].providers[].resources.registry) > [limits](#environments[].providers[].resources.registry.limits) > memory

Memory limit in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          registry:
            ...
            limits:
              ...
              memory: 4096
```
### `environments[].providers[].resources.registry.requests`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [registry](#environments[].providers[].resources.registry) > requests



| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.registry.requests.cpu`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [registry](#environments[].providers[].resources.registry) > [requests](#environments[].providers[].resources.registry.requests) > cpu

CPU request in millicpu.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          registry:
            ...
            requests:
              ...
              cpu: 200
```
### `environments[].providers[].resources.registry.requests.memory`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [registry](#environments[].providers[].resources.registry) > [requests](#environments[].providers[].resources.registry.requests) > memory

Memory request in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          registry:
            ...
            requests:
              ...
              memory: 512
```
### `environments[].providers[].resources.sync`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > sync

Resource requests and limits for the code sync service, which we use to sync build contexts to the cluster
ahead of building images. This generally is not resource intensive, but you might want to adjust the
defaults if you have many concurrent users.

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.sync.limits`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [sync](#environments[].providers[].resources.sync) > limits



| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.sync.limits.cpu`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [sync](#environments[].providers[].resources.sync) > [limits](#environments[].providers[].resources.sync.limits) > cpu

CPU limit in millicpu.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          sync:
            ...
            limits:
              ...
              cpu: 200
```
### `environments[].providers[].resources.sync.limits.memory`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [sync](#environments[].providers[].resources.sync) > [limits](#environments[].providers[].resources.sync.limits) > memory

Memory limit in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          sync:
            ...
            limits:
              ...
              memory: 256
```
### `environments[].providers[].resources.sync.requests`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [sync](#environments[].providers[].resources.sync) > requests



| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.sync.requests.cpu`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [sync](#environments[].providers[].resources.sync) > [requests](#environments[].providers[].resources.sync.requests) > cpu

CPU request in millicpu.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          sync:
            ...
            requests:
              ...
              cpu: 100
```
### `environments[].providers[].resources.sync.requests.memory`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [sync](#environments[].providers[].resources.sync) > [requests](#environments[].providers[].resources.sync.requests) > memory

Memory request in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No

Example:
```yaml
environments:
  - providers:
      - resources:
          ...
          sync:
            ...
            requests:
              ...
              memory: 64
```
### `environments[].providers[].storage`
[environments](#environments) > [providers](#environments[].providers[]) > storage

Storage parameters to set for the in-cluster builder, container registry and code sync persistent volumes
(which are automatically installed and used when `buildMode` is `cluster-docker` or `kaniko`).

These are all shared cluster-wide across all users and builds, so they should be resourced accordingly,
factoring in how many concurrent builds you expect and how large your images and build contexts tend to be.

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].storage.builder`
[environments](#environments) > [providers](#environments[].providers[]) > [storage](#environments[].providers[].storage) > builder

Storage parameters for the data volume for the in-cluster Docker Daemon.

Only applies when `buildMode` is set to `cluster-docker`, ignored otherwise.

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].storage.builder.size`
[environments](#environments) > [providers](#environments[].providers[]) > [storage](#environments[].providers[].storage) > [builder](#environments[].providers[].storage.builder) > size

Volume size for the registry in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No
### `environments[].providers[].storage.builder.storageClass`
[environments](#environments) > [providers](#environments[].providers[]) > [storage](#environments[].providers[].storage) > [builder](#environments[].providers[].storage.builder) > storageClass

Storage class to use for the volume.

| Type | Required |
| ---- | -------- |
| `string` | No
### `environments[].providers[].storage.registry`
[environments](#environments) > [providers](#environments[].providers[]) > [storage](#environments[].providers[].storage) > registry

Storage parameters for the in-cluster Docker registry volume. Built images are stored here, so that they
are available to all the nodes in your cluster.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].storage.registry.size`
[environments](#environments) > [providers](#environments[].providers[]) > [storage](#environments[].providers[].storage) > [registry](#environments[].providers[].storage.registry) > size

Volume size for the registry in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No
### `environments[].providers[].storage.registry.storageClass`
[environments](#environments) > [providers](#environments[].providers[]) > [storage](#environments[].providers[].storage) > [registry](#environments[].providers[].storage.registry) > storageClass

Storage class to use for the volume.

| Type | Required |
| ---- | -------- |
| `string` | No
### `environments[].providers[].storage.sync`
[environments](#environments) > [providers](#environments[].providers[]) > [storage](#environments[].providers[].storage) > sync

Storage parameters for the code sync volume, which build contexts are synced to ahead of running
in-cluster builds.

Only applies when `buildMode` is set to `cluster-docker` or `kaniko`, ignored otherwise.

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].storage.sync.size`
[environments](#environments) > [providers](#environments[].providers[]) > [storage](#environments[].providers[].storage) > [sync](#environments[].providers[].storage.sync) > size

Volume size for the registry in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No
### `environments[].providers[].storage.sync.storageClass`
[environments](#environments) > [providers](#environments[].providers[]) > [storage](#environments[].providers[].storage) > [sync](#environments[].providers[].storage.sync) > storageClass

Storage class to use for the volume.

| Type | Required |
| ---- | -------- |
| `string` | No
### `environments[].providers[].tlsCertificates[]`
[environments](#environments) > [providers](#environments[].providers[]) > tlsCertificates

One or more certificates to use for ingress.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `environments[].providers[].tlsCertificates[].name`
[environments](#environments) > [providers](#environments[].providers[]) > [tlsCertificates](#environments[].providers[].tlscertificates[]) > name

A unique identifier for this certificate.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
environments:
  - providers:
      - tlsCertificates:
          - name: "wildcard"
```
### `environments[].providers[].tlsCertificates[].hostnames[]`
[environments](#environments) > [providers](#environments[].providers[]) > [tlsCertificates](#environments[].providers[].tlscertificates[]) > hostnames

A list of hostnames that this certificate should be used for. If you don't specify these, they will be automatically read from the certificate.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
environments:
  - providers:
      - tlsCertificates:
          - hostnames:
            - www.mydomain.com
```
### `environments[].providers[].tlsCertificates[].secretRef`
[environments](#environments) > [providers](#environments[].providers[]) > [tlsCertificates](#environments[].providers[].tlscertificates[]) > secretRef

A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.

| Type | Required |
| ---- | -------- |
| `object` | No

Example:
```yaml
environments:
  - providers:
      - tlsCertificates:
          - secretRef:
            name: my-tls-secret
            namespace: default
```
### `environments[].providers[].tlsCertificates[].secretRef.name`
[environments](#environments) > [providers](#environments[].providers[]) > [tlsCertificates](#environments[].providers[].tlscertificates[]) > [secretRef](#environments[].providers[].tlscertificates[].secretref) > name

The name of the Kubernetes secret.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
environments:
  - providers:
      - tlsCertificates:
          - secretRef:
            name: my-tls-secret
            namespace: default
              ...
              name: "my-secret"
```
### `environments[].providers[].tlsCertificates[].secretRef.namespace`
[environments](#environments) > [providers](#environments[].providers[]) > [tlsCertificates](#environments[].providers[].tlscertificates[]) > [secretRef](#environments[].providers[].tlscertificates[].secretref) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type | Required |
| ---- | -------- |
| `string` | No
### `environments[].providers[].name`
[environments](#environments) > [providers](#environments[].providers[]) > name

The name of the provider plugin to use.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
environments:
  - providers:
      - name: "local-kubernetes"
```
### `environments[].providers[].context`
[environments](#environments) > [providers](#environments[].providers[]) > context

The kubectl context to use to connect to the Kubernetes cluster.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
environments:
  - providers:
      - context: "my-dev-context"
```
### `environments[].providers[].namespace`
[environments](#environments) > [providers](#environments[].providers[]) > namespace

Specify which namespace to deploy services to (defaults to the project name). Note that the framework generates other namespaces as well with this name as a prefix.

| Type | Required |
| ---- | -------- |
| `string` | No
### `environments[].providers[].setupIngressController`
[environments](#environments) > [providers](#environments[].providers[]) > setupIngressController

Set this to null or false to skip installing/enabling the `nginx` ingress controller.

| Type | Required |
| ---- | -------- |
| `string` | No


## Complete YAML schema
```yaml
apiVersion: garden.io/v0
kind: Project
name:
defaultEnvironment: ''
environmentDefaults:
  providers:
    - name:
      environments:
  variables: {}
providers:
  - name:
    environments:
sources:
  - name:
    repositoryUrl:
variables: {}
environments:
  - providers:
      - environments:
        buildMode: local-docker
        defaultHostname:
        defaultUsername:
        forceSsl: false
        imagePullSecrets:
          - name:
            namespace: default
        resources:
          builder:
            limits:
              cpu: 2000
              memory: 4096
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
              cpu: 200
              memory: 256
            requests:
              cpu: 100
              memory: 64
        storage:
          builder:
            size: 10240
            storageClass: null
          registry:
            size: 10240
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
