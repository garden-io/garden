---
title: '`exec` Module Type'
tocTitle: '`exec`'
---

# exec

## Description

A simple module for executing commands in your shell. This can be a useful escape hatch if no other module type fits your needs, and you just need to execute something \(as opposed to deploy it, track its status etc.\).

By default, the `exec` module type executes the commands in the Garden build directory \(under .garden/build/\). By setting `local: true`, the commands are executed in the module source directory instead.

Note that Garden does not sync the source code for local exec modules into the Garden build directory. This means that include/exclude filters and ignore files are not applied to local exec modules, as the filtering is done during the sync.

Below is the full schema reference. For an introduction to configuring Garden modules, please look at our [Configuration guide](../../using-garden/configuration-overview.md).

The [first section](exec.md#complete-yaml-schema) contains the complete YAML schema, and the [second section](exec.md#configuration-keys) describes each schema key.

`exec` modules also export values that are available in template strings. See the [Outputs](exec.md#outputs) section below for details.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
# The schema version of this config (currently not used).
apiVersion: garden.io/v0

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
          # Defaults to to same as source path.
          target: ''

  # The command to run to perform the build.
  #
  # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
  # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
  command: []

# A description of the module.
description:

# Set this to `true` to disable the module. You can use this with conditional template strings to disable modules
# based on, for example, the current environment or other variables (e.g. `disabled: \${environment.name == "prod"}`).
# This can be handy when you only need certain modules for specific environments, e.g. only for development.
#
# Disabling a module means that any services, tasks and tests contained in it will not be deployed or run. It also
# means that the module is not built _unless_ it is declared as a build dependency by another enabled module (in which
# case building this module is necessary for the dependant to be built).
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
# guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
# details.
#
# Also note that specifying an empty list here means _no sources_ should be included.
include:

# Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match these
# paths or globs are excluded when computing the version of the module, when responding to filesystem watch events,
# and when staging builds.
#
# Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include`
# field, the files/patterns specified here are filtered from the files matched by `include`. See the [Configuration
# Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories)
# for details.
#
# Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on which files and
# directories are watched for changes. Use the project `modules.exclude` field to affect those, if you have large
# directories that should not be watched for changes.
exclude:

# A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
# branch or tag, with the format: <git remote url>#<branch|tag>
#
# Garden will import the repository source code into this module, but read the module's config from the local
# garden.yml file.
repositoryUrl:

# When false, disables pushing this module to remote registries.
allowPublish: true

# A list of files to write to the module directory when resolving this module. This is useful to automatically
# generate (and template) any supporting files needed for the module.
generateFiles:
  - # POSIX-style filename to read the source file contents from, relative to the path of the module (or the
    # ModuleTemplate configuration file if one is being applied).
    # This file may contain template strings, much like any other field in the configuration.
    sourcePath:

    # POSIX-style filename to write the resolved file contents to, relative to the path of the module.
    #
    # Note that any existing file with the same name will be overwritten. If the path contains one or more
    # directories, they will be automatically created if missing.
    targetPath:

    # The desired file contents as a string.
    value:

# If set to true, Garden will run the build command, tests, and tasks in the module source directory,
# instead of in the Garden build directory (under .garden/build/<module-name>).
#
# Garden will therefore not stage the build for local exec modules. This means that include/exclude filters
# and ignore files are not applied to local exec modules.
local: false

# Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
# `GARDEN`) and values must be primitives.
env: {}

# A list of tasks that can be run in this module.
tasks:
  - # The name of the task.
    name:

    # A description of the task.
    description:

    # The names of any tasks that must be executed, and the names of any services that must be running, before this
    # task is executed.
    dependencies: []

    # Set this to `true` to disable the task. You can use this with conditional template strings to enable/disable
    # tasks based on, for example, the current environment or other variables (e.g. `enabled: \${environment.name !=
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
    timeout: null

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

    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives.
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
    # `enabled: \${environment.name != "prod"}`). This is handy when you only want certain tests to run in
    # specific environments, e.g. only during CI.
    disabled: false

    # Maximum duration (in seconds) of the test run.
    timeout: null

    # The command to run to test the module.
    #
    # By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
    # If the top level `local` directive is set to `true`, the command runs in the module source directory instead.
    command:

    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives.
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

### `apiVersion`

The schema version of this config \(currently not used\).

| Type | Allowed Values | Default | Required |
| :--- | :--- | :--- | :--- |
| `string` | "garden.io/v0" | `"garden.io/v0"` | Yes |

### `kind`

| Type | Allowed Values | Default | Required |
| :--- | :--- | :--- | :--- |
| `string` | "Module" | `"Module"` | Yes |

### `type`

The type of this module.

| Type | Required |
| :--- | :--- |
| `string` | Yes |

Example:

```yaml
type: "container"
```

### `name`

The name of this module.

| Type | Required |
| :--- | :--- |
| `string` | Yes |

Example:

```yaml
name: "my-sweet-module"
```

### `build`

Specify how to build the module. Note that plugins may define additional keys on this object.

| Type | Default | Required |
| :--- | :--- | :--- |
| `object` | `{"dependencies":[]}` | No |

### `build.dependencies[]`

[build](exec.md#build) &gt; dependencies

A list of modules that must be built before this module is built.

| Type | Default | Required |
| :--- | :--- | :--- |
| `array[object]` | `[]` | No |

Example:

```yaml
build:
  ...
  dependencies:
    - name: some-other-module-name
```

### `build.dependencies[].name`

[build](exec.md#build) &gt; [dependencies](exec.md#builddependencies) &gt; name

Module name to build ahead of this module.

| Type | Required |
| :--- | :--- |
| `string` | Yes |

### `build.dependencies[].copy[]`

[build](exec.md#build) &gt; [dependencies](exec.md#builddependencies) &gt; copy

Specify one or more files or directories to copy from the built dependency to this module.

| Type | Default | Required |
| :--- | :--- | :--- |
| `array[object]` | `[]` | No |

### `build.dependencies[].copy[].source`

[build](exec.md#build) &gt; [dependencies](exec.md#builddependencies) &gt; [copy](exec.md#builddependenciescopy) &gt; source

POSIX-style path or filename of the directory or file\(s\) to copy to the target.

| Type | Required |
| :--- | :--- |
| `posixPath` | Yes |

### `build.dependencies[].copy[].target`

[build](exec.md#build) &gt; [dependencies](exec.md#builddependencies) &gt; [copy](exec.md#builddependenciescopy) &gt; target

POSIX-style path or filename to copy the directory or file\(s\), relative to the build directory. Defaults to to same as source path.

| Type | Default | Required |
| :--- | :--- | :--- |
| `posixPath` | `""` | No |

### `build.command[]`

[build](exec.md#build) &gt; command

The command to run to perform the build.

By default, the command is run inside the Garden build directory \(under .garden/build/\). If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type | Default | Required |
| :--- | :--- | :--- |
| `array[string]` | `[]` | No |

Example:

```yaml
build:
  ...
  command:
    - npm
    - run
    - build
```

### `description`

A description of the module.

| Type | Required |
| :--- | :--- |
| `string` | No |

### `disabled`

Set this to `true` to disable the module. You can use this with conditional template strings to disable modules based on, for example, the current environment or other variables \(e.g. `disabled: \${environment.name == "prod"}`\). This can be handy when you only need certain modules for specific environments, e.g. only for development.

Disabling a module means that any services, tasks and tests contained in it will not be deployed or run. It also means that the module is not built _unless_ it is declared as a build dependency by another enabled module \(in which case building this module is necessary for the dependant to be built\).

If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden will automatically ignore those dependency declarations. Note however that template strings referencing the module's service or task outputs \(i.e. runtime outputs\) will fail to resolve when the module is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type | Default | Required |
| :--- | :--- | :--- |
| `boolean` | `false` | No |

### `include[]`

Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files that do _not_ match these paths or globs are excluded when computing the version of the module, when responding to filesystem watch events, and when staging builds.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Also note that specifying an empty list here means _no sources_ should be included.

| Type | Required |
| :--- | :--- |
| `array[posixPath]` | No |

Example:

```yaml
include:
  - Dockerfile
  - my-app.js
```

### `exclude[]`

Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match these paths or globs are excluded when computing the version of the module, when responding to filesystem watch events, and when staging builds.

Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include` field, the files/patterns specified here are filtered from the files matched by `include`. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes. Use the project `modules.exclude` field to affect those, if you have large directories that should not be watched for changes.

| Type | Required |
| :--- | :--- |
| `array[posixPath]` | No |

Example:

```yaml
exclude:
  - tmp/**/*
  - '*.log'
```

### `repositoryUrl`

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: \#

Garden will import the repository source code into this module, but read the module's config from the local garden.yml file.

| Type | Required |  |
| :--- | :--- | :--- |
| \`gitUrl | string\` | No |

Example:

```yaml
repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

### `allowPublish`

When false, disables pushing this module to remote registries.

| Type | Default | Required |
| :--- | :--- | :--- |
| `boolean` | `true` | No |

### `generateFiles[]`

A list of files to write to the module directory when resolving this module. This is useful to automatically generate \(and template\) any supporting files needed for the module.

| Type | Required |
| :--- | :--- |
| `array[object]` | No |

### `generateFiles[].sourcePath`

[generateFiles](exec.md#generatefiles) &gt; sourcePath

POSIX-style filename to read the source file contents from, relative to the path of the module \(or the ModuleTemplate configuration file if one is being applied\). This file may contain template strings, much like any other field in the configuration.

| Type | Required |
| :--- | :--- |
| `posixPath` | No |

### `generateFiles[].targetPath`

[generateFiles](exec.md#generatefiles) &gt; targetPath

POSIX-style filename to write the resolved file contents to, relative to the path of the module.

Note that any existing file with the same name will be overwritten. If the path contains one or more directories, they will be automatically created if missing.

| Type | Required |
| :--- | :--- |
| `posixPath` | Yes |

### `generateFiles[].value`

[generateFiles](exec.md#generatefiles) &gt; value

The desired file contents as a string.

| Type | Required |
| :--- | :--- |
| `string` | No |

### `local`

If set to true, Garden will run the build command, tests, and tasks in the module source directory, instead of in the Garden build directory \(under .garden/build/\).

Garden will therefore not stage the build for local exec modules. This means that include/exclude filters and ignore files are not applied to local exec modules.

| Type | Default | Required |
| :--- | :--- | :--- |
| `boolean` | `false` | No |

### `env`

Key/value map of environment variables. Keys must be valid POSIX environment variable names \(must not start with `GARDEN`\) and values must be primitives.

| Type | Default | Required |
| :--- | :--- | :--- |
| `object` | `{}` | No |

### `tasks[]`

A list of tasks that can be run in this module.

| Type | Default | Required |
| :--- | :--- | :--- |
| `array[object]` | `[]` | No |

### `tasks[].name`

[tasks](exec.md#tasks) &gt; name

The name of the task.

| Type | Required |
| :--- | :--- |
| `string` | Yes |

### `tasks[].description`

[tasks](exec.md#tasks) &gt; description

A description of the task.

| Type | Required |
| :--- | :--- |
| `string` | No |

### `tasks[].dependencies[]`

[tasks](exec.md#tasks) &gt; dependencies

The names of any tasks that must be executed, and the names of any services that must be running, before this task is executed.

| Type | Default | Required |
| :--- | :--- | :--- |
| `array[string]` | `[]` | No |

### `tasks[].disabled`

[tasks](exec.md#tasks) &gt; disabled

Set this to `true` to disable the task. You can use this with conditional template strings to enable/disable tasks based on, for example, the current environment or other variables \(e.g. `enabled: \${environment.name != "prod"}`\). This can be handy when you only want certain tasks to run in specific environments, e.g. only for development.

Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime dependency for another service, test or task.

Note however that template strings referencing the task's outputs \(i.e. runtime outputs\) will fail to resolve when the task is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type | Default | Required |
| :--- | :--- | :--- |
| `boolean` | `false` | No |

### `tasks[].timeout`

[tasks](exec.md#tasks) &gt; timeout

Maximum duration \(in seconds\) of the task's execution.

| Type | Default | Required |
| :--- | :--- | :--- |
| `number` | `null` | No |

### `tasks[].artifacts[]`

[tasks](exec.md#tasks) &gt; artifacts

A list of artifacts to copy after the task run.

| Type | Required |
| :--- | :--- |
| `array[object]` | No |

### `tasks[].artifacts[].source`

[tasks](exec.md#tasks) &gt; [artifacts](exec.md#tasksartifacts) &gt; source

A POSIX-style path or glob to copy, relative to the build root.

| Type | Required |
| :--- | :--- |
| `posixPath` | Yes |

### `tasks[].artifacts[].target`

[tasks](exec.md#tasks) &gt; [artifacts](exec.md#tasksartifacts) &gt; target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

| Type | Default | Required |
| :--- | :--- | :--- |
| `posixPath` | `"."` | No |

### `tasks[].command[]`

[tasks](exec.md#tasks) &gt; command

The command to run.

By default, the command is run inside the Garden build directory \(under .garden/build/\). If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type | Required |
| :--- | :--- |
| `array[string]` | Yes |

### `tasks[].env`

[tasks](exec.md#tasks) &gt; env

Key/value map of environment variables. Keys must be valid POSIX environment variable names \(must not start with `GARDEN`\) and values must be primitives.

| Type | Default | Required |
| :--- | :--- | :--- |
| `object` | `{}` | No |

### `tests[]`

A list of tests to run in the module.

| Type | Default | Required |
| :--- | :--- | :--- |
| `array[object]` | `[]` | No |

### `tests[].name`

[tests](exec.md#tests) &gt; name

The name of the test.

| Type | Required |
| :--- | :--- |
| `string` | Yes |

### `tests[].dependencies[]`

[tests](exec.md#tests) &gt; dependencies

The names of any services that must be running, and the names of any tasks that must be executed, before the test is run.

| Type | Default | Required |
| :--- | :--- | :--- |
| `array[string]` | `[]` | No |

### `tests[].disabled`

[tests](exec.md#tests) &gt; disabled

Set this to `true` to disable the test. You can use this with conditional template strings to enable/disable tests based on, for example, the current environment or other variables \(e.g. `enabled: \${environment.name != "prod"}`\). This is handy when you only want certain tests to run in specific environments, e.g. only during CI.

| Type | Default | Required |
| :--- | :--- | :--- |
| `boolean` | `false` | No |

### `tests[].timeout`

[tests](exec.md#tests) &gt; timeout

Maximum duration \(in seconds\) of the test run.

| Type | Default | Required |
| :--- | :--- | :--- |
| `number` | `null` | No |

### `tests[].command[]`

[tests](exec.md#tests) &gt; command

The command to run to test the module.

By default, the command is run inside the Garden build directory \(under .garden/build/\). If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type | Required |
| :--- | :--- |
| `array[string]` | Yes |

### `tests[].env`

[tests](exec.md#tests) &gt; env

Key/value map of environment variables. Keys must be valid POSIX environment variable names \(must not start with `GARDEN`\) and values must be primitives.

| Type | Default | Required |
| :--- | :--- | :--- |
| `object` | `{}` | No |

### `tests[].artifacts[]`

[tests](exec.md#tests) &gt; artifacts

A list of artifacts to copy after the test run.

| Type | Required |
| :--- | :--- |
| `array[object]` | No |

### `tests[].artifacts[].source`

[tests](exec.md#tests) &gt; [artifacts](exec.md#testsartifacts) &gt; source

A POSIX-style path or glob to copy, relative to the build root.

| Type | Required |
| :--- | :--- |
| `posixPath` | Yes |

### `tests[].artifacts[].target`

[tests](exec.md#tests) &gt; [artifacts](exec.md#testsartifacts) &gt; target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

| Type | Default | Required |
| :--- | :--- | :--- |
| `posixPath` | `"."` | No |

## Outputs

### Module Outputs

The following keys are available via the `${modules.<module-name>}` template string key for `exec` modules.

### `${modules.<module-name>.buildPath}`

The build path of the module.

| Type |
| :--- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.buildPath}
```

### `${modules.<module-name>.path}`

The local path of the module.

| Type |
| :--- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.path}
```

### `${modules.<module-name>.version}`

The current version of the module.

| Type |
| :--- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.version}
```

### Task Outputs

The following keys are available via the `${runtime.tasks.<task-name>}` template string key for `exec` module tasks. Note that these are only resolved when deploying/running dependants of the task, so they are not usable for every field.

### `${runtime.tasks.<task-name>.outputs.log}`

The full log from the executed task. \(Pro-tip: Make it machine readable so it can be parsed by dependant tasks and services!\)

| Type | Default |
| :--- | :--- |
| `string` | `""` |

