# `maven-container` reference

Below is the schema reference for the `maven-container` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

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
        - name: "local-kubernetes"
```


## Complete YAML schema
```yaml
project:
  environments:
    - providers:
        - name:
```
