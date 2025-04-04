---
order: 43
title: ConfigTemplate Reference
---

# ConfigTemplate Reference

Below is the schema reference for `ConfigTemplate` configuration files. To learn more about config templates, see the [Config Templates guide](../features/config-templates.md).

The reference is divided into two sections:
* [YAML Schema](#yaml-schema) contains the config YAML schema
* [Configuration keys](#configuration-keys) describes each individual schema key for the configuration files.

Also check out the [`RenderTemplate` reference](./render-template-config.md).

## YAML Schema

The values in the schema below are the default values.

```yaml
kind: ConfigTemplate

# The name of the template.
name:

# Path to a JSON schema file describing the expected inputs for the template. Must be an object schema. If none is
# provided all inputs will be accepted.
inputsSchemaPath:

# A list of modules this template will output. The schema for each is the same as when you create modules normally in
# configuration files, with the addition of a `path` field, which allows you to specify a sub-directory to set as the
# module root.
#
# In addition to any template strings you can normally use for modules (see [the
# reference](./template-strings/modules.md)), you can reference the inputs described by the inputs schema for the
# template, using ${inputs.*} template strings, as well as ${parent.name} and ${template.name}, to reference the name
# of the module using the template, and the name of the template itself, respectively. This also applies to file
# contents specified under the `files` key.
#
# **Important: Make sure you use templates for any identifiers that must be unique, such as module names, service
# names and task names. Otherwise you'll inevitably run into configuration errors. The module names can reference the
# ${inputs.*}, ${parent.name} and ${template.name} keys. Other identifiers can also reference those, plus any other
# keys available for module templates (see [the module context reference](./template-strings/modules.md)).**
modules:
  - kind: Module

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
    # based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name ==
    # "prod"}`). This can be handy when you only need certain modules for specific environments, e.g. only for
    # development.
    #
    # Disabling a module means that any services, tasks and tests contained in it will not be build, deployed or run.
    #
    # If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
    # will automatically ignore those dependency declarations. Note however that template strings referencing the
    # module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so you
    # need to make sure to provide alternate values for those if you're using them, using conditional expressions.
    disabled: false

    # Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files
    # that do *not* match these paths or globs are excluded when computing the version of the module, when responding
    # to filesystem watch events, and when staging builds.
    #
    # Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
    # source tree, which use the same format as `.gitignore` files. See the [Configuration Files
    # guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories)
    # for details.
    #
    # Also note that specifying an empty list here means _no sources_ should be included.
    include:

    # Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match
    # these paths or globs are excluded when computing the version of the module, when responding to filesystem watch
    # events, and when staging builds.
    #
    # Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include`
    # field, the files/patterns specified here are filtered from the files matched by `include`. See the
    # [Configuration Files
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

        # POSIX-style filename to write the resolved file contents to, relative to the path of the module source
        # directory (for remote modules this means the root of the module repository, otherwise the directory of the
        # module configuration).
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
    # configuration and take precedence over project-scoped variables. They may reference project-scoped variables,
    # and generally use any template strings normally allowed when resolving modules.
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
    # _NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of
    # nested objects and arrays._
    #
    # To use different module-level varfiles in different environments, you can template in the environment name
    # to the varfile name, e.g. `varfile: "my-module.${environment.name}.env` (this assumes that the corresponding
    # varfiles exist).
    varfile:

    # POSIX-style path of a sub-directory to set as the module root. If the directory does not exist, it is
    # automatically created.
    path:

# A list of Garden configs this template will output, e.g. a set of actions. The schema for each is the same as when
# you create resources normally in configuration files, with the addition of a `path` field, which allows you to
# specify a sub-directory to set as the root location of the resource.
#
# The following resource kinds are allowed: `Build`, `Deploy`, `Run`, `Test` and `Workflow`
#
# __Note that you may _not_ specify Module resources here. Those need to be specified in the `modules` field.__
#
# In addition to any template strings you can normally use for the given configurations (see [the
# reference](./template-strings/README.md)), you can reference the inputs described by the inputs schema for the
# template, using ${inputs.*} template strings, as well as ${parent.name} and ${template.name}, to reference the name
# of the `RenderTemplate` resource being rendered, and the name of the template itself, respectively.
#
# **Important: Make sure you use templates for any identifiers that must be unique, such as action names.**
# Otherwise you'll inevitably run into configuration errors when re-using the template. The names can reference the
# ${inputs.*}, ${parent.name} and ${template.name} keys, and must be resolvable when parsing the template (meaning no
# action or runtime references etc.). Other identifiers can also reference those, plus any other keys available for
# templates in the given configs (see [the reference](./template-strings/README.md)).
#
# Also note that template strings are not allowed in the following fields: `apiVersion` and `kind`
configs:
  - # The kind of resource to create.
    kind:

    # The name of the resource.
    name:

    unknown:
```

## Configuration Keys


### `kind`

| Type     | Allowed Values                     | Default            | Required |
| -------- | ---------------------------------- | ------------------ | -------- |
| `string` | "ConfigTemplate", "ModuleTemplate" | `"ConfigTemplate"` | Yes      |

### `name`

The name of the template.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `inputsSchemaPath`

Path to a JSON schema file describing the expected inputs for the template. Must be an object schema. If none is provided all inputs will be accepted.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `modules[]`

{% hint style="warning" %}
**Deprecated**: The `modules` configuration field `ConfigTemplate` action kinds is deprecated in Garden 0.14. Please use the `configs` field instead, and use actions instead of modules.
{% endhint %}

A list of modules this template will output. The schema for each is the same as when you create modules normally in configuration files, with the addition of a `path` field, which allows you to specify a sub-directory to set as the module root.

In addition to any template strings you can normally use for modules (see [the reference](./template-strings/modules.md)), you can reference the inputs described by the inputs schema for the template, using ${inputs.*} template strings, as well as ${parent.name} and ${template.name}, to reference the name of the module using the template, and the name of the template itself, respectively. This also applies to file contents specified under the `files` key.

**Important: Make sure you use templates for any identifiers that must be unique, such as module names, service names and task names. Otherwise you'll inevitably run into configuration errors. The module names can reference the ${inputs.*}, ${parent.name} and ${template.name} keys. Other identifiers can also reference those, plus any other keys available for module templates (see [the module context reference](./template-strings/modules.md)).**

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `modules[].kind`

[modules](#modules) > kind

| Type     | Allowed Values | Default    | Required |
| -------- | -------------- | ---------- | -------- |
| `string` | "Module"       | `"Module"` | Yes      |

### `modules[].type`

[modules](#modules) > type

The type of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
modules:
  - type: "container"
```

### `modules[].name`

[modules](#modules) > name

The name of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
modules:
  - name: "my-sweet-module"
```

### `modules[].build`

[modules](#modules) > build

Specify how to build the module. Note that plugins may define additional keys on this object.

| Type     | Default               | Required |
| -------- | --------------------- | -------- |
| `object` | `{"dependencies":[]}` | No       |

### `modules[].build.dependencies[]`

[modules](#modules) > [build](#modulesbuild) > dependencies

A list of modules that must be built before this module is built.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

Example:

```yaml
modules:
  - build:
      ...
      dependencies:
        - name: some-other-module-name
```

### `modules[].build.dependencies[].name`

[modules](#modules) > [build](#modulesbuild) > [dependencies](#modulesbuilddependencies) > name

Module name to build ahead of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `modules[].build.dependencies[].copy[]`

[modules](#modules) > [build](#modulesbuild) > [dependencies](#modulesbuilddependencies) > copy

Specify one or more files or directories to copy from the built dependency to this module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `modules[].build.dependencies[].copy[].source`

[modules](#modules) > [build](#modulesbuild) > [dependencies](#modulesbuilddependencies) > [copy](#modulesbuilddependenciescopy) > source

POSIX-style path or filename of the directory or file(s) to copy to the target.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `modules[].build.dependencies[].copy[].target`

[modules](#modules) > [build](#modulesbuild) > [dependencies](#modulesbuilddependencies) > [copy](#modulesbuilddependenciescopy) > target

POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
Defaults to the same as source path.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `modules[].build.timeout`

[modules](#modules) > [build](#modulesbuild) > timeout

Maximum time in seconds to wait for build to finish.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `600`   | No       |

### `modules[].local`

[modules](#modules) > local

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

### `modules[].description`

[modules](#modules) > description

A description of the module.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `modules[].disabled`

[modules](#modules) > disabled

Set this to `true` to disable the module. You can use this with conditional template strings to disable modules based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name == "prod"}`). This can be handy when you only need certain modules for specific environments, e.g. only for development.

Disabling a module means that any services, tasks and tests contained in it will not be build, deployed or run.

If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden will automatically ignore those dependency declarations. Note however that template strings referencing the module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `modules[].include[]`

[modules](#modules) > include

Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files that do *not* match these paths or globs are excluded when computing the version of the module, when responding to filesystem watch events, and when staging builds.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Also note that specifying an empty list here means _no sources_ should be included.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
modules:
  - include:
      - Dockerfile
      - my-app.js
```

### `modules[].exclude[]`

[modules](#modules) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match these paths or globs are excluded when computing the version of the module, when responding to filesystem watch events, and when staging builds.

Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include` field, the files/patterns specified here are filtered from the files matched by `include`. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

Unlike the `scan.exclude` field in the project config, the filters here have _no effect_ on which files and directories are watched for changes. Use the project `scan.exclude` field to affect those, if you have large directories that should not be watched for changes.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
modules:
  - exclude:
      - tmp/**/*
      - '*.log'
```

### `modules[].repositoryUrl`

[modules](#modules) > repositoryUrl

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

Garden will import the repository source code into this module, but read the module's config from the local garden.yml file.

| Type               | Required |
| ------------------ | -------- |
| `gitUrl \| string` | No       |

Example:

```yaml
modules:
  - repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

### `modules[].allowPublish`

[modules](#modules) > allowPublish

When false, disables pushing this module to remote registries via the publish command.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `modules[].generateFiles[]`

[modules](#modules) > generateFiles

A list of files to write to the module directory when resolving this module. This is useful to automatically generate (and template) any supporting files needed for the module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `modules[].generateFiles[].sourcePath`

[modules](#modules) > [generateFiles](#modulesgeneratefiles) > sourcePath

POSIX-style filename to read the source file contents from, relative to the path of the module (or the ConfigTemplate configuration file if one is being applied).
This file may contain template strings, much like any other field in the configuration.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `modules[].generateFiles[].targetPath`

[modules](#modules) > [generateFiles](#modulesgeneratefiles) > targetPath

POSIX-style filename to write the resolved file contents to, relative to the path of the module source directory (for remote modules this means the root of the module repository, otherwise the directory of the module configuration).

Note that any existing file with the same name will be overwritten. If the path contains one or more directories, they will be automatically created if missing.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `modules[].generateFiles[].resolveTemplates`

[modules](#modules) > [generateFiles](#modulesgeneratefiles) > resolveTemplates

By default, Garden will attempt to resolve any Garden template strings in source files. Set this to false to skip resolving template strings. Note that this does not apply when setting the `value` field, since that's resolved earlier when parsing the configuration.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

### `modules[].generateFiles[].value`

[modules](#modules) > [generateFiles](#modulesgeneratefiles) > value

The desired file contents as a string.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `modules[].variables`

[modules](#modules) > variables

A map of variables scoped to this particular module. These are resolved before any other parts of the module configuration and take precedence over project-scoped variables. They may reference project-scoped variables, and generally use any template strings normally allowed when resolving modules.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `modules[].varfile`

[modules](#modules) > varfile

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
modules:
  - varfile: "my-module.env"
```

### `modules[].path`

[modules](#modules) > path

POSIX-style path of a sub-directory to set as the module root. If the directory does not exist, it is automatically created.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `configs[]`

A list of Garden configs this template will output, e.g. a set of actions. The schema for each is the same as when you create resources normally in configuration files, with the addition of a `path` field, which allows you to specify a sub-directory to set as the root location of the resource.

The following resource kinds are allowed: `Build`, `Deploy`, `Run`, `Test` and `Workflow`

__Note that you may _not_ specify Module resources here. Those need to be specified in the `modules` field.__

In addition to any template strings you can normally use for the given configurations (see [the reference](./template-strings/README.md)), you can reference the inputs described by the inputs schema for the template, using ${inputs.*} template strings, as well as ${parent.name} and ${template.name}, to reference the name of the `RenderTemplate` resource being rendered, and the name of the template itself, respectively.

**Important: Make sure you use templates for any identifiers that must be unique, such as action names.**
Otherwise you'll inevitably run into configuration errors when re-using the template. The names can reference the ${inputs.*}, ${parent.name} and ${template.name} keys, and must be resolvable when parsing the template (meaning no action or runtime references etc.). Other identifiers can also reference those, plus any other keys available for templates in the given configs (see [the reference](./template-strings/README.md)).

Also note that template strings are not allowed in the following fields: `apiVersion` and `kind`

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `configs[].kind`

[configs](#configs) > kind

The kind of resource to create.

| Type     | Allowed Values                               | Required |
| -------- | -------------------------------------------- | -------- |
| `string` | "Build", "Deploy", "Run", "Test", "Workflow" | Yes      |

### `configs[].name`

[configs](#configs) > name

The name of the resource.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `configs[].unknown`

[configs](#configs) > unknown

| Type  | Allowed Values          | Required |
| ----- | ----------------------- | -------- |
| `any` | {"override":true}, true | Yes      |

