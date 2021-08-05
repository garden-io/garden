---
title: "`helm` Module Type"
tocTitle: "`helm`"
---

# `helm` Module Type

## Description

Specify a Helm chart (either in your repository or remote from a registry) to deploy.
Refer to the [Helm guide](https://docs.garden.io/guides/using-helm-charts) for usage instructions.

Below is the full schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../../using-garden/configuration-overview.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`helm` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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
#
# If neither `include` nor `exclude` is set, and the module has local chart sources, Garden
# automatically sets `include` to: `["*", "charts/**/*", "templates/**/*"]`.
#
# If neither `include` nor `exclude` is set and the module specifies a remote chart, Garden
# automatically sets `ìnclude` to `[]`.
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

    # POSIX-style filename to write the resolved file contents to, relative to the path of the module source directory
    # (for remote modules this means the root of the module repository, otherwise the directory of the module
    # configuration).
    #
    # Note that any existing file with the same name will be overwritten. If the path contains one or more
    # directories, they will be automatically created if missing.
    targetPath:

    # The desired file contents as a string.
    value:

# A map of variables scoped to this particular module. These are resolved before any other parts of the module
# configuration and take precedence over project-scoped variables. They may reference project-scoped variables, and
# generally use any template strings normally allowed when resolving modules.
variables:

# Whether to set the --atomic flag during installs and upgrades. Set to false if e.g. you want to see more information
# about failures and then manually roll back, instead of having Helm do it automatically on failure.
atomicInstall: true

# The name of another `helm` module to use as a base for this one. Use this to re-use a Helm chart across multiple
# services. For example, you might have an organization-wide base chart for certain types of services.
# If set, this module will by default inherit the following properties from the base module: `serviceResource`,
# `values`
# Each of those can be overridden in this module. They will be merged with a JSON Merge Patch (RFC 7396).
base:

# A valid Helm chart name or URI (same as you'd input to `helm install`). Required if the module doesn't contain the
# Helm chart itself.
chart:

# The path, relative to the module path, to the chart sources (i.e. where the Chart.yaml file is, if any). Not used
# when `base` is specified.
chartPath: .

# List of names of services that should be deployed before this chart.
dependencies: []

# **EXPERIMENTAL**
#
# Specifies which files or directories to sync to which paths inside the running containers of the service when it's
# in dev mode, and overrides for the container command and/or arguments.
#
# Note that `serviceResource` must also be specified to enable dev mode.
#
# Dev mode is enabled when running the `garden dev` command, and by setting the `--dev` flag on the `garden deploy`
# command.
devMode:
  # Override the default container arguments when in dev mode.
  args:

  # Override the default container command (i.e. entrypoint) when in dev mode.
  command:

  # Specify one or more source files or directories to automatically sync with the running container.
  sync:
    - # POSIX-style path of the directory to sync to the target, relative to the module's top-level directory. Must be
      # a relative path. Defaults to the module's top-level directory if no value is provided.
      source: .

      # POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is not
      # allowed.
      target:

      # Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.
      exclude:

      # The sync mode to use for the given paths. Allowed options: `one-way`, `one-way-replica`, `two-way`.
      mode: one-way

  # Optionally specify the name of a specific container to sync to. If not specified, the first container in the
  # workload is used.
  containerName:

# A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters,
# numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63 characters.
namespace:

# Optionally override the release name used when installing (defaults to the module name).
releaseName:

# The repository URL to fetch the chart from.
repo:

# The Deployment, DaemonSet or StatefulSet that Garden should regard as the _Garden service_ in this module (not to be
# confused with Kubernetes Service resources). Because a Helm chart can contain any number of Kubernetes resources,
# this needs to be specified for certain Garden features and commands to work, such as hot-reloading.
# We currently map a Helm chart to a single Garden service, because all the resources in a Helm chart are deployed at
# once.
serviceResource:
  # The type of Kubernetes resource to sync files to.
  kind: Deployment

  # The name of a container in the target. Specify this if the target contains more than one container and the main
  # container is not the first container in the spec.
  containerName:

  # The name of the resource to sync to. If the chart contains a single resource of the specified Kind,
  # this can be omitted.
  #
  # This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'.
  # This allows you to easily match the dynamic names given by Helm. In most cases you should copy this
  # directly from the template in question in order to match it. Note that you may need to add single quotes around
  # the string for the YAML to be parsed correctly.
  name:

  # The Garden module that contains the sources for the container. This needs to be specified under `serviceResource`
  # in order to enable hot-reloading, but is not necessary for tasks and tests.
  # Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the
  # container module.
  # Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`
  containerModule:

  # If specified, overrides the arguments for the main container when running in hot-reload mode.
  hotReloadArgs:

# Set this to true if the chart should only be built, but not deployed as a service. Use this, for example, if the
# chart should only be used as a base for other modules.
skipDeploy: false

# The task definitions for this module.
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

    # Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any time
    # your project (or one or more of the task's dependants) is deployed. Otherwise the task is only re-run when its
    # version changes (i.e. the module or one of its dependencies is modified), or when you run `garden run task`.
    cacheResult: true

    # The command/entrypoint used to run the task inside the container.
    command:

    # The arguments to pass to the container used for execution.
    args:

    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives or references to secrets.
    env: {}

    # Specify artifacts to copy out of the container after the run. The artifacts are stored locally under
    # the `.garden/artifacts` directory.
    artifacts:
      - # A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.
        source:

        # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at
        # `.garden/artifacts`.
        target: .

    # The Deployment, DaemonSet or StatefulSet that Garden should use to execute this task.
    # If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
    # an error will be thrown.
    #
    # The following pod spec fields from the service resource will be used (if present) when executing the task:
    # * `affinity`
    # * `automountServiceAccountToken`
    # * `containers`
    # * `dnsConfig`
    # * `dnsPolicy`
    # * `enableServiceLinks`
    # * `hostAliases`
    # * `hostIPC`
    # * `hostNetwork`
    # * `hostPID`
    # * `hostname`
    # * `imagePullSecrets`
    # * `nodeName`
    # * `nodeSelector`
    # * `overhead`
    # * `preemptionPolicy`
    # * `priority`
    # * `priorityClassName`
    # * `runtimeClassName`
    # * `schedulerName`
    # * `securityContext`
    # * `serviceAccount`
    # * `serviceAccountName`
    # * `shareProcessNamespace`
    # * `subdomain`
    # * `tolerations`
    # * `topologySpreadConstraints`
    # * `volumes`
    resource:
      # The type of Kubernetes resource to sync files to.
      kind: Deployment

      # The name of a container in the target. Specify this if the target contains more than one container and the
      # main container is not the first container in the spec.
      containerName:

      # The name of the resource to sync to. If the chart contains a single resource of the specified Kind,
      # this can be omitted.
      #
      # This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'.
      # This allows you to easily match the dynamic names given by Helm. In most cases you should copy this
      # directly from the template in question in order to match it. Note that you may need to add single quotes
      # around
      # the string for the YAML to be parsed correctly.
      name:

      # The Garden module that contains the sources for the container. This needs to be specified under
      # `serviceResource` in order to enable hot-reloading, but is not necessary for tasks and tests.
      # Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the
      # container module.
      # Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`
      containerModule:

      # If specified, overrides the arguments for the main container when running in hot-reload mode.
      hotReloadArgs:

# The test suite definitions for this module.
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

    # The command/entrypoint used to run the test inside the container.
    command:

    # The arguments to pass to the container used for testing.
    args:

    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives or references to secrets.
    env: {}

    # Specify artifacts to copy out of the container after the run. The artifacts are stored locally under
    # the `.garden/artifacts` directory.
    artifacts:
      - # A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.
        source:

        # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at
        # `.garden/artifacts`.
        target: .

    # The Deployment, DaemonSet or StatefulSet that Garden should use to execute this test suite.
    # If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
    # an error will be thrown.
    #
    # The following pod spec fields from the service resource will be used (if present) when executing the test suite:
    # * `affinity`
    # * `automountServiceAccountToken`
    # * `containers`
    # * `dnsConfig`
    # * `dnsPolicy`
    # * `enableServiceLinks`
    # * `hostAliases`
    # * `hostIPC`
    # * `hostNetwork`
    # * `hostPID`
    # * `hostname`
    # * `imagePullSecrets`
    # * `nodeName`
    # * `nodeSelector`
    # * `overhead`
    # * `preemptionPolicy`
    # * `priority`
    # * `priorityClassName`
    # * `runtimeClassName`
    # * `schedulerName`
    # * `securityContext`
    # * `serviceAccount`
    # * `serviceAccountName`
    # * `shareProcessNamespace`
    # * `subdomain`
    # * `tolerations`
    # * `topologySpreadConstraints`
    # * `volumes`
    resource:
      # The type of Kubernetes resource to sync files to.
      kind: Deployment

      # The name of a container in the target. Specify this if the target contains more than one container and the
      # main container is not the first container in the spec.
      containerName:

      # The name of the resource to sync to. If the chart contains a single resource of the specified Kind,
      # this can be omitted.
      #
      # This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'.
      # This allows you to easily match the dynamic names given by Helm. In most cases you should copy this
      # directly from the template in question in order to match it. Note that you may need to add single quotes
      # around
      # the string for the YAML to be parsed correctly.
      name:

      # The Garden module that contains the sources for the container. This needs to be specified under
      # `serviceResource` in order to enable hot-reloading, but is not necessary for tasks and tests.
      # Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the
      # container module.
      # Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`
      containerModule:

      # If specified, overrides the arguments for the main container when running in hot-reload mode.
      hotReloadArgs:

# Time in seconds to wait for Helm to complete any individual Kubernetes operation (like Jobs for hooks).
timeout: 300

# The chart version to deploy.
version:

# Map of values to pass to Helm when rendering the templates. May include arrays and nested objects. When specified,
# these take precedence over the values in the `values.yaml` file (or the files specified in `valueFiles`).
values: {}

# Specify value files to use when rendering the Helm chart. These will take precedence over the `values.yaml` file
# bundled in the Helm chart, and should be specified in ascending order of precedence. Meaning, the last file in
# this list will have the highest precedence.
#
# If you _also_ specify keys under the `values` field, those will effectively be added as another file at the end
# of this list, so they will take precedence over other files listed here.
#
# Note that the paths here should be relative to the _module_ root, and the files should be contained in
# your module directory.
valueFiles: []
```

## Configuration Keys

### `apiVersion`

The schema version of this config (currently not used).

| Type     | Allowed Values | Default          | Required |
| -------- | -------------- | ---------------- | -------- |
| `string` | "garden.io/v0" | `"garden.io/v0"` | Yes      |

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
Defaults to to same as source path.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `""`    | No       |

### `description`

A description of the module.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `disabled`

Set this to `true` to disable the module. You can use this with conditional template strings to disable modules based on, for example, the current environment or other variables (e.g. `disabled: \${environment.name == "prod"}`). This can be handy when you only need certain modules for specific environments, e.g. only for development.

Disabling a module means that any services, tasks and tests contained in it will not be deployed or run. It also means that the module is not built _unless_ it is declared as a build dependency by another enabled module (in which case building this module is necessary for the dependant to be built).

If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden will automatically ignore those dependency declarations. Note however that template strings referencing the module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `include[]`

Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files that do *not* match these paths or globs are excluded when computing the version of the module, when responding to filesystem watch events, and when staging builds.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Also note that specifying an empty list here means _no sources_ should be included.

If neither `include` nor `exclude` is set, and the module has local chart sources, Garden
automatically sets `include` to: `["*", "charts/**/*", "templates/**/*"]`.

If neither `include` nor `exclude` is set and the module specifies a remote chart, Garden
automatically sets `ìnclude` to `[]`.

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

Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include` field, the files/patterns specified here are filtered from the files matched by `include`. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes. Use the project `modules.exclude` field to affect those, if you have large directories that should not be watched for changes.

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

| Type              | Required |
| ----------------- | -------- |
| `gitUrl | string` | No       |

Example:

```yaml
repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

### `allowPublish`

When false, disables pushing this module to remote registries.

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

POSIX-style filename to read the source file contents from, relative to the path of the module (or the ModuleTemplate configuration file if one is being applied).
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

### `atomicInstall`

Whether to set the --atomic flag during installs and upgrades. Set to false if e.g. you want to see more information about failures and then manually roll back, instead of having Helm do it automatically on failure.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `base`

The name of another `helm` module to use as a base for this one. Use this to re-use a Helm chart across multiple services. For example, you might have an organization-wide base chart for certain types of services.
If set, this module will by default inherit the following properties from the base module: `serviceResource`, `values`
Each of those can be overridden in this module. They will be merged with a JSON Merge Patch (RFC 7396).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
base: "my-base-chart"
```

### `chart`

A valid Helm chart name or URI (same as you'd input to `helm install`). Required if the module doesn't contain the Helm chart itself.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
chart: "ingress-nginx"
```

### `chartPath`

The path, relative to the module path, to the chart sources (i.e. where the Chart.yaml file is, if any). Not used when `base` is specified.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

### `dependencies[]`

List of names of services that should be deployed before this chart.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `devMode`

**EXPERIMENTAL**

Specifies which files or directories to sync to which paths inside the running containers of the service when it's in dev mode, and overrides for the container command and/or arguments.

Note that `serviceResource` must also be specified to enable dev mode.

Dev mode is enabled when running the `garden dev` command, and by setting the `--dev` flag on the `garden deploy` command.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `devMode.args[]`

[devMode](#devmode) > args

Override the default container arguments when in dev mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `devMode.command[]`

[devMode](#devmode) > command

Override the default container command (i.e. entrypoint) when in dev mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `devMode.sync[]`

[devMode](#devmode) > sync

Specify one or more source files or directories to automatically sync with the running container.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `devMode.sync[].source`

[devMode](#devmode) > [sync](#devmodesync) > source

POSIX-style path of the directory to sync to the target, relative to the module's top-level directory. Must be a relative path. Defaults to the module's top-level directory if no value is provided.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
devMode:
  ...
  sync:
    - source: "src"
```

### `devMode.sync[].target`

[devMode](#devmode) > [sync](#devmodesync) > target

POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is not allowed.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
devMode:
  ...
  sync:
    - target: "/app/src"
```

### `devMode.sync[].exclude[]`

[devMode](#devmode) > [sync](#devmodesync) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
devMode:
  ...
  sync:
    - exclude:
        - dist/**/*
        - '*.log'
```

### `devMode.sync[].mode`

[devMode](#devmode) > [sync](#devmodesync) > mode

The sync mode to use for the given paths. Allowed options: `one-way`, `one-way-replica`, `two-way`.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"one-way"` | No       |

### `devMode.containerName`

[devMode](#devmode) > containerName

Optionally specify the name of a specific container to sync to. If not specified, the first container in the workload is used.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `namespace`

A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `releaseName`

Optionally override the release name used when installing (defaults to the module name).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `repo`

The repository URL to fetch the chart from.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `serviceResource`

The Deployment, DaemonSet or StatefulSet that Garden should regard as the _Garden service_ in this module (not to be confused with Kubernetes Service resources). Because a Helm chart can contain any number of Kubernetes resources, this needs to be specified for certain Garden features and commands to work, such as hot-reloading.
We currently map a Helm chart to a single Garden service, because all the resources in a Helm chart are deployed at once.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `serviceResource.kind`

[serviceResource](#serviceresource) > kind

The type of Kubernetes resource to sync files to.

| Type     | Allowed Values                           | Default        | Required |
| -------- | ---------------------------------------- | -------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | `"Deployment"` | Yes      |

### `serviceResource.containerName`

[serviceResource](#serviceresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `serviceResource.name`

[serviceResource](#serviceresource) > name

The name of the resource to sync to. If the chart contains a single resource of the specified Kind,
this can be omitted.

This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'.
This allows you to easily match the dynamic names given by Helm. In most cases you should copy this
directly from the template in question in order to match it. Note that you may need to add single quotes around
the string for the YAML to be parsed correctly.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `serviceResource.containerModule`

[serviceResource](#serviceresource) > containerModule

The Garden module that contains the sources for the container. This needs to be specified under `serviceResource` in order to enable hot-reloading, but is not necessary for tasks and tests.
Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the container module.
Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
serviceResource:
  ...
  containerModule: "my-container-module"
```

### `serviceResource.hotReloadArgs[]`

[serviceResource](#serviceresource) > hotReloadArgs

If specified, overrides the arguments for the main container when running in hot-reload mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
serviceResource:
  ...
  hotReloadArgs:
    - nodemon
    - my-server.js
```

### `skipDeploy`

Set this to true if the chart should only be built, but not deployed as a service. Use this, for example, if the chart should only be used as a base for other modules.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `tasks[]`

The task definitions for this module.

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

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `tasks[].disabled`

[tasks](#tasks) > disabled

Set this to `true` to disable the task. You can use this with conditional template strings to enable/disable tasks based on, for example, the current environment or other variables (e.g. `enabled: \${environment.name != "prod"}`). This can be handy when you only want certain tasks to run in specific environments, e.g. only for development.

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
| `number` | `null`  | No       |

### `tasks[].cacheResult`

[tasks](#tasks) > cacheResult

Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any time your project (or one or more of the task's dependants) is deployed. Otherwise the task is only re-run when its version changes (i.e. the module or one of its dependencies is modified), or when you run `garden run task`.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `tasks[].command[]`

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

### `tasks[].args[]`

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

### `tasks[].env`

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

### `tasks[].artifacts[]`

[tasks](#tasks) > artifacts

Specify artifacts to copy out of the container after the run. The artifacts are stored locally under
the `.garden/artifacts` directory.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `tasks[].artifacts[].source`

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

### `tasks[].artifacts[].target`

[tasks](#tasks) > [artifacts](#tasksartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
tasks:
  - artifacts:
      - target: "outputs/foo/"
```

### `tasks[].resource`

[tasks](#tasks) > resource

The Deployment, DaemonSet or StatefulSet that Garden should use to execute this task.
If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
an error will be thrown.

The following pod spec fields from the service resource will be used (if present) when executing the task:
* `affinity`
* `automountServiceAccountToken`
* `containers`
* `dnsConfig`
* `dnsPolicy`
* `enableServiceLinks`
* `hostAliases`
* `hostIPC`
* `hostNetwork`
* `hostPID`
* `hostname`
* `imagePullSecrets`
* `nodeName`
* `nodeSelector`
* `overhead`
* `preemptionPolicy`
* `priority`
* `priorityClassName`
* `runtimeClassName`
* `schedulerName`
* `securityContext`
* `serviceAccount`
* `serviceAccountName`
* `shareProcessNamespace`
* `subdomain`
* `tolerations`
* `topologySpreadConstraints`
* `volumes`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `tasks[].resource.kind`

[tasks](#tasks) > [resource](#tasksresource) > kind

The type of Kubernetes resource to sync files to.

| Type     | Allowed Values                           | Default        | Required |
| -------- | ---------------------------------------- | -------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | `"Deployment"` | Yes      |

### `tasks[].resource.containerName`

[tasks](#tasks) > [resource](#tasksresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tasks[].resource.name`

[tasks](#tasks) > [resource](#tasksresource) > name

The name of the resource to sync to. If the chart contains a single resource of the specified Kind,
this can be omitted.

This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'.
This allows you to easily match the dynamic names given by Helm. In most cases you should copy this
directly from the template in question in order to match it. Note that you may need to add single quotes around
the string for the YAML to be parsed correctly.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tasks[].resource.containerModule`

[tasks](#tasks) > [resource](#tasksresource) > containerModule

The Garden module that contains the sources for the container. This needs to be specified under `serviceResource` in order to enable hot-reloading, but is not necessary for tasks and tests.
Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the container module.
Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
tasks:
  - resource:
      ...
      containerModule: "my-container-module"
```

### `tasks[].resource.hotReloadArgs[]`

[tasks](#tasks) > [resource](#tasksresource) > hotReloadArgs

If specified, overrides the arguments for the main container when running in hot-reload mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tasks:
  - resource:
      ...
      hotReloadArgs:
        - nodemon
        - my-server.js
```

### `tests[]`

The test suite definitions for this module.

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
`enabled: \${environment.name != "prod"}`). This is handy when you only want certain tests to run in
specific environments, e.g. only during CI.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `tests[].timeout`

[tests](#tests) > timeout

Maximum duration (in seconds) of the test run.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `null`  | No       |

### `tests[].command[]`

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

### `tests[].args[]`

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

### `tests[].env`

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

### `tests[].artifacts[]`

[tests](#tests) > artifacts

Specify artifacts to copy out of the container after the run. The artifacts are stored locally under
the `.garden/artifacts` directory.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `tests[].artifacts[].source`

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

### `tests[].artifacts[].target`

[tests](#tests) > [artifacts](#testsartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
tests:
  - artifacts:
      - target: "outputs/foo/"
```

### `tests[].resource`

[tests](#tests) > resource

The Deployment, DaemonSet or StatefulSet that Garden should use to execute this test suite.
If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
an error will be thrown.

The following pod spec fields from the service resource will be used (if present) when executing the test suite:
* `affinity`
* `automountServiceAccountToken`
* `containers`
* `dnsConfig`
* `dnsPolicy`
* `enableServiceLinks`
* `hostAliases`
* `hostIPC`
* `hostNetwork`
* `hostPID`
* `hostname`
* `imagePullSecrets`
* `nodeName`
* `nodeSelector`
* `overhead`
* `preemptionPolicy`
* `priority`
* `priorityClassName`
* `runtimeClassName`
* `schedulerName`
* `securityContext`
* `serviceAccount`
* `serviceAccountName`
* `shareProcessNamespace`
* `subdomain`
* `tolerations`
* `topologySpreadConstraints`
* `volumes`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `tests[].resource.kind`

[tests](#tests) > [resource](#testsresource) > kind

The type of Kubernetes resource to sync files to.

| Type     | Allowed Values                           | Default        | Required |
| -------- | ---------------------------------------- | -------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | `"Deployment"` | Yes      |

### `tests[].resource.containerName`

[tests](#tests) > [resource](#testsresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tests[].resource.name`

[tests](#tests) > [resource](#testsresource) > name

The name of the resource to sync to. If the chart contains a single resource of the specified Kind,
this can be omitted.

This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'.
This allows you to easily match the dynamic names given by Helm. In most cases you should copy this
directly from the template in question in order to match it. Note that you may need to add single quotes around
the string for the YAML to be parsed correctly.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tests[].resource.containerModule`

[tests](#tests) > [resource](#testsresource) > containerModule

The Garden module that contains the sources for the container. This needs to be specified under `serviceResource` in order to enable hot-reloading, but is not necessary for tasks and tests.
Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the container module.
Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
tests:
  - resource:
      ...
      containerModule: "my-container-module"
```

### `tests[].resource.hotReloadArgs[]`

[tests](#tests) > [resource](#testsresource) > hotReloadArgs

If specified, overrides the arguments for the main container when running in hot-reload mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tests:
  - resource:
      ...
      hotReloadArgs:
        - nodemon
        - my-server.js
```

### `timeout`

Time in seconds to wait for Helm to complete any individual Kubernetes operation (like Jobs for hooks).

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `300`   | No       |

### `version`

The chart version to deploy.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `values`

Map of values to pass to Helm when rendering the templates. May include arrays and nested objects. When specified, these take precedence over the values in the `values.yaml` file (or the files specified in `valueFiles`).

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `valueFiles[]`

Specify value files to use when rendering the Helm chart. These will take precedence over the `values.yaml` file
bundled in the Helm chart, and should be specified in ascending order of precedence. Meaning, the last file in
this list will have the highest precedence.

If you _also_ specify keys under the `values` field, those will effectively be added as another file at the end
of this list, so they will take precedence over other files listed here.

Note that the paths here should be relative to the _module_ root, and the files should be contained in
your module directory.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |


## Outputs

### Module Outputs

The following keys are available via the `${modules.<module-name>}` template string key for `helm`
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

The local path of the module.

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

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

### `${modules.<module-name>.version}`

The current version of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.version}
```

### `${modules.<module-name>.outputs.release-name}`

The Helm release name of the service.

| Type     |
| -------- |
| `string` |


### Service Outputs

The following keys are available via the `${runtime.services.<service-name>}` template string key for `helm` module services.
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

The following keys are available via the `${runtime.tasks.<task-name>}` template string key for `helm` module tasks.
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

