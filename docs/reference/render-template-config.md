---
order: 44
title: RenderTemplate Reference
---

# RenderTemplate Reference

Below is the schema reference for `RenderTemplate` configuration files. To learn more about config templates, see the [Config Templates guide](../features/config-templates.md).

The reference is divided into two sections:
* [YAML Schema](#yaml-schema) contains the config YAML schema
* [Configuration keys](#configuration-keys) describes each individual schema key for the configuration files.

Also check out the [`ConfigTemplate` reference](./config-template-config.md).

## YAML Schema

The values in the schema below are the default values.

```yaml
kind: RenderTemplate

# A unique identifier for the Render config.
name:

# Set to true to skip rendering this template.
disabled: false

# The ConfigTemplate to render.
template:

# A map of inputs to pass to the ConfigTemplate. These must match the inputs schema of the ConfigTemplate.
#
# Note: You can use template strings for the inputs, but be aware that inputs that are used to generate the resulting
# config names and other top-level identifiers must be resolvable when scanning for configs, and thus cannot reference
# other actions, modules or runtime variables. See the [environment configuration context
# reference](./template-strings/environments.md) to see template strings that are safe to use for inputs used to
# generate config identifiers.
inputs:
```

## Configuration Keys


### `kind`

| Type     | Allowed Values   | Default            | Required |
| -------- | ---------------- | ------------------ | -------- |
| `string` | "RenderTemplate" | `"RenderTemplate"` | Yes      |

### `name`

A unique identifier for the Render config.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `disabled`

Set to true to skip rendering this template.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `template`

The ConfigTemplate to render.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `inputs`

A map of inputs to pass to the ConfigTemplate. These must match the inputs schema of the ConfigTemplate.

Note: You can use template strings for the inputs, but be aware that inputs that are used to generate the resulting config names and other top-level identifiers must be resolvable when scanning for configs, and thus cannot reference other actions, modules or runtime variables. See the [environment configuration context reference](./template-strings/environments.md) to see template strings that are safe to use for inputs used to generate config identifiers.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

