# `terraform` reference

Resolves a Terraform stack and either applies it automatically (if `autoApply: true`) or errors when the stack
resources are not up-to-date.

Stack outputs are made available as service outputs, that can be referenced by other modules under
`\${runtime.services.<module-name>.outputs.<key>}`. You can template in those values as e.g. command arguments
or environment variables for other services.

Note that you can also declare a Terraform root in the `terraform` provider configuration by setting the
`initRoot` parameter.
This may be preferable if you need the outputs of the Terraform stack to be available to other provider
configurations, e.g. if you spin up an environment with the Terraform provider, and then use outputs from
that to configure another provider or other modules via `\${providers.terraform.outputs.<key>}` template
strings.

See the [Terraform guide](../../using-garden/terraform.md) for a high-level introduction to the `terraform`
provider.

Below is the schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../../using-garden/configuration-files.md).
The [first section](#configuration-keys) lists and describes the available
schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

`terraform` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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

### `autoApply`

If set to true, Garden will automatically run `terraform apply -auto-approve` when the stack is not up-to-date. Otherwise, a warning is logged if the stack is out-of-date, and an error thrown if it is missing entirely.
Defaults to the value set in the provider config.

| Type      | Required | Default |
| --------- | -------- | ------- |
| `boolean` | No       | `null`  |

### `dependencies`

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[string]` | No       | `[]`    |

### `root`

Specify the path to the working directory root—i.e. where your Terraform files are—relative to the module root.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `"."`   |

### `variables`

A map of variables to use when applying the stack. You can define these here or you can place a `terraform.tfvars` file in the working directory root.
If you specified `variables` in the `terraform` provider config, those will be included but the variables specified here take precedence.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `version`

The version of Terraform to use. Defaults to the version set in the provider config.

| Type     | Required | Default    |
| -------- | -------- | ---------- |
| `string` | No       | `"0.12.7"` |


## Complete YAML schema
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
autoApply: null
dependencies: []
root: .
variables:
version: 0.12.7
```

## Outputs

### Module outputs

The following keys are available via the `${modules.<module-name>}` template string key for `terraform`
modules.

### `modules.<module-name>.buildPath`

The build path of the module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
buildPath: "/home/me/code/my-project/.garden/build/my-module"
```

### `modules.<module-name>.path`

The local path of the module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
path: "/home/me/code/my-project/my-module"
```

### `modules.<module-name>.version`

The current version of the module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
version: "v-17ad4cb3fd"
```

### `modules.<module-name>.outputs`

The outputs defined by the module.

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

