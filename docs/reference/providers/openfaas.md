# `openfaas` reference

Below is the schema reference for the `openfaas` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

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
      - name: "openfaas"
```
### `environments[].providers[].hostname`
[environments](#environments) > [providers](#environments[].providers[]) > hostname

The hostname to configure for the function gateway.
Defaults to the default hostname of the configured Kubernetes provider.

Important: If you have other types of services, this should be different from their ingress hostnames,
or the other services should not expose paths under /function and /system to avoid routing conflicts.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
environments:
  - providers:
      - hostname: "functions.mydomain.com"
```


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
      - name: openfaas
        hostname:
```
