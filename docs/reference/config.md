# garden.yml reference

Below is the schema reference for the [Project](#project-configuration) and [Module](#module-configuration) `garden.yml` configuration files. For an introduction to configuring a Garden project,
please look at our [configuration guide](../using-garden/configuration-files.md).

The reference is divided into four sections. The [first section](#project-configuration-keys) lists and describes the available schema keys for the project level configuration, and the [second section](#project-yaml-schema) contains the project level YAML schema.

The [third section](#module-configuration-keys) lists and describes the available schema keys for the module level configuration, and the [fourth section](#module-yaml-schema) contains the module level YAML schema.

Note that individual providers, e.g. `kubernetes`, add their own project level configuration keys. The provider types are listed on the [Providers page](./providers/README.md).

Likewise, individual module types, e.g. `container`, add additional configuration keys at the module level. Module types are listed on the [Module Types page](./module-types/README.md).

Please refer to those for more details on provider and module configuration.

## Project configuration keys


### `apiVersion`

The schema version of this project's config (currently not used).

| Type     | Required | Allowed Values | Default          |
| -------- | -------- | -------------- | ---------------- |
| `string` | Yes      | "garden.io/v0" | `"garden.io/v0"` |

### `kind`

| Type     | Required | Allowed Values | Default     |
| -------- | -------- | -------------- | ----------- |
| `string` | Yes      | "Project"      | `"Project"` |

### `name`

The name of the project.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
name: "my-sweet-project"
```

### `defaultEnvironment`

The default environment to use when calling commands without the `--env` parameter.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `""`    |

### `dotIgnoreFiles`

Specify a list of filenames that should be used as ".ignore" files across the project, using the same syntax and semantics as `.gitignore` files. By default, patterns matched in `.gitignore` and `.gardenignore` files, found anywhere in the project, are ignored when scanning for modules and module sources.
Note that these take precedence over the project `module.include` field, and module `include` fields, so any paths matched by the .ignore files will be ignored even if they are explicitly specified in those fields.
See the [Configuration Files guide] (https://docs.garden.io/using-garden/configuration-files#including-excluding-files-and-directories) for details.

| Type            | Required | Default                          |
| --------------- | -------- | -------------------------------- |
| `array[string]` | No       | `[".gitignore",".gardenignore"]` |

### `environmentDefaults`

DEPRECATED - Please use the `providers` field instead, and omit the environments key in the configured provider to use it for all environments, and use the `variables` field to configure variables across all environments.

| Type     | Required | Default                           |
| -------- | -------- | --------------------------------- |
| `object` | No       | `{"providers":[],"variables":{}}` |

Example:

```yaml
environmentDefaults:
    providers: []
    variables: {}
```

### `environmentDefaults.providers[]`

[environmentDefaults](#environmentdefaults) > providers

DEPRECATED - Please use the top-level `providers` field instead, and if needed use the `environments` key on the provider configurations to limit them to specific environments.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

### `environmentDefaults.providers[].name`

[environmentDefaults](#environmentdefaults) > [providers](#environmentdefaults.providers[]) > name

The name of the provider plugin to use.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
environmentDefaults:
    providers: []
    variables: {}
  ...
  providers:
    - name: "local-kubernetes"
```

### `environmentDefaults.providers[].environments[]`

[environmentDefaults](#environmentdefaults) > [providers](#environmentdefaults.providers[]) > environments

If specified, this provider will only be used in the listed environments. Note that an empty array effectively disables the provider. To use a provider in all environments, omit this field.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
environmentDefaults:
    providers: []
    variables: {}
  ...
  providers:
    - environments:
      - dev
      - stage
```

### `environmentDefaults.variables`

[environmentDefaults](#environmentdefaults) > variables

A key/value map of variables that modules can reference when using this environment. These take precedence over variables defined in the top-level `variables` field.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `object` | No       | `{}`    |

### `environments`

A list of environments to configure for the project.

| Type                            | Required |
| ------------------------------- | -------- |
| `array[object] | array[string]` | No       |

Example:

```yaml
environments: [{"name":"local","providers":[{"name":"local-kubernetes","environments":[]}],"variables":{}}]
```

### `modules`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `modules.include[]`

[modules](#modules) > include

Specify a list of POSIX-style paths or globs that should be scanned for Garden modules.

Note that you can also _exclude_ path using the `exclude` field or by placing `.gardenignore` files in your
source tree, which use the same format as `.gitignore` files. See the
[Configuration Files guide](https://docs.garden.io/using-garden/configuration-files#including-excluding-files-and-directories) for details.

Also note that specifying an empty list here means _no paths_ should be included.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

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
Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include` field, the paths/patterns specified here are filtered from the files matched by `include`. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-files#including-excluding-files-and-directories) for details.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
modules:
  ...
  exclude:
    - public/**/*
    - tmp/**/*
```

### `providers`

A list of providers that should be used for this project, and their configuration. Please refer to individual plugins/providers for details on how to configure them.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

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

### `sources`

A list of remote sources to import into project.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

### `sources[].name`

[sources](#sources) > name

The name of the source to import

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `sources[].repositoryUrl`

[sources](#sources) > repositoryUrl

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
sources:
  - repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

### `variables`

Variables to configure for all environments.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `object` | No       | `{}`    |


## Project YAML schema
```yaml
apiVersion: garden.io/v0
kind: Project
name:
defaultEnvironment: ''
dotIgnoreFiles:
  - .gitignore
  - .gardenignore
environmentDefaults:
  providers:
    - name:
      environments:
  variables: {}
environments:
modules:
  include:
  exclude:
providers:
  - name:
    environments:
sources:
  - name:
    repositoryUrl:
variables: {}
```

## Module configuration keys


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
[Configuration Files guide](https://docs.garden.io/using-garden/configuration-files#including-excluding-files-and-directories) for details.

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
[Configuration Files guide](https://docs.garden.io/using-garden/configuration-files#including-excluding-files-and-directories)for details.

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

[build](#build) > [dependencies](#build.dependencies[]) > name

Module name to build ahead of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `build.dependencies[].copy[]`

[build](#build) > [dependencies](#build.dependencies[]) > copy

Specify one or more files or directories to copy from the built dependency to this module.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

### `build.dependencies[].copy[].source`

[build](#build) > [dependencies](#build.dependencies[]) > [copy](#build.dependencies[].copy[]) > source

POSIX-style path or filename of the directory or file(s) to copy to the target.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `build.dependencies[].copy[].target`

[build](#build) > [dependencies](#build.dependencies[]) > [copy](#build.dependencies[].copy[]) > target

POSIX-style path or filename to copy the directory or file(s).

| Type     | Required | Default                   |
| -------- | -------- | ------------------------- |
| `string` | No       | `"<same as source path>"` |


## Module YAML schema
```yaml
apiVersion: garden.io/v0
kind: Module
type:
name:
description:
include:
exclude:
repositoryUrl:
allowPublish: true
build:
  dependencies:
    - name:
      copy:
        - source:
          target: <same as source path>
```

