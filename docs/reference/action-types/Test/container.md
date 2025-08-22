---
title: "`container` Test"
tocTitle: "`container` Test"
---

# `container` Test

## Description

Define a Test which runs a command in a container image, e.g. in a Kubernetes namespace (when used with the `kubernetes` provider).

This is a simplified abstraction, which can be convenient for simple scenarios, but has limited features compared to more platform-specific types. For example, you cannot specify replicas for redundancy, and various platform-specific options are not included. For more flexibility, please look at other Test types like [kubernetes-pod](./kubernetes-pod.md).

Below is the full schema reference for the action.

`container` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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

### `include[]`

Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will affect the computed _version_ of the action.

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run when certain files are modified.

_Build_ actions have a different behavior, since they generally are based on some files in the source tree, so please reference the docs for more information on those.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's version.

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set `include` paths, or such paths inferred by providers. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

Path to a file containing variables.

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

### `build`

Specify a _Build_ action, and resolve this action from the context of that Build.

For example, you might create an `exec` Build which prepares some manifests, and then reference that in a `kubernetes` _Deploy_ action, and the resulting manifests from the Build.

This would mean that instead of looking for manifest files relative to this action's location in your project structure, the output directory for the referenced `exec` Build would be the source.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `kind`

| Type     | Allowed Values | Required |
| -------- | -------------- | -------- |
| `string` | "Test"         | Yes      |

### `timeout`

Set a timeout for the test to complete, in seconds.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `600`   | No       |

### `spec`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.command[]`

[spec](#spec) > command

The command/entrypoint to run the container with.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
spec:
  ...
  command:
    - /bin/sh
    - '-c'
```

### `spec.args[]`

[spec](#spec) > args

The arguments (on top of the `command`, i.e. entrypoint) to run the container with.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
spec:
  ...
  args:
    - npm
    - start
```

### `spec.env`

[spec](#spec) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
spec:
  ...
  env:
      - MY_VAR: some-value
        MY_SECRET_VAR:
          secretRef:
            name: my-secret
            key: some-key
      - {}
```

### `spec.cpu`

[spec](#spec) > cpu

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"min":10,"max":1000}` | No       |

### `spec.cpu.min`

[spec](#spec) > [cpu](#speccpu) > min

The minimum amount of CPU the container needs to be available for it to be deployed, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `10`    | No       |

### `spec.cpu.max`

[spec](#spec) > [cpu](#speccpu) > max

The maximum amount of CPU the container can use, in millicpus (i.e. 1000 = 1 CPU). If set to null will result in no limit being set.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1000`  | No       |

### `spec.memory`

[spec](#spec) > memory

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"min":90,"max":1024}` | No       |

### `spec.memory.min`

[spec](#spec) > [memory](#specmemory) > min

The minimum amount of RAM the container needs to be available for it to be deployed, in megabytes (i.e. 1024 = 1 GB)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `90`    | No       |

### `spec.memory.max`

[spec](#spec) > [memory](#specmemory) > max

The maximum amount of RAM the container can use, in megabytes (i.e. 1024 = 1 GB) If set to null will result in no limit being set.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1024`  | No       |

### `spec.volumes[]`

[spec](#spec) > volumes

List of volumes that should be mounted when starting the container.

Note: If neither `hostPath` nor `action` is specified,
an empty ephemeral volume is created and mounted when deploying the container.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `spec.volumes[].name`

[spec](#spec) > [volumes](#specvolumes) > name

The name of the allocated volume.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.volumes[].containerPath`

[spec](#spec) > [volumes](#specvolumes) > containerPath

The path where the volume should be mounted in the container.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `spec.volumes[].hostPath`

[spec](#spec) > [volumes](#specvolumes) > hostPath

_NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms and providers. Some providers may not support it at all._

A local path or path on the node that's running the container, to mount in the container, relative to the config source directory (or absolute).

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
spec:
  ...
  volumes:
    - hostPath: "/some/dir"
```

### `spec.privileged`

[spec](#spec) > privileged

If true, run the main container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.addCapabilities[]`

[spec](#spec) > addCapabilities

POSIX capabilities to add when running the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `spec.dropCapabilities[]`

[spec](#spec) > dropCapabilities

POSIX capabilities to remove when running the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `spec.tty`

[spec](#spec) > tty

Specify if containers in this action have TTY support enabled (which implies having stdin support enabled).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.deploymentStrategy`

[spec](#spec) > deploymentStrategy

Specifies the container's deployment strategy.

| Type     | Allowed Values              | Default           | Required |
| -------- | --------------------------- | ----------------- | -------- |
| `string` | "RollingUpdate", "Recreate" | `"RollingUpdate"` | Yes      |

### `spec.artifacts[]`

[spec](#spec) > artifacts

Specify artifacts to copy out of the container after the run. The artifacts are stored locally under the `.garden/artifacts` directory.

Note: Depending on the provider, this may require the container image to include `sh` `tar`, in order to enable the file transfer.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

Example:

```yaml
spec:
  ...
  artifacts:
    - source: /report/**/*
```

### `spec.artifacts[].source`

[spec](#spec) > [artifacts](#specartifacts) > source

A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
spec:
  ...
  artifacts:
    - source: /report/**/*
    - source: "/output/**/*"
```

### `spec.artifacts[].target`

[spec](#spec) > [artifacts](#specartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
spec:
  ...
  artifacts:
    - source: /report/**/*
    - target: "outputs/foo/"
```

### `spec.image`

[spec](#spec) > image

Specify an image ID to deploy. Should be a valid Docker image identifier. Required.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.cacheResult`

[spec](#spec) > cacheResult

Set to false if you don't want the Test action result to be cached. Use this if the Test action needs to be run any time your project (or one or more of the Test action's dependants) is deployed. Otherwise the Test action is only re-run when its version changes, or when you run `garden run`.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |


## Outputs

The following keys are available via the `${actions.test.<name>}` template string key for `container`
action.

### `${actions.test.<name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.test.<name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.test.my-test.disabled}
```

### `${actions.test.<name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.test.my-test.buildPath}
```

### `${actions.test.<name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.test.my-test.sourcePath}
```

### `${actions.test.<name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.test.my-test.mode}
```

### `${actions.test.<name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.test.<name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.test.<name>.outputs.log}`

The full log output from the executed action. (Pro-tip: Make it machine readable so it can be parsed by dependants)

| Type     | Default |
| -------- | ------- |
| `string` | `""`    |

