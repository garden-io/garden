---
order: 40
title: Project Configuration
---

# Project Configuration Reference

Below is the schema reference for Project configuration files.

The reference is divided into two sections:
* [YAML Schema](#yaml-schema) contains the Project config YAML schema
* [Configuration keys](#configuration-keys) describes each individual schema key for Project configuration files.

Note that individual providers, e.g. `kubernetes`, add their own project level configuration keys. The provider types are listed on the [Providers page](../reference/providers/README.md).

Please refer to those for more details on provider configuration.

## YAML Schema

The values in the schema below are the default values.

```yaml
# The Garden apiVersion for this project.
#
# The value garden.io/v0 is the default for backwards compatibility with
# Garden Acorn (0.12) when not explicitly specified.
#
# Configuring garden.io/v1 explicitly in your project configuration allows
# you to start using the new Action configs introduced in Garden Bonsai (0.13).
#
# Note that the value garden.io/v1 will break compatibility of your project
# with Garden Acorn (0.12).
#
# EXPERIMENTAL: Configuring garden.io/v2 explicitly in your project configuration
# activates the breaking changes introduced in Garden 0.14.
# The list of breaking changes is not final yet, so use this setting at your own risk.
#
# Please refer to [the deprecations guide](https://docs.garden.io/cedar-0.14/guides/deprecations) for more
# information.
apiVersion:

# Indicate what kind of config this is.
kind: Project

# The name of the project.
name:

# The ID of the organization that this project belongs to in Garden Cloud.
organizationId:

# A list of environments to configure for the project.
environments:
  - # The name of the environment.
    name:

    # Set the default namespace to use. This can be templated to be user-specific, or to use an environment variable
    # (e.g. in CI).
    #
    # You can also set this to `null`, in order to require an explicit namespace to be set on usage. This may be
    # advisable for shared environments, but you may also be able to achieve the desired result by templating this
    # field, as mentioned above.
    defaultNamespace: default

    # Flag the environment as a production environment.
    #
    # Setting this flag to `true` will activate the protection on the `build`, `delete`, `deploy`, `dev`, and
    # `test` commands. A protected command will ask for a user confirmation every time is run against
    # an environment marked as production.
    # Run the command with the "--yes" flag to skip the check (e.g. when running Garden in CI).
    #
    # This flag is also passed on to every provider, and may affect how certain providers behave.
    # For more details please check the documentation for the providers in use.
    production: false

    # Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
    # _environment-specific_ `variables` field.
    #
    # The format of the files is determined by the configured file's extension:
    #
    # * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may
    # contain any value type. YAML format is used by default.
    # * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
    # * `.json` - JSON. Must contain a single JSON _object_ (not an array).
    #
    # _NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of
    # nested objects and arrays._
    #
    # If you don't set the field and the `garden.<env-name>.env` file does not exist,
    # we simply ignore it. If you do override the default value and the file doesn't exist, an error will be thrown.
    varfile:

    # A key/value map of variables that actions can reference when using this environment. These take precedence over
    # variables defined in the top-level `variables` field, but may also reference the top-level variables in template
    # strings.
    variables: {}

    # Configuration for the Automatic Environment Cleanup feature.
    #
    # You must specify at least one _trigger_, which defines the schedule or time of inactivity that will cause the
    # automatic environment cleanup to be performed, as well as the type of action to perform (pause or cleanup).
    #
    # If you specify multiple triggers and multiple are matched, the _last_ trigger matched in the list will be used.
    # For example, you can specify a trigger to pause the environment after 1 day of inactivity as the first trigger,
    # and another trigger to fully clean up the environment after 1 week of inactivity or on a specific schedule as
    # the second trigger.
    #
    # Note that this feature is only available for paid Garden Cloud users. Also note that the feature is currently in
    # beta, and is only available for specific providers, in particular the Kubernetes provider.
    #
    # Please refer to the [Automatic Environment Cleanup
    # guide](https://docs.garden.io/cedar-0.14/guides/automatic-environment-cleanup) for details.
    aec:
      # Set to true to disable automatic environment cleanup. It may be useful to template this value in, in some
      # scenarios.
      disabled: false

      # The triggers that will cause the automatic environment cleanup to be performed.
      triggers:
        - # The action to perform when the trigger is matched.
          action:

          # The time to live for the environment after the last update (i.e. the last time the environment was
          # deployed or updated using `garden deploy`).
          #
          # Please refer to the [Automatic Environment Cleanup
          # guide](https://docs.garden.io/cedar-0.14/guides/automatic-environment-cleanup) for details.
          afterLastUpdate:
            unit:

            value:

          # Specify a cron-like schedule for the automatic environment cleanup. Use this to specify a fixed cadence
          # and time of day for the cleanup.
          #
          # Please refer to the [Automatic Environment Cleanup
          # guide](https://docs.garden.io/cedar-0.14/guides/automatic-environment-cleanup) for details.
          schedule:
            every:

            hourOfDay:

            minuteOfHour: 0

# A list of providers that should be used for this project, and their configuration. Please refer to individual
# plugins/providers for details on how to configure them.
providers:
  - # The name of the provider plugin to use.
    name:

    # List other providers that should be resolved before this one.
    dependencies: []

    # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    environments:

    preInit:
      # A script to run before the provider is initialized. This is useful for performing any provider-specific setup
      # outside of Garden. For example, you can use this to perform authentication, such as authenticating with a
      # Kubernetes cluster provider.
      # The script will always be run from the project root directory.
      # Note that provider statuses are cached, so this script will generally only be run once, but you can force a
      # re-run by setting `--force-refresh` on any Garden command that uses the provider.
      runScript:

# The default environment to use when calling commands without the `--env` parameter. May include a namespace name, in
# the format `<namespace>.<environment>`. Defaults to the first configured environment, with no namespace set.
defaultEnvironment: ''

# Specify a filename that should be used as ".ignore" file across the project, using the same syntax and semantics as
# `.gitignore` files. By default, patterns matched in `.gardenignore` files, found anywhere in the project, are
# ignored when scanning for actions and action sources.
# Note that this take precedence over the project `scan.include` field, and action `include` fields, so any paths
# matched by the .ignore file will be ignored even if they are explicitly specified in those fields.
# See the [Configuration Files
# guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
# for details.
dotIgnoreFile: .gardenignore

# A list of string values that should be excluded when computing action versions.
#
# Setting values here is equivalent to adding them to the `version.excludeValues` field on all actions in the project.
#
# These values can be templated, and generally should be templated. A typical example is to exclude the namespace of
# the environment, or a hostname suffix used across many Deploy actions. For example:
#
# excludeValuesFromActionVersions:
#   - "${var.hostname-suffix}"  # resolving to something like "my-branch.dev.my-org.com"
#
# **Important:**
# You should be careful to not make these values too broad, since the strings will be replaced for every field in all
# actions across the project when computing versions. For example, if a value here resolves to a short and generic
# string like "api", the string "api" will be replaced for every field in all actions across the project when
# computing versions. This could lead to unexpected issues like tests getting skipped when they shouldn't, deployments
# not updating etc.
#
# However, something more specific like a branch name, commit hash, PR number etc., ideally with some specific prefix
# or suffix, is generally safer to do. That said, this field only affects version computation, not the actual action
# configuration when it's executed.
excludeValuesFromActionVersions:

proxy:
  # The URL that Garden uses when creating port forwards. Defaults to "localhost".
  #
  # Note that the `GARDEN_PROXY_DEFAULT_ADDRESS` environment variable takes precedence over this value.
  hostname: localhost

# Control where and how to scan for configuration files in the project.
scan:
  # Specify a list of POSIX-style paths or globs that should be scanned for Garden configuration files.
  #
  # Note that you can also _exclude_ path using the `exclude` field or by placing `.gardenignore` files in your source
  # tree, which use the same format as `.gitignore` files. See the [Configuration Files
  # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
  # for details.
  #
  # Unlike the `exclude` field, the paths/globs specified here have _no effect_ on which files and directories Garden
  # watches for changes. Use the `exclude` field to affect those, if you have large directories that should not be
  # watched for changes.
  #
  # Also note that specifying an empty list here means _no paths_ should be included.
  include:

  # Specify a list of POSIX-style paths or glob patterns that should be excluded when scanning for configuration
  # files.
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
  # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
  # for details.
  exclude:

  git:
    # Choose how to perform scans of git repositories. Defaults to `repo`. The `subtree` runs individual git scans on
    # each action/module path. The `repo` mode scans entire repositories and then filters down to files matching the
    # paths, includes and excludes for each action/module. This can be considerably more efficient for large projects
    # with many actions/modules.
    mode: repo

# A list of output values that the project should export. These are exported by the `garden get outputs` command, as
# well as when referencing a project as a sub-project within another project.
#
# You may use any template strings to specify the values, including references to provider outputs, action
# outputs and runtime outputs. For a full reference, see the [Output configuration
# context](./template-strings/project-outputs.md) section in the Template String Reference.
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
# project-wide `variables` field.
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
# If you don't set the field and the `garden.env` file does not exist, we simply ignore it.
# If you do override the default value and the file doesn't exist, an error will be thrown.
#
# _Note that in many cases it is advisable to only use environment-specific var files, instead of combining
# multiple ones. See the `environments[].varfile` field for this option._
varfile: garden.env

# Key/value map of variables to configure for all environments. Keys may contain letters and numbers. Any values are
# permitted, including arrays and objects of any nesting.
variables: {}

# EXPERIMENTAL: This is an experimental feature that requires setting "GARDEN_EXPERIMENTAL_USE_CLOUD_VARIABLES=true"
# and enabling variables for your organization in Garden Cloud (currenty only available in early access).
# Specify a variable list (or array of variable lists) from which to load variables/secrets. The lists and their
# variables/secrets are created in [Garden Cloud](https://app.garden.io/variables).
# If an array of variable lists is provided, the variable are merged in the order of the lists (so the value from a
# variable in a list that appears later in the array overwrites the value of a variable from an earlier list if they
# have the same name).
variablesFrom: []
```

## Configuration Keys


### `apiVersion`

The Garden apiVersion for this project.

The value garden.io/v0 is the default for backwards compatibility with
Garden Acorn (0.12) when not explicitly specified.

Configuring garden.io/v1 explicitly in your project configuration allows
you to start using the new Action configs introduced in Garden Bonsai (0.13).

Note that the value garden.io/v1 will break compatibility of your project
with Garden Acorn (0.12).

EXPERIMENTAL: Configuring garden.io/v2 explicitly in your project configuration
activates the breaking changes introduced in Garden 0.14.
The list of breaking changes is not final yet, so use this setting at your own risk.

Please refer to [the deprecations guide](https://docs.garden.io/cedar-0.14/guides/deprecations) for more information.

| Type     | Allowed Values                                 | Required |
| -------- | ---------------------------------------------- | -------- |
| `string` | "garden.io/v0", "garden.io/v1", "garden.io/v2" | Yes      |

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

### `organizationId`

The ID of the organization that this project belongs to in Garden Cloud.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `environments[]`

A list of environments to configure for the project.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | Yes      |

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

### `environments[].defaultNamespace`

[environments](#environments) > defaultNamespace

Set the default namespace to use. This can be templated to be user-specific, or to use an environment variable (e.g. in CI).

You can also set this to `null`, in order to require an explicit namespace to be set on usage. This may be advisable for shared environments, but you may also be able to achieve the desired result by templating this field, as mentioned above.

| Type     | Default     | Required |
| -------- | ----------- | -------- |
| `string` | `"default"` | No       |

Example:

```yaml
environments:
  - defaultNamespace: "user-${local.username}"
```

### `environments[].production`

[environments](#environments) > production

Flag the environment as a production environment.

Setting this flag to `true` will activate the protection on the `build`, `delete`, `deploy`, `dev`, and
`test` commands. A protected command will ask for a user confirmation every time is run against
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

### `environments[].varfile`

[environments](#environments) > varfile

Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
_environment-specific_ `variables` field.

The format of the files is determined by the configured file's extension:

* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type. YAML format is used by default.
* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

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

A key/value map of variables that actions can reference when using this environment. These take precedence over variables defined in the top-level `variables` field, but may also reference the top-level variables in template strings.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `environments[].aec`

[environments](#environments) > aec

Configuration for the Automatic Environment Cleanup feature.

You must specify at least one _trigger_, which defines the schedule or time of inactivity that will cause the automatic environment cleanup to be performed, as well as the type of action to perform (pause or cleanup).

If you specify multiple triggers and multiple are matched, the _last_ trigger matched in the list will be used. For example, you can specify a trigger to pause the environment after 1 day of inactivity as the first trigger, and another trigger to fully clean up the environment after 1 week of inactivity or on a specific schedule as the second trigger.

Note that this feature is only available for paid Garden Cloud users. Also note that the feature is currently in beta, and is only available for specific providers, in particular the Kubernetes provider.

Please refer to the [Automatic Environment Cleanup guide](https://docs.garden.io/cedar-0.14/guides/automatic-environment-cleanup) for details.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `environments[].aec.disabled`

[environments](#environments) > [aec](#environmentsaec) > disabled

Set to true to disable automatic environment cleanup. It may be useful to template this value in, in some scenarios.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `environments[].aec.triggers[]`

[environments](#environments) > [aec](#environmentsaec) > triggers

The triggers that will cause the automatic environment cleanup to be performed.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | Yes      |

### `environments[].aec.triggers[].action`

[environments](#environments) > [aec](#environmentsaec) > [triggers](#environmentsaectriggers) > action

The action to perform when the trigger is matched.

| Type     | Allowed Values     | Required |
| -------- | ------------------ | -------- |
| `string` | "cleanup", "pause" | Yes      |

### `environments[].aec.triggers[].afterLastUpdate`

[environments](#environments) > [aec](#environmentsaec) > [triggers](#environmentsaectriggers) > afterLastUpdate

The time to live for the environment after the last update (i.e. the last time the environment was deployed or updated using `garden deploy`).

Please refer to the [Automatic Environment Cleanup guide](https://docs.garden.io/cedar-0.14/guides/automatic-environment-cleanup) for details.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `environments[].aec.triggers[].afterLastUpdate.unit`

[environments](#environments) > [aec](#environmentsaec) > [triggers](#environmentsaectriggers) > [afterLastUpdate](#environmentsaectriggersafterlastupdate) > unit

| Type     | Allowed Values             | Required |
| -------- | -------------------------- | -------- |
| `string` | "hours", "days", "minutes" | Yes      |

### `environments[].aec.triggers[].afterLastUpdate.value`

[environments](#environments) > [aec](#environmentsaec) > [triggers](#environmentsaectriggers) > [afterLastUpdate](#environmentsaectriggersafterlastupdate) > value

| Type     | Required |
| -------- | -------- |
| `number` | Yes      |

### `environments[].aec.triggers[].schedule`

[environments](#environments) > [aec](#environmentsaec) > [triggers](#environmentsaectriggers) > schedule

Specify a cron-like schedule for the automatic environment cleanup. Use this to specify a fixed cadence and time of day for the cleanup.

Please refer to the [Automatic Environment Cleanup guide](https://docs.garden.io/cedar-0.14/guides/automatic-environment-cleanup) for details.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `environments[].aec.triggers[].schedule.every`

[environments](#environments) > [aec](#environmentsaec) > [triggers](#environmentsaectriggers) > [schedule](#environmentsaectriggersschedule) > every

| Type     | Allowed Values                                                                                 | Required |
| -------- | ---------------------------------------------------------------------------------------------- | -------- |
| `string` | "weekday", "day", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday" | Yes      |

### `environments[].aec.triggers[].schedule.hourOfDay`

[environments](#environments) > [aec](#environmentsaec) > [triggers](#environmentsaectriggers) > [schedule](#environmentsaectriggersschedule) > hourOfDay

| Type     | Required |
| -------- | -------- |
| `number` | Yes      |

### `environments[].aec.triggers[].schedule.minuteOfHour`

[environments](#environments) > [aec](#environmentsaec) > [triggers](#environmentsaectriggers) > [schedule](#environmentsaectriggersschedule) > minuteOfHour

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `0`     | No       |

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

### `providers[].dependencies[]`

[providers](#providers) > dependencies

List other providers that should be resolved before this one.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

Example:

```yaml
providers:
  - dependencies:
      - exec
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

### `providers[].preInit`

[providers](#providers) > preInit

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `providers[].preInit.runScript`

[providers](#providers) > [preInit](#providerspreinit) > runScript

A script to run before the provider is initialized. This is useful for performing any provider-specific setup outside of Garden. For example, you can use this to perform authentication, such as authenticating with a Kubernetes cluster provider.
The script will always be run from the project root directory.
Note that provider statuses are cached, so this script will generally only be run once, but you can force a re-run by setting `--force-refresh` on any Garden command that uses the provider.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `defaultEnvironment`

The default environment to use when calling commands without the `--env` parameter. May include a namespace name, in the format `<namespace>.<environment>`. Defaults to the first configured environment, with no namespace set.

| Type          | Default | Required |
| ------------- | ------- | -------- |
| `environment` | `""`    | No       |

Example:

```yaml
defaultEnvironment: "dev"
```

### `dotIgnoreFile`

Specify a filename that should be used as ".ignore" file across the project, using the same syntax and semantics as `.gitignore` files. By default, patterns matched in `.gardenignore` files, found anywhere in the project, are ignored when scanning for actions and action sources.
Note that this take precedence over the project `scan.include` field, and action `include` fields, so any paths matched by the .ignore file will be ignored even if they are explicitly specified in those fields.
See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

| Type        | Default           | Required |
| ----------- | ----------------- | -------- |
| `posixPath` | `".gardenignore"` | No       |

Example:

```yaml
dotIgnoreFile: ".gitignore"
```

### `excludeValuesFromActionVersions[]`

A list of string values that should be excluded when computing action versions.

Setting values here is equivalent to adding them to the `version.excludeValues` field on all actions in the project.

These values can be templated, and generally should be templated. A typical example is to exclude the namespace of the environment, or a hostname suffix used across many Deploy actions. For example:

```yaml
excludeValuesFromActionVersions:
  - "${var.hostname-suffix}"  # resolving to something like "my-branch.dev.my-org.com"
```

**Important:**
You should be careful to not make these values too broad, since the strings will be replaced for every field in all actions across the project when computing versions. For example, if a value here resolves to a short and generic string like "api", the string "api" will be replaced for every field in all actions across the project when computing versions. This could lead to unexpected issues like tests getting skipped when they shouldn't, deployments not updating etc.

However, something more specific like a branch name, commit hash, PR number etc., ideally with some specific prefix or suffix, is generally safer to do. That said, this field only affects version computation, not the actual action configuration when it's executed.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `proxy`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `proxy.hostname`

[proxy](#proxy) > hostname

The URL that Garden uses when creating port forwards. Defaults to "localhost".

Note that the `GARDEN_PROXY_DEFAULT_ADDRESS` environment variable takes precedence over this value.

| Type     | Default       | Required |
| -------- | ------------- | -------- |
| `string` | `"localhost"` | No       |

Example:

```yaml
proxy:
  ...
  hostname: - 127.0.0.1
```

### `scan`

Control where and how to scan for configuration files in the project.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `scan.include[]`

[scan](#scan) > include

Specify a list of POSIX-style paths or globs that should be scanned for Garden configuration files.

Note that you can also _exclude_ path using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Unlike the `exclude` field, the paths/globs specified here have _no effect_ on which files and directories Garden watches for changes. Use the `exclude` field to affect those, if you have large directories that should not be watched for changes.

Also note that specifying an empty list here means _no paths_ should be included.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
scan:
  ...
  include:
    - actions/**/*
```

### `scan.exclude[]`

[scan](#scan) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded when scanning for configuration files.

The filters here also affect which files and directories are watched for changes. So if you have a large number of directories in your project that should not be watched, you should specify them here.

For example, you might want to exclude large vendor directories in your project from being scanned and watched, by setting `exclude: [node_modules/**/*, vendor/**/*]`.

Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include` field, the paths/patterns specified here are filtered from the files matched by `include`.

The `include` field does _not_ affect which files are watched.

See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
scan:
  ...
  exclude:
    - public/**/*
    - tmp/**/*
```

### `scan.git`

[scan](#scan) > git

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `scan.git.mode`

[scan](#scan) > [git](#scangit) > mode

Choose how to perform scans of git repositories. Defaults to `repo`. The `subtree` runs individual git scans on each action/module path. The `repo` mode scans entire repositories and then filters down to files matching the paths, includes and excludes for each action/module. This can be considerably more efficient for large projects with many actions/modules.

| Type     | Allowed Values    | Default  | Required |
| -------- | ----------------- | -------- | -------- |
| `string` | "repo", "subtree" | `"repo"` | Yes      |

### `outputs[]`

A list of output values that the project should export. These are exported by the `garden get outputs` command, as well as when referencing a project as a sub-project within another project.

You may use any template strings to specify the values, including references to provider outputs, action
outputs and runtime outputs. For a full reference, see the [Output configuration context](./template-strings/project-outputs.md) section in the Template String Reference.

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

| Type                          | Required |
| ----------------------------- | -------- |
| `string \| number \| boolean` | Yes      |

Example:

```yaml
outputs:
  - value: "${actions.build.my-build.outputs.deployment-image-name}"
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

| Type               | Required |
| ------------------ | -------- |
| `gitUrl \| string` | Yes      |

Example:

```yaml
sources:
  - repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

### `varfile`

Specify a path (relative to the project root) to a file containing variables, that we apply on top of the
project-wide `variables` field.

The format of the files is determined by the configured file's extension:

* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type. YAML format is used by default.
* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

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

### `variablesFrom`

EXPERIMENTAL: This is an experimental feature that requires setting "GARDEN_EXPERIMENTAL_USE_CLOUD_VARIABLES=true" and enabling variables for your organization in Garden Cloud (currenty only available in early access).
Specify a variable list (or array of variable lists) from which to load variables/secrets. The lists and their variables/secrets are created in [Garden Cloud](https://app.garden.io/variables).
If an array of variable lists is provided, the variable are merged in the order of the lists (so the value from a variable in a list that appears later in the array overwrites the value of a variable from an earlier list if they have the same name).

| Type                      | Default | Required |
| ------------------------- | ------- | -------- |
| `string \| array[string]` | `[]`    | No       |

Example:

```yaml
variablesFrom: "varlist_abc"
```

