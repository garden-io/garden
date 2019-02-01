# `kubernetes` reference

Below is the schema reference for the `kubernetes` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

The reference is divided into two sections. The [first section](#configuration-keys) lists and describes the available schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

## Configuration keys

### `project`



| Type | Required |
| ---- | -------- |
| `object` | No
### `project.environments[]`
[project](#project) > environments



| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `project.environments[].providers[]`
[project](#project) > [environments](#project.environments[]) > providers



| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `project.environments[].providers[].defaultHostname`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > defaultHostname

A default hostname to use when no hostname is explicitly configured for a service.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - defaultHostname: "api.mydomain.com"
```
### `project.environments[].providers[].defaultUsername`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > defaultUsername

Set a default username (used for namespacing within a cluster).

| Type | Required |
| ---- | -------- |
| `string` | No
### `project.environments[].providers[].forceSsl`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > forceSsl

Require SSL on all services. If set to true, an error is raised when no certificate is available for a configured hostname.

| Type | Required |
| ---- | -------- |
| `boolean` | No
### `project.environments[].providers[].imagePullSecrets[]`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > imagePullSecrets

References to `docker-registry` secrets to use for authenticating with remote registries when pulling
images. This is necessary if you reference private images in your module configuration, and is required
when configuring a remote Kubernetes environment.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `project.environments[].providers[].imagePullSecrets[].name`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > [imagePullSecrets](#project.environments[].providers[].imagepullsecrets[]) > name

The name of the Kubernetes secret.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - imagePullSecrets:
            - name: "my-secret"
```
### `project.environments[].providers[].imagePullSecrets[].namespace`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > [imagePullSecrets](#project.environments[].providers[].imagepullsecrets[]) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type | Required |
| ---- | -------- |
| `string` | No
### `project.environments[].providers[].tlsCertificates[]`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > tlsCertificates

One or more certificates to use for ingress.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `project.environments[].providers[].tlsCertificates[].name`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > [tlsCertificates](#project.environments[].providers[].tlscertificates[]) > name

A unique identifier for this certificate.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - tlsCertificates:
            - name: "wildcard"
```
### `project.environments[].providers[].tlsCertificates[].hostnames[]`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > [tlsCertificates](#project.environments[].providers[].tlscertificates[]) > hostnames

A list of hostnames that this certificate should be used for. If you don't specify these, they will be automatically read from the certificate.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - tlsCertificates:
            - hostnames:
              - www.mydomain.com
```
### `project.environments[].providers[].tlsCertificates[].secretRef`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > [tlsCertificates](#project.environments[].providers[].tlscertificates[]) > secretRef

A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.

| Type | Required |
| ---- | -------- |
| `object` | No

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - tlsCertificates:
            - secretRef:
              name: my-tls-secret
              namespace: default
```
### `project.environments[].providers[].tlsCertificates[].secretRef.name`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > [tlsCertificates](#project.environments[].providers[].tlscertificates[]) > [secretRef](#project.environments[].providers[].tlscertificates[].secretref) > name

The name of the Kubernetes secret.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - tlsCertificates:
            - secretRef:
              name: my-tls-secret
              namespace: default
                ...
                name: "my-secret"
```
### `project.environments[].providers[].tlsCertificates[].secretRef.namespace`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > [tlsCertificates](#project.environments[].providers[].tlscertificates[]) > [secretRef](#project.environments[].providers[].tlscertificates[].secretref) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type | Required |
| ---- | -------- |
| `string` | No
### `project.environments[].providers[].name`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > name

The name of the provider plugin to use.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - name: "kubernetes"
```
### `project.environments[].providers[].context`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > context

The kubectl context to use to connect to the Kubernetes cluster.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - context: "my-dev-context"
```
### `project.environments[].providers[].deploymentRegistry`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > deploymentRegistry

The registry where built containers should be pushed to, and then pulled to the cluster when deploying services.

| Type | Required |
| ---- | -------- |
| `object` | Yes
### `project.environments[].providers[].deploymentRegistry.hostname`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > [deploymentRegistry](#project.environments[].providers[].deploymentregistry) > hostname

The hostname (and optionally port, if not the default port) of the registry.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - deploymentRegistry:
            ...
            hostname: "gcr.io"
```
### `project.environments[].providers[].deploymentRegistry.port`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > [deploymentRegistry](#project.environments[].providers[].deploymentregistry) > port

The port where the registry listens on, if not the default.

| Type | Required |
| ---- | -------- |
| `number` | No
### `project.environments[].providers[].deploymentRegistry.namespace`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > [deploymentRegistry](#project.environments[].providers[].deploymentregistry) > namespace

The namespace in the registry where images should be pushed.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - deploymentRegistry:
            ...
            namespace: "my-project"
```
### `project.environments[].providers[].ingressClass`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > ingressClass

The ingress class to use on configured Ingresses (via the `kubernetes.io/ingress.class` annotation)
when deploying `container` services. Use this if you have multiple ingress controllers in your cluster.

| Type | Required |
| ---- | -------- |
| `string` | No
### `project.environments[].providers[].ingressHttpPort`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > ingressHttpPort

The external HTTP port of the cluster's ingress controller.

| Type | Required |
| ---- | -------- |
| `number` | No
### `project.environments[].providers[].ingressHttpsPort`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > ingressHttpsPort

The external HTTPS port of the cluster's ingress controller.

| Type | Required |
| ---- | -------- |
| `number` | No
### `project.environments[].providers[].namespace`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > namespace

Specify which namespace to deploy services to (defaults to <username>--<project name>). Note that the framework generates other namespaces as well with this name as a prefix.

| Type | Required |
| ---- | -------- |
| `string` | No


## Complete YAML schema
```yaml
project:
  environments:
    - providers:
        - defaultHostname:
          defaultUsername:
          forceSsl: false
          imagePullSecrets:
            - name:
              namespace: default
          tlsCertificates:
            - name:
              hostnames:
              secretRef:
                name:
                namespace: default
          name:
          context:
          deploymentRegistry:
            hostname:
            port:
            namespace: _
          ingressClass:
          ingressHttpPort: 80
          ingressHttpsPort: 443
          namespace:
```
