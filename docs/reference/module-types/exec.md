---
title: "`exec` Module Type"
tocTitle: "`exec`"
---

# `exec` Module Type

{% hint style="warning" %}
Modules are deprecated and will be removed in version `0.14`. Please use [action](../../getting-started/basics.md#anatomy-of-a-garden-action)-based configuration instead. See the [0.12 to Bonsai migration guide](../../misc/migrating-to-bonsai.md) for details.
{% endhint %}

## Description

A general-purpose module for executing commands in your shell. This can be a useful escape hatch if no other module type fits your needs, and you just need to execute something (as opposed to deploy it, track its status etc.).

By default, the `exec` module type executes the commands in the Garden build directory
(under .garden/build/<module-name>). By setting `local: true`, the commands are executed in the module
source directory instead.

Note that Garden does not sync the source code for local exec modules into the Garden build directory.
This means that include/exclude filters and ignore files are not applied to local exec modules, as the
filtering is done during the sync.

Below is the full schema reference.

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`exec` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
kind: Module

# The type of this module.
type:

# The name of this module.
name:

# Specify how to build the module. Note that plugins may define additional keys on this object.
build:
  # A list of modules that must be built before this module is built.
  dependencies:
    - # Module name to build ahead of this module.
      name:

      # Specify one or more files or directories to copy from the built dependency to this module.
      copy:
        - # POSIX-style path or filename of the directory or file(s) to copy to the target.
          source:

          # POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
          # Defaults to the same as source path.
          target:

  # Maximum time in seconds to wait for build to finish.
  timeout: 600

  # The command to run to perform the build.
  #
  # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
  # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
  command: []

  # The command to run to check the status of the build.
  #
  # If this is specified, it is run before the build `command`. If the status command runs successfully and returns
  # exit code of 0, the build is considered already complete and the `command` is not run. To indicate that the build
  # is not complete, the status command should return a non-zero exit code.
  #
  # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
  # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
  statusCommand: []

# If set to true, Garden will run the build command, services, tests, and tasks in the module source directory,
# instead of in the Garden build directory (under .garden/build/<module-name>).
#
# Garden will therefore not stage the build for local modules. This means that include/exclude filters
# and ignore files are not applied to local modules, except to calculate the module/action versions.
#
# If you use use `build.dependencies[].copy` for one or more build dependencies of this module, the copied files
# will be copied to the module source directory (instead of the build directory, as is the default case when
# `local = false`).
#
# Note: This maps to the `buildAtSource` option in this module's generated Build action (if any).
local: false

# A description of the module.
description:

# Set this to `true` to disable the module. You can use this with conditional template strings to disable modules
# based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name == "prod"}`).
# This can be handy when you only need certain modules for specific environments, e.g. only for development.
#
# Disabling a module means that any services, tasks and tests contained in it will not be build, deployed or run.
#
# If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden will
# automatically ignore those dependency declarations. Note however that template strings referencing the module's
# service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so you need to make
# sure to provide alternate values for those if you're using them, using conditional expressions.
disabled: false

# Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files that
# do *not* match these paths or globs are excluded when computing the version of the module, when responding to
# filesystem watch events, and when staging builds.
#
# Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source
# tree, which use the same format as `.gitignore` files. See the [Configuration Files
# guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
# for details.
#
# Also note that specifying an empty list here means _no sources_ should be included.
include:

# Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match these
# paths or globs are excluded when computing the version of the module, when responding to filesystem watch events,
# and when staging builds.
#
# Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include`
# field, the files/patterns specified here are filtered from the files matched by `include`. See the [Configuration
# Files
# guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
# for details.
#
# Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
# directories are watched for changes. Use the project `scan.exclude` field to affect those, if you have large
# directories that should not be watched for changes.
exclude:

# A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
# branch or tag, with the format: <git remote url>#<branch|tag>
#
# Garden will import the repository source code into this module, but read the module's config from the local
# garden.yml file.
repositoryUrl:

# When false, disables pushing this module to remote registries via the publish command.
allowPublish: true

# A list of files to write to the module directory when resolving this module. This is useful to automatically
# generate (and template) any supporting files needed for the module.
generateFiles:
  - # POSIX-style filename to read the source file contents from, relative to the path of the module (or the
    # ConfigTemplate configuration file if one is being applied).
    # This file may contain template strings, much like any other field in the configuration.
    sourcePath:

    # POSIX-style filename to write the resolved file contents to, relative to the path of the module source directory
    # (for remote modules this means the root of the module repository, otherwise the directory of the module
    # configuration).
    #
    # Note that any existing file with the same name will be overwritten. If the path contains one or more
    # directories, they will be automatically created if missing.
    targetPath:

    # By default, Garden will attempt to resolve any Garden template strings in source files. Set this to false to
    # skip resolving template strings. Note that this does not apply when setting the `value` field, since that's
    # resolved earlier when parsing the configuration.
    resolveTemplates: true

    # The desired file contents as a string.
    value:

# A map of variables scoped to this particular module. These are resolved before any other parts of the module
# configuration and take precedence over project-scoped variables. They may reference project-scoped variables, and
# generally use any template strings normally allowed when resolving modules.
variables:

# Specify a path (relative to the module root) to a file containing variables, that we apply on top of the
# module-level `variables` field.
#
# The format of the files is determined by the configured file's extension:
#
# * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
# contain any value type. YAML format is used by default.
# * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
# * `.json` - JSON. Must contain a single JSON _object_ (not an array).
#
# _NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of nested
# objects and arrays._
#
# To use different module-level varfiles in different environments, you can template in the environment name
# to the varfile name, e.g. `varfile: "my-module.${environment.name}.env` (this assumes that the corresponding
# varfiles exist).
varfile:

# Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
# `GARDEN`) and values must be primitives.
env: {}

# A list of services to deploy from this module.
services:
  - # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter,
    # and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer than 63
    # characters.
    name:

    # The names of any services that this service depends on at runtime, and the names of any tasks that should be
    # executed before this service is deployed.
    # You may also depend on Deploy and Run actions, but please note that you cannot reference those actions in
    # template strings.
    dependencies: []

    # Set this to `true` to disable the service. You can use this with conditional template strings to enable/disable
    # services based on, for example, the current environment or other variables (e.g. `enabled: ${environment.name !=
    # "prod"}`). This can be handy when you only need certain services for specific environments, e.g. only for
    # development.
    #
    # Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a runtime
    # dependency for another service, test or task.
    #
    # Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to resolve
    # when the service is disabled, so you need to make sure to provide alternate values for those if you're using
    # them, using conditional expressions.
    disabled: false

    # The command to run to deploy the service.
    #
    # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
    # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
    deployCommand:

    # Optionally set a command to check the status of the service. If this is specified, it is run before the
    # `deployCommand`. If the command runs successfully and returns exit code of 0, the service is considered
    # already deployed and the `deployCommand` is not run.
    #
    # If this is not specified, the service is always reported as "unknown", so it's highly recommended to specify
    # this command if possible.
    #
    # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
    # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
    statusCommand:

    # Optionally set a command to clean the service up, e.g. when running `garden delete env`.
    #
    # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
    # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
    cleanupCommand:

    # The maximum duration (in seconds) to wait for a local script to exit.
    timeout: 600

    # Environment variables to set when running the deploy and status commands.
    env: {}

    syncMode:
      # The command to run to deploy the service in sync mode. When in sync mode, Garden assumes that
      # the command starts a persistent process and does not wait for it return. The logs from the process
      # can be retrieved via the `garden logs` command as usual.
      #
      # If a `statusCommand` is set, Garden will wait until it returns a zero exit code before considering
      # the service ready. Otherwise it considers the service immediately ready.
      #
      # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
      # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
      command:

      # Optionally set a command to check the status of the service in sync mode. Garden will run the status command
      # at an interval until it returns a zero exit code or times out.
      #
      # If no `statusCommand` is set, Garden will consider the service ready as soon as it has started the process.
      #
      # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
      # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
      statusCommand:

      # The maximum duration (in seconds) to wait for a for the `statusCommand` to return a zero
      # exit code. Ignored if no `statusCommand` is set.
      timeout: 10

# A list of tasks that can be run in this module.
tasks:
  - # The name of the task.
    name:

    # A description of the task.
    description:

    # The names of any tasks that must be executed, and the names of any services that must be running, before this
    # task is executed.
    # You may also depend on Deploy and Run actions, but please note that you cannot reference those actions in
    # template strings.
    dependencies: []

    # Set this to `true` to disable the task. You can use this with conditional template strings to enable/disable
    # tasks based on, for example, the current environment or other variables (e.g. `enabled: ${environment.name !=
    # "prod"}`). This can be handy when you only want certain tasks to run in specific environments, e.g. only for
    # development.
    #
    # Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime
    # dependency for another service, test or task.
    #
    # Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to resolve
    # when the task is disabled, so you need to make sure to provide alternate values for those if you're using them,
    # using conditional expressions.
    disabled: false

    # Maximum duration (in seconds) of the task's execution.
    timeout: 600

    # A list of artifacts to copy after the task run.
    artifacts:
      - # A POSIX-style path or glob to copy, relative to the build root.
        source:

        # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at
        # `.garden/artifacts`.
        target: .

    # The command to run.
    #
    # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
    # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
    command:

    # The command to run to check the status of the task.
    #
    # If this is specified, it is run before the `command`. If the status command runs successfully and returns exit
    # code of 0, the task is considered already complete and the `command` is not run. To indicate that the task is
    # not complete, the status command should return a non-zero exit code.
    #
    # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
    # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
    statusCommand:

    # Environment variables to set when running the command.
    env: {}

# A list of tests to run in the module.
tests:
  - # The name of the test.
    name:

    # The names of any services that must be running, and the names of any tasks that must be executed, before the
    # test is run.
    dependencies: []

    # Set this to `true` to disable the test. You can use this with conditional template strings to
    # enable/disable tests based on, for example, the current environment or other variables (e.g.
    # `enabled: ${environment.name != "prod"}`). This is handy when you only want certain tests to run in
    # specific environments, e.g. only during CI.
    disabled: false

    # Maximum duration (in seconds) of the test run.
    timeout: 600

    # The command to run to test the module.
    #
    # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
    # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
    command:

    # The command to run to check the status of the test.
    #
    # If this is specified, it is run before the `command`. If the status command runs successfully and returns exit
    # code of 0, the test is considered already complete and the `command` is not run. To indicate that the test is
    # not complete, the status command should return a non-zero exit code.
    #
    # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
    # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
    statusCommand:

    # Environment variables to set when running the command.
    env: {}

    # A list of artifacts to copy after the test run.
    artifacts:
      - # A POSIX-style path or glob to copy, relative to the build root.
        source:

        # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at
        # `.garden/artifacts`.
        target: .
```

## Configuration Keys

### `kind`

| Type     | Allowed Values | Default    | Required |
| -------- | -------------- | ---------- | -------- |
| `string` | "Module"       | `"Module"` | Yes      |

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

### `build`

Specify how to build the module. Note that plugins may define additional keys on this object.

| Type     | Default               | Required |
| -------- | --------------------- | -------- |
| `object` | `{"dependencies":[]}` | No       |

### `build.dependencies[]`

[build](#build) > dependencies

A list of modules that must be built before this module is built.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

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

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `build.dependencies[].copy[].source`

[build](#build) > [dependencies](#builddependencies) > [copy](#builddependenciescopy) > source

POSIX-style path or filename of the directory or file(s) to copy to the target.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `build.dependencies[].copy[].target`

[build](#build) > [dependencies](#builddependencies) > [copy](#builddependenciescopy) > target

POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
Defaults to the same as source path.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `build.timeout`

[build](#build) > timeout

Maximum time in seconds to wait for build to finish.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `600`   | No       |

### `build.command[]`

[build](#build) > command

The command to run to perform the build.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

Example:

```yaml
build:
  ...
  command:
    - npm
    - run
    - build
```

### `build.statusCommand[]`

[build](#build) > statusCommand

The command to run to check the status of the build.

If this is specified, it is run before the build `command`. If the status command runs successfully and returns exit code of 0, the build is considered already complete and the `command` is not run. To indicate that the build is not complete, the status command should return a non-zero exit code.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `local`

If set to true, Garden will run the build command, services, tests, and tasks in the module source directory,
instead of in the Garden build directory (under .garden/build/<module-name>).

Garden will therefore not stage the build for local modules. This means that include/exclude filters
and ignore files are not applied to local modules, except to calculate the module/action versions.

If you use use `build.dependencies[].copy` for one or more build dependencies of this module, the copied files
will be copied to the module source directory (instead of the build directory, as is the default case when
`local = false`).

Note: This maps to the `buildAtSource` option in this module's generated Build action (if any).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `description`

A description of the module.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `disabled`

Set this to `true` to disable the module. You can use this with conditional template strings to disable modules based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name == "prod"}`). This can be handy when you only need certain modules for specific environments, e.g. only for development.

Disabling a module means that any services, tasks and tests contained in it will not be build, deployed or run.

If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden will automatically ignore those dependency declarations. Note however that template strings referencing the module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `include[]`

Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files that do *not* match these paths or globs are excluded when computing the version of the module, when responding to filesystem watch events, and when staging builds.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Also note that specifying an empty list here means _no sources_ should be included.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
include:
  - Dockerfile
  - my-app.js
```

### `exclude[]`

Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match these paths or globs are excluded when computing the version of the module, when responding to filesystem watch events, and when staging builds.

Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include` field, the files/patterns specified here are filtered from the files matched by `include`. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes. Use the project `scan.exclude` field to affect those, if you have large directories that should not be watched for changes.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
exclude:
  - tmp/**/*
  - '*.log'
```

### `repositoryUrl`

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

Garden will import the repository source code into this module, but read the module's config from the local garden.yml file.

| Type               | Required |
| ------------------ | -------- |
| `gitUrl \| string` | No       |

Example:

```yaml
repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

### `allowPublish`

When false, disables pushing this module to remote registries via the publish command.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `generateFiles[]`

A list of files to write to the module directory when resolving this module. This is useful to automatically generate (and template) any supporting files needed for the module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `generateFiles[].sourcePath`

[generateFiles](#generatefiles) > sourcePath

POSIX-style filename to read the source file contents from, relative to the path of the module (or the ConfigTemplate configuration file if one is being applied).
This file may contain template strings, much like any other field in the configuration.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `generateFiles[].targetPath`

[generateFiles](#generatefiles) > targetPath

POSIX-style filename to write the resolved file contents to, relative to the path of the module source directory (for remote modules this means the root of the module repository, otherwise the directory of the module configuration).

Note that any existing file with the same name will be overwritten. If the path contains one or more directories, they will be automatically created if missing.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `generateFiles[].resolveTemplates`

[generateFiles](#generatefiles) > resolveTemplates

By default, Garden will attempt to resolve any Garden template strings in source files. Set this to false to skip resolving template strings. Note that this does not apply when setting the `value` field, since that's resolved earlier when parsing the configuration.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `generateFiles[].value`

[generateFiles](#generatefiles) > value

The desired file contents as a string.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `variables`

A map of variables scoped to this particular module. These are resolved before any other parts of the module configuration and take precedence over project-scoped variables. They may reference project-scoped variables, and generally use any template strings normally allowed when resolving modules.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `varfile`

Specify a path (relative to the module root) to a file containing variables, that we apply on top of the
module-level `variables` field.

The format of the files is determined by the configured file's extension:

* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type. YAML format is used by default.
* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

To use different module-level varfiles in different environments, you can template in the environment name
to the varfile name, e.g. `varfile: "my-module.${environment.name}.env` (this assumes that the corresponding
varfiles exist).

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
varfile: "my-module.env"
```

### `env`

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `services[]`

A list of services to deploy from this module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `services[].name`

[services](#services) > name

Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `services[].dependencies[]`

[services](#services) > dependencies

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.
You may also depend on Deploy and Run actions, but please note that you cannot reference those actions in template strings.

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `array[alternatives]` | `[]`    | No       |

### `services[].disabled`

[services](#services) > disabled

Set this to `true` to disable the service. You can use this with conditional template strings to enable/disable services based on, for example, the current environment or other variables (e.g. `enabled: ${environment.name != "prod"}`). This can be handy when you only need certain services for specific environments, e.g. only for development.

Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a runtime dependency for another service, test or task.

Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to resolve when the service is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `services[].deployCommand[]`

[services](#services) > deployCommand

The command to run to deploy the service.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | Yes      |

### `services[].statusCommand[]`

[services](#services) > statusCommand

Optionally set a command to check the status of the service. If this is specified, it is run before the
`deployCommand`. If the command runs successfully and returns exit code of 0, the service is considered
already deployed and the `deployCommand` is not run.

If this is not specified, the service is always reported as "unknown", so it's highly recommended to specify
this command if possible.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `services[].cleanupCommand[]`

[services](#services) > cleanupCommand

Optionally set a command to clean the service up, e.g. when running `garden delete env`.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `services[].timeout`

[services](#services) > timeout

The maximum duration (in seconds) to wait for a local script to exit.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `600`   | No       |

### `services[].env`

[services](#services) > env

Environment variables to set when running the deploy and status commands.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `services[].syncMode`

[services](#services) > syncMode

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `services[].syncMode.command[]`

[services](#services) > [syncMode](#servicessyncmode) > command

The command to run to deploy the service in sync mode. When in sync mode, Garden assumes that
the command starts a persistent process and does not wait for it return. The logs from the process
can be retrieved via the `garden logs` command as usual.

If a `statusCommand` is set, Garden will wait until it returns a zero exit code before considering
the service ready. Otherwise it considers the service immediately ready.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `services[].syncMode.statusCommand[]`

[services](#services) > [syncMode](#servicessyncmode) > statusCommand

Optionally set a command to check the status of the service in sync mode. Garden will run the status command
at an interval until it returns a zero exit code or times out.

If no `statusCommand` is set, Garden will consider the service ready as soon as it has started the process.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `services[].syncMode.timeout`

[services](#services) > [syncMode](#servicessyncmode) > timeout

The maximum duration (in seconds) to wait for a for the `statusCommand` to return a zero
exit code. Ignored if no `statusCommand` is set.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `10`    | No       |

### `tasks[]`

A list of tasks that can be run in this module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `tasks[].name`

[tasks](#tasks) > name

The name of the task.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `tasks[].description`

[tasks](#tasks) > description

A description of the task.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tasks[].dependencies[]`

[tasks](#tasks) > dependencies

The names of any tasks that must be executed, and the names of any services that must be running, before this task is executed.
You may also depend on Deploy and Run actions, but please note that you cannot reference those actions in template strings.

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `array[alternatives]` | `[]`    | No       |

### `tasks[].disabled`

[tasks](#tasks) > disabled

Set this to `true` to disable the task. You can use this with conditional template strings to enable/disable tasks based on, for example, the current environment or other variables (e.g. `enabled: ${environment.name != "prod"}`). This can be handy when you only want certain tasks to run in specific environments, e.g. only for development.

Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime dependency for another service, test or task.

Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to resolve when the task is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `tasks[].timeout`

[tasks](#tasks) > timeout

Maximum duration (in seconds) of the task's execution.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `600`   | No       |

### `tasks[].artifacts[]`

[tasks](#tasks) > artifacts

A list of artifacts to copy after the task run.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `tasks[].artifacts[].source`

[tasks](#tasks) > [artifacts](#tasksartifacts) > source

A POSIX-style path or glob to copy, relative to the build root.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `tasks[].artifacts[].target`

[tasks](#tasks) > [artifacts](#tasksartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

### `tasks[].command[]`

[tasks](#tasks) > command

The command to run.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | Yes      |

### `tasks[].statusCommand[]`

[tasks](#tasks) > statusCommand

The command to run to check the status of the task.

If this is specified, it is run before the `command`. If the status command runs successfully and returns exit code of 0, the task is considered already complete and the `command` is not run. To indicate that the task is not complete, the status command should return a non-zero exit code.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `tasks[].env`

[tasks](#tasks) > env

Environment variables to set when running the command.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `tests[]`

A list of tests to run in the module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `tests[].name`

[tests](#tests) > name

The name of the test.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `tests[].dependencies[]`

[tests](#tests) > dependencies

The names of any services that must be running, and the names of any tasks that must be executed, before the test is run.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `tests[].disabled`

[tests](#tests) > disabled

Set this to `true` to disable the test. You can use this with conditional template strings to
enable/disable tests based on, for example, the current environment or other variables (e.g.
`enabled: ${environment.name != "prod"}`). This is handy when you only want certain tests to run in
specific environments, e.g. only during CI.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `tests[].timeout`

[tests](#tests) > timeout

Maximum duration (in seconds) of the test run.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `600`   | No       |

### `tests[].command[]`

[tests](#tests) > command

The command to run to test the module.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | Yes      |

### `tests[].statusCommand[]`

[tests](#tests) > statusCommand

The command to run to check the status of the test.

If this is specified, it is run before the `command`. If the status command runs successfully and returns exit code of 0, the test is considered already complete and the `command` is not run. To indicate that the test is not complete, the status command should return a non-zero exit code.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `tests[].env`

[tests](#tests) > env

Environment variables to set when running the command.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `tests[].artifacts[]`

[tests](#tests) > artifacts

A list of artifacts to copy after the test run.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `tests[].artifacts[].source`

[tests](#tests) > [artifacts](#testsartifacts) > source

A POSIX-style path or glob to copy, relative to the build root.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `tests[].artifacts[].target`

[tests](#tests) > [artifacts](#testsartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |


## Outputs

### Module Outputs

The following keys are available via the `${modules.<module-name>}` template string key for `exec`
modules.

### `${modules.<module-name>.buildPath}`

The build path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.buildPath}
```

### `${modules.<module-name>.name}`

The name of the module.

| Type     |
| -------- |
| `string` |

### `${modules.<module-name>.path}`

The source path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.path}
```

### `${modules.<module-name>.var.*}`

A map of all variables defined in the module.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${modules.<module-name>.var.<variable-name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${modules.<module-name>.version}`

The current version of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.version}
```


### Service Outputs

The following keys are available via the `${runtime.services.<service-name>}` template string key for `exec` module services.
Note that these are only resolved when deploying/running dependants of the service, so they are not usable for every field.

### `${runtime.services.<service-name>.version}`

The current version of the service.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${runtime.services.my-service.version}
```


### Task Outputs

The following keys are available via the `${runtime.tasks.<task-name>}` template string key for `exec` module tasks.
Note that these are only resolved when deploying/running dependants of the task, so they are not usable for every field.

### `${runtime.tasks.<task-name>.version}`

The current version of the task.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${runtime.tasks.my-tasks.version}
```

