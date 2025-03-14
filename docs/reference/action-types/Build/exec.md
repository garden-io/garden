---
title: "`exec` Build"
tocTitle: "`exec` Build"
---

# `exec` Build

## Description

A simple Build action which runs a build locally with a shell command.

Below is the full schema reference for the action.

`exec` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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

You can use `source.repository` to get the source from an external repository. For more information on remote actions, please refer to the [Remote Sources guide](https://docs.garden.io/bonsai-0.13/advanced/using-remote-sources).

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

You can _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/bonsai-0.13/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

### `spec.shell`

[spec](#spec) > shell

If `true`, runs file inside of a shell. Uses `/bin/sh` on UNIX and `cmd.exe` on Windows. A different shell can be specified as a string. The shell should understand the `-c` switch on UNIX or `/d /s /c` on Windows.

Note that if this is not set, no shell interpreter (Bash, `cmd.exe`, etc.) is used, so shell features such as variables substitution (`echo $PATH`) are not allowed.

We recommend against using this option since it is:

- not cross-platform, encouraging shell-specific syntax.
- slower, because of the additional shell interpretation.
- unsafe, potentially allowing command injection.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.command[]`

[spec](#spec) > command

The command to run to perform the build.

_Note: You may omit this if all you need is for other implicit actions to happen, like copying files from build dependencies etc._

By default, the command is run inside the Garden build directory (under .garden/build/<build-name>). If the top level `buildAtSource` directive is set to `true`, the command runs in the action source directory instead. Please see the docs for that field for more information and potential implications. Also note that other `exec` actions that reference this build via the `build` field will then also run from this action's source directory.

Example: `["npm","run","build"]`

| Type    | Default | Required |
| ------- | ------- | -------- |
| `array` | `[]`    | No       |

### `spec.env`

[spec](#spec) > env

Environment variables to set when running the command.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |


## Outputs

The following keys are available via the `${actions.build.<name>}` template string key for `exec`
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

### `${actions.build.<name>.outputs.log}`

The full log output from the executed command. (Pro-tip: Make it machine readable so it can be parsed by dependants)

| Type     | Default |
| -------- | ------- |
| `string` | `""`    |

### `${actions.build.<name>.outputs.stdout}`

The stdout log output from the executed command. (Pro-tip: Make it machine readable so it can be parsed by dependants)

| Type     | Default |
| -------- | ------- |
| `string` | `""`    |

### `${actions.build.<name>.outputs.stderr}`

The stderr log output from the executed command. (Pro-tip: Make it machine readable so it can be parsed by dependants)

| Type     | Default |
| -------- | ------- |
| `string` | `""`    |

