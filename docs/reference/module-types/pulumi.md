---
title: "`pulumi` Module Type"
tocTitle: "`pulumi`"
---

# `pulumi` Module Type

{% hint style="warning" %}
Modules are deprecated and will be removed in version `0.14`. Please use [action](../../getting-started/basics.md#anatomy-of-a-garden-action)-based configuration instead. See the [0.12 to Bonsai migration guide](../../misc/migrating-to-bonsai.md) for details.
{% endhint %}

## Description

Deploys a Pulumi stack and either creates/updates it automatically (if `autoApply: true`) or warns when the stack resources are not up-to-date, or errors if it's missing entirely.

**Note: It is not recommended to set `autoApply` to `true` for production or shared environments, since this may result in accidental or conflicting changes to the stack.** Instead, it is recommended to manually preview and update using the provided plugin commands. Run `garden plugins pulumi` for details. Note that not all Pulumi CLI commands are wrapped by the plugin, only the ones where it's important to apply any variables defined in the action. For others, simply run the Pulumi CLI as usual from the project root.

Stack outputs are made available as service outputs. These can then be referenced by other actions under `${runtime.services.<module-name>.outputs.<key>}`. You can template in those values as e.g. command arguments or environment variables for other services.

Below is the full schema reference.

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`pulumi` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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

# The names of any services that this service depends on at runtime, and the names of any tasks that should be
# executed before this service is deployed.
# You may also depend on Deploy and Run actions, but please note that you cannot reference those actions in template
# strings.
dependencies: []

# If set to true, Garden will destroy the stack when calling `garden cleanup namespace` or `garden cleanup deploy
# <deploy action name>`.
# This is useful to prevent unintentional destroys in production or shared environments.
allowDestroy: true

# If set to false, deployments will fail unless a `planPath` is provided for this deploy action. This is useful when
# deploying to
# production or shared environments, or when the action deploys infrastructure that you don't want to unintentionally
# update/create.
autoApply: true

# If set to true, Garden will automatically create the stack if it doesn't already exist.
createStack: false

# Specify the path to the Pulumi project root, relative to the deploy action's root.
root: .

# If set to true, the deploy action will use the new Pulumi varfile schema, which does not nest all variables under
# the 'config' key automatically like the old schema. This allow setting variables at the root level of the varfile
# that don't belong to the 'config' key. Example:
# config:
#   myVar: value
# secretsprovider: gcpkms://projects/xyz/locations/global/keyRings/pulumi/cryptoKeys/pulumi-secrets
# For more information see [this guide on pulumi varfiles and
# variables](https://docs.garden.io/pulumi-plugin/about#pulumi-varfile-schema)
useNewPulumiVarfileSchema: false

# A map of config variables to use when applying the stack. These are merged with the contents of any `pulumiVarfiles`
# provided
# for this deploy action. The deploy action's stack config will be overwritten with the resulting merged config.
# Variables declared here override any conflicting config variables defined in this deploy action's `pulumiVarfiles`.
#
# Note: `pulumiVariables` should not include action outputs from other pulumi deploy actions when `cacheStatus` is set
# to true, since
# the outputs may change from the time the stack status of the dependency action is initially queried to when it's
# been deployed.
#
# Instead, use pulumi stack references when using the `cacheStatus` config option.
pulumiVariables: {}

# Specify one or more paths (relative to the deploy action's root) to YAML files containing pulumi configuration.
#
# Templated paths that resolve to `null`, `undefined` or an empty string are ignored.
#
# Any Garden template strings in these varfiles will be resolved when the files are loaded.
#
# Each file must consist of a single YAML document, which must be a map (dictionary). Keys may contain any
# value type.
#
# If one or more varfiles is not found, no error is thrown (that varfile path is simply ignored).
#
# Note: The old varfile schema nests all variables under the 'config' key automatically. If you need to set variables
# at the root level of the varfile that don't belong to the 'config' key, set `useNewPulumiVarfileSchema` to true.
pulumiVarfiles: []

# The name of the pulumi organization to use. Overrides the `orgName` set on the pulumi provider (if any).
# To use the default org, set to null.
orgName:

# When set to true, the pulumi stack will be tagged with the Garden service version when deploying. The tag
# will then be used for service status checks for this service. If the version doesn't change between deploys,
# the subsequent deploy is skipped.
#
# Note that this will not pick up changes to stack outputs referenced via stack references in your pulumi stack,
# unless they're referenced via template strings in the deploy action configuration.
#
# When using stack references to other pulumi deploy actions in your project, we recommend including them in this
# deploy action's `stackReferences` config field (see the documentation for that field on this page).
#
# `cacheStatus: true` is not supported for self-managed state backends.
cacheStatus: false

# When setting `cacheStatus` to true for this deploy action, you should include all stack references used by this
# deploy action's pulumi stack in this field.
#
# This lets Garden know to redeploy the pulumi stack if the output values of one or more of these stack references
# have changed since the last deployment.
stackReferences: []

# When set to true, will use pulumi plans generated by the `garden plugins pulumi preview` command when
# deploying, and will fail if no plan exists locally for the deploy action.
#
# When this option is used, the pulumi plugin bypasses the status check altogether and passes the plan directly
# to `pulumi up` (via the `--plan` option, which is experimental as of March 2022). You should therefore
# take care to only use this config option when you're sure you want to apply the changes in the plan.
#
# This option is intended for two-phase pulumi deployments, where pulumi preview diffs are first reviewed (e.g.
# during code review).
deployFromPreview: false

# The name of the pulumi stack to use. Defaults to the current environment name.
stack:

# When set to true, stack outputs which are marked as secrets will be shown in the output.
#
# By default, Pulumi will print secret stack outputs as the string '[secret]' instead of
# the true content of the output.
showSecretsInOutput: false
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

### `dependencies[]`

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.
You may also depend on Deploy and Run actions, but please note that you cannot reference those actions in template strings.

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `array[alternatives]` | `[]`    | No       |

### `allowDestroy`

If set to true, Garden will destroy the stack when calling `garden cleanup namespace` or `garden cleanup deploy <deploy action name>`.
This is useful to prevent unintentional destroys in production or shared environments.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `autoApply`

If set to false, deployments will fail unless a `planPath` is provided for this deploy action. This is useful when deploying to
production or shared environments, or when the action deploys infrastructure that you don't want to unintentionally update/create.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `createStack`

If set to true, Garden will automatically create the stack if it doesn't already exist.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `root`

Specify the path to the Pulumi project root, relative to the deploy action's root.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

### `useNewPulumiVarfileSchema`

If set to true, the deploy action will use the new Pulumi varfile schema, which does not nest all variables under
the 'config' key automatically like the old schema. This allow setting variables at the root level of the varfile
that don't belong to the 'config' key. Example:
```
config:
  myVar: value
secretsprovider: gcpkms://projects/xyz/locations/global/keyRings/pulumi/cryptoKeys/pulumi-secrets
```
For more information see [this guide on pulumi varfiles and variables](https://docs.garden.io/pulumi-plugin/about#pulumi-varfile-schema)

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `pulumiVariables`

A map of config variables to use when applying the stack. These are merged with the contents of any `pulumiVarfiles` provided
for this deploy action. The deploy action's stack config will be overwritten with the resulting merged config.
Variables declared here override any conflicting config variables defined in this deploy action's `pulumiVarfiles`.

Note: `pulumiVariables` should not include action outputs from other pulumi deploy actions when `cacheStatus` is set to true, since
the outputs may change from the time the stack status of the dependency action is initially queried to when it's been deployed.

Instead, use pulumi stack references when using the `cacheStatus` config option.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `pulumiVarfiles[]`

Specify one or more paths (relative to the deploy action's root) to YAML files containing pulumi configuration.

Templated paths that resolve to `null`, `undefined` or an empty string are ignored.

Any Garden template strings in these varfiles will be resolved when the files are loaded.

Each file must consist of a single YAML document, which must be a map (dictionary). Keys may contain any
value type.

If one or more varfiles is not found, no error is thrown (that varfile path is simply ignored).

Note: The old varfile schema nests all variables under the 'config' key automatically. If you need to set variables
at the root level of the varfile that don't belong to the 'config' key, set `useNewPulumiVarfileSchema` to true.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

### `orgName`

The name of the pulumi organization to use. Overrides the `orgName` set on the pulumi provider (if any).
To use the default org, set to null.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `cacheStatus`

When set to true, the pulumi stack will be tagged with the Garden service version when deploying. The tag
will then be used for service status checks for this service. If the version doesn't change between deploys,
the subsequent deploy is skipped.

Note that this will not pick up changes to stack outputs referenced via stack references in your pulumi stack,
unless they're referenced via template strings in the deploy action configuration.

When using stack references to other pulumi deploy actions in your project, we recommend including them in this
deploy action's `stackReferences` config field (see the documentation for that field on this page).

`cacheStatus: true` is not supported for self-managed state backends.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `stackReferences[]`

When setting `cacheStatus` to true for this deploy action, you should include all stack references used by this
deploy action's pulumi stack in this field.

This lets Garden know to redeploy the pulumi stack if the output values of one or more of these stack references
have changed since the last deployment.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

Example:

```yaml
stackReferences:
  - ${actions.deploy.some-pulumi-deploy-action.outputs.ip-address}
  - ${actions.deploy.some-other-pulumi-deploy-action.outputs.database-url}
```

### `deployFromPreview`

When set to true, will use pulumi plans generated by the `garden plugins pulumi preview` command when
deploying, and will fail if no plan exists locally for the deploy action.

When this option is used, the pulumi plugin bypasses the status check altogether and passes the plan directly
to `pulumi up` (via the `--plan` option, which is experimental as of March 2022). You should therefore
take care to only use this config option when you're sure you want to apply the changes in the plan.

This option is intended for two-phase pulumi deployments, where pulumi preview diffs are first reviewed (e.g.
during code review).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `stack`

The name of the pulumi stack to use. Defaults to the current environment name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `showSecretsInOutput`

When set to true, stack outputs which are marked as secrets will be shown in the output.

By default, Pulumi will print secret stack outputs as the string '[secret]' instead of
the true content of the output.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |


## Outputs

### Module Outputs

The following keys are available via the `${modules.<module-name>}` template string key for `pulumi`
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

The following keys are available via the `${runtime.services.<service-name>}` template string key for `pulumi` module services.
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

The following keys are available via the `${runtime.tasks.<task-name>}` template string key for `pulumi` module tasks.
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

