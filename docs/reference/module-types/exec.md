---
title: Exec
---

# `exec` reference

A simple module for executing commands in your shell. This can be a useful escape hatch if no other module
type fits your needs, and you just need to execute something (as opposed to deploy it, track its status etc.).

By default, the `exec` module type executes the commands in the Garden build directory
(under .garden/build/<module-name>). By setting `local: true`, the commands are executed in the module
source directory instead.

Note that Garden does not sync the source code for local exec modules into the Garden build directory.
This means that include/exclude filters and ignore files are not applied to local exec modules, as the
filtering is done during the sync.

Below is the schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../../guides/configuration-files.md).
The [first section](#configuration-keys) lists and describes the available
schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

`exec` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Configuration keys

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

### `build.command[]`

[build](#build) > command

The command to run to perform the build.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[string]` | No       | `[]`    |

Example:

```yaml
build:
  ...
  command:
    - npm
    - run
    - build
```

### `local`

If set to true, Garden will run the build command, tests, and tasks in the module source directory,
instead of in the Garden build directory (under .garden/build/<module-name>).

Garden will therefore not stage the build for local exec modules. This means that include/exclude filters
and ignore files are not applied to local exec modules.

| Type      | Required | Default |
| --------- | -------- | ------- |
| `boolean` | No       | `false` |

### `env`

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `object` | No       | `{}`    |

### `tasks`

A list of tasks that can be run in this module.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

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

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[string]` | No       | `[]`    |

### `tasks[].timeout`

[tasks](#tasks) > timeout

Maximum duration (in seconds) of the task's execution.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `null`  |

### `tasks[].artifacts[]`

[tasks](#tasks) > artifacts

A list of artifacts to copy after the task run.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `tasks[].artifacts[].source`

[tasks](#tasks) > [artifacts](#tasksartifacts) > source

A POSIX-style path or glob to copy, relative to the build root.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `tasks[].artifacts[].target`

[tasks](#tasks) > [artifacts](#tasksartifacts) > target

A POSIX-style path to copy the artifact to, relative to the project artifacts directory.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `"."`   |

### `tasks[].command[]`

[tasks](#tasks) > command

The command to run.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | Yes      |

### `tasks[].env`

[tasks](#tasks) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `object` | No       | `{}`    |

### `tests`

A list of tests to run in the module.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

### `tests[].name`

[tests](#tests) > name

The name of the test.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `tests[].dependencies[]`

[tests](#tests) > dependencies

The names of any services that must be running, and the names of any tasks that must be executed, before the test is run.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[string]` | No       | `[]`    |

### `tests[].timeout`

[tests](#tests) > timeout

Maximum duration (in seconds) of the test run.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `null`  |

### `tests[].command[]`

[tests](#tests) > command

The command to run to test the module.

By default, the command is run inside the Garden build directory (under .garden/build/<module-name>).
If the top level `local` directive is set to `true`, the command runs in the module source directory instead.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | Yes      |

### `tests[].env`

[tests](#tests) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `object` | No       | `{}`    |

### `tests[].artifacts[]`

[tests](#tests) > artifacts

A list of artifacts to copy after the test run.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `tests[].artifacts[].source`

[tests](#tests) > [artifacts](#testsartifacts) > source

A POSIX-style path or glob to copy, relative to the build root.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `tests[].artifacts[].target`

[tests](#tests) > [artifacts](#testsartifacts) > target

A POSIX-style path to copy the artifact to, relative to the project artifacts directory.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `"."`   |


## Complete YAML schema
```yaml
apiVersion: garden.io/v0
kind: Module
type:
name:
description:
include:
exclude:
repositoryUrl:
allowPublish: true
build:
  dependencies:
    - name:
      copy:
        - source:
          target: <same as source path>
  command: []
local: false
env: {}
tasks:
  - name:
    description:
    dependencies: []
    timeout: null
    artifacts:
      - source:
        target: .
    command:
    env: {}
tests:
  - name:
    dependencies: []
    timeout: null
    command:
    env: {}
    artifacts:
      - source:
        target: .
```

## Outputs

### Module outputs

The following keys are available via the `${modules.<module-name>}` template string key for `exec`
modules.

### `${modules.<module-name>.buildPath}`

The build path of the module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
my-variable: ${modules.my-module.buildPath}
```

### `${modules.<module-name>.path}`

The local path of the module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
my-variable: ${modules.my-module.path}
```

### `${modules.<module-name>.version}`

The current version of the module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
my-variable: ${modules.my-module.version}
```


### Task outputs

The following keys are available via the `${runtime.tasks.<task-name>}` template string key for `exec` module tasks.
Note that these are only resolved when deploying/running dependants of the task, so they are not usable for every field.

### `${runtime.tasks.<task-name>.outputs}`

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

### `${runtime.tasks.<task-name>.outputs.log}`

[outputs](#outputs) > log

The full log from the executed task. (Pro-tip: Make it machine readable so it can be parsed by dependant tasks and services!)

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `""`    |

