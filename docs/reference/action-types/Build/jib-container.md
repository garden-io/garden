---
title: "`jib-container` Build"
tocTitle: "`jib-container` Build"
---

# `jib-container` Build

## Description

Extends the [container type](./container.md) to build the image with [Jib](https://github.com/GoogleContainerTools/jib). Use this to efficiently build container images for Java services. Check out the [jib example](https://github.com/garden-io/garden/tree/0.14.16/examples/jib-container) to see it in action.

The image is always built locally, directly from the source directory (see the note on that below), before shipping the container image to the right place. You can set `build.tarOnly: true` to only build the image as a tarball.

By default (and when not using remote building), the image is pushed to the local Docker daemon, to match the behavior of and stay compatible with normal `container` actions.

When using remote building with the `kubernetes` provider, the image is synced to the cluster (where individual layers are cached) and then pushed to the deployment registry from there. This is to make sure any registry auth works seamlessly and exactly like for normal Docker image builds.

Please consult the [Jib documentation](https://github.com/GoogleContainerTools/jib) for how to configure Jib in your Gradle or Maven project.

To provide additional arguments to Gradle/Maven when building, you can set the `extraFlags` field.

**Important note:** Unlike many other types, `jib-container` builds are done from the _source_ directory instead of the build staging directory, because of how Java projects are often laid out across a repository. This means build dependency copy directives are effectively ignored, and any include/exclude statements and .gardenignore files will not impact the build result. _Note that you should still configure includes, excludes and/or a .gardenignore to tell Garden which files to consider as part of the Build version hash, to correctly detect whether a new build is required.**

Below is the full schema reference for the action.

`jib-container` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Configuration Keys

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

You can override the directory that is used for the build context by setting `source.path`.

You can use `source.repository` to get the source from an external repository. For more information on remote actions, please refer to the [Remote Sources guide](https://docs.garden.io/cedar-0.14/advanced/using-remote-sources).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `source.path`

[source](#source) > path

A relative POSIX-style path to the source directory for this action.

If specified together with `source.repository`, the path will be relative to the repository root.

Otherwise, the path will be relative to the directory containing the Garden configuration file.

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

### `environments[]`

If set, the action is only enabled for the listed environment types. This is effectively a cleaner shorthand for the `disabled` field with an expression for environments. For example, `environments: ["prod"]` is equivalent to `disabled: ${environment.name != "prod"}`.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `variables`

A map of variables scoped to this particular action. These are resolved before any other parts of the action configuration and take precedence over group-scoped variables (if applicable) and project-scoped variables, in that order. They may reference group-scoped and project-scoped variables, and generally can use any template strings normally allowed when resolving the action.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `varfiles[]`

Specify a list of paths (relative to the directory where the action is defined) to a file containing variables, that we apply on top of the action-level `variables` field, and take precedence over group-level variables (if applicable) and project-level variables, in that order.

If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the previous ones.

The format of the files is determined by the configured file's extension:

* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type. YAML format is used by default.
* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

To use different varfiles in different environments, you can template in the environment name to the varfile name, e.g. `varfile: "my-action.${environment.name}.env"` (this assumes that the corresponding varfiles exist).

If a listed varfile cannot be found, throwing an error.
To add optional varfiles, you can use a list item object with a `path` and an optional `optional` boolean field.
```yaml
varfiles:
  - path: my-action.env
    optional: true
```

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `array[alternatives]` | `[]`    | No       |

Example:

```yaml
varfiles:
  "my-action.env"
```

### `varfiles[].path`

[varfiles](#varfiles) > path

Path to a file containing a path.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `varfiles[].optional`

[varfiles](#varfiles) > optional

Whether the varfile is optional.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `version`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `version.excludeDependencies[]`

[version](#version) > excludeDependencies

Specify a list of dependencies that should be ignored when computing the version hash for this action.

Generally, the versions of all dependencies (both implicit and explicitly specified) are used when computing the version hash for this action.
However, there are cases where you might want to exclude certain dependencies from the version hash.

For example, you might have a dependency that naturally changes for every individual test or dev environment, such as a setup script that runs before the test. You could solve for that with something like this:

```yaml
version:
  excludeDependencies:
    - run.setup
```

Where `run.setup` refers to a Run action named `setup`. You can also use the full action reference for each dependency to exclude, e.g. `{ kind: "Run", name: "setup" }`.

| Type                     | Required |
| ------------------------ | -------- |
| `array[actionReference]` | No       |

### `version.excludeFields[]`

[version](#version) > excludeFields

Specify a list of config fields that should be ignored when computing the version hash for this action. Each item should be an array of strings, specifying the path to the field to ignore, e.g. `[spec, env, HOSTNAME]` would ignore `spec.env.HOSTNAME` in the configuration when computing the version.

For example, you might have a field that naturally changes for every individual test or dev environment, such as a dynamic hostname. You could solve for that with something like this:

```yaml
version:
  excludeFields:
    - [spec, env, HOSTNAME]
```

Arrays can also be indexed with numeric indices, but you can also use wildcards to exclude specific fields on all objects in arrays. Example:

```yaml
kind: Test
type: container
...
spec:
  artifacts:
    - source: foo
      target: bar  # Gets excluded from the version calculation
version:
  excludeFields:
    - [spec, artifacts, "*", target]
```

Only simple `"*"` wildcards are supported for the moment (i.e. you can't exclude by `"something*"` or use question marks for individual character matching).

Note that it is very important not to specify overly broad exclusions here, as this may cause the version to change too rarely, which may cause build errors or tests to not run when they should.

| Type           | Required |
| -------------- | -------- |
| `array[array]` | No       |

### `version.excludeFiles[]`

[version](#version) > excludeFiles

Specify one or more file paths that should be ignored when computing the version hash for this action.

Specify in the same format as the `include` field. You may use glob patterns here.

For example, you might have a file that naturally changes for every build, such as a compiled binary (that isn't deterministic down to the byte), that you need to have in the build but shouldn't affect the version. You could solve for that with something like this:

```yaml
include:
  - src/**/*
  - some/compiled/binary
version:
  excludeFiles:
    - some/compiled/binary
```

Note that when you use this, you do need to make sure that other files or config fields do affect the version appropriately. Otherwise you might run into issues where builds are not updated or tests are not run when they should be.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `version.excludeValues[]`

[version](#version) > excludeValues

Specify one or more string values that should be ignored when computing the version hash for this action. You may use template expressions here. This is useful to avoid dynamic values affecting cache versions.

For example, you might have a variable that naturally changes for every individual test or dev environment, such as a dynamic hostname. You could solve for that with something like this:

```yaml
version:
  excludeValues:
    - ${var.hostname}
```

With the `hostname` variable being defined in the Project configuration.

For each value specified under this field, every occurrence of that string value (even as part of a longer string) will be replaced when calculating the action version. The action configuration (used when performing the action) is not affected.

For instances when the value to replace may be overly broad (e.g. "api") it is generally better to use the `excludeFields` option, since that can be applied more surgically.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `kind`

| Type     | Allowed Values | Required |
| -------- | -------------- | -------- |
| `string` | "Build"        | Yes      |

### `allowPublish`

When false, disables publishing this build to remote registries via the publish command.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `buildAtSource`

By default, builds are _staged_ in `.garden/build/<build name>` and that directory is used as the build context. This is done to avoid builds contaminating the source tree, which can end up confusing version computation, or a build including files that are not intended to be part of it. In most scenarios, the default behavior is desired and leads to the most predictable and verifiable builds, as well as avoiding potential confusion around file watching.

You _can_ override this by setting `buildAtSource: true`, which basically sets the build root for this action at the location of the Build action config in the source tree. This means e.g. that the build command in `exec` Builds runs at the source, and for Docker image builds the build is initiated from the source directory.

An important implication is that `include` and `exclude` directives for the action, as well as `.gardenignore` files, only affect version hash computation but are otherwise not effective in controlling the build context. This may lead to unexpected variation in builds with the same version hash. **This may also slow down code synchronization to remote destinations, e.g. when performing remote Docker image builds.**

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

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `include[]`

Specify a list of POSIX-style paths or globs that should be included as the build context for the Build, and will affect the computed _version_ of the action.

If nothing is specified here, the whole directory may be assumed to be included in the build. Providers are sometimes able to infer the list of paths, e.g. from a Dockerfile, but often this is inaccurate (say, if a Dockerfile has an `ADD .` statement) so it may be important to set `include` and/or `exclude` to define the build context. Otherwise you may find unrelated files being included in the build context and the build version, which may result in unnecessarily repeated builds.

You can _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `600`   | No       |

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

Note: Garden will always set a `GARDEN_ACTION_VERSION` (alias `GARDEN_MODULE_VERSION`) argument with the module/build version at build time.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `spec.platforms[]`

[spec](#spec) > platforms

Specify the platforms to build the image for. This is useful when building multi-platform images.
The format is `os/arch`, e.g. `linux/amd64`, `linux/arm64`, etc.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `spec.secrets`

[spec](#spec) > secrets

Secret values that can be mounted in the Dockerfile, but do not become part of the image filesystem or image manifest. This is useful e.g. for private registry auth tokens.

Build arguments and environment variables are inappropriate for secrets, as they persist in the final image.

The secret can later be consumed in the Dockerfile like so:
```
  RUN --mount=type=secret,id=mytoken TOKEN=$(cat /run/secrets/mytoken) ...
```

See also https://docs.docker.com/build/building/secrets/

| Type     | Required |
| -------- | -------- |
| `object` | No       |

Example:

```yaml
spec:
  ...
  secrets:
      mytoken: supersecret
```

### `spec.dockerfile`

[spec](#spec) > dockerfile

POSIX-style name of a Dockerfile, relative to the action's source root.

| Type        | Default        | Required |
| ----------- | -------------- | -------- |
| `posixPath` | `"Dockerfile"` | No       |

### `spec.projectType`

[spec](#spec) > projectType

The type of project to build. Defaults to auto-detecting between gradle and maven (based on which files/directories are found in the action root), but in some cases you may need to specify it.

| Type     | Allowed Values                             | Default  | Required |
| -------- | ------------------------------------------ | -------- | -------- |
| `string` | "gradle", "maven", "jib", "auto", "mavend" | `"auto"` | Yes      |

### `spec.jdkVersion`

[spec](#spec) > jdkVersion

The JDK version to use.

The chosen version will be downloaded by Garden and used to define `JAVA_HOME` environment variable for Gradle and Maven.

To use an arbitrary JDK distribution, please use the `jdkPath` configuration option.

| Type     | Allowed Values        | Default | Required |
| -------- | --------------------- | ------- | -------- |
| `number` | 8, 11, 13, 17, 21, 23 | `11`    | Yes      |

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

### `spec.gradlePath`

[spec](#spec) > gradlePath

Defines the location of the custom executable Gradle binary.

If not provided, then the Gradle binary available in the working directory will be used.
If no Gradle binary found in the working dir, then Gradle 7.6.4 will be downloaded and used.

**Note!** Either `jdkVersion` or `jdkPath` will be used to define `JAVA_HOME` environment variable for the custom Gradle.
To ensure a system JDK usage, please set `jdkPath` to `${local.env.JAVA_HOME}`.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.mavenPath`

[spec](#spec) > mavenPath

Defines the location of the custom executable Maven binary.

If not provided, then Maven 3.9.9 will be downloaded and used.

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

### `spec.mavendPath`

[spec](#spec) > mavendPath

Defines the location of the custom executable Maven Daemon binary.

If not provided, then Maven Daemon 1.0.2 will be downloaded and used.

**Note!** Either `jdkVersion` or `jdkPath` will be used to define `JAVA_HOME` environment variable for the custom Maven Daemon.
To ensure a system JDK usage, please set `jdkPath` to `${local.env.JAVA_HOME}`.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.concurrentMavenBuilds`

[spec](#spec) > concurrentMavenBuilds

{% hint style="warning" %}
**Experimental**: this is an experimental feature and the API might change in the future.
{% endhint %}

[EXPERIMENTAL] Enable/disable concurrent Maven and Maven Daemon builds.

Note! Concurrent builds can be unstable. This option is disabled by default.
This option must be configured for each Build action individually.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.extraFlags[]`

[spec](#spec) > extraFlags

Specify extra flags to pass to maven/gradle when building the container image.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |


## Outputs

The following keys are available via the `${actions.build.<name>}` template string key for `jib-container`
action.

### `${actions.build.<name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.build.<name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.build.my-build.disabled}
```

### `${actions.build.<name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.build.my-build.buildPath}
```

### `${actions.build.<name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.build.my-build.sourcePath}
```

### `${actions.build.<name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.build.my-build.mode}
```

### `${actions.build.<name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.build.<name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

