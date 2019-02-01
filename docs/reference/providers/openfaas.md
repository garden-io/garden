# `openfaas` reference

Below is the schema reference for the `openfaas` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

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
        - name: "openfaas"
```
### `project.environments[].providers[].hostname`
[project](#project) > [environments](#project.environments[]) > [providers](#project.environments[].providers[]) > hostname

The hostname to configure for the function gateway.
Defaults to the default hostname of the configured Kubernetes provider.

Important: If you have other types of services, this should be different from their ingress hostnames,
or the other services should not expose paths under /function and /system to avoid routing conflicts.

| Type | Required |
| ---- | -------- |
| `string` | No

Example:
```yaml
project:
  ...
  environments:
    - providers:
        - hostname: "functions.mydomain.com"
```


## Complete YAML schema
```yaml
project:
  environments:
    - providers:
        - name:
          hostname:
```
