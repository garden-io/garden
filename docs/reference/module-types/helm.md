---
title: "`helm` Module Type"
tocTitle: "`helm`"
---

# `helm` Module Type

{% hint style="warning" %}
Modules are deprecated and will be removed in version `0.14`. Please use [action](../../getting-started/basics.md#anatomy-of-a-garden-action)-based configuration instead. See the [0.12 to Bonsai migration guide](../../misc/migrating-to-bonsai.md) for details.
{% endhint %}

## Description

Specify a Helm chart (either in your repository or remote from a registry) to deploy.

Refer to the [Helm guide](../../garden-for/kubernetes/install-helm-chart.md) for usage instructions.

Garden uses Helm 3.18.3.

Below is the full schema reference.

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`helm` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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

# Optionally override the release name used when installing (defaults to the Deploy name).
releaseName:

# Time in seconds to wait for Helm to complete any individual Kubernetes operation (like Jobs for hooks).
timeout: 300

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
# Note that the paths here should be relative to the _config_ root, and the files should be contained in
# this action config's directory.
valueFiles: []

# Whether to set the `--atomic` flag during installs and upgrades. Set to `true` if you'd like the changes applied
# to be reverted on failure. Set to false if e.g. you want to see more information about failures and then manually
# roll back, instead of having Helm do it automatically on failure.
#
# Note that setting `atomic` to `true` implies `wait`.
atomicInstall: false

# The name of another `helm` module to use as a base for this one. Use this to re-use a Helm chart across multiple
# services. For example, you might have an organization-wide base chart for certain types of services.
# If set, this module will by default inherit the following properties from the base module: `serviceResource`,
# `values`
# Each of those can be overridden in this module. They will be merged with a JSON Merge Patch (RFC 7396).
base:

# A valid Helm chart name or URI (same as you'd input to `helm install`) Required if the action doesn't contain the
# Helm chart itself.
chart:

# The path, relative to the module path, to the chart sources (i.e. where the Chart.yaml file is, if any). Not used
# when `base` is specified.
chartPath: .

# List of names of services that should be deployed before this chart.
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

# The repository URL to fetch the chart from. Defaults to the "stable" helm repo (https://charts.helm.sh/stable).
repo:

# The Deployment, DaemonSet or StatefulSet or Pod that Garden should regard as the _Garden service_ in this module
# (not to be confused with Kubernetes Service resources).
#
# This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name` fields,
# or a Pod via the `podSelector` field.
#
# Because a Helm chart can contain any number of Kubernetes resources, this needs to be specified for certain Garden
# features and commands to work.
serviceResource:
  # The type of Kubernetes resource to sync files to.
  kind: Deployment

  # The name of a container in the target. Specify this if the target contains more than one container and the main
  # container is not the first container in the spec.
  containerName:

  # A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with
  # matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.
  podSelector:

  # The name of the resource to sync to. If the chart contains a single resource of the specified Kind,
  # this can be omitted.
  #
  # This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'.
  # This allows you to easily match the dynamic names given by Helm. In most cases you should copy this
  # directly from the template in question in order to match it. Note that you may need to add single quotes around
  # the string for the YAML to be parsed correctly.
  name:

  # The Garden module that contains the sources for the container. This needs to be specified under `serviceResource`
  # in order to enable syncing, but is not necessary for tasks and tests. Must be a `container` module.
  #
  # _Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`._
  containerModule:

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

    # The Deployment, DaemonSet or StatefulSet or Pod that Garden should use to execute this task.
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

      # The name of a container in the target. Specify this if the target contains more than one container and the
      # main container is not the first container in the spec.
      containerName:

      # A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod
      # with matching labels will be picked as a target, so make sure the labels will always match a specific Pod
      # type.
      podSelector:

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
      # `serviceResource` in order to enable syncing, but is not necessary for tasks and tests. Must be a `container`
      # module.
      #
      # _Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`._
      containerModule:

# The test suite definitions for this module.
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

      # The name of a container in the target. Specify this if the target contains more than one container and the
      # main container is not the first container in the spec.
      containerName:

      # A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod
      # with matching labels will be picked as a target, so make sure the labels will always match a specific Pod
      # type.
      podSelector:

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
      # `serviceResource` in order to enable syncing, but is not necessary for tasks and tests. Must be a `container`
      # module.
      #
      # _Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`._
      containerModule:

# The chart version to deploy.
version:
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

### `releaseName`

Optionally override the release name used when installing (defaults to the Deploy name).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `timeout`

Time in seconds to wait for Helm to complete any individual Kubernetes operation (like Jobs for hooks).

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `300`   | No       |

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

Note that the paths here should be relative to the _config_ root, and the files should be contained in
this action config's directory.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

### `atomicInstall`

Whether to set the `--atomic` flag during installs and upgrades. Set to `true` if you'd like the changes applied
to be reverted on failure. Set to false if e.g. you want to see more information about failures and then manually
roll back, instead of having Helm do it automatically on failure.

Note that setting `atomic` to `true` implies `wait`.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

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

A valid Helm chart name or URI (same as you'd input to `helm install`) Required if the action doesn't contain the Helm chart itself.

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

### `repo`

The repository URL to fetch the chart from. Defaults to the "stable" helm repo (https://charts.helm.sh/stable).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `serviceResource`

The Deployment, DaemonSet or StatefulSet or Pod that Garden should regard as the _Garden service_ in this module (not to be confused with Kubernetes Service resources).

This can either reference a workload (i.e. a Deployment, DaemonSet or StatefulSet) via the `kind` and `name` fields, or a Pod via the `podSelector` field.

Because a Helm chart can contain any number of Kubernetes resources, this needs to be specified for certain Garden features and commands to work.

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

### `serviceResource.podSelector`

[serviceResource](#serviceresource) > podSelector

A map of string key/value labels to match on any Pods in the namespace. When specified, a random ready Pod with matching labels will be picked as a target, so make sure the labels will always match a specific Pod type.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

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

### `tasks[].resource`

[tasks](#tasks) > resource

The Deployment, DaemonSet or StatefulSet or Pod that Garden should use to execute this task.
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

The Garden module that contains the sources for the container. This needs to be specified under `serviceResource` in order to enable syncing, but is not necessary for tasks and tests. Must be a `container` module.

_Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`._

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

The Garden module that contains the sources for the container. This needs to be specified under `serviceResource` in order to enable syncing, but is not necessary for tasks and tests. Must be a `container` module.

_Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`._

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

### `version`

The chart version to deploy.

| Type     | Required |
| -------- | -------- |
| `string` | No       |


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

