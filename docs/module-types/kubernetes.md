---
title: kubernetes
---

# `kubernetes` Module Type

Specify one or more Kubernetes manifests to deploy.

You can either (or both) specify the manifests as part of the `garden.yml` configuration, or you can refer to
one or more files with existing manifests.

Note that if you include the manifests in the `garden.yml` file, you can use
[template strings](../guides/variables-and-templating.md) to interpolate values into the manifests.

If you need more advanced templating features you can use the
[helm](./helm.md) module type.

## Reference

Below is the schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../guides/configuration-files.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`kubernetes` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

### Complete YAML Schema

The values in the schema below are the default values.

```yaml
# The schema version of this module's config (currently not used).
apiVersion: garden.io/v0

kind: Module

# The type of this module.
type:

# The name of this module.
name:

description:

# Set this to `true` to disable the module. You can use this with conditional template strings to
# disable modules based on, for example, the current environment or other variables (e.g.
# `disabled: \${environment.name == "prod"}`). This can be handy when you only need certain modules for
# specific environments, e.g. only for development.
#
# Disabling a module means that any services, tasks and tests contained in it will not be deployed or run.
# It also means that the module is not built _unless_ it is declared as a build dependency by another enabled
# module (in which case building this module is necessary for the dependant to be built).
#
# If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
# will automatically ignore those dependency declarations. Note however that template strings referencing the
# module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled,
# so you need to make sure to provide alternate values for those if you're using them, using conditional
# expressions.
disabled: false

# Specify a list of POSIX-style paths or globs that should be regarded as the source files for this
# module. Files that do *not* match these paths or globs are excluded when computing the version of the module,
# when responding to filesystem watch events, and when staging builds.
#
# Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
# source tree, which use the same format as `.gitignore` files. See the
# [Configuration Files
# guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.
#
# Also note that specifying an empty list here means _no sources_ should be included.
#
# If neither `include` nor `exclude` is set, Garden automatically sets `include` to equal the
# `files` directive so that only the Kubernetes manifests get included.
include:

# Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that
# match these paths or globs are excluded when computing the version of the module, when responding to filesystem
# watch events, and when staging builds.
#
# Note that you can also explicitly _include_ files using the `include` field. If you also specify the
# `include` field, the files/patterns specified here are filtered from the files matched by `include`. See the
# [Configuration Files
# guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)for details.
#
# Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on which files
# and directories are watched for changes. Use the project `modules.exclude` field to affect those, if you have
# large directories that should not be watched for changes.
exclude:

# A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
# branch or tag, with the format: <git remote url>#<branch|tag>
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
          # POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
          # Defaults to to same as source path.
          target: ''

# The names of any services that this service depends on at runtime, and the names of any tasks that should be
# executed before this service is deployed.
dependencies: []

# List of Kubernetes resource manifests to deploy. Use this instead of the `files` field if you need to resolve
# template strings in any of the manifests.
manifests:
  # The API version of the resource.
  - apiVersion:
    # The kind of the resource.
    kind:
    metadata:
      # The name of the resource.
      name:

# POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests.
files: []

# The Deployment, DaemonSet or StatefulSet that Garden should regard as the _Garden service_ in this module (not to be
# confused with Kubernetes Service resources). Because a `kubernetes` can contain any number of Kubernetes resources,
# this needs to be specified for certain Garden features and commands to work.
serviceResource:
  # The type of Kubernetes resource to sync files to.
  kind: Deployment

  # The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can be
  # omitted.
  name:

  # The name of a container in the target. Specify this if the target contains more than one container and the main
  # container is not the first container in the spec.
  containerName:

tasks:
  # The name of the task.
  - name:
    # A description of the task.
    description:
    # The names of any tasks that must be executed, and the names of any services that must be running, before this
    # task is executed.
    dependencies: []
    # Set this to `true` to disable the task. You can use this with conditional template strings to
    # enable/disable tasks based on, for example, the current environment or other variables (e.g.
    # `enabled: \${environment.name != "prod"}`). This can be handy when you only want certain tasks to run in
    # specific environments, e.g. only for development.
    #
    # Disabling a task means that it will not be run, and will also be ignored if it is declared as a
    # runtime dependency for another service, test or task.
    #
    # Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to
    # resolve when the task is disabled, so you need to make sure to provide alternate values for those if
    # you're using them, using conditional expressions.
    disabled: false
    # Maximum duration (in seconds) of the task's execution.
    timeout: null
    # The Deployment, DaemonSet or StatefulSet that Garden should use to execute this task. If not specified, the
    # `serviceResource` configured on the module will be used. If neither is specified, an error will be thrown.
    resource:
      # The type of Kubernetes resource to sync files to.
      kind: Deployment

      # The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can
      # be omitted.
      name:

      # The name of a container in the target. Specify this if the target contains more than one container and the
      # main container is not the first container in the spec.
      containerName:
    # The command/entrypoint used to run the task inside the container.
    command:
    # The arguments to pass to the container used for execution.
    args:
    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives or references to secrets.
    env: {}
    # Specify artifacts to copy out of the container after the task is complete.
    artifacts:
      # A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.
      - source:
        # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory.
        target: .

tests:
  # The name of the test.
  - name:
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
    # The Deployment, DaemonSet or StatefulSet that Garden should use to execute this test suite. If not specified,
    # the `serviceResource` configured on the module will be used. If neither is specified, an error will be thrown.
    resource:
      # The type of Kubernetes resource to sync files to.
      kind: Deployment

      # The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can
      # be omitted.
      name:

      # The name of a container in the target. Specify this if the target contains more than one container and the
      # main container is not the first container in the spec.
      containerName:
    # The command/entrypoint used to run the test inside the container.
    command:
    # The arguments to pass to the container used for testing.
    args:
    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives or references to secrets.
    env: {}
    # Specify artifacts to copy out of the container after the test is complete.
    artifacts:
      # A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.
      - source:
        # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory.
        target: .
```

### Configuration Keys

#### `apiVersion`

The schema version of this module's config (currently not used).

| Type     | Allowed Values | Default          | Required |
| -------- | -------------- | ---------------- | -------- |
| `string` | "garden.io/v0" | `"garden.io/v0"` | Yes      |

#### `kind`

| Type     | Allowed Values | Default    | Required |
| -------- | -------------- | ---------- | -------- |
| `string` | "Module"       | `"Module"` | Yes      |

#### `type`

The type of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
type: "container"
```

#### `name`

The name of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
name: "my-sweet-module"
```

#### `description`

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `disabled`

Set this to `true` to disable the module. You can use this with conditional template strings to
disable modules based on, for example, the current environment or other variables (e.g.
`disabled: \${environment.name == "prod"}`). This can be handy when you only need certain modules for
specific environments, e.g. only for development.

Disabling a module means that any services, tasks and tests contained in it will not be deployed or run.
It also means that the module is not built _unless_ it is declared as a build dependency by another enabled
module (in which case building this module is necessary for the dependant to be built).

If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
will automatically ignore those dependency declarations. Note however that template strings referencing the
module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled,
so you need to make sure to provide alternate values for those if you're using them, using conditional
expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

#### `include`

Specify a list of POSIX-style paths or globs that should be regarded as the source files for this
module. Files that do *not* match these paths or globs are excluded when computing the version of the module,
when responding to filesystem watch events, and when staging builds.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
source tree, which use the same format as `.gitignore` files. See the
[Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.

Also note that specifying an empty list here means _no sources_ should be included.

If neither `include` nor `exclude` is set, Garden automatically sets `include` to equal the
`files` directive so that only the Kubernetes manifests get included.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
include:
  - Dockerfile
  - my-app.js
```

#### `exclude`

Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that
match these paths or globs are excluded when computing the version of the module, when responding to filesystem
watch events, and when staging builds.

Note that you can also explicitly _include_ files using the `include` field. If you also specify the
`include` field, the files/patterns specified here are filtered from the files matched by `include`. See the
[Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)for details.

Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on which files
and directories are watched for changes. Use the project `modules.exclude` field to affect those, if you have
large directories that should not be watched for changes.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
exclude:
  - tmp/**/*
  - '*.log'
```

#### `repositoryUrl`

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

Garden will import the repository source code into this module, but read the module's
config from the local garden.yml file.

| Type              | Required |
| ----------------- | -------- |
| `gitUrl | string` | No       |

Example:

```yaml
repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

#### `allowPublish`

When false, disables pushing this module to remote registries.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

#### `build`

Specify how to build the module. Note that plugins may define additional keys on this object.

| Type     | Default               | Required |
| -------- | --------------------- | -------- |
| `object` | `{"dependencies":[]}` | No       |

#### `build.dependencies[]`

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

#### `build.dependencies[].name`

[build](#build) > [dependencies](#builddependencies) > name

Module name to build ahead of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `build.dependencies[].copy[]`

[build](#build) > [dependencies](#builddependencies) > copy

Specify one or more files or directories to copy from the built dependency to this module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `build.dependencies[].copy[].source`

[build](#build) > [dependencies](#builddependencies) > [copy](#builddependenciescopy) > source

POSIX-style path or filename of the directory or file(s) to copy to the target.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

#### `build.dependencies[].copy[].target`

[build](#build) > [dependencies](#builddependencies) > [copy](#builddependenciescopy) > target

POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
Defaults to to same as source path.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `""`    | No       |

#### `dependencies`

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

#### `manifests`

List of Kubernetes resource manifests to deploy. Use this instead of the `files` field if you need to resolve template strings in any of the manifests.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `manifests[].apiVersion`

[manifests](#manifests) > apiVersion

The API version of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `manifests[].kind`

[manifests](#manifests) > kind

The kind of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `manifests[].metadata`

[manifests](#manifests) > metadata

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

#### `manifests[].metadata.name`

[manifests](#manifests) > [metadata](#manifestsmetadata) > name

The name of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `files`

POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

#### `serviceResource`

The Deployment, DaemonSet or StatefulSet that Garden should regard as the _Garden service_ in this module (not to be confused with Kubernetes Service resources). Because a `kubernetes` can contain any number of Kubernetes resources, this needs to be specified for certain Garden features and commands to work.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

#### `serviceResource.kind`

[serviceResource](#serviceresource) > kind

The type of Kubernetes resource to sync files to.

| Type     | Allowed Values                           | Default        | Required |
| -------- | ---------------------------------------- | -------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | `"Deployment"` | Yes      |

#### `serviceResource.name`

[serviceResource](#serviceresource) > name

The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can be omitted.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `serviceResource.containerName`

[serviceResource](#serviceresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `tasks`

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `tasks[].name`

[tasks](#tasks) > name

The name of the task.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `tasks[].description`

[tasks](#tasks) > description

A description of the task.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `tasks[].dependencies[]`

[tasks](#tasks) > dependencies

The names of any tasks that must be executed, and the names of any services that must be running, before this task is executed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

#### `tasks[].disabled`

[tasks](#tasks) > disabled

Set this to `true` to disable the task. You can use this with conditional template strings to
enable/disable tasks based on, for example, the current environment or other variables (e.g.
`enabled: \${environment.name != "prod"}`). This can be handy when you only want certain tasks to run in
specific environments, e.g. only for development.

Disabling a task means that it will not be run, and will also be ignored if it is declared as a
runtime dependency for another service, test or task.

Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to
resolve when the task is disabled, so you need to make sure to provide alternate values for those if
you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

#### `tasks[].timeout`

[tasks](#tasks) > timeout

Maximum duration (in seconds) of the task's execution.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `null`  | No       |

#### `tasks[].resource`

[tasks](#tasks) > resource

The Deployment, DaemonSet or StatefulSet that Garden should use to execute this task. If not specified, the `serviceResource` configured on the module will be used. If neither is specified, an error will be thrown.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

#### `tasks[].resource.kind`

[tasks](#tasks) > [resource](#tasksresource) > kind

The type of Kubernetes resource to sync files to.

| Type     | Allowed Values                           | Default        | Required |
| -------- | ---------------------------------------- | -------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | `"Deployment"` | Yes      |

#### `tasks[].resource.name`

[tasks](#tasks) > [resource](#tasksresource) > name

The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can be omitted.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `tasks[].resource.containerName`

[tasks](#tasks) > [resource](#tasksresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `tasks[].command[]`

[tasks](#tasks) > command

The command/entrypoint used to run the task inside the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tasks:
  - command:
    - /bin/sh
    - '-c'
```

#### `tasks[].args[]`

[tasks](#tasks) > args

The arguments to pass to the container used for execution.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tasks:
  - args:
    - rake
    - 'db:migrate'
```

#### `tasks[].env`

[tasks](#tasks) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
tasks:
  - env:
      - MY_VAR: some-value
        MY_SECRET_VAR:
          secretRef:
            name: my-secret
            key: some-key
      - {}
```

#### `tasks[].artifacts[]`

[tasks](#tasks) > artifacts

Specify artifacts to copy out of the container after the task is complete.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `tasks[].artifacts[].source`

[tasks](#tasks) > [artifacts](#tasksartifacts) > source

A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
tasks:
  - artifacts:
      - source: "/output/**/*"
```

#### `tasks[].artifacts[].target`

[tasks](#tasks) > [artifacts](#tasksartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
tasks:
  - artifacts:
      - target: "outputs/foo/"
```

#### `tests`

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `tests[].name`

[tests](#tests) > name

The name of the test.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `tests[].dependencies[]`

[tests](#tests) > dependencies

The names of any services that must be running, and the names of any tasks that must be executed, before the test is run.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

#### `tests[].disabled`

[tests](#tests) > disabled

Set this to `true` to disable the test. You can use this with conditional template strings to
enable/disable tests based on, for example, the current environment or other variables (e.g.
`enabled: \${environment.name != "prod"}`). This is handy when you only want certain tests to run in
specific environments, e.g. only during CI.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

#### `tests[].timeout`

[tests](#tests) > timeout

Maximum duration (in seconds) of the test run.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `null`  | No       |

#### `tests[].resource`

[tests](#tests) > resource

The Deployment, DaemonSet or StatefulSet that Garden should use to execute this test suite. If not specified, the `serviceResource` configured on the module will be used. If neither is specified, an error will be thrown.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

#### `tests[].resource.kind`

[tests](#tests) > [resource](#testsresource) > kind

The type of Kubernetes resource to sync files to.

| Type     | Allowed Values                           | Default        | Required |
| -------- | ---------------------------------------- | -------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | `"Deployment"` | Yes      |

#### `tests[].resource.name`

[tests](#tests) > [resource](#testsresource) > name

The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can be omitted.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `tests[].resource.containerName`

[tests](#tests) > [resource](#testsresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `tests[].command[]`

[tests](#tests) > command

The command/entrypoint used to run the test inside the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tests:
  - command:
    - /bin/sh
    - '-c'
```

#### `tests[].args[]`

[tests](#tests) > args

The arguments to pass to the container used for testing.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tests:
  - args:
    - npm
    - test
```

#### `tests[].env`

[tests](#tests) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
tests:
  - env:
      - MY_VAR: some-value
        MY_SECRET_VAR:
          secretRef:
            name: my-secret
            key: some-key
      - {}
```

#### `tests[].artifacts[]`

[tests](#tests) > artifacts

Specify artifacts to copy out of the container after the test is complete.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `tests[].artifacts[].source`

[tests](#tests) > [artifacts](#testsartifacts) > source

A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
tests:
  - artifacts:
      - source: "/output/**/*"
```

#### `tests[].artifacts[].target`

[tests](#tests) > [artifacts](#testsartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
tests:
  - artifacts:
      - target: "outputs/foo/"
```


### Outputs

#### Module Outputs

The following keys are available via the `${modules.<module-name>}` template string key for `kubernetes`
modules.

#### `${modules.<module-name>.buildPath}`

The build path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.buildPath}
```

#### `${modules.<module-name>.path}`

The local path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.path}
```

#### `${modules.<module-name>.version}`

The current version of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.version}
```

