---
order: 4
title: Config Files
---

# garden.yml reference

Below is the schema reference for the [Project](#project-configuration-keys), [Module](#module-configuration-keys) and [Workflow](#workflow-configuration-keys) `garden.yml` configuration files. For an introduction to configuring a Garden project, please look at our [configuration guide](../guides/configuration-files.md).

The reference is divided into a few sections:
* [Project YAML schema](#project-yaml-schema) contains the Project config YAML schema
* [Project configuration keys](#project-configuration-keys) describes each individual schema key for Project configuration files.
* [Module YAML schema](#module-yaml-schema) contains the Module config YAML schema
* [Module configuration keys](#module-configuration-keys) describes each individual schema key for Module configuration files.
* [Workflow YAML schema](#workflow-yaml-schema) contains the Workflow config YAML schema
* [Workflow configuration keys](#module-configuration-keys) describes each individual schema key for Workflow configuration files.

Note that individual providers, e.g. `kubernetes`, add their own project level configuration keys. The provider types are listed on the [Providers page](../reference/providers/README.md).

Likewise, individual module types, e.g. `container`, add additional configuration keys at the module level. Module types are listed on the [Module Types page](../reference/module-types/README.md).

Please refer to those for more details on provider and module configuration.

## Project YAML schema

The values in the schema below are the default values.

```yaml
# Indicate what kind of config this is.
kind: Project

# The name of the project.
name:

# A list of environments to configure for the project.
environments:
  - # The name of the environment.
    name:

    # Control if and how this environment should support namespaces. If set to "optional" (the default), users can
    # set a namespace for the environment. This is useful for any shared environments, e.g. testing and development
    # environments, where namespaces separate different users or code versions within an environment. Users then
    # specify an environment with `--env <namespace>.<environment>`, e.g. `--env alice.dev` or
    # `--env my-branch.testing`.
    #
    # If set to "required", this namespace separation is enforced, and an error is thrown if a namespace is not
    # specified with the `--env` parameter.
    #
    # If set to "disabled", an error is thrown if a namespace is specified. This makes sense for e.g. production or
    # staging environments, where you don't want to split the environment between users or code versions.
    #
    # When specified, namespaces must be a valid DNS-style label, much like other identifiers.
    namespacing: optional

    # Set a default namespace to use, when `namespacing` is `required` or `optional`. This can be templated to be
    # user-specific, or to use an environment variable (e.g. in CI).
    #
    # If this is set, users can specify `--env <environment>` and skip the namespace part, even when `namespacing` is
    # `required` for the environment.
    defaultNamespace:

    # Flag the environment as a production environment.
    #
    # Setting this flag to `true` will activate the protection on the `deploy`, `test`, `task`, `build`,
    # and `dev` commands. A protected command will ask for a user confirmation every time is run against
    # an environment marked as production.
    # Run the command with the "--yes" flag to skip the check (e.g. when running Garden in CI).
    #
    # This flag is also passed on to every provider, and may affect how certain providers behave.
    # For more details please check the documentation for the providers in use.
    production: false

    # Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
    # _environment-specific_ `variables` field. The file should be in a standard "dotenv" format, specified
    # [here](https://github.com/motdotla/dotenv#rules).
    #
    # If you don't set the field and the `garden.<env-name>.env` file does not exist,
    # we simply ignore it. If you do override the default value and the file doesn't exist, an error will be thrown.
    varfile:

    # A key/value map of variables that modules can reference when using this environment. These take precedence over
    # variables defined in the top-level `variables` field.
    variables: {}

# A list of providers that should be used for this project, and their configuration. Please refer to individual
# plugins/providers for details on how to configure them.
providers:
  - # The name of the provider plugin to use.
    name:

    # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    environments:

# The default environment to use when calling commands without the `--env` parameter. May include a namespace name, in
# the format `<namespace>.<environment>`. Defaults to the first configured environment, with no namespace set.
defaultEnvironment: ''

# Specify a list of filenames that should be used as ".ignore" files across the project, using the same syntax and
# semantics as `.gitignore` files. By default, patterns matched in `.gardenignore` files, found anywhere in the
# project, are ignored when scanning for modules and module sources (Note: prior to version 0.12.0, `.gitignore` files
# were also used by default).
# Note that these take precedence over the project `module.include` field, and module `include` fields, so any paths
# matched by the .ignore files will be ignored even if they are explicitly specified in those fields.
# See the [Configuration Files
# guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.
dotIgnoreFiles:
  - .gardenignore

# Control where to scan for modules in the project.
modules:
  # Specify a list of POSIX-style paths or globs that should be scanned for Garden modules.
  #
  # Note that you can also _exclude_ path using the `exclude` field or by placing `.gardenignore` files in your source
  # tree, which use the same format as `.gitignore` files. See the [Configuration Files
  # guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.
  #
  # Unlike the `exclude` field, the paths/globs specified here have _no effect_ on which files and directories Garden
  # watches for changes. Use the `exclude` field to affect those, if you have large directories that should not be
  # watched for changes.
  #
  # Also note that specifying an empty list here means _no paths_ should be included.
  include:

  # Specify a list of POSIX-style paths or glob patterns that should be excluded when scanning for modules.
  #
  # The filters here also affect which files and directories are watched for changes. So if you have a large number of
  # directories in your project that should not be watched, you should specify them here.
  #
  # For example, you might want to exclude large vendor directories in your project from being scanned and watched, by
  # setting `exclude: [node_modules/**/*, vendor/**/*]`.
  #
  # Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include`
  # field, the paths/patterns specified here are filtered from the files matched by `include`.
  #
  # The `include` field does _not_ affect which files are watched.
  #
  # See the [Configuration Files
  # guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.
  exclude:

# A list of output values that the project should export. These are exported by the `garden get outputs` command, as
# well as when referencing a project as a sub-project within another project.
#
# You may use any template strings to specify the values, including references to provider outputs, module
# outputs and runtime outputs. For a full reference, see the [Output configuration
# context](https://docs.garden.io/reference/template-strings#output-configuration-context) section in the Template
# String Reference.
#
# Note that if any runtime outputs are referenced, the referenced services and tasks will be deployed and run if
# necessary when resolving the outputs.
outputs:
  - # The name of the output value.
    name:

    # The value for the output. Must be a primitive (string, number, boolean or null). May also be any valid template
    # string.
    value:

# A list of remote sources to import into project.
sources:
  - # The name of the source to import
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:

# Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
# project-wide `variables` field. The file should be in a standard "dotenv" format, specified
# [here](https://github.com/motdotla/dotenv#rules).
#
# If you don't set the field and the `garden.env` file does not exist, we simply ignore it.
# If you do override the default value and the file doesn't exist, an error will be thrown.
#
# _Note that in many cases it is advisable to only use environment-specific var files, instead of combining
# multiple ones. See the `environments[].varfile` field for this option._
varfile: garden.env

# Key/value map of variables to configure for all environments. Keys may contain letters and numbers. Any values are
# permitted, including arrays and objects of any nesting.
variables: {}
```

## Project configuration keys


### `kind`

Indicate what kind of config this is.

| Type     | Allowed Values | Default     | Required |
| -------- | -------------- | ----------- | -------- |
| `string` | "Project"      | `"Project"` | Yes      |

### `name`

The name of the project.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
name: "my-sweet-project"
```

### `environments[]`

A list of environments to configure for the project.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `environments[].name`

[environments](#environments) > name

The name of the environment.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
environments:
  - name: "dev"
```

### `environments[].namespacing`

[environments](#environments) > namespacing

Control if and how this environment should support namespaces. If set to "optional" (the default), users can
set a namespace for the environment. This is useful for any shared environments, e.g. testing and development
environments, where namespaces separate different users or code versions within an environment. Users then
specify an environment with `--env <namespace>.<environment>`, e.g. `--env alice.dev` or
`--env my-branch.testing`.

If set to "required", this namespace separation is enforced, and an error is thrown if a namespace is not
specified with the `--env` parameter.

If set to "disabled", an error is thrown if a namespace is specified. This makes sense for e.g. production or
staging environments, where you don't want to split the environment between users or code versions.

When specified, namespaces must be a valid DNS-style label, much like other identifiers.

| Type     | Default      | Required |
| -------- | ------------ | -------- |
| `string` | `"optional"` | No       |

### `environments[].defaultNamespace`

[environments](#environments) > defaultNamespace

Set a default namespace to use, when `namespacing` is `required` or `optional`. This can be templated to be user-specific, or to use an environment variable (e.g. in CI).

If this is set, users can specify `--env <environment>` and skip the namespace part, even when `namespacing` is `required` for the environment.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
environments:
  - defaultNamespace: "user-${local.username}"
```

### `environments[].production`

[environments](#environments) > production

Flag the environment as a production environment.

Setting this flag to `true` will activate the protection on the `deploy`, `test`, `task`, `build`,
and `dev` commands. A protected command will ask for a user confirmation every time is run against
an environment marked as production.
Run the command with the "--yes" flag to skip the check (e.g. when running Garden in CI).

This flag is also passed on to every provider, and may affect how certain providers behave.
For more details please check the documentation for the providers in use.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

Example:

```yaml
environments:
  - production: true
```

### `environments[].providers[]`

[environments](#environments) > providers

DEPRECATED - Please use the top-level `providers` field instead, and if needed use the `environments` key on the provider configurations to limit them to specific environments.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `environments[].providers[].name`

[environments](#environments) > [providers](#environmentsproviders) > name

The name of the provider plugin to use.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
environments:
```

### `environments[].providers[].environments[]`

[environments](#environments) > [providers](#environmentsproviders) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
environments:
```

### `environments[].varfile`

[environments](#environments) > varfile

Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
_environment-specific_ `variables` field. The file should be in a standard "dotenv" format, specified
[here](https://github.com/motdotla/dotenv#rules).

If you don't set the field and the `garden.<env-name>.env` file does not exist,
we simply ignore it. If you do override the default value and the file doesn't exist, an error will be thrown.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
environments:
  - varfile: "custom.env"
```

### `environments[].variables`

[environments](#environments) > variables

A key/value map of variables that modules can reference when using this environment. These take precedence over variables defined in the top-level `variables` field.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `providers[]`

A list of providers that should be used for this project, and their configuration. Please refer to individual plugins/providers for details on how to configure them.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `providers[].name`

[providers](#providers) > name

The name of the provider plugin to use.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
providers:
  - name: "local-kubernetes"
```

### `providers[].environments[]`

[providers](#providers) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
providers:
  - environments:
      - dev
      - stage
```

### `defaultEnvironment`

The default environment to use when calling commands without the `--env` parameter. May include a namespace name, in the format `<namespace>.<environment>`. Defaults to the first configured environment, with no namespace set.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `""`    | No       |

Example:

```yaml
defaultEnvironment: "dev"
```

### `dotIgnoreFiles[]`

Specify a list of filenames that should be used as ".ignore" files across the project, using the same syntax and semantics as `.gitignore` files. By default, patterns matched in `.gardenignore` files, found anywhere in the project, are ignored when scanning for modules and module sources (Note: prior to version 0.12.0, `.gitignore` files were also used by default).
Note that these take precedence over the project `module.include` field, and module `include` fields, so any paths matched by the .ignore files will be ignored even if they are explicitly specified in those fields.
See the [Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.

| Type               | Default             | Required |
| ------------------ | ------------------- | -------- |
| `array[posixPath]` | `[".gardenignore"]` | No       |

Example:

```yaml
dotIgnoreFiles:
  - .gardenignore
  - .gitignore
```

### `modules`

Control where to scan for modules in the project.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `modules.include[]`

[modules](#modules) > include

Specify a list of POSIX-style paths or globs that should be scanned for Garden modules.

Note that you can also _exclude_ path using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.

Unlike the `exclude` field, the paths/globs specified here have _no effect_ on which files and directories Garden watches for changes. Use the `exclude` field to affect those, if you have large directories that should not be watched for changes.

Also note that specifying an empty list here means _no paths_ should be included.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
modules:
  ...
  include:
    - modules/**/*
```

### `modules.exclude[]`

[modules](#modules) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded when scanning for modules.

The filters here also affect which files and directories are watched for changes. So if you have a large number of directories in your project that should not be watched, you should specify them here.

For example, you might want to exclude large vendor directories in your project from being scanned and watched, by setting `exclude: [node_modules/**/*, vendor/**/*]`.

Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include` field, the paths/patterns specified here are filtered from the files matched by `include`.

The `include` field does _not_ affect which files are watched.

See the [Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
modules:
  ...
  exclude:
    - public/**/*
    - tmp/**/*
```

### `outputs[]`

A list of output values that the project should export. These are exported by the `garden get outputs` command, as well as when referencing a project as a sub-project within another project.

You may use any template strings to specify the values, including references to provider outputs, module
outputs and runtime outputs. For a full reference, see the [Output configuration context](https://docs.garden.io/reference/template-strings#output-configuration-context) section in the Template String Reference.

Note that if any runtime outputs are referenced, the referenced services and tasks will be deployed and run if necessary when resolving the outputs.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `outputs[].name`

[outputs](#outputs) > name

The name of the output value.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
outputs:
  - name: "my-output-key"
```

### `outputs[].value`

[outputs](#outputs) > value

The value for the output. Must be a primitive (string, number, boolean or null). May also be any valid template
string.

| Type                        | Required |
| --------------------------- | -------- |
| `number | string | boolean` | Yes      |

Example:

```yaml
outputs:
  - value: "${modules.my-module.outputs.some-output}"
```

### `sources[]`

A list of remote sources to import into project.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `sources[].name`

[sources](#sources) > name

The name of the source to import

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
sources:
  - name: "my-external-repo"
```

### `sources[].repositoryUrl`

[sources](#sources) > repositoryUrl

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

| Type              | Required |
| ----------------- | -------- |
| `gitUrl | string` | Yes      |

Example:

```yaml
sources:
  - repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

### `varfile`

Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
project-wide `variables` field. The file should be in a standard "dotenv" format, specified
[here](https://github.com/motdotla/dotenv#rules).

If you don't set the field and the `garden.env` file does not exist, we simply ignore it.
If you do override the default value and the file doesn't exist, an error will be thrown.

_Note that in many cases it is advisable to only use environment-specific var files, instead of combining
multiple ones. See the `environments[].varfile` field for this option._

| Type        | Default        | Required |
| ----------- | -------------- | -------- |
| `posixPath` | `"garden.env"` | No       |

Example:

```yaml
varfile: "custom.env"
```

### `variables`

Key/value map of variables to configure for all environments. Keys may contain letters and numbers. Any values are permitted, including arrays and objects of any nesting.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |


## Module YAML schema
```yaml
# The schema version of this module's config (currently not used).
apiVersion: garden.io/v0

kind: Module

# The type of this module.
type:

# The name of this module.
name:

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
# guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.
#
# Also note that specifying an empty list here means _no sources_ should be included.
include:

# Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match these
# paths or globs are excluded when computing the version of the module, when responding to filesystem watch events,
# and when staging builds.
#
# Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include`
# field, the files/patterns specified here are filtered from the files matched by `include`. See the [Configuration
# Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)for
# details.
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
```

## Module configuration keys


### `apiVersion`

The schema version of this module's config (currently not used).

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

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.

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

Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include` field, the files/patterns specified here are filtered from the files matched by `include`. See the [Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)for details.

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


## Workflow YAML schema
```yaml
# The schema version of this workflow's config (currently not used).
apiVersion: garden.io/v0

kind: Workflow

# The name of this workflow.
name:

# A description of the workflow.
description:

# A list of files to write before starting the workflow.
#
# This is useful to e.g. create files required for provider authentication, and can be created from data stored in
# secrets or templated strings.
#
# Note that you cannot reference provider configuration in template strings within this field, since they are resolved
# after these files are generated. This means you can reference the files specified here in your provider
# configurations.
files:
  - # POSIX-style path to write the file to, relative to the project root (or absolute). If the path contains one
    # or more directories, they are created automatically if necessary.
    # If any of those directories conflict with existing file paths, or if the file path conflicts with an existing
    # directory path, an error will be thrown.
    # **Any existing file with the same path will be overwritten, so be careful not to accidentally accidentally
    # overwrite files unrelated to your workflow.**
    path:

    # The file data as a string.
    data:

    # The name of a Garden secret to copy the file data from (Garden Enterprise only).
    secretName:

# The number of hours to keep the workflow pod running after completion.
keepAliveHours: 48

limits:
  # The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU)
  cpu: 1000

  # The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB)
  memory: 1024

# The steps the workflow should run. At least one step is required. Steps are run sequentially. If a step fails,
# subsequent steps are skipped.
steps:
  - # An identifier to assign to this step. If none is specified, this defaults to "step-<number of step>", where
    # <number of step> is the sequential number of the step (first step being number 1).
    #
    # This identifier is useful when referencing command outputs in following steps. For example, if you set this
    # to "my-step", following steps can reference the \${steps.my-step.outputs.*} key in the `script` or `command`
    # fields.
    name:

    # A Garden command this step should run, followed by any required or optional arguments and flags.
    # Arguments and options for the commands may be templated, including references to previous steps, but for now
    # the commands themselves (as listed below) must be hard-coded.
    #
    # Supported commands:
    #
    # `[build]`
    # `[delete, environment]`
    # `[delete, service]`
    # `[deploy]`
    # `[exec]`
    # `[get, config]`
    # `[get, outputs]`
    # `[get, status]`
    # `[get, task-result]`
    # `[get, test-result]`
    # `[link, module]`
    # `[link, source]`
    # `[publish]`
    # `[run, task]`
    # `[run, test]`
    # `[test]`
    # `[update-remote, all]`
    # `[update-remote, modules]`
    # `[update-remote, sources]`
    #
    #
    command:

    # A description of the workflow step.
    description:

    # A bash script to run. Note that the host running the workflow must have bash installed and on path. It is
    # considered to have run successfully if it returns an exit code of 0. Any other exit code signals an error, and
    # the remainder of the workflow is aborted.
    # The script may include template strings, including references to previous steps.
    script:

# A list of triggers that determine when the workflow should be run, and which environment should be used (Garden
# Enterprise only).
triggers:
  - # The environment name (from your project configuration) to use for the workflow when matched by this trigger.
    environment:

    # The namespace to use for the workflow when matched by this trigger. Follows the namespacing setting used for
    # this trigger's environment, as defined in your project's environment configs.
    namespace:

    # A list of GitHub events that should trigger this workflow.
    events:

    # If specified, only run the workflow for branches matching one of these filters.
    branches:

    # If specified, only run the workflow for tags matching one of these filters.
    tags:

    # If specified, do not run the workflow for branches matching one of these filters.
    ignoreBranches:

    # If specified, do not run the workflow for tags matching one of these filters.
    ignoreTags:
```

## Workflow configuration keys


### `apiVersion`

The schema version of this workflow's config (currently not used).

| Type     | Allowed Values | Default          | Required |
| -------- | -------------- | ---------------- | -------- |
| `string` | "garden.io/v0" | `"garden.io/v0"` | Yes      |

### `kind`

| Type     | Allowed Values | Default      | Required |
| -------- | -------------- | ------------ | -------- |
| `string` | "Workflow"     | `"Workflow"` | Yes      |

### `name`

The name of this workflow.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
name: "my-workflow"
```

### `description`

A description of the workflow.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `files[]`

A list of files to write before starting the workflow.

This is useful to e.g. create files required for provider authentication, and can be created from data stored in secrets or templated strings.

Note that you cannot reference provider configuration in template strings within this field, since they are resolved after these files are generated. This means you can reference the files specified here in your provider configurations.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `files[].path`

[files](#files) > path

POSIX-style path to write the file to, relative to the project root (or absolute). If the path contains one
or more directories, they are created automatically if necessary.
If any of those directories conflict with existing file paths, or if the file path conflicts with an existing directory path, an error will be thrown.
**Any existing file with the same path will be overwritten, so be careful not to accidentally accidentally overwrite files unrelated to your workflow.**

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
files:
  - path: ".auth/kubeconfig.yaml"
```

### `files[].data`

[files](#files) > data

The file data as a string.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `files[].secretName`

[files](#files) > secretName

The name of a Garden secret to copy the file data from (Garden Enterprise only).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `keepAliveHours`

The number of hours to keep the workflow pod running after completion.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `48`    | No       |

### `limits`

| Type     | Default                      | Required |
| -------- | ---------------------------- | -------- |
| `object` | `{"cpu":1000,"memory":1024}` | No       |

### `limits.cpu`

[limits](#limits) > cpu

The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1000`  | No       |

### `limits.memory`

[limits](#limits) > memory

The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1024`  | No       |

### `steps[]`

The steps the workflow should run. At least one step is required. Steps are run sequentially. If a step fails, subsequent steps are skipped.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | Yes      |

### `steps[].name`

[steps](#steps) > name

An identifier to assign to this step. If none is specified, this defaults to "step-<number of step>", where
<number of step> is the sequential number of the step (first step being number 1).

This identifier is useful when referencing command outputs in following steps. For example, if you set this
to "my-step", following steps can reference the \${steps.my-step.outputs.*} key in the `script` or `command`
fields.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `steps[].command[]`

[steps](#steps) > command

A Garden command this step should run, followed by any required or optional arguments and flags.
Arguments and options for the commands may be templated, including references to previous steps, but for now
the commands themselves (as listed below) must be hard-coded.

Supported commands:

`[build]`
`[delete, environment]`
`[delete, service]`
`[deploy]`
`[exec]`
`[get, config]`
`[get, outputs]`
`[get, status]`
`[get, task-result]`
`[get, test-result]`
`[link, module]`
`[link, source]`
`[publish]`
`[run, task]`
`[run, test]`
`[test]`
`[update-remote, all]`
`[update-remote, modules]`
`[update-remote, sources]`



| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
steps:
  - command:
      - run
      - task
      - my-task
```

### `steps[].description`

[steps](#steps) > description

A description of the workflow step.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `steps[].script`

[steps](#steps) > script

A bash script to run. Note that the host running the workflow must have bash installed and on path. It is considered to have run successfully if it returns an exit code of 0. Any other exit code signals an error, and the remainder of the workflow is aborted.
The script may include template strings, including references to previous steps.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `triggers[]`

A list of triggers that determine when the workflow should be run, and which environment should be used (Garden Enterprise only).

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `triggers[].environment`

[triggers](#triggers) > environment

The environment name (from your project configuration) to use for the workflow when matched by this trigger.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `triggers[].namespace`

[triggers](#triggers) > namespace

The namespace to use for the workflow when matched by this trigger. Follows the namespacing setting used for this trigger's environment, as defined in your project's environment configs.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `triggers[].events[]`

[triggers](#triggers) > events

A list of GitHub events that should trigger this workflow.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `triggers[].branches[]`

[triggers](#triggers) > branches

If specified, only run the workflow for branches matching one of these filters.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `triggers[].tags[]`

[triggers](#triggers) > tags

If specified, only run the workflow for tags matching one of these filters.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `triggers[].ignoreBranches[]`

[triggers](#triggers) > ignoreBranches

If specified, do not run the workflow for branches matching one of these filters.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `triggers[].ignoreTags[]`

[triggers](#triggers) > ignoreTags

If specified, do not run the workflow for tags matching one of these filters.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

