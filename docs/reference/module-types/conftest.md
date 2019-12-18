---
title: Conftest
---

# `conftest` reference

Runs `conftest` on the specified files, with the specified (or default) policy and namespace.

> Note: In many cases, you'll let conftest providers (e.g. `conftest-container` and `conftest-kubernetes`
create this module type automatically, but you may in some cases want or need to manually specify files to test.

See the [conftest docs](https://github.com/instramenta/conftest) for details on how to configure policies.

Below is the schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../../guides/configuration-files.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`conftest` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Complete YAML schema

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

# Specify a list of POSIX-style paths or globs that should be regarded as the source files for
# this
# module. Files that do *not* match these paths or globs are excluded when computing the version
# of the module,
# when responding to filesystem watch events, and when staging builds.
#
# Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore`
# files in your
# source tree, which use the same format as `.gitignore` files. See the
# [Configuration Files
# guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)
# for details.
#
# Also note that specifying an empty list here means _no sources_ should be included.
include:

# Specify a list of POSIX-style paths or glob patterns that should be excluded from the module.
# Files that
# match these paths or globs are excluded when computing the version of the module, when
# responding to filesystem
# watch events, and when staging builds.
#
# Note that you can also explicitly _include_ files using the `include` field. If you also specify
# the
# `include` field, the files/patterns specified here are filtered from the files matched by
# `include`. See the
# [Configuration Files
# guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)for
# details.
#
# Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on
# which files
# and directories are watched for changes. Use the project `modules.exclude` field to affect
# those, if you have
# large directories that should not be watched for changes.
exclude:

# A remote repository URL. Currently only supports git servers. Must contain a hash suffix
# pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>
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
          # POSIX-style path or filename to copy the directory or file(s), relative to the build
          # directory.
          # Defaults to to same as source path.
          target: <same as source path>

# Specify a module whose sources we want to test.
sourceModule:

# POSIX-style path to a directory containing the policies to match the config against, or a
# specific .rego file, relative to the module root.
# Must be a relative path, and should in most cases be within the project root.
# Defaults to the `policyPath` set in the provider config.
policyPath:

# The policy namespace in which to find _deny_ and _warn_ rules.
namespace: main

# A list of files to test with the given policy. Must be POSIX-style paths, and may include
# wildcards.
files:
```

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

### `sourceModule`

Specify a module whose sources we want to test.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `policyPath`

POSIX-style path to a directory containing the policies to match the config against, or a specific .rego file, relative to the module root.
Must be a relative path, and should in most cases be within the project root.
Defaults to the `policyPath` set in the provider config.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `namespace`

The policy namespace in which to find _deny_ and _warn_ rules.

| Type     | Required | Default  |
| -------- | -------- | -------- |
| `string` | No       | `"main"` |

### `files`

A list of files to test with the given policy. Must be POSIX-style paths, and may include wildcards.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | Yes      |


## Outputs

### Module outputs

The following keys are available via the `${modules.<module-name>}` template string key for `conftest`
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

