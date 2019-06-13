# `maven-container` reference

Below is the schema reference for the `maven-container` provider. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-files.md).

The reference is divided into two sections. The [first section](#configuration-keys) lists and describes the available schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

## Configuration keys

### `providers`

| Type | Required |
| ---- | -------- |
| `array[object]` | No

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

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type | Required |
| ---- | -------- |
| `string` | Yes

Example:

```yaml
providers:
  - name: "maven-container"
```


## Complete YAML schema

The values in the schema below are the default values.

```yaml
providers:
  - environments:
    name: maven-container
```
