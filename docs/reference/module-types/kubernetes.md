---
title: "`kubernetes` Module Type"
tocTitle: "`kubernetes`"
---

# `kubernetes` Module Type

{% hint style="warning" %}
Modules are deprecated and will be removed in version `0.14`. Please use [action](../../getting-started/basics.md#anatomy-of-a-garden-action)-based configuration instead. See the [0.12 to Bonsai migration guide](../../misc/migrating-to-bonsai.md) for details.
{% endhint %}

## Description

Specify one or more Kubernetes manifests to deploy.

You can either (or both) specify the manifests as part of the `garden.yml` configuration, or you can refer to one or more files with existing manifests.

Note that if you include the manifests in the `garden.yml` file, you can use [template strings](https://docs.garden.io/cedar-0.14/config-guides/variables-and-templating) to interpolate values into the manifests.

If you need more advanced templating features you can use the [helm](./helm.md) Deploy type.

Below is the full schema reference.

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`kubernetes` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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

# POSIX-style paths to YAML files to load manifests from. Each can contain multiple manifests, and can include any
# Garden template strings, which will be resolved before applying the manifests.
files: []

# Resolve the specified kustomization and include the resulting resources. Note that if you specify `files` or
# `manifests` as well, these are also included.
kustomize:
  # The directory path where the desired kustomization.yaml is, or a git repository URL. This could be the path to an
  # overlay directory, for example. If it's a path, must be a relative POSIX-style path and must be within the action
  # root. Defaults to the action root. If you set this to null, kustomize will not be run.
  path: .

  # The Kustomize version to use.
  version: 5

  # A list of additional arguments to pass to the `kustomize build` command. Note that specifying '-o' or '--output'
  # is not allowed.
  extraArgs: []

# List of Kubernetes resource manifests to deploy. If `files` is also specified, this is combined with the manifests
# read from the files.
manifests:
  - # The API version of the resource.
    apiVersion:

    # The kind of the resource.
    kind:

    metadata:
      # The name of the resource.
      name:

# A list of resources to patch using Kubernetes' patch strategies. This is useful for e.g. overwriting a given
# container image name with an image built by Garden
# without having to actually modify the underlying Kubernetes manifest in your source code. Another common example is
# to use this to change the number of replicas for a given
# Kubernetes Deployment.
#
# Under the hood, Garden just applies the `kubectl patch` command to the resource that matches the specified `kind`
# and `name`.
#
# Patches are applied to file manifests, inline manifests, and kustomize files.
#
# You can learn more about patching Kubernetes resources here:
# https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/
patchResources:
  - # The kind of the resource to patch.
    kind:

    # The name of the resource to patch.
    name:

    # The patch strategy to use. One of 'json', 'merge', or 'strategic'. Defaults to 'strategic'.
    #
    # You can read more about the different strategies in the offical Kubernetes documentation at:
    # https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/
    strategy: strategic

    # The patch to apply.
    patch:

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

# The maximum duration (in seconds) to wait for resources to deploy and become healthy.
timeout: 300

# Additional arguments to pass to `kubectl apply`.
applyArgs:

# Wait until the jobs have been completed. Garden will wait for as long as `timeout`.
waitForJobs:

# The names of any services that this service depends on at runtime, and the names of any tasks that should be
# executed before this service is deployed.
dependencies: []

# Specifies which files or directories to sync to which paths inside the running containers of the service when it's
# in sync mode, and overrides for the container command and/or arguments.
#
# Note that `serviceResource` must also be specified to enable sync.
#
# Sync is enabled by setting the `--sync` flag on the `garden deploy` command.
#
# See the [Code Synchronization guide](https://docs.garden.io/cedar-0.14/guides/code-synchronization) for more
# information.
sync:
  # Override the default container arguments when in sync mode.
  args:

  # Override the default container command (i.e. entrypoint) when in sync mode.
  command:

  # Specify one or more source files or directories to automatically sync with the running container.
  paths:
    - # Path to a local directory to be synchronized with the target.
      # This should generally be a templated path to another action's source path (e.g.
      # `${actions.build.my-container-image.sourcePath}`), or a relative path.
      # If a path is hard-coded, we recommend sticking with relative paths here, and using forward slashes (`/`) as a
      # delimiter, as Windows-style paths with back slashes (`\`) and absolute paths will work on some platforms, but
      # they are not portable and will not work for users on other platforms.
      # Defaults to the Deploy action's config's directory if no value is provided.
      source: .

      # POSIX-style absolute path to sync to inside the container. The root path (i.e. "/") is not allowed.
      target:

      # Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.
      #
      # `.git` directories and `.garden` directories are always ignored.
      exclude:

      # The sync mode to use for the given paths. See the [Code Synchronization
      # guide](https://docs.garden.io/cedar-0.14/guides/code-synchronization) for details.
      mode: one-way-safe

      # The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0o644
      # (user can read/write, everyone else can read). See the [Mutagen
      # docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.
      defaultFileMode: 420

      # The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to
      # 0o755 (user can read/write, everyone else can read). See the [Mutagen
      # docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.
      defaultDirectoryMode: 493

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

# [EXPERIMENTAL] Configures the local application which will send and receive network requests instead of the target
# resource specified by `localMode.target` or `defaultTarget`. One of those fields must be specified to enable local
# mode for the action.
#
# The selected container of the target Kubernetes resource will be replaced by a proxy container which runs an SSH
# server to proxy requests.
# Reverse port-forwarding will be automatically configured to route traffic to the locally run application and back.
#
# Local mode is enabled by setting the `--local` option on the `garden deploy` command.
# Local mode always takes the precedence over sync mode if there are any conflicting service names.
#
# Health checks are disabled for services running in local mode.
#
# Note! This feature is still experimental. Some incompatible changes can be made until the first non-experimental
# release.
localMode:
  # The reverse port-forwards configuration for the local application.
  ports:
    - # The local port to be used for reverse port-forward.
      local:

      # The remote port to be used for reverse port-forward.
      remote:

  # The command to run the local application. If not present, then the local application should be started manually.
  command:

  # Specifies restarting policy for the local application. By default, the local application will be restarting
  # infinitely with 1000ms between attempts.
  restart:
    # Delay in milliseconds between the local application restart attempts. The default value is 1000ms.
    delayMsec: 1000

    # Max number of the local application restarts. Unlimited by default.
    max: .inf

  # The remote Kubernetes resource to proxy traffic from. If specified, this is used instead of `defaultTarget`.
  target:
    # The kind of Kubernetes resource to find.
    kind:

    # The name of the resource, of the specified `kind`. If specified, you must also specify `kind`.
    name:

    # A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with
    # matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.
    podSelector:

    # The name of a container in the target. Specify this if the target contains more than one container and the main
    # container is not the first container in the spec.
    containerName:

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

  # The name of the resource to sync to. If the action contains a single resource of the specified Kind, this can be
  # omitted.
  name:

  # The name of a container in the target. Specify this if the target contains more than one container and the main
  # container is not the first container in the spec.
  containerName:

  # A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with
  # matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.
  podSelector:

  # The Garden module that contains the sources for the container. This needs to be specified under `serviceResource`
  # in order to enable syncing, but is not necessary for tasks and tests. Must be a `container` module.
  #
  # _Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`._
  containerModule:

tasks:
  - # The name of the task.
    name:

    # A description of the task.
    description:

    # The names of any tasks that must be executed, and the names of any services that must be running, before this
    # task is executed.
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

    # The Deployment, DaemonSet, StatefulSet or Pod that Garden should use to execute this task.
    # If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
    # an error will be thrown.
    #
    # This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name`
    # fields, or a Pod via the `podSelector` field.
    #
    # The following pod spec fields from the service resource will be used (if present) when executing the task:
    #
    # **Warning**: Garden will retain `configMaps` and `secrets` as volumes, but remove `persistentVolumeClaim`
    # volumes from the Pod spec, as they might already be mounted.
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

      # The name of the resource to sync to. If the action contains a single resource of the specified Kind, this can
      # be omitted.
      name:

      # The name of a container in the target. Specify this if the target contains more than one container and the
      # main container is not the first container in the spec.
      containerName:

      # A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod
      # with matching labels will be picked as a target, so make sure the labels will always match a specific Pod
      # type.
      podSelector:

    # Set to false if you don't want the Run action result to be cached. Use this if the Run action needs to be run
    # any time your project (or one or more of the Run action's dependants) is deployed. Otherwise the Run action is
    # only re-run when its version changes, or when you run `garden run`.
    cacheResult: true

    # The command/entrypoint used to run inside the container.
    command:

    # The arguments to pass to the command/entrypoint used for execution.
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

    # A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters,
    # numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63
    # characters.
    namespace:

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

    # The Deployment, DaemonSet or StatefulSet or Pod that Garden should use to execute this test suite.
    # If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
    # an error will be thrown.
    #
    # This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name`
    # fields, or a Pod via the `podSelector` field.
    #
    # The following pod spec fields from the service resource will be used (if present) when executing the test suite:
    #
    # **Warning**: Garden will retain `configMaps` and `secrets` as volumes, but remove `persistentVolumeClaim`
    # volumes from the Pod spec, as they might already be mounted.
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

      # The name of the resource to sync to. If the action contains a single resource of the specified Kind, this can
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

The directory path where the desired kustomization.yaml is, or a git repository URL. This could be the path to an overlay directory, for example. If it's a path, must be a relative POSIX-style path and must be within the action root. Defaults to the action root. If you set this to null, kustomize will not be run.

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `posixPath \| string` | `"."`   | No       |

### `kustomize.version`

[kustomize](#kustomize) > version

The Kustomize version to use.

| Type     | Allowed Values | Default | Required |
| -------- | -------------- | ------- | -------- |
| `number` | 4, 5           | `5`     | Yes      |

### `kustomize.extraArgs[]`

[kustomize](#kustomize) > extraArgs

A list of additional arguments to pass to the `kustomize build` command. Note that specifying '-o' or '--output' is not allowed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `manifests[]`

List of Kubernetes resource manifests to deploy. If `files` is also specified, this is combined with the manifests read from the files.

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

### `patchResources[]`

A list of resources to patch using Kubernetes' patch strategies. This is useful for e.g. overwriting a given container image name with an image built by Garden
without having to actually modify the underlying Kubernetes manifest in your source code. Another common example is to use this to change the number of replicas for a given
Kubernetes Deployment.

Under the hood, Garden just applies the `kubectl patch` command to the resource that matches the specified `kind` and `name`.

Patches are applied to file manifests, inline manifests, and kustomize files.

You can learn more about patching Kubernetes resources here: https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `patchResources[].kind`

[patchResources](#patchresources) > kind

The kind of the resource to patch.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `patchResources[].name`

[patchResources](#patchresources) > name

The name of the resource to patch.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `patchResources[].strategy`

[patchResources](#patchresources) > strategy

The patch strategy to use. One of 'json', 'merge', or 'strategic'. Defaults to 'strategic'.

You can read more about the different strategies in the offical Kubernetes documentation at:
https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/

| Type     | Default       | Required |
| -------- | ------------- | -------- |
| `string` | `"strategic"` | No       |

### `patchResources[].patch`

[patchResources](#patchresources) > patch

The patch to apply.

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

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

### `timeout`

The maximum duration (in seconds) to wait for resources to deploy and become healthy.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `300`   | No       |

### `applyArgs[]`

Additional arguments to pass to `kubectl apply`.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `waitForJobs`

Wait until the jobs have been completed. Garden will wait for as long as `timeout`.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `dependencies[]`

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `sync`

Specifies which files or directories to sync to which paths inside the running containers of the service when it's in sync mode, and overrides for the container command and/or arguments.

Note that `serviceResource` must also be specified to enable sync.

Sync is enabled by setting the `--sync` flag on the `garden deploy` command.

See the [Code Synchronization guide](https://docs.garden.io/cedar-0.14/guides/code-synchronization) for more information.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `sync.args[]`

[sync](#sync) > args

Override the default container arguments when in sync mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `sync.command[]`

[sync](#sync) > command

Override the default container command (i.e. entrypoint) when in sync mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `sync.paths[]`

[sync](#sync) > paths

Specify one or more source files or directories to automatically sync with the running container.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `sync.paths[].source`

[sync](#sync) > [paths](#syncpaths) > source

Path to a local directory to be synchronized with the target.
This should generally be a templated path to another action's source path (e.g. `${actions.build.my-container-image.sourcePath}`), or a relative path.
If a path is hard-coded, we recommend sticking with relative paths here, and using forward slashes (`/`) as a delimiter, as Windows-style paths with back slashes (`\`) and absolute paths will work on some platforms, but they are not portable and will not work for users on other platforms.
Defaults to the Deploy action's config's directory if no value is provided.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"."`   | No       |

Example:

```yaml
sync:
  ...
  paths:
    - source: "src"
```

### `sync.paths[].target`

[sync](#sync) > [paths](#syncpaths) > target

POSIX-style absolute path to sync to inside the container. The root path (i.e. "/") is not allowed.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
sync:
  ...
  paths:
    - target: "/app/src"
```

### `sync.paths[].exclude[]`

[sync](#sync) > [paths](#syncpaths) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

`.git` directories and `.garden` directories are always ignored.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
sync:
  ...
  paths:
    - exclude:
        - dist/**/*
        - '*.log'
```

### `sync.paths[].mode`

[sync](#sync) > [paths](#syncpaths) > mode

The sync mode to use for the given paths. See the [Code Synchronization guide](https://docs.garden.io/cedar-0.14/guides/code-synchronization) for details.

| Type     | Allowed Values                                                                                                                            | Default          | Required |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- |
| `string` | "one-way", "one-way-safe", "one-way-replica", "one-way-reverse", "one-way-replica-reverse", "two-way", "two-way-safe", "two-way-resolved" | `"one-way-safe"` | Yes      |

### `sync.paths[].defaultFileMode`

[sync](#sync) > [paths](#syncpaths) > defaultFileMode

The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0o644 (user can read/write, everyone else can read). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `0o644` | No       |

### `sync.paths[].defaultDirectoryMode`

[sync](#sync) > [paths](#syncpaths) > defaultDirectoryMode

The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to 0o755 (user can read/write, everyone else can read). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `0o755` | No       |

### `sync.paths[].defaultOwner`

[sync](#sync) > [paths](#syncpaths) > defaultOwner

Set the default owner of files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type               | Required |
| ------------------ | -------- |
| `number \| string` | No       |

### `sync.paths[].defaultGroup`

[sync](#sync) > [paths](#syncpaths) > defaultGroup

Set the default group on files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type               | Required |
| ------------------ | -------- |
| `number \| string` | No       |

### `sync.containerName`

[sync](#sync) > containerName

Optionally specify the name of a specific container to sync to. If not specified, the first container in the workload is used.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `localMode`

{% hint style="warning" %}
**Deprecated**: The local mode will be removed in the next major version of Garden, 0.14.
{% endhint %}

[EXPERIMENTAL] Configures the local application which will send and receive network requests instead of the target resource specified by `localMode.target` or `defaultTarget`. One of those fields must be specified to enable local mode for the action.

The selected container of the target Kubernetes resource will be replaced by a proxy container which runs an SSH server to proxy requests.
Reverse port-forwarding will be automatically configured to route traffic to the locally run application and back.

Local mode is enabled by setting the `--local` option on the `garden deploy` command.
Local mode always takes the precedence over sync mode if there are any conflicting service names.

Health checks are disabled for services running in local mode.

Note! This feature is still experimental. Some incompatible changes can be made until the first non-experimental release.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `localMode.ports[]`

[localMode](#localmode) > ports

The reverse port-forwards configuration for the local application.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `localMode.ports[].local`

[localMode](#localmode) > [ports](#localmodeports) > local

The local port to be used for reverse port-forward.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `localMode.ports[].remote`

[localMode](#localmode) > [ports](#localmodeports) > remote

The remote port to be used for reverse port-forward.

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

### `localMode.target`

[localMode](#localmode) > target

The remote Kubernetes resource to proxy traffic from. If specified, this is used instead of `defaultTarget`.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `localMode.target.kind`

[localMode](#localmode) > [target](#localmodetarget) > kind

The kind of Kubernetes resource to find.

| Type     | Allowed Values                           | Required |
| -------- | ---------------------------------------- | -------- |
| `string` | "Deployment", "DaemonSet", "StatefulSet" | Yes      |

### `localMode.target.name`

[localMode](#localmode) > [target](#localmodetarget) > name

The name of the resource, of the specified `kind`. If specified, you must also specify `kind`.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `localMode.target.podSelector`

[localMode](#localmode) > [target](#localmodetarget) > podSelector

A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `localMode.target.containerName`

[localMode](#localmode) > [target](#localmodetarget) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

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

The name of the resource to sync to. If the action contains a single resource of the specified Kind, this can be omitted.

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

The Garden module that contains the sources for the container. This needs to be specified under `serviceResource` in order to enable syncing, but is not necessary for tasks and tests. Must be a `container` module.

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

### `tasks[].resource`

[tasks](#tasks) > resource

The Deployment, DaemonSet, StatefulSet or Pod that Garden should use to execute this task.
If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
an error will be thrown.

This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name` fields, or a Pod via the `podSelector` field.

The following pod spec fields from the service resource will be used (if present) when executing the task:

**Warning**: Garden will retain `configMaps` and `secrets` as volumes, but remove `persistentVolumeClaim` volumes from the Pod spec, as they might already be mounted.
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

The name of the resource to sync to. If the action contains a single resource of the specified Kind, this can be omitted.

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

Set to false if you don't want the Run action result to be cached. Use this if the Run action needs to be run any time your project (or one or more of the Run action's dependants) is deployed. Otherwise the Run action is only re-run when its version changes, or when you run `garden run`.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `tasks[].command[]`

[tasks](#tasks) > command

The command/entrypoint used to run inside the container.

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

The arguments to pass to the command/entrypoint used for execution.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tasks:
  - args:
      - rake
      - db:migrate
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

### `tasks[].namespace`

[tasks](#tasks) > namespace

A valid Kubernetes namespace name. Must be a valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash) and must not be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

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

### `tests[].resource`

[tests](#tests) > resource

The Deployment, DaemonSet or StatefulSet or Pod that Garden should use to execute this test suite.
If not specified, the `serviceResource` configured on the module will be used. If neither is specified,
an error will be thrown.

This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name` fields, or a Pod via the `podSelector` field.

The following pod spec fields from the service resource will be used (if present) when executing the test suite:

**Warning**: Garden will retain `configMaps` and `secrets` as volumes, but remove `persistentVolumeClaim` volumes from the Pod spec, as they might already be mounted.
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

The name of the resource to sync to. If the action contains a single resource of the specified Kind, this can be omitted.

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

