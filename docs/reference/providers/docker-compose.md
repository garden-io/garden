---
title: "`docker-compose` Provider"
tocTitle: "`docker-compose`"
---

# `docker-compose` Provider

## Description

**EXPERIMENTAL**

This plugin allows you to integrate [Docker Compose](https://docs.docker.com/compose/) projects into your Garden project.

It works by parsing the Docker Compose projects, and creating Build and Deploy actions for each [service](https://docs.docker.com/compose/compose-file/05-services/) in the project.

You can then easily add Run and Test actions to complement your Compose project.

This can be very useful e.g. for running tests against a Docker Compose stack in CI (and locally), and to wrap various scripts you use during development (e.g. a Run for seeding a database with test data, or a Run for generating a database migration inside a container that you're developing).

See the [Docker Compose guide](https://docs.garden.io/docker-compose-plugin/about) for more information on the action types provided by the plugin, and how to use it for developing and testing your Compose project.

Below is the full schema reference for the provider configuration. For an introduction to configuring a Garden project with providers, please look at our [configuration guide](../../using-garden/configuration-overview.md).

The reference is divided into two sections. The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
providers:
  - # The name of the provider plugin to use.
    name:

    # List other providers that should be resolved before this one.
    #
    # Example: `["exec"]`
    dependencies: []

    # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    #
    # Example: `["dev","stage"]`
    environments:

    # Specify Compose projects to import. Defaults to look for one in the project root.
    projects:
      - name:

        # The path to the Compose project directory. Important: This must be within a git repository!
        path:
```
## Configuration Keys

### `providers[]`

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `providers[].dependencies[]`

[providers](#providers) > dependencies

List other providers that should be resolved before this one.

Example: `["exec"]`

| Type    | Default | Required |
| ------- | ------- | -------- |
| `array` | `[]`    | No       |

### `providers[].environments[]`

[providers](#providers) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

Example: `["dev","stage"]`

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `providers[].projects[]`

[providers](#providers) > projects

Specify Compose projects to import. Defaults to look for one in the project root.

| Type    | Default          | Required |
| ------- | ---------------- | -------- |
| `array` | `[{"path":"."}]` | No       |

### `providers[].projects[].name`

[providers](#providers) > [projects](#providersprojects) > name

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `providers[].projects[].path`

[providers](#providers) > [projects](#providersprojects) > path

The path to the Compose project directory. Important: This must be within a git repository!

| Type     | Required |
| -------- | -------- |
| `string` | No       |

