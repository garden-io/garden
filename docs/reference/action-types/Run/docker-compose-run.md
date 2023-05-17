---
title: "`docker-compose-run` Run"
tocTitle: "`docker-compose-run` Run"
---

# `docker-compose-run` Run

## Description

Uses ` compose run` to execute the specified command in a new, one-off container from the specified Compose service.

Below is the full schema reference for the action. For an introduction to configuring Garden, please look at our [Configuration
guide](../../../using-garden/configuration-overview.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`docker-compose-run` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
# The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will be
# defined by your configured providers.
type:

# A valid name for the action. Must be unique across all actions of the same _kind_ in your project.
name:

# A description of the action.
description:

# By default, the directory where the action is defined is used as the source for the build context.
#
# You can override this by setting either `source.path` to another (POSIX-style) path relative to the action source
# directory, or `source.repository` to get the source from an external repository.
#
# If using `source.path`, you must make sure the target path is in a git repository.
#
# For `source.repository` behavior, please refer to the [Remote Sources
# guide](https://docs.garden.io/advanced/using-remote-sources).
source:
  # A relative POSIX-style path to the source directory for this action. You must make sure this path exists and is in
  # a git repository!
  path:

  # When set, Garden will import the action source from this repository, but use this action configuration (and not
  # scan for configs in the separate repository).
  repository:
    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    url:

# A list of other actions that this action depends on, and should be built, deployed or run (depending on the action
# type) before processing this action.
#
# Each dependency should generally be expressed as a `"<kind>.<name>"` string, where _<kind>_ is one of `build`,
# `deploy`, `run` or `test`, and _<name>_ is the name of the action to depend on.
#
# You may also optionally specify a dependency as an object, e.g. `{ kind: "Build", name: "some-image" }`.
#
# Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency via
# template expressions.
dependencies: []

# Set this to `true` to disable the action. You can use this with conditional template strings to disable actions
# based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name == "prod"}`).
# This can be handy when you only need certain actions for specific environments, e.g. only for development.
#
# For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another enabled
# action (in which case the Build is assumed to be necessary for the dependant action to be run or built).
#
# For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored. Note
# however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the action is
# disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional
# expressions.
disabled: false

# Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will
# affect the computed _version_ of the action.
#
# For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An
# exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be inferred
# and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run
# when certain files are modified.
#
# _Build_ actions have a different behavior, since they generally are based on some files in the source tree, so
# please reference the docs for more information on those.
#
# Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source
# tree, which use the same format as `.gitignore` files. See the [Configuration Files
# guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
# details.
include:

# Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's version.
#
# For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For
# _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set `include`
# paths, or such paths inferred by providers. See the [Configuration Files
# guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
# details.
#
# Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
# directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect those,
# if you have large directories that should not be watched for changes.
exclude:

# A map of variables scoped to this particular action. These are resolved before any other parts of the action
# configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in that
# order. They may reference group-scoped and project-scoped variables, and generally can use any template strings
# normally allowed when resolving the action.
variables:

# Specify a list of paths (relative to the directory where the action is defined) to a file containing variables, that
# we apply on top of the action-level `variables` field, and take precedence over group-level variables (if
# applicable) and project-level variables, in that order.
#
# If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the
# previous ones.
#
# The format of the files is determined by the configured file's extension:
#
# * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
# * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
# contain any value type.
# * `.json` - JSON. Must contain a single JSON _object_ (not an array).
#
# _NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of nested
# objects and arrays._
#
# To use different varfiles in different environments, you can template in the environment name to the varfile name,
# e.g. `varfile: "my-action.\$\{environment.name\}.env` (this assumes that the corresponding varfiles exist).
#
# If a listed varfile cannot be found, it is ignored.
varfiles: []

# Specify a _Build_ action, and resolve this action from the context of that Build.
#
# For example, you might create an `exec` Build which prepares some manifests, and then reference that in a
# `kubernetes` _Deploy_ action, and the resulting manifests from the Build.
#
# This would mean that instead of looking for manifest files relative to this action's location in your project
# structure, the output directory for the referenced `exec` Build would be the source.
build:

kind:

# Set a timeout for the run to complete, in seconds.
timeout: 600

spec:
  # The Compose project name. This field is usually unnecessary unless using several Compose projects together.
  projectName:

  # The name of the service.
  service:

  # Environment variables to set during execution.
  env: {}

  # Run the command as this user.
  user:

  # Path to workdir directory for this command.
  workdir:

  #
  #       Override the image's entrypoint. See
  # https://docs.docker.com/engine/reference/run/#entrypoint-default-command-to-execute-at-runtime for more details.
  #
  #
  # Example: `["/bin/sh"]`
  entrypoint:

  #
  #       The command that is executed in the container.
  #
  #       Note: If you're also providing an `entrypoint`, any arguments it requires should be passed here.
  #
  #       For example, if you wanted to run `/bin/sh -c echo "Hello world!"` in the container, you'd set
  #       `/bin/sh` as the `entrypoint`, and `["-c", "echo", "Hello world!"]` as the `cmd`.
  #
  #       These fields map to the `--entrypoint` and `--cmd` CLI options for `docker` run and
  #       `docker compose run`.
  #
  #       To learn more about how `entrypoint` and `cmd` work together in Docker, please check out the following
  # pages:
  #
  #       https://docs.docker.com/engine/reference/run/#cmd-default-command-or-options
  #
  #       https://docs.docker.com/engine/reference/builder/#cmd
  #
  #
  # Example: `["npm","run","test"]`
  command:

  # Assign a name to the container.
  name:

  # Run command with the service's ports enabled and mapped to the host.
  servicePorts: false

  # Connect the container to these networks.
  networks: []

  # Automatically remove the container when it exits.
  rm: true

  # Use the service's network useAliases in the network(s) the container connects to.
  useAliases: false

  # Bind mount one or more volumes.
  volumes: []
```

## Configuration Keys

### `type`

The type of action, e.g. `exec`, `container` or `kubernetes`. Some are built into Garden but mostly these will be defined by your configured providers.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `name`

A valid name for the action. Must be unique across all actions of the same _kind_ in your project.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `description`

A description of the action.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `source`

By default, the directory where the action is defined is used as the source for the build context.

You can override this by setting either `source.path` to another (POSIX-style) path relative to the action source directory, or `source.repository` to get the source from an external repository.

If using `source.path`, you must make sure the target path is in a git repository.

For `source.repository` behavior, please refer to the [Remote Sources guide](https://docs.garden.io/advanced/using-remote-sources).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `source.path`

[source](#source) > path

A relative POSIX-style path to the source directory for this action. You must make sure this path exists and is in a git repository!

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `source.repository`

[source](#source) > repository

When set, Garden will import the action source from this repository, but use this action configuration (and not scan for configs in the separate repository).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `source.repository.url`

[source](#source) > [repository](#sourcerepository) > url

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

| Type               | Required |
| ------------------ | -------- |
| `gitUrl \| string` | Yes      |

Example:

```yaml
source:
  ...
  repository:
    ...
    url: "git+https://github.com/org/repo.git#v2.0"
```

### `dependencies[]`

A list of other actions that this action depends on, and should be built, deployed or run (depending on the action type) before processing this action.

Each dependency should generally be expressed as a `"<kind>.<name>"` string, where _<kind>_ is one of `build`, `deploy`, `run` or `test`, and _<name>_ is the name of the action to depend on.

You may also optionally specify a dependency as an object, e.g. `{ kind: "Build", name: "some-image" }`.

Any empty values (i.e. null or empty strings) are ignored, so that you can conditionally add in a dependency via template expressions.

| Type                     | Default | Required |
| ------------------------ | ------- | -------- |
| `array[actionReference]` | `[]`    | No       |

Example:

```yaml
dependencies:
  - build.my-image
  - deploy.api
```

### `disabled`

Set this to `true` to disable the action. You can use this with conditional template strings to disable actions based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name == "prod"}`). This can be handy when you only need certain actions for specific environments, e.g. only for development.

For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or built).

For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored. Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the action is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `include[]`

Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will affect the computed _version_ of the action.

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run when certain files are modified.

_Build_ actions have a different behavior, since they generally are based on some files in the source tree, so please reference the docs for more information on those.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
include:
  - my-app.js
  - some-assets/**/*
```

### `exclude[]`

Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's version.

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set `include` paths, or such paths inferred by providers. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect those, if you have large directories that should not be watched for changes.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
exclude:
  - tmp/**/*
  - '*.log'
```

### `variables`

A map of variables scoped to this particular action. These are resolved before any other parts of the action configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in that order. They may reference group-scoped and project-scoped variables, and generally can use any template strings normally allowed when resolving the action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `varfiles[]`

Specify a list of paths (relative to the directory where the action is defined) to a file containing variables, that we apply on top of the action-level `variables` field, and take precedence over group-level variables (if applicable) and project-level variables, in that order.

If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the previous ones.

The format of the files is determined by the configured file's extension:

* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type.
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

To use different varfiles in different environments, you can template in the environment name to the varfile name, e.g. `varfile: "my-action.\$\{environment.name\}.env` (this assumes that the corresponding varfiles exist).

If a listed varfile cannot be found, it is ignored.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

Example:

```yaml
varfiles:
  "my-action.env"
```

### `build`

Specify a _Build_ action, and resolve this action from the context of that Build.

For example, you might create an `exec` Build which prepares some manifests, and then reference that in a `kubernetes` _Deploy_ action, and the resulting manifests from the Build.

This would mean that instead of looking for manifest files relative to this action's location in your project structure, the output directory for the referenced `exec` Build would be the source.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `kind`

| Type     | Allowed Values | Required |
| -------- | -------------- | -------- |
| `string` | "Run"          | Yes      |

### `timeout`

Set a timeout for the run to complete, in seconds.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `600`   | No       |

### `spec`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.projectName`

[spec](#spec) > projectName

The Compose project name. This field is usually unnecessary unless using several Compose projects together.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.service`

[spec](#spec) > service

The name of the service.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.env`

[spec](#spec) > env

Environment variables to set during execution.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `spec.user`

[spec](#spec) > user

Run the command as this user.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.workdir`

[spec](#spec) > workdir

Path to workdir directory for this command.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.entrypoint`

[spec](#spec) > entrypoint


      Override the image's entrypoint. See https://docs.docker.com/engine/reference/run/#entrypoint-default-command-to-execute-at-runtime for more details.
    

Example: `["/bin/sh"]`

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.command[]`

[spec](#spec) > command


      The command that is executed in the container.

      Note: If you're also providing an `entrypoint`, any arguments it requires should be passed here.

      For example, if you wanted to run `/bin/sh -c echo "Hello world!"` in the container, you'd set
      `/bin/sh` as the `entrypoint`, and `["-c", "echo", "Hello world!"]` as the `cmd`.

      These fields map to the `--entrypoint` and `--cmd` CLI options for `docker` run and
      `docker compose run`.

      To learn more about how `entrypoint` and `cmd` work together in Docker, please check out the following pages:

      https://docs.docker.com/engine/reference/run/#cmd-default-command-or-options

      https://docs.docker.com/engine/reference/builder/#cmd
    

Example: `["npm","run","test"]`

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.name`

[spec](#spec) > name

Assign a name to the container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.servicePorts`

[spec](#spec) > servicePorts

Run command with the service's ports enabled and mapped to the host.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.networks[]`

[spec](#spec) > networks

Connect the container to these networks.

| Type    | Default | Required |
| ------- | ------- | -------- |
| `array` | `[]`    | No       |

### `spec.rm`

[spec](#spec) > rm

Automatically remove the container when it exits.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `spec.useAliases`

[spec](#spec) > useAliases

Use the service's network useAliases in the network(s) the container connects to.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.volumes[]`

[spec](#spec) > volumes

Bind mount one or more volumes.

| Type    | Default | Required |
| ------- | ------- | -------- |
| `array` | `[]`    | No       |


## Outputs

The following keys are available via the `${actions.run.<name>}` template string key for `docker-compose-run`
action.

### `${actions.run.<name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.run.<name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.run.my-run.disabled}
```

### `${actions.run.<name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.my-run.buildPath}
```

### `${actions.run.<name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.run.my-run.sourcePath}
```

### `${actions.run.<name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.run.my-run.mode}
```

### `${actions.run.<name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.run.<name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |
