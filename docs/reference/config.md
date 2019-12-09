---
order: 3
title: Config Files Reference
---

# garden.yml reference

Below is the schema reference for the [Project](#project-configuration-keys) and [Module](#module-configuration-keys) `garden.yml` configuration files. For an introduction to configuring a Garden project,
please look at our [configuration guide](../guides/configuration-files.md).

The reference is divided into four sections. The [first section](#project-yaml-schema) contains the project level YAML schema, and the [second section](#project-configuration-keys) describes each individual schema key for the project level configuration.

The [third section](#module-yaml-schema) contains the module level YAML schema, and the [fourth section](#module-configuration-keys) describes each individual schema key for the module level configuration.

Note that individual providers, e.g. `kubernetes`, add their own project level configuration keys. The provider types are listed on the [Providers page](./providers/README.md).

Likewise, individual module types, e.g. `container`, add additional configuration keys at the module level. Module types are listed on the [Module Types page](./module-types/README.md).

Please refer to those for more details on provider and module configuration.

## Project YAML schema

The values in the schema below are the default values.

```yaml
# The schema version of this project's config (currently not used).
apiVersion: garden.io/v0

kind: Project

# The name of the project.
name:

# The default environment to use when calling commands without the `--env` parameter.
defaultEnvironment: ''

# Specify a list of filenames that should be used as ".ignore" files across the project, using the
# same syntax and semantics as `.gitignore` files. By default, patterns matched in `.gitignore`
# and `.gardenignore` files, found anywhere in the project, are ignored when scanning for modules
# and module sources.
# Note that these take precedence over the project `module.include` field, and module `include`
# fields, so any paths matched by the .ignore files will be ignored even if they are explicitly
# specified in those fields.
# See the [Configuration Files guide]
# (https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)
# for details.
dotIgnoreFiles:
  - .gitignore
  - .gardenignore

modules:
  # Specify a list of POSIX-style paths or globs that should be scanned for Garden modules.
  #
  # Note that you can also _exclude_ path using the `exclude` field or by placing `.gardenignore`
  # files in your
  # source tree, which use the same format as `.gitignore` files. See the
  # [Configuration Files
  # guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)
  # for details.
  #
  # Unlike the `exclude` field, the paths/globs specified here have _no effect_ on which files and
  # directories
  # Garden watches for changes. Use the `exclude` field to affect those, if you have large
  # directories that
  # should not be watched for changes.
  #
  # Also note that specifying an empty list here means _no paths_ should be included.
  include:

  # Specify a list of POSIX-style paths or glob patterns that should be excluded when scanning for
  # modules.
  #
  # The filters here also affect which files and directories are watched for changes. So if you
  # have a large number
  # of directories in your project that should not be watched, you should specify them here.
  #
  # For example, you might want to exclude large vendor directories in your project from being
  # scanned and
  # watched:
  #
  # ```yaml
  # modules:
  #   exclude:
  #     - node_modules/**/*
  #     - vendor/**/*
  # ```
  #
  # Note that you can also explicitly _include_ files using the `include` field. If you also
  # specify the
  # `include` field, the paths/patterns specified here are filtered from the files matched by
  # `include`.
  #
  # The `include` field does _not_ affect which files are watched.
  #
  # See the [Configuration Files
  # guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)
  # for details.
  exclude:

# A list of providers that should be used for this project, and their configuration. Please refer
# to individual plugins/providers for details on how to configure them.
providers:
  # The name of the provider plugin to use.
  - name:
    # If specified, this provider will only be used in the listed environments. Note that an empty
    # array effectively disables the provider. To use a provider in all environments, omit this
    # field.
    environments:

# A list of remote sources to import into project.
sources:
  # The name of the source to import
  - name:
    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix
    # pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:

# Specify a path (relative to the project root) to a file containing variables, that we apply on
# top of the
# project-wide `variables` field. The file should be in a standard "dotenv" format, specified
# [here](https://github.com/motdotla/dotenv#rules).
#
# If you don't set the field and the `garden.env` file does not exist, we simply ignore it.
# If you do override the default value and the file doesn't exist, an error will be thrown.
#
# _Note that in many cases it is advisable to only use environment-specific var files, instead of
# combining
# multiple ones. See the `environments[].varfile` field for this option._
varfile: garden.env

# Variables to configure for all environments.
variables: {}

environments:
  # Specify a path (relative to the project root) to a file containing variables, that we apply
  # on top of the
  # _environment-specific_ `variables` field. The file should be in a standard "dotenv" format,
  # specified
  # [here](https://github.com/motdotla/dotenv#rules).
  #
  # If you don't set the field and the `garden.<env-name>.env` file does not exist,
  # we simply ignore it. If you do override the default value and the file doesn't exist, an
  # error will be thrown.
  - varfile: garden.<env-name>.env
    # A key/value map of variables that modules can reference when using this environment. These
    # take precedence over variables defined in the top-level `variables` field.
    variables: {}
    # The name of the environment.
    name:
    # Flag the environment as a production environment.
    #
    # Setting this flag to `true` will activate the protection on the `deploy`, `test`, `task`,
    # `build`,
    # `init` and `dev` commands. A protected command will ask for a user confirmation every time
    # is run agains
    # an environment marked as production.
    # Run the command with the "--yes" flag to skip the check (e.g. when running Garden in CI).
    #
    # This flag is also passed on to every provider, and may affect how certain providers behave.
    # For more details please check the documentation for the providers in use.
    production: false
```

## Project configuration keys


### `apiVersion`

The schema version of this project's config (currently not used).

| Type     | Required | Allowed Values | Default          |
| -------- | -------- | -------------- | ---------------- |
| `string` | Yes      | "garden.io/v0" | `"garden.io/v0"` |

### `kind`

| Type     | Required | Allowed Values | Default     |
| -------- | -------- | -------------- | ----------- |
| `string` | Yes      | "Project"      | `"Project"` |

### `name`

The name of the project.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
name: "my-sweet-project"
```

### `defaultEnvironment`

The default environment to use when calling commands without the `--env` parameter.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `""`    |

### `dotIgnoreFiles`

Specify a list of filenames that should be used as ".ignore" files across the project, using the same syntax and semantics as `.gitignore` files. By default, patterns matched in `.gitignore` and `.gardenignore` files, found anywhere in the project, are ignored when scanning for modules and module sources.
Note that these take precedence over the project `module.include` field, and module `include` fields, so any paths matched by the .ignore files will be ignored even if they are explicitly specified in those fields.
See the [Configuration Files guide] (https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.

| Type            | Required | Default                          |
| --------------- | -------- | -------------------------------- |
| `array[string]` | No       | `[".gitignore",".gardenignore"]` |

### `modules`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `modules.include[]`

[modules](#modules) > include

Specify a list of POSIX-style paths or globs that should be scanned for Garden modules.

Note that you can also _exclude_ path using the `exclude` field or by placing `.gardenignore` files in your
source tree, which use the same format as `.gitignore` files. See the
[Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.

Unlike the `exclude` field, the paths/globs specified here have _no effect_ on which files and directories
Garden watches for changes. Use the `exclude` field to affect those, if you have large directories that
should not be watched for changes.

Also note that specifying an empty list here means _no paths_ should be included.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
modules:
  ...
  include:
    - modules/**/*
```

### `modules.exclude[]`

[modules](#modules) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded when scanning for modules.

The filters here also affect which files and directories are watched for changes. So if you have a large number
of directories in your project that should not be watched, you should specify them here.

For example, you might want to exclude large vendor directories in your project from being scanned and
watched:

```yaml
modules:
  exclude:
    - node_modules/**/*
    - vendor/**/*
```

Note that you can also explicitly _include_ files using the `include` field. If you also specify the
`include` field, the paths/patterns specified here are filtered from the files matched by `include`.

The `include` field does _not_ affect which files are watched.

See the [Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
modules:
  ...
  exclude:
    - public/**/*
    - tmp/**/*
```

### `providers`

A list of providers that should be used for this project, and their configuration. Please refer to individual plugins/providers for details on how to configure them.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - name: "local-kubernetes"
```

### `providers[].environments[]`

[providers](#providers) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
providers:
  - environments:
    - dev
    - stage
```

### `sources`

A list of remote sources to import into project.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

### `sources[].name`

[sources](#sources) > name

The name of the source to import

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `sources[].repositoryUrl`

[sources](#sources) > repositoryUrl

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
sources:
  - repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

### `varfile`

Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
project-wide `variables` field. The file should be in a standard "dotenv" format, specified
[here](https://github.com/motdotla/dotenv#rules).

If you don't set the field and the `garden.env` file does not exist, we simply ignore it.
If you do override the default value and the file doesn't exist, an error will be thrown.

_Note that in many cases it is advisable to only use environment-specific var files, instead of combining
multiple ones. See the `environments[].varfile` field for this option._

| Type     | Required | Default        |
| -------- | -------- | -------------- |
| `string` | No       | `"garden.env"` |

### `variables`

Variables to configure for all environments.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `object` | No       | `{}`    |

### `environments`

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `environments[].varfile`

[environments](#environments) > varfile

Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
_environment-specific_ `variables` field. The file should be in a standard "dotenv" format, specified
[here](https://github.com/motdotla/dotenv#rules).

If you don't set the field and the `garden.<env-name>.env` file does not exist,
we simply ignore it. If you do override the default value and the file doesn't exist, an error will be thrown.

| Type     | Required | Default                   |
| -------- | -------- | ------------------------- |
| `string` | No       | `"garden.<env-name>.env"` |

### `environments[].variables`

[environments](#environments) > variables

A key/value map of variables that modules can reference when using this environment. These take precedence over variables defined in the top-level `variables` field.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `object` | No       | `{}`    |

### `environments[].name`

[environments](#environments) > name

The name of the environment.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `environments[].production`

[environments](#environments) > production

Flag the environment as a production environment.

Setting this flag to `true` will activate the protection on the `deploy`, `test`, `task`, `build`,
`init` and `dev` commands. A protected command will ask for a user confirmation every time is run agains
an environment marked as production.
Run the command with the "--yes" flag to skip the check (e.g. when running Garden in CI).

This flag is also passed on to every provider, and may affect how certain providers behave.
For more details please check the documentation for the providers in use.

| Type      | Required | Default |
| --------- | -------- | ------- |
| `boolean` | No       | `false` |


## Module YAML schema
```yaml
# The schema version of this module's config (currently not used).
apiVersion: garden.io/v0

kind: Module

# The type of this module.
type:

# The name of this module.
name:

description:

# Specify a list of POSIX-style paths or globs that should be regarded as the source files for
# this
# module. Files that do *not* match these paths or globs are excluded when computing the version
# of the module,
# when responding to filesystem watch events, and when staging builds.
#
# Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore`
# files in your
# source tree, which use the same format as `.gitignore` files. See the
# [Configuration Files
# guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)
# for details.
#
# Also note that specifying an empty list here means _no sources_ should be included.
include:

# Specify a list of POSIX-style paths or glob patterns that should be excluded from the module.
# Files that
# match these paths or globs are excluded when computing the version of the module, when
# responding to filesystem
# watch events, and when staging builds.
#
# Note that you can also explicitly _include_ files using the `include` field. If you also specify
# the
# `include` field, the files/patterns specified here are filtered from the files matched by
# `include`. See the
# [Configuration Files
# guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)for
# details.
#
# Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on
# which files
# and directories are watched for changes. Use the project `modules.exclude` field to affect
# those, if you have
# large directories that should not be watched for changes.
exclude:

# A remote repository URL. Currently only supports git servers. Must contain a hash suffix
# pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>
#
# Garden will import the repository source code into this module, but read the module's
# config from the local garden.yml file.
repositoryUrl:

# When false, disables pushing this module to remote registries.
allowPublish: true

# Specify how to build the module. Note that plugins may define additional keys on this object.
build:
  # A list of modules that must be built before this module is built.
  dependencies:
    # Module name to build ahead of this module.
    - name:
      # Specify one or more files or directories to copy from the built dependency to this module.
      copy:
        # POSIX-style path or filename of the directory or file(s) to copy to the target.
        - source:
          # POSIX-style path or filename to copy the directory or file(s), relative to the build
          # directory.
          # Defaults to to same as source path.
          target: <same as source path>
```

## Module configuration keys


### `apiVersion`

The schema version of this module's config (currently not used).

| Type     | Required | Allowed Values | Default          |
| -------- | -------- | -------------- | ---------------- |
| `string` | Yes      | "garden.io/v0" | `"garden.io/v0"` |

### `kind`

| Type     | Required | Allowed Values | Default    |
| -------- | -------- | -------------- | ---------- |
| `string` | Yes      | "Module"       | `"Module"` |

### `type`

The type of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
type: "container"
```

### `name`

The name of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
name: "my-sweet-module"
```

### `description`

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `include`

Specify a list of POSIX-style paths or globs that should be regarded as the source files for this
module. Files that do *not* match these paths or globs are excluded when computing the version of the module,
when responding to filesystem watch events, and when staging builds.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
source tree, which use the same format as `.gitignore` files. See the
[Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.

Also note that specifying an empty list here means _no sources_ should be included.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
include:
  - Dockerfile
  - my-app.js
```

### `exclude`

Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that
match these paths or globs are excluded when computing the version of the module, when responding to filesystem
watch events, and when staging builds.

Note that you can also explicitly _include_ files using the `include` field. If you also specify the
`include` field, the files/patterns specified here are filtered from the files matched by `include`. See the
[Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)for details.

Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on which files
and directories are watched for changes. Use the project `modules.exclude` field to affect those, if you have
large directories that should not be watched for changes.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
exclude:
  - tmp/**/*
  - '*.log'
```

### `repositoryUrl`

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

Garden will import the repository source code into this module, but read the module's
config from the local garden.yml file.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

### `allowPublish`

When false, disables pushing this module to remote registries.

| Type      | Required | Default |
| --------- | -------- | ------- |
| `boolean` | No       | `true`  |

### `build`

Specify how to build the module. Note that plugins may define additional keys on this object.

| Type     | Required | Default               |
| -------- | -------- | --------------------- |
| `object` | No       | `{"dependencies":[]}` |

### `build.dependencies[]`

[build](#build) > dependencies

A list of modules that must be built before this module is built.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

Example:

```yaml
build:
  ...
  dependencies:
    - name: some-other-module-name
```

### `build.dependencies[].name`

[build](#build) > [dependencies](#builddependencies) > name

Module name to build ahead of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `build.dependencies[].copy[]`

[build](#build) > [dependencies](#builddependencies) > copy

Specify one or more files or directories to copy from the built dependency to this module.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

### `build.dependencies[].copy[].source`

[build](#build) > [dependencies](#builddependencies) > [copy](#builddependenciescopy) > source

POSIX-style path or filename of the directory or file(s) to copy to the target.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `build.dependencies[].copy[].target`

[build](#build) > [dependencies](#builddependencies) > [copy](#builddependenciescopy) > target

POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
Defaults to to same as source path.

| Type     | Required | Default                   |
| -------- | -------- | ------------------------- |
| `string` | No       | `"<same as source path>"` |


