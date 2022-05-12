---
title: "`kubernetes` Module Type"
tocTitle: "`kubernetes`"
---

# `kubernetes` Module Type

## Description

Specify one or more Kubernetes manifests to deploy.

You can either (or both) specify the manifests as part of the `garden.yml` configuration, or you can refer to
one or more files with existing manifests.

Note that if you include the manifests in the `garden.yml` file, you can use
[template strings](../../using-garden/variables-and-templating.md) to interpolate values into the manifests.

If you need more advanced templating features you can use the [helm](./helm.md) module type.

Below is the full schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../../using-garden/configuration-overview.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`kubernetes` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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

  # Maximum time in seconds to wait for build to finish.
  timeout: 1200

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
# If neither `include` nor `exclude` is set, Garden automatically sets `include` to equal the
# `files` directive so that only the Kubernetes manifests get included.
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
# * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
# * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
# contain any value type.
# * `.json` - JSON. Must contain a single JSON _object_ (not an array).
#
# _NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of nested
# objects and arrays._
#
# To use different module-level varfiles in different environments, you can template in the environment name
# to the varfile name, e.g. `varfile: "my-module.\$\{environment.name\}.env` (this assumes that the corresponding
# varfiles exist).
varfile:

# The names of any services that this service depends on at runtime, and the names of any tasks that should be
# executed before this service is deployed.
dependencies: []

# Specifies which files or directories to sync to which paths inside the running containers of the service when it's
# in dev mode, and overrides for the container command and/or arguments.
#
# Note that `serviceResource` must also be specified to enable dev mode.
#
# Dev mode is enabled when running the `garden dev` command, and by setting the `--dev` flag on the `garden deploy`
# command.
#
# See the [Code Synchronization guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for more
# information.
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
      #
      # `.git` directories and `.garden` directories are always ignored.
      exclude:

      # The sync mode to use for the given paths. See the [Dev Mode
      # guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for details.
      mode: one-way-safe

      # The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0600 (user
      # read/write). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions)
      # for more information.
      defaultFileMode:

      # The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to 0700
      # (user read/write). See the [Mutagen
      # docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.
      defaultDirectoryMode:

      # Set the default owner of files and directories at the target. Specify either an integer ID or a string name.
      # See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for
      # more information.
      defaultOwner:

      # Set the default group on files and directories at the target. Specify either an integer ID or a string name.
      # See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for
      # more information.
      defaultGroup:

  # Optionally specify the name of a specific container to sync to. If not specified, the first container in the
  # workload is used.
  containerName:

# Specifies necessary configuration details of the local application which will replace a target remote service.
#
# The target service will be replaced by a proxy container with an SSH server running,
# and the reverse port forwarding will be automatically configured to route the traffic to the local service and back.
#
# Local mode is enabled by setting the `--local` option on the `garden deploy` or `garden dev` commands.
# The local mode always takes the precedence over the dev mode if there are any conflicts service names.
#
# The health checks are disabled for services running in local mode.
#
# See the [Local Mode guide](https://docs.garden.io/guides/running-service-in-local-mode.md) for more information.
localMode:
  # The working port of the local application.
  localPort:

  # The command to run the local application. If not present, then the local application should be started manually.
  command:

  # Specifies restarting policy for the local application. By default, the local application will be restarting
  # infinitely with 1000ms between attempts.
  restart:
    # Delay in milliseconds between the local application restart attempts. The default value is 1000ms.
    delayMsec: 1000

    # Max number of the local application restarts. Unlimited by default.
    max: .inf

  # The k8s name of the target remote container.
  containerName:

# POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests, and can include any
# Garden template strings, which will be resolved before applying the manifests.
files: []

# Resolve the specified kustomization and include the resulting resources. Note that if you specify `files` or
# `manifests` as well, these are also included.
kustomize:
  # The directory path where the desired kustomization.yaml is, or a git repository URL. This could be the path to an
  # overlay directory, for example. If it's a path, must be a relative POSIX-style path and must be within the module
  # root. Defaults to the module root. If you set this to null, kustomize will not be run.
  path: .

  # A list of additional arguments to pass to the `kustomize build` command. Note that specifying '-o' or '--output'
  # is not allowed.
  extraArgs: []

# List of Kubernetes resource manifests to deploy. Use this instead of the `files` field if you need to resolve
# template strings in any of the manifests.
manifests:
  - # The API version of the resource.
    apiVersion:

    # The kind of the resource.
    kind:

    metadata:
      # The name of the resource.
      name:

# A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters,
# numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63 characters.
namespace:

# Manually specify port forwards that Garden should set up when deploying in dev or watch mode. If specified, these
# override the auto-detection of forwardable ports, so you'll need to specify the full list of port forwards to
# create.
portForwards:
  - # An identifier to describe the port forward.
    name:

    # The full resource kind and name to forward to, e.g. Service/my-service or Deployment/my-deployment. Note that
    # Garden will not validate this ahead of attempting to start the port forward, so you need to make sure this is
    # correctly set. The types of resources supported will match that of the `kubectl port-forward` CLI command.
    resource:

    # The port number on the remote resource to forward to.
    targetPort:

    # The _preferred_ local port to forward from. If none is set, a random port is chosen. If the specified port is
    # not available, a warning is shown and a random port chosen instead.
    localPort:

# The Deployment, DaemonSet or StatefulSet or Pod that Garden should regard as the _Garden service_ in this module
# (not to be confused with Kubernetes Service resources).
#
# This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name` fields,
# or a Pod via the `podSelector` field.
#
# Because a `kubernetes` module can contain any number of Kubernetes resources, this needs to be specified for certain
# Garden features and commands to work.
serviceResource:
  # The type of Kubernetes resource to sync files to.
  kind: Deployment

  # The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can be
  # omitted.
  name:

  # The name of a container in the target. Specify this if the target contains more than one container and the main
  # container is not the first container in the spec.
  containerName:

  # A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with
  # matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.
  podSelector:

  # The Garden module that contains the sources for the container. This needs to be specified under `serviceResource`
  # in order to enable hot-reloading and dev mode, but is not necessary for tasks and tests.
  #
  # Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the
  # container module (not required for dev mode).
  #
  # _Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`._
  containerModule:

  # If specified, overrides the arguments for the main container when running in hot-reload mode.
  hotReloadArgs:

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

    # The Deployment, DaemonSet, StatefulSet or Pod that Garden should use to execute this task.
    # If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
    # an error will be thrown.
    #
    # This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name`
    # fields, or a Pod via the `podSelector` field.
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

      # The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can
      # be omitted.
      name:

      # The name of a container in the target. Specify this if the target contains more than one container and the
      # main container is not the first container in the spec.
      containerName:

      # A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod
      # with matching labels will be picked as a target, so make sure the labels will always match a specific Pod
      # type.
      podSelector:

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

    # The Deployment, DaemonSet or StatefulSet or Pod that Garden should use to execute this test suite.
    # If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
    # an error will be thrown.
    #
    # This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name`
    # fields, or a Pod via the `podSelector` field.
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

      # The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can
      # be omitted.
      name:

      # The name of a container in the target. Specify this if the target contains more than one container and the
      # main container is not the first container in the spec.
      containerName:

      # A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod
      # with matching labels will be picked as a target, so make sure the labels will always match a specific Pod
      # type.
      podSelector:

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

# The maximum duration (in seconds) to wait for resources to deploy and become healthy.
timeout: 300
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

### `build.timeout`

[build](#build) > timeout

Maximum time in seconds to wait for build to finish.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1200`  | No       |

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

* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type.
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

To use different module-level varfiles in different environments, you can template in the environment name
to the varfile name, e.g. `varfile: "my-module.\$\{environment.name\}.env` (this assumes that the corresponding
varfiles exist).

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
varfile: "my-module.env"
```

### `dependencies[]`

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `devMode`

Specifies which files or directories to sync to which paths inside the running containers of the service when it's in dev mode, and overrides for the container command and/or arguments.

Note that `serviceResource` must also be specified to enable dev mode.

Dev mode is enabled when running the `garden dev` command, and by setting the `--dev` flag on the `garden deploy` command.

See the [Code Synchronization guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for more information.

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

`.git` directories and `.garden` directories are always ignored.

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

The sync mode to use for the given paths. See the [Dev Mode guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for details.

| Type     | Allowed Values                                                                                                                            | Default          | Required |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- |
| `string` | "one-way", "one-way-safe", "one-way-replica", "one-way-reverse", "one-way-replica-reverse", "two-way", "two-way-safe", "two-way-resolved" | `"one-way-safe"` | Yes      |

### `devMode.sync[].defaultFileMode`

[devMode](#devmode) > [sync](#devmodesync) > defaultFileMode

The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0600 (user read/write). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `devMode.sync[].defaultDirectoryMode`

[devMode](#devmode) > [sync](#devmodesync) > defaultDirectoryMode

The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to 0700 (user read/write). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `devMode.sync[].defaultOwner`

[devMode](#devmode) > [sync](#devmodesync) > defaultOwner

Set the default owner of files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type              | Required |
| ----------------- | -------- |
| `number | string` | No       |

### `devMode.sync[].defaultGroup`

[devMode](#devmode) > [sync](#devmodesync) > defaultGroup

Set the default group on files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type              | Required |
| ----------------- | -------- |
| `number | string` | No       |

### `devMode.containerName`

[devMode](#devmode) > containerName

Optionally specify the name of a specific container to sync to. If not specified, the first container in the workload is used.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `localMode`

Specifies necessary configuration details of the local application which will replace a target remote service.

The target service will be replaced by a proxy container with an SSH server running,
and the reverse port forwarding will be automatically configured to route the traffic to the local service and back.

Local mode is enabled by setting the `--local` option on the `garden deploy` or `garden dev` commands.
The local mode always takes the precedence over the dev mode if there are any conflicts service names.

The health checks are disabled for services running in local mode.

See the [Local Mode guide](https://docs.garden.io/guides/running-service-in-local-mode.md) for more information.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `localMode.localPort`

[localMode](#localmode) > localPort

The working port of the local application.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `localMode.command[]`

[localMode](#localmode) > command

The command to run the local application. If not present, then the local application should be started manually.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `localMode.restart`

[localMode](#localmode) > restart

Specifies restarting policy for the local application. By default, the local application will be restarting infinitely with 1000ms between attempts.

| Type     | Default                         | Required |
| -------- | ------------------------------- | -------- |
| `object` | `{"delayMsec":1000,"max":null}` | No       |

### `localMode.restart.delayMsec`

[localMode](#localmode) > [restart](#localmoderestart) > delayMsec

Delay in milliseconds between the local application restart attempts. The default value is 1000ms.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1000`  | No       |

### `localMode.restart.max`

[localMode](#localmode) > [restart](#localmoderestart) > max

Max number of the local application restarts. Unlimited by default.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `null`  | No       |

### `localMode.containerName`

[localMode](#localmode) > containerName

The k8s name of the target remote container.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `files[]`

POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests, and can include any Garden template strings, which will be resolved before applying the manifests.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

### `kustomize`

Resolve the specified kustomization and include the resulting resources. Note that if you specify `files` or `manifests` as well, these are also included.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `kustomize.path`

[kustomize](#kustomize) > path

The directory path where the desired kustomization.yaml is, or a git repository URL. This could be the path to an overlay directory, for example. If it's a path, must be a relative POSIX-style path and must be within the module root. Defaults to the module root. If you set this to null, kustomize will not be run.

| Type                 | Default | Required |
| -------------------- | ------- | -------- |
| `posixPath | string` | `"."`   | No       |

### `kustomize.extraArgs[]`

[kustomize](#kustomize) > extraArgs

A list of additional arguments to pass to the `kustomize build` command. Note that specifying '-o' or '--output' is not allowed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `manifests[]`

List of Kubernetes resource manifests to deploy. Use this instead of the `files` field if you need to resolve template strings in any of the manifests.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `manifests[].apiVersion`

[manifests](#manifests) > apiVersion

The API version of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `manifests[].kind`

[manifests](#manifests) > kind

The kind of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `manifests[].metadata`

[manifests](#manifests) > metadata

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

### `manifests[].metadata.name`

[manifests](#manifests) > [metadata](#manifestsmetadata) > name

The name of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `namespace`

A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `portForwards[]`

Manually specify port forwards that Garden should set up when deploying in dev or watch mode. If specified, these override the auto-detection of forwardable ports, so you'll need to specify the full list of port forwards to create.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `portForwards[].name`

[portForwards](#portforwards) > name

An identifier to describe the port forward.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `portForwards[].resource`

[portForwards](#portforwards) > resource

The full resource kind and name to forward to, e.g. Service/my-service or Deployment/my-deployment. Note that Garden will not validate this ahead of attempting to start the port forward, so you need to make sure this is correctly set. The types of resources supported will match that of the `kubectl port-forward` CLI command.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `portForwards[].targetPort`

[portForwards](#portforwards) > targetPort

The port number on the remote resource to forward to.

| Type     | Required |
| -------- | -------- |
| `number` | Yes      |

### `portForwards[].localPort`

[portForwards](#portforwards) > localPort

The _preferred_ local port to forward from. If none is set, a random port is chosen. If the specified port is not available, a warning is shown and a random port chosen instead.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `serviceResource`

The Deployment, DaemonSet or StatefulSet or Pod that Garden should regard as the _Garden service_ in this module (not to be confused with Kubernetes Service resources).

This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name` fields, or a Pod via the `podSelector` field.

Because a `kubernetes` module can contain any number of Kubernetes resources, this needs to be specified for certain Garden features and commands to work.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `serviceResource.kind`

[serviceResource](#serviceresource) > kind

The type of Kubernetes resource to sync files to.

| Type     | Allowed Values                           | Default        | Required |
| -------- | ---------------------------------------- | -------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | `"Deployment"` | Yes      |

### `serviceResource.name`

[serviceResource](#serviceresource) > name

The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can be omitted.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `serviceResource.containerName`

[serviceResource](#serviceresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `serviceResource.podSelector`

[serviceResource](#serviceresource) > podSelector

A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `serviceResource.containerModule`

[serviceResource](#serviceresource) > containerModule

The Garden module that contains the sources for the container. This needs to be specified under `serviceResource` in order to enable hot-reloading and dev mode, but is not necessary for tasks and tests.

Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the container module (not required for dev mode).

_Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`._

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

### `tasks[]`

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

### `tasks[].resource`

[tasks](#tasks) > resource

The Deployment, DaemonSet, StatefulSet or Pod that Garden should use to execute this task.
If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
an error will be thrown.

This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name` fields, or a Pod via the `podSelector` field.

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

### `tasks[].resource.name`

[tasks](#tasks) > [resource](#tasksresource) > name

The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can be omitted.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tasks[].resource.containerName`

[tasks](#tasks) > [resource](#tasksresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tasks[].resource.podSelector`

[tasks](#tasks) > [resource](#tasksresource) > podSelector

A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

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

### `tests[]`

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

### `tests[].resource`

[tests](#tests) > resource

The Deployment, DaemonSet or StatefulSet or Pod that Garden should use to execute this test suite.
If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
an error will be thrown.

This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name` fields, or a Pod via the `podSelector` field.

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

### `tests[].resource.name`

[tests](#tests) > [resource](#testsresource) > name

The name of the resource to sync to. If the module contains a single resource of the specified Kind, this can be omitted.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tests[].resource.containerName`

[tests](#tests) > [resource](#testsresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tests[].resource.podSelector`

[tests](#tests) > [resource](#testsresource) > podSelector

A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

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

### `timeout`

The maximum duration (in seconds) to wait for resources to deploy and become healthy.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `300`   | No       |


## Outputs

### Module Outputs

The following keys are available via the `${modules.<module-name>}` template string key for `kubernetes`
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


### Service Outputs

The following keys are available via the `${runtime.services.<service-name>}` template string key for `kubernetes` module services.
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

The following keys are available via the `${runtime.tasks.<task-name>}` template string key for `kubernetes` module tasks.
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

