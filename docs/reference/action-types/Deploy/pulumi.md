---
title: "`pulumi` Deploy"
tocTitle: "`pulumi` Deploy"
---

# `pulumi` Deploy

## Description

Deploys a Pulumi stack and either creates/updates it automatically (if `autoApply: true`) or warns when the stack resources are not up-to-date, or errors if it's missing entirely.

**Note: It is not recommended to set `autoApply` to `true` for production or shared environments, since this may result in accidental or conflicting changes to the stack.** Instead, it is recommended to manually preview and update using the provided plugin commands. Run `garden plugins pulumi` for details. Note that not all Pulumi CLI commands are wrapped by the plugin, only the ones where it's important to apply any variables defined in the action. For others, simply run the Pulumi CLI as usual from the project root.

Stack outputs are made available as action outputs. These can then be referenced by other actions under `${actions.<name>.outputs.<key>}`. You can template in those values as e.g. command arguments or environment variables for other services.

Below is the full schema reference for the action. For an introduction to configuring Garden, please look at our [Configuration
guide](../../using-garden/configuration-overview.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`pulumi` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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
# based on, for example, the current environment or other variables (e.g. `disabled: \${environment.name == "prod"}`).
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

# Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will
# affect the computed _version_ of the action.
#
# For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An
# exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be inferred
# and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run
# when certain files are modified.
#
# _Build_ actions have a different behavior, since they generally are based on some files in the source tree, so
# please reference the docs for more information on those.
#
# Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source
# tree, which use the same format as `.gitignore` files. See the [Configuration Files
# guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
# details.
include:

# Specify a list of POSIX-style paths or glob patterns that should be explicitly excluded from the action's version.
#
# For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For
# _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set `include`
# paths, or such paths inferred by providers. See the [Configuration Files
# guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
# details.
#
# Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and
# directories are watched for changes when watching is enabled. Use the project `scan.exclude` field to affect those,
# if you have large directories that should not be watched for changes.
exclude:

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
varfiles:

# Specify a _Build_ action, and resolve this action from the context of that Build.
#
# For example, you might create an `exec` Build which prepares some manifests, and then reference that in a
# `kubernetes` _Deploy_ action, and the resulting manifests from the Build.
#
# This would mean that instead of looking for manifest files relative to this action's location in your project
# structure, the output directory for the referenced `exec` Build would be the source.
build:

spec:
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

  # If set to true, Garden will destroy the stack when calling `garden delete env` or `garden delete service <module
  # name>`.
  # This is useful to prevent unintentional destroys in production or shared environments.
  allowDestroy: true

  # If set to false, deployments will fail unless a `planPath` is provided for this module. This is useful when
  # deploying to
  # production or shared environments, or when the module deploys infrastructure that you don't want to
  # unintentionally update/create.
  autoApply: true

  # If set to true, Garden will automatically create the stack if it doesn't already exist.
  createStack: false

  # The names of any services that this service depends on at runtime, and the names of any tasks that should be
  # executed before this service is deployed.
  dependencies: []

  # Specify the path to the Pulumi project root, relative to the module root.
  root: .

  # A map of config variables to use when applying the stack. These are merged with the contents of any
  # `pulumiVarfiles` provided
  # for this module. The module's stack config will be overwritten with the resulting merged config.
  # Variables declared here override any conflicting config variables defined in this module's `pulumiVarfiles`.
  #
  # Note: `pulumiVariables` should not include runtime outputs from other pulumi modules when `cacheStatus` is set to
  # true, since
  # the outputs may change from the time the stack status of the dependency module is initially queried to when it's
  # been deployed.
  #
  # Instead, use pulumi stack references when using the `cacheStatus` config option.
  pulumiVariables: {}

  # Specify one or more paths (relative to the module root) to YAML files containing pulumi config variables.
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
  # Note: There is no need to nest the variables under a `config` field as is done in a pulumi
  # config. Simply specify all the config variables at the top level.
  pulumiVarfiles: []

  # The name of the pulumi organization to use. Overrides the `orgName` set on the pulumi provider (if any).
  # To use the default org, set to null.
  orgName:

  # When set to true, the pulumi stack will be tagged with the Garden service version when deploying. The tag
  # will then be used for service status checks for this service. If the version doesn't change between deploys,
  # the subsequent deploy is skipped.
  #
  # Note that this will not pick up changes to stack outputs referenced via stack references in your pulumi stack,
  # unless they're referenced via template strings in the module configuration.
  #
  # When using stack references to other pulumi modules in your project, we recommend including them in this
  # module's `stackReferences` config field (see the documentation for that field on this page).
  cacheStatus: false

  # When setting `cacheStatus` to true for this module, you should include all stack references used by this
  # module's pulumi stack in this field.
  #
  # This lets Garden know to redeploy the pulumi stack if the output values of one or more of these stack references
  # have changed since the last deployment.
  stackReferences: []

  # When set to true, will use pulumi plans generated by the `garden plugins pulumi preview` command when
  # deploying, and will fail if no plan exists locally for the module.
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

| Type              | Required |
| ----------------- | -------- |
| `gitUrl | string` | Yes      |

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

Set this to `true` to disable the action. You can use this with conditional template strings to disable actions based on, for example, the current environment or other variables (e.g. `disabled: \${environment.name == "prod"}`). This can be handy when you only need certain actions for specific environments, e.g. only for development.

For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or built).

For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored. Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the action is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `include[]`

Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will affect the computed _version_ of the action.

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run when certain files are modified.

_Build_ actions have a different behavior, since they generally are based on some files in the source tree, so please reference the docs for more information on those.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set `include` paths, or such paths inferred by providers. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

### `varfiles`

Specify a list of paths (relative to the directory where the action is defined) to a file containing variables, that we apply on top of the action-level `variables` field, and take precedence over group-level variables (if applicable) and project-level variables, in that order.

If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the previous ones.

The format of the files is determined by the configured file's extension:

* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type.
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

To use different varfiles in different environments, you can template in the environment name to the varfile name, e.g. `varfile: "my-action.\$\{environment.name\}.env` (this assumes that the corresponding varfiles exist).

If a listed varfile cannot be found, it is ignored.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
varfiles: "my-action.env"
```

### `build`

Specify a _Build_ action, and resolve this action from the context of that Build.

For example, you might create an `exec` Build which prepares some manifests, and then reference that in a `kubernetes` _Deploy_ action, and the resulting manifests from the Build.

This would mean that instead of looking for manifest files relative to this action's location in your project structure, the output directory for the referenced `exec` Build would be the source.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.build`

[spec](#spec) > build

Specify how to build the module. Note that plugins may define additional keys on this object.

| Type     | Default               | Required |
| -------- | --------------------- | -------- |
| `object` | `{"dependencies":[]}` | No       |

### `spec.build.dependencies[]`

[spec](#spec) > [build](#specbuild) > dependencies

A list of modules that must be built before this module is built.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

Example:

```yaml
spec:
  ...
  build:
    ...
    dependencies:
      - name: some-other-module-name
```

### `spec.build.dependencies[].name`

[spec](#spec) > [build](#specbuild) > [dependencies](#specbuilddependencies) > name

Module name to build ahead of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.build.dependencies[].copy[]`

[spec](#spec) > [build](#specbuild) > [dependencies](#specbuilddependencies) > copy

Specify one or more files or directories to copy from the built dependency to this module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `spec.build.dependencies[].copy[].source`

[spec](#spec) > [build](#specbuild) > [dependencies](#specbuilddependencies) > [copy](#specbuilddependenciescopy) > source

POSIX-style path or filename of the directory or file(s) to copy to the target.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `spec.build.dependencies[].copy[].target`

[spec](#spec) > [build](#specbuild) > [dependencies](#specbuilddependencies) > [copy](#specbuilddependenciescopy) > target

POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
Defaults to to same as source path.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `""`    | No       |

### `spec.build.timeout`

[spec](#spec) > [build](#specbuild) > timeout

Maximum time in seconds to wait for build to finish.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1200`  | No       |

### `spec.allowDestroy`

[spec](#spec) > allowDestroy

If set to true, Garden will destroy the stack when calling `garden delete env` or `garden delete service <module name>`.
This is useful to prevent unintentional destroys in production or shared environments.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `spec.autoApply`

[spec](#spec) > autoApply

If set to false, deployments will fail unless a `planPath` is provided for this module. This is useful when deploying to
production or shared environments, or when the module deploys infrastructure that you don't want to unintentionally update/create.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `spec.createStack`

[spec](#spec) > createStack

If set to true, Garden will automatically create the stack if it doesn't already exist.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.dependencies[]`

[spec](#spec) > dependencies

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `spec.root`

[spec](#spec) > root

Specify the path to the Pulumi project root, relative to the module root.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

### `spec.pulumiVariables`

[spec](#spec) > pulumiVariables

A map of config variables to use when applying the stack. These are merged with the contents of any `pulumiVarfiles` provided
for this module. The module's stack config will be overwritten with the resulting merged config.
Variables declared here override any conflicting config variables defined in this module's `pulumiVarfiles`.

Note: `pulumiVariables` should not include runtime outputs from other pulumi modules when `cacheStatus` is set to true, since
the outputs may change from the time the stack status of the dependency module is initially queried to when it's been deployed.

Instead, use pulumi stack references when using the `cacheStatus` config option.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `spec.pulumiVarfiles[]`

[spec](#spec) > pulumiVarfiles

Specify one or more paths (relative to the module root) to YAML files containing pulumi config variables.

Templated paths that resolve to `null`, `undefined` or an empty string are ignored.

Any Garden template strings in these varfiles will be resolved when the files are loaded.

Each file must consist of a single YAML document, which must be a map (dictionary). Keys may contain any
value type.

If one or more varfiles is not found, no error is thrown (that varfile path is simply ignored).

Note: There is no need to nest the variables under a `config` field as is done in a pulumi
config. Simply specify all the config variables at the top level.

| Type               | Default | Required |
| ------------------ | ------- | -------- |
| `array[posixPath]` | `[]`    | No       |

### `spec.orgName`

[spec](#spec) > orgName

The name of the pulumi organization to use. Overrides the `orgName` set on the pulumi provider (if any).
To use the default org, set to null.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.cacheStatus`

[spec](#spec) > cacheStatus

When set to true, the pulumi stack will be tagged with the Garden service version when deploying. The tag
will then be used for service status checks for this service. If the version doesn't change between deploys,
the subsequent deploy is skipped.

Note that this will not pick up changes to stack outputs referenced via stack references in your pulumi stack,
unless they're referenced via template strings in the module configuration.

When using stack references to other pulumi modules in your project, we recommend including them in this
module's `stackReferences` config field (see the documentation for that field on this page).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.stackReferences[]`

[spec](#spec) > stackReferences

When setting `cacheStatus` to true for this module, you should include all stack references used by this
module's pulumi stack in this field.

This lets Garden know to redeploy the pulumi stack if the output values of one or more of these stack references
have changed since the last deployment.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

Example:

```yaml
spec:
  ...
  stackReferences:
    - '${runtime.services.some-pulumi-module.outputs.ip-address}'
    - '${runtime.services.some-other-pulumi-module.outputs.database-url}'
```

### `spec.deployFromPreview`

[spec](#spec) > deployFromPreview

When set to true, will use pulumi plans generated by the `garden plugins pulumi preview` command when
deploying, and will fail if no plan exists locally for the module.

When this option is used, the pulumi plugin bypasses the status check altogether and passes the plan directly
to `pulumi up` (via the `--plan` option, which is experimental as of March 2022). You should therefore
take care to only use this config option when you're sure you want to apply the changes in the plan.

This option is intended for two-phase pulumi deployments, where pulumi preview diffs are first reviewed (e.g.
during code review).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.stack`

[spec](#spec) > stack

The name of the pulumi stack to use. Defaults to the current environment name.

| Type     | Required |
| -------- | -------- |
| `string` | No       |


## Outputs

The following keys are available via the `${actions.deploy.<name>}` template string key for `pulumi`
modules.

### `${actions.deploy.<name>.buildPath}`

The build path of the action/module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.buildPath}
```

### `${actions.deploy.<name>.name}`

The name of the action/module.

| Type     |
| -------- |
| `string` |

### `${actions.deploy.<name>.path}`

The source path of the action/module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.path}
```

### `${actions.deploy.<name>.var.*}`

A map of all variables defined in the module.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.deploy.<name>.var.<variable-name>}`

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

### `${actions.deploy.<name>.version}`

The current version of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.version}
```

### `${actions.deploy.<name>.outputs.*}`

A map of all the outputs returned by the Pulumi stack.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.deploy.<name>.outputs.<name>}`

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |
