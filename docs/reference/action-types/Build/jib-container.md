---
title: "`jib-container` Build"
tocTitle: "`jib-container` Build"
---

# `jib-container` Build

## Description

Extends the [container type](./container.md) to build the image with [Jib](https://github.com/GoogleContainerTools/jib). Use this to efficiently build container images for Java services. Check out the [jib example](https://github.com/garden-io/garden/tree/0.12.47/examples/jib-container) to see it in action.

The image is always built locally, directly from the source directory (see the note on that below), before shipping the container image to the right place. You can set `build.tarOnly: true` to only build the image as a tarball.

By default (and when not using remote building), the image is pushed to the local Docker daemon, to match the behavior of and stay compatible with normal `container` modules.

When using remote building with the `kubernetes` provider, the image is synced to the cluster (where individual layers are cached) and then pushed to the deployment registry from there. This is to make sure any registry auth works seamlessly and exactly like for normal Docker image builds.

Please consult the [Jib documentation](https://github.com/GoogleContainerTools/jib) for how to configure Jib in your Gradle or Maven project.

To provide additional arguments to Gradle/Maven when building, you can set the `extraFlags` field.

**Important note:** Unlike many other types, `jib-container` builds are done from the _source_ directory instead of the build staging directory, because of how Java projects are often laid out across a repository. This means build dependency copy directives are effectively ignored, and any include/exclude statements and .gardenignore files will not impact the build result. _Note that you should still configure includes, excludes and/or a .gardenignore to tell Garden which files to consider as part of the module version hash, to correctly detect whether a new build is required._

Below is the full schema reference for the action. For an introduction to configuring Garden, please look at our [Configuration
guide](../../using-garden/configuration-overview.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`jib-container` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
# The schema version of this config (currently not used).
apiVersion: garden.io/v0

# The kind of action you want to define (one of Build, Deploy, Run or Test).
kind:

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
  # A relative POSIX-style path to the source directory for this action. You must make sure this path exists and is
  # ina git repository!
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

# When false, disables publishing this build to remote registries via the publish command.
allowPublish: true

# By default, builds are _staged_ in `.garden/build/<build name>` and that directory is used as the build context.
# This is done to avoid builds contaminating the source tree, which can end up confusing version computation, or a
# build including files that are not intended to be part of it. In most scenarios, the default behavior is desired and
# leads to the most predictable and verifiable builds, as well as avoiding potential confusion around file watching.
#
# You _can_ override this by setting `buildAtSource: true`, which basically sets the build root for this action at the
# location of the Build action config in the source tree. This means e.g. that the build command in `exec` Builds runs
# at the source, and for `docker-image` builds the build is initiated from the source directory.
#
# An important implication is that `include` and `exclude` directives for the action, as well as `.gardenignore`
# files, only affect version hash computation but are otherwise not effective in controlling the build context. This
# may lead to unexpected variation in builds with the same version hash. **This may also slow down code
# synchronization to remote destinations, e.g. when performing remote `docker-image` builds.**
#
# Additionally, any `exec` runtime actions (and potentially others) that reference this Build with the `build` field,
# will run from the source directory of this action.
#
# While there may be good reasons to do this in some situations, please be aware that this increases the potential for
# side-effects and variability in builds. **You must take extra care**, including making sure that files generated
# during builds are excluded with e.g. `.gardenignore` files or `exclude` fields on potentially affected actions.
# Another potential issue is causing infinite loops when running with file-watching enabled, basically triggering a
# new build during the build.
buildAtSource: false

# Copy files from other builds, ahead of running this build.
copyFrom:
  - # The name of the Build action to copy from.
    build:

    # POSIX-style path or filename of the directory or file(s) to copy to the target, relative to the build path of
    # the source build.
    sourcePath:

    # POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
    # Defaults to to same as source path.
    targetPath: ''

# Specify a list of POSIX-style paths or globs that should be included as the build context for the Build, and will
# affect the computed _version_ of the action.
#
# If nothing is specified here, the whole directory may be assumed to be included in the build. Providers are
# sometimes able to infer the list of paths, e.g. from a Dockerfile, but often this is inaccurate (say, if a
# Dockerfile has an `ADD .` statement) so it may be important to set `include` and/or `exclude` to define the build
# context. Otherwise you may find unrelated files being included in the build context and the build version, which may
# result in unnecessarily repeated builds.
#
# You can _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use
# the same format as `.gitignore` files. See the [Configuration Files
# guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
# details.
include:

# Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the build context and
# the Build version.
#
# Providers are sometimes able to infer the `include` field, e.g. from a Dockerfile, but often this is inaccurate
# (say, if a Dockerfile has an `ADD .` statement) so it may be important to set `include` and/or `exclude` to define
# the build context. Otherwise you may find unrelated files being included in the build context and the build version,
# which may result in unnecessarily repeated builds.
#
# Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
# directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect those,
# if you have large directories that should not be watched for changes.
exclude:

# Set a timeout for the build to complete, in seconds.
timeout:

spec:
  # Specify an image ID to use when building locally, instead of the default of using the action name. Must be a valid
  # Docker image identifier. **Note that the image _tag_ is always set to the action version.**
  localId:

  # Specify an image ID to use when publishing the image (via the `garden publish` command), instead of the default of
  # using the action name. Must be a valid Docker image identifier.
  publishId:

  # For multi-stage Dockerfiles, specify which image/stage to build (see
  # https://docs.docker.com/engine/reference/commandline/build/#specifying-target-build-stage---target for details).
  targetStage:

  # Specify build arguments to use when building the container image.
  #
  # Note: Garden will always set a `GARDEN_BUILD_VERSION` (alias `GARDEN_MODULE_VERSION`) argument with the
  # module/build version at build time.
  buildArgs: {}

  # POSIX-style name of a Dockerfile, relative to the action's source root.
  dockerfile: Dockerfile

  # The type of project to build. Defaults to auto-detecting between gradle and maven (based on which
  # files/directories are found in the module root), but in some cases you may need to specify it.
  projectType: auto

  # The JDK version to use.
  #
  # The chosen version will be downloaded by Garden and used to define `JAVA_HOME` environment variable for Gradle and
  # Maven.
  #
  # To use an arbitrary JDK distribution, please use the `jdkPath` configuration option.
  jdkVersion: 11

  # The JDK home path. This **always overrides** the JDK defined in `jdkVersion`.
  #
  # The value will be used as `JAVA_HOME` environment variable for Gradle and Maven.
  jdkPath:

  # Build the image and push to a local Docker daemon (i.e. use the `jib:dockerBuild` / `jibDockerBuild` target).
  dockerBuild: false

  # Don't load or push the resulting image to a Docker daemon or registry, only build it as a tar file.
  tarOnly: false

  # Specify the image format in the resulting tar file. Only used if `tarOnly: true`.
  tarFormat: docker

  # Defines the location of the custom executable Maven binary.
  #
  # **Note!** Either `jdkVersion` or `jdkPath` will be used to define `JAVA_HOME` environment variable for the custom
  # Maven.
  # To ensure a system JDK usage, please set `jdkPath` to `${local.env.JAVA_HOME}`.
  mavenPath:

  # Defines the Maven phases to be executed during the Garden build step.
  mavenPhases:

  # Specify extra flags to pass to maven/gradle when building the container image.
  extraFlags:
```

## Configuration Keys

### `apiVersion`

The schema version of this config (currently not used).

| Type     | Allowed Values | Default          | Required |
| -------- | -------------- | ---------------- | -------- |
| `string` | "garden.io/v0" | `"garden.io/v0"` | Yes      |

### `kind`

The kind of action you want to define (one of Build, Deploy, Run or Test).

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

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

A relative POSIX-style path to the source directory for this action. You must make sure this path exists and is ina git repository!

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

### `allowPublish`

When false, disables publishing this build to remote registries via the publish command.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `buildAtSource`

By default, builds are _staged_ in `.garden/build/<build name>` and that directory is used as the build context. This is done to avoid builds contaminating the source tree, which can end up confusing version computation, or a build including files that are not intended to be part of it. In most scenarios, the default behavior is desired and leads to the most predictable and verifiable builds, as well as avoiding potential confusion around file watching.

You _can_ override this by setting `buildAtSource: true`, which basically sets the build root for this action at the location of the Build action config in the source tree. This means e.g. that the build command in `exec` Builds runs at the source, and for `docker-image` builds the build is initiated from the source directory.

An important implication is that `include` and `exclude` directives for the action, as well as `.gardenignore` files, only affect version hash computation but are otherwise not effective in controlling the build context. This may lead to unexpected variation in builds with the same version hash. **This may also slow down code synchronization to remote destinations, e.g. when performing remote `docker-image` builds.**

Additionally, any `exec` runtime actions (and potentially others) that reference this Build with the `build` field, will run from the source directory of this action.

While there may be good reasons to do this in some situations, please be aware that this increases the potential for side-effects and variability in builds. **You must take extra care**, including making sure that files generated during builds are excluded with e.g. `.gardenignore` files or `exclude` fields on potentially affected actions. Another potential issue is causing infinite loops when running with file-watching enabled, basically triggering a new build during the build.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `copyFrom[]`

Copy files from other builds, ahead of running this build.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `copyFrom[].build`

[copyFrom](#copyfrom) > build

The name of the Build action to copy from.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `copyFrom[].sourcePath`

[copyFrom](#copyfrom) > sourcePath

POSIX-style path or filename of the directory or file(s) to copy to the target, relative to the build path of the source build.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `copyFrom[].targetPath`

[copyFrom](#copyfrom) > targetPath

POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
Defaults to to same as source path.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `""`    | No       |

### `include[]`

Specify a list of POSIX-style paths or globs that should be included as the build context for the Build, and will affect the computed _version_ of the action.

If nothing is specified here, the whole directory may be assumed to be included in the build. Providers are sometimes able to infer the list of paths, e.g. from a Dockerfile, but often this is inaccurate (say, if a Dockerfile has an `ADD .` statement) so it may be important to set `include` and/or `exclude` to define the build context. Otherwise you may find unrelated files being included in the build context and the build version, which may result in unnecessarily repeated builds.

You can _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the build context and the Build version.

Providers are sometimes able to infer the `include` field, e.g. from a Dockerfile, but often this is inaccurate (say, if a Dockerfile has an `ADD .` statement) so it may be important to set `include` and/or `exclude` to define the build context. Otherwise you may find unrelated files being included in the build context and the build version, which may result in unnecessarily repeated builds.

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

### `timeout`

Set a timeout for the build to complete, in seconds.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `spec`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.localId`

[spec](#spec) > localId

Specify an image ID to use when building locally, instead of the default of using the action name. Must be a valid Docker image identifier. **Note that the image _tag_ is always set to the action version.**

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.publishId`

[spec](#spec) > publishId

Specify an image ID to use when publishing the image (via the `garden publish` command), instead of the default of using the action name. Must be a valid Docker image identifier.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.targetStage`

[spec](#spec) > targetStage

For multi-stage Dockerfiles, specify which image/stage to build (see https://docs.docker.com/engine/reference/commandline/build/#specifying-target-build-stage---target for details).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.buildArgs`

[spec](#spec) > buildArgs

Specify build arguments to use when building the container image.

Note: Garden will always set a `GARDEN_BUILD_VERSION` (alias `GARDEN_MODULE_VERSION`) argument with the module/build version at build time.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `spec.dockerfile`

[spec](#spec) > dockerfile

POSIX-style name of a Dockerfile, relative to the action's source root.

| Type        | Default        | Required |
| ----------- | -------------- | -------- |
| `posixPath` | `"Dockerfile"` | No       |

### `spec.projectType`

[spec](#spec) > projectType

The type of project to build. Defaults to auto-detecting between gradle and maven (based on which files/directories are found in the module root), but in some cases you may need to specify it.

| Type     | Allowed Values                             | Default  | Required |
| -------- | ------------------------------------------ | -------- | -------- |
| `string` | "gradle", "maven", "jib", "auto", "mavend" | `"auto"` | Yes      |

### `spec.jdkVersion`

[spec](#spec) > jdkVersion

The JDK version to use.

The chosen version will be downloaded by Garden and used to define `JAVA_HOME` environment variable for Gradle and Maven.

To use an arbitrary JDK distribution, please use the `jdkPath` configuration option.

| Type     | Allowed Values | Default | Required |
| -------- | -------------- | ------- | -------- |
| `number` | 8, 11, 13, 17  | `11`    | Yes      |

### `spec.jdkPath`

[spec](#spec) > jdkPath

The JDK home path. This **always overrides** the JDK defined in `jdkVersion`.

The value will be used as `JAVA_HOME` environment variable for Gradle and Maven.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
spec:
  ...
  jdkPath: "${local.env.JAVA_HOME}"
```

### `spec.dockerBuild`

[spec](#spec) > dockerBuild

Build the image and push to a local Docker daemon (i.e. use the `jib:dockerBuild` / `jibDockerBuild` target).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.tarOnly`

[spec](#spec) > tarOnly

Don't load or push the resulting image to a Docker daemon or registry, only build it as a tar file.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.tarFormat`

[spec](#spec) > tarFormat

Specify the image format in the resulting tar file. Only used if `tarOnly: true`.

| Type     | Allowed Values  | Default    | Required |
| -------- | --------------- | ---------- | -------- |
| `string` | "docker", "oci" | `"docker"` | Yes      |

### `spec.mavenPath`

[spec](#spec) > mavenPath

Defines the location of the custom executable Maven binary.

**Note!** Either `jdkVersion` or `jdkPath` will be used to define `JAVA_HOME` environment variable for the custom Maven.
To ensure a system JDK usage, please set `jdkPath` to `${local.env.JAVA_HOME}`.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.mavenPhases[]`

[spec](#spec) > mavenPhases

Defines the Maven phases to be executed during the Garden build step.

| Type            | Default       | Required |
| --------------- | ------------- | -------- |
| `array[string]` | `["compile"]` | No       |

### `spec.extraFlags[]`

[spec](#spec) > extraFlags

Specify extra flags to pass to maven/gradle when building the container image.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |


## Outputs

The following keys are available via the `${actions.build.<name>}` template string key for `jib-container`
modules.

### `${actions.build.<name>.buildPath}`

The build path of the action/module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.build.my-build.buildPath}
```

### `${actions.build.<name>.name}`

The name of the action/module.

| Type     |
| -------- |
| `string` |

### `${actions.build.<name>.path}`

The source path of the action/module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.build.my-build.path}
```

### `${actions.build.<name>.var.*}`

A map of all variables defined in the module.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.build.<name>.var.<variable-name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.build.<name>.version}`

The current version of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.build.my-build.version}
```
