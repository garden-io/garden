## `kubernetes` reference

Below is the schema reference for the `kubernetes` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

## Configuration keys

### `name`

The name of the provider plugin to use.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
name: "local-kubernetes"
```
### `defaultHostname`

A default hostname to use when no hostname is explicitly configured for a service.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
defaultHostname: "api.mydomain.com"
```
### `defaultUsername`

Set a default username (used for namespacing within a cluster).

| Type | Required |
| ---- | -------- |
| `string` | No
### `forceSsl`

Require SSL on all services. If set to true, an error is raised when no certificate is available for a configured hostname.

| Type | Required |
| ---- | -------- |
| `boolean` | No
### `imagePullSecrets`

References to `docker-registry` secrets to use for authenticating with remote registries when pulling
images. This is necessary if you reference private images in your module configuration, and is required
when configuring a remote Kubernetes environment.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `imagePullSecrets.name`
[imagePullSecrets](#imagepullsecrets) > name

The name of the Kubernetes secret.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
imagePullSecrets:
  - name: "my-secret"
```
### `imagePullSecrets.namespace`
[imagePullSecrets](#imagepullsecrets) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type | Required |
| ---- | -------- |
| `string` | No
### `tlsCertificates`

One or more certificates to use for ingress.

| Type | Required |
| ---- | -------- |
| `array[object]` | No
### `tlsCertificates.name`
[tlsCertificates](#tlscertificates) > name

A unique identifier for this certificate.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
tlsCertificates:
  - name: "wildcard"
```
### `tlsCertificates.hostnames`
[tlsCertificates](#tlscertificates) > hostnames

A list of hostnames that this certificate should be used for. If you don't specify these, they will be automatically read from the certificate.

| Type | Required |
| ---- | -------- |
| `array[string]` | No

Example:
```yaml
tlsCertificates:
  - hostnames:
    - www.mydomain.com
```
### `tlsCertificates.secretRef`
[tlsCertificates](#tlscertificates) > secretRef

A reference to the Kubernetes secret that contains the TLS certificate and key for the domain.

| Type | Required |
| ---- | -------- |
| `object` | No

Example:
```yaml
tlsCertificates:
  - secretRef:
    name: my-tls-secret
    namespace: default
```
### `tlsCertificates.secretRef.name`
[tlsCertificates](#tlscertificates) > [secretRef](#tlscertificates.secretref) > name

The name of the Kubernetes secret.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
tlsCertificates:
  - secretRef:
    name: my-tls-secret
    namespace: default
      name: "my-secret"
```
### `tlsCertificates.secretRef.namespace`
[tlsCertificates](#tlscertificates) > [secretRef](#tlscertificates.secretref) > namespace

The namespace where the secret is stored. If necessary, the secret may be copied to the appropriate namespace before use.

| Type | Required |
| ---- | -------- |
| `string` | No
### `context`

The kubectl context to use to connect to the Kubernetes cluster.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
context: "my-dev-context"
```
### `deploymentRegistry`

The registry where built containers should be pushed to, and then pulled to the cluster when deploying services.

| Type | Required |
| ---- | -------- |
| `object` | Yes
### `deploymentRegistry.hostname`
[deploymentRegistry](#deploymentregistry) > hostname

The hostname (and optionally port, if not the default port) of the registry.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:
```yaml
deploymentRegistry:
  hostname: "gcr.io"
```
### `deploymentRegistry.port`
[deploymentRegistry](#deploymentregistry) > port

The port where the registry listens on, if not the default.

| Type | Required |
| ---- | -------- |
| `number` | No
### `deploymentRegistry.namespace`
[deploymentRegistry](#deploymentregistry) > namespace

The namespace in the registry where images should be pushed.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
deploymentRegistry:
  namespace: "my-project"
```
### `ingressClass`

The ingress class to use on configured Ingresses (via the `kubernetes.io/ingress.class` annotation)
when deploying `container` services. Use this if you have multiple ingress controllers in your cluster.

| Type | Required |
| ---- | -------- |
| `string` | No
### `ingressHttpPort`

The external HTTP port of the cluster's ingress controller.

| Type | Required |
| ---- | -------- |
| `number` | No
### `ingressHttpsPort`

The external HTTPS port of the cluster's ingress controller.

| Type | Required |
| ---- | -------- |
| `number` | No
### `namespace`

Specify which namespace to deploy services to (defaults to <username>--<project name>). Note that the framework generates other namespaces as well with this name as a prefix.

| Type | Required |
| ---- | -------- |
| `string` | No

## Complete schema
```yaml
name:

defaultHostname:

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