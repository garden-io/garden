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

Default environment settings. These are inherited (but can be overridden) by each configured environment.

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

A list of providers that should be used for this environment, and their configuration. Please refer to individual plugins/providers for details on how to configure them.

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
### `environmentDefaults.variables`
[environmentDefaults](#environmentdefaults) > variables

A key/value map of variables that modules can reference when using this environment.

| Type | Required |
| ---- | -------- |
| `object` | No
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
### `environments`



| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `environments[].providers[]`
[environments](#environments) > providers



| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `environments[].providers[].buildMode`
[environments](#environments) > [providers](#environments[].providers[]) > buildMode

Choose the mechanism used to build containers before deploying. By default it uses the local docker, but you can set it to 'cluster-docker' to sync files to a remote docker daemon, installed in the cluster, and build container images there.
This is currently experimental and sometimes not needed (e.g. with Docker for Desktop), so it's not enabled by default.

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

Require SSL on all services. If set to true, an error is raised when no certificate is available for a configured hostname.

| Type | Required |
| ---- | -------- |
| `boolean` | No
### `environments[].providers[].imagePullSecrets[]`
[environments](#environments) > [providers](#environments[].providers[]) > imagePullSecrets

References to `docker-registry` secrets to use for authenticating with remote registries when pulling
images. This is necessary if you reference private images in your module configuration, and is required
when configuring a remote Kubernetes environment.

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
### `environments[].providers[].storage`
[environments](#environments) > [providers](#environments[].providers[]) > storage

Storage parameters to set for the in-cluster builder and container registry persistent volume (which are automatically installed and used when buildMode=cluster-docker).

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].storage.builder`
[environments](#environments) > [providers](#environments[].providers[]) > [storage](#environments[].providers[].storage) > builder



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
### `environments[].providers[].resources`
[environments](#environments) > [providers](#environments[].providers[]) > resources

Resource requests and limits for the in-cluster builder and container registry (which are automatically installed and used when buildMode=cluster-docker).

| Type | Required |
| ---- | -------- |
| `object` | No
### `environments[].providers[].resources.builder`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > builder



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
### `environments[].providers[].resources.builder.limits.memory`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [builder](#environments[].providers[].resources.builder) > [limits](#environments[].providers[].resources.builder.limits) > memory

Memory limit in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No
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
### `environments[].providers[].resources.builder.requests.memory`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [builder](#environments[].providers[].resources.builder) > [requests](#environments[].providers[].resources.builder.requests) > memory

Memory request in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No
### `environments[].providers[].resources.registry`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > registry



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
### `environments[].providers[].resources.registry.limits.memory`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [registry](#environments[].providers[].resources.registry) > [limits](#environments[].providers[].resources.registry.limits) > memory

Memory limit in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No
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
### `environments[].providers[].resources.registry.requests.memory`
[environments](#environments) > [providers](#environments[].providers[]) > [resources](#environments[].providers[].resources) > [registry](#environments[].providers[].resources.registry) > [requests](#environments[].providers[].resources.registry.requests) > memory

Memory request in megabytes.

| Type | Required |
| ---- | -------- |
| `number` | No
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
  variables: {}
sources:
  - name:
    repositoryUrl:
environments:
  - providers:
      - buildMode: local
        defaultHostname:
        defaultUsername:
        forceSsl: false
        imagePullSecrets:
          - name:
            namespace: default
        storage:
          builder:
            size: 10240
            storageClass: null
          registry:
            size: 10240
            storageClass: null
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
