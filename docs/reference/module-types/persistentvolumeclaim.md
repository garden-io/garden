---
title: "`persistentvolumeclaim` Module Type"
tocTitle: "`persistentvolumeclaim`"
---

# `persistentvolumeclaim` Module Type

## Description

Creates a [PersistentVolumeClaim](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) in your namespace, that can be referenced and mounted by other resources and [container modules](https://docs.garden.io/reference/module-types/container).

See the [Mounting volumes](https://docs.garden.io/guides/container-modules#mounting-volumes) guide for more info and usage examples.

Below is the full schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../../using-garden/configuration-overview.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`persistentvolumeclaim` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Complete YAML Schema

The values in the schema below are the default values.

```yaml
# The schema version of this config (currently not used).
apiVersion: garden.io/v0

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
          # Defaults to to same as source path.
          target: ''

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
# guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
# details.
#
# Also note that specifying an empty list here means _no sources_ should be included.
include:

# Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match these
# paths or globs are excluded when computing the version of the module, when responding to filesystem watch events,
# and when staging builds.
#
# Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include`
# field, the files/patterns specified here are filtered from the files matched by `include`. See the [Configuration
# Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories)
# for details.
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

# A list of files to write to the module directory when resolving this module. This is useful to automatically
# generate (and template) any supporting files needed for the module.
generateFiles:
  - # POSIX-style filename to read the source file contents from, relative to the path of the module (or the
    # ModuleTemplate configuration file if one is being applied).
    # This file may contain template strings, much like any other field in the configuration.
    sourcePath:

    # POSIX-style filename to write the resolved file contents to, relative to the path of the module source directory
    # (for remote modules this means the root of the module repository, otherwise the directory of the module
    # configuration).
    #
    # Note that any existing file with the same name will be overwritten. If the path contains one or more
    # directories, they will be automatically created if missing.
    targetPath:

    # The desired file contents as a string.
    value:

# A map of variables scoped to this particular module. These are resolved before any other parts of the module
# configuration and take precedence over project-scoped variables. They may reference project-scoped variables, and
# generally use any template strings normally allowed when resolving modules.
variables:

# List of services and tasks to deploy/run before deploying this PVC.
dependencies: []

# The namespace to deploy the PVC in. Note that any module referencing the PVC must be in the same namespace, so in
# most cases you should leave this unset.
namespace:

# The spec for the PVC. This is passed directly to the created PersistentVolumeClaim resource. Note that the spec
# schema may include (or even require) additional fields, depending on the used `storageClass`. See the
# [PersistentVolumeClaim docs](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims)
# for details.
spec:
  # AccessModes contains the desired access modes the volume should have. More info:
  # https://kubernetes.io/docs/concepts/storage/persistent-volumes#access-modes-1
  accessModes:

  # TypedLocalObjectReference contains enough information to let you locate the typed referenced object inside the
  # same namespace.
  dataSource:
    # APIGroup is the group for the resource being referenced. If APIGroup is not specified, the specified Kind must
    # be in the core API group. For any other third-party types, APIGroup is required.
    apiGroup:

    # Kind is the type of resource being referenced
    kind:

    # Name is the name of resource being referenced
    name:

  # ResourceRequirements describes the compute resource requirements.
  resources:
    # Limits describes the maximum amount of compute resources allowed. More info:
    # https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
    limits:

    # Requests describes the minimum amount of compute resources required. If Requests is omitted for a container, it
    # defaults to Limits if that is explicitly specified, otherwise to an implementation-defined value. More info:
    # https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/
    requests:

  # A label selector is a label query over a set of resources. The result of matchLabels and matchExpressions are
  # ANDed. An empty label selector matches all objects. A null label selector matches no objects.
  selector:
    # matchExpressions is a list of label selector requirements. The requirements are ANDed.
    matchExpressions:

    # matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an
    # element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains only
    # "value". The requirements are ANDed.
    matchLabels:

  # Name of the StorageClass required by the claim. More info:
  # https://kubernetes.io/docs/concepts/storage/persistent-volumes#class-1
  storageClassName:

  # volumeMode defines what type of volume is required by the claim. Value of Filesystem is implied when not included
  # in claim spec. This is a beta feature.
  volumeMode:

  # VolumeName is the binding reference to the PersistentVolume backing this claim.
  volumeName:
```

## Configuration Keys

### `apiVersion`

The schema version of this config (currently not used).

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

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include` field, the files/patterns specified here are filtered from the files matched by `include`. See the [Configuration Files guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

### `generateFiles[]`

A list of files to write to the module directory when resolving this module. This is useful to automatically generate (and template) any supporting files needed for the module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `generateFiles[].sourcePath`

[generateFiles](#generatefiles) > sourcePath

POSIX-style filename to read the source file contents from, relative to the path of the module (or the ModuleTemplate configuration file if one is being applied).
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

### `dependencies[]`

List of services and tasks to deploy/run before deploying this PVC.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `namespace`

The namespace to deploy the PVC in. Note that any module referencing the PVC must be in the same namespace, so in most cases you should leave this unset.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec`

The spec for the PVC. This is passed directly to the created PersistentVolumeClaim resource. Note that the spec schema may include (or even require) additional fields, depending on the used `storageClass`. See the [PersistentVolumeClaim docs](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) for details.

| Type     | Required |
| -------- | -------- |
| `object` | Yes      |

### `spec.accessModes[]`

[spec](#spec) > accessModes

AccessModes contains the desired access modes the volume should have. More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#access-modes-1

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.dataSource`

[spec](#spec) > dataSource

TypedLocalObjectReference contains enough information to let you locate the typed referenced object inside the same namespace.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.dataSource.apiGroup`

[spec](#spec) > [dataSource](#specdatasource) > apiGroup

APIGroup is the group for the resource being referenced. If APIGroup is not specified, the specified Kind must be in the core API group. For any other third-party types, APIGroup is required.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.dataSource.kind`

[spec](#spec) > [dataSource](#specdatasource) > kind

Kind is the type of resource being referenced

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.dataSource.name`

[spec](#spec) > [dataSource](#specdatasource) > name

Name is the name of resource being referenced

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.resources`

[spec](#spec) > resources

ResourceRequirements describes the compute resource requirements.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.resources.limits`

[spec](#spec) > [resources](#specresources) > limits

Limits describes the maximum amount of compute resources allowed. More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.resources.requests`

[spec](#spec) > [resources](#specresources) > requests

Requests describes the minimum amount of compute resources required. If Requests is omitted for a container, it defaults to Limits if that is explicitly specified, otherwise to an implementation-defined value. More info: https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.selector`

[spec](#spec) > selector

A label selector is a label query over a set of resources. The result of matchLabels and matchExpressions are ANDed. An empty label selector matches all objects. A null label selector matches no objects.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.selector.matchExpressions[]`

[spec](#spec) > [selector](#specselector) > matchExpressions

matchExpressions is a list of label selector requirements. The requirements are ANDed.

| Type    | Required |
| ------- | -------- |
| `array` | No       |

### `spec.selector.matchLabels`

[spec](#spec) > [selector](#specselector) > matchLabels

matchLabels is a map of {key,value} pairs. A single {key,value} in the matchLabels map is equivalent to an element of matchExpressions, whose key field is "key", the operator is "In", and the values array contains only "value". The requirements are ANDed.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.storageClassName`

[spec](#spec) > storageClassName

Name of the StorageClass required by the claim. More info: https://kubernetes.io/docs/concepts/storage/persistent-volumes#class-1

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.volumeMode`

[spec](#spec) > volumeMode

volumeMode defines what type of volume is required by the claim. Value of Filesystem is implied when not included in claim spec. This is a beta feature.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.volumeName`

[spec](#spec) > volumeName

VolumeName is the binding reference to the PersistentVolume backing this claim.

| Type     | Required |
| -------- | -------- |
| `string` | No       |


## Outputs

### Module Outputs

The following keys are available via the `${modules.<module-name>}` template string key for `persistentvolumeclaim`
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

The local path of the module.

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

| Type                                             |
| ------------------------------------------------ |
| `string | number | boolean | link | array[link]` |

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

The following keys are available via the `${runtime.services.<service-name>}` template string key for `persistentvolumeclaim` module services.
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

The following keys are available via the `${runtime.tasks.<task-name>}` template string key for `persistentvolumeclaim` module tasks.
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

