# `helm` reference

Specify a Helm chart (either in your repository or remote from a registry) to deploy.
Refer to the [Helm guide](https://docs.garden.io/using-garden/using-helm-charts) for usage instructions.

Below is the schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../../using-garden/configuration-files.md).
The [first section](#configuration-keys) lists and describes the available
schema keys. The [second section](#complete-yaml-schema) contains the complete YAML schema.

`helm` modules also export values that are available in template strings under `${modules.<module-name>.outputs}`.
See the [Outputs](#outputs) section below for details.

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

### `base`

The name of another `helm` module to use as a base for this one. Use this to re-use a Helm chart across multiple services. For example, you might have an organization-wide base chart for certain types of services.
If set, this module will by default inherit the following properties from the base module: `serviceResource`, `values`
Each of those can be overridden in this module. They will be merged with a JSON Merge Patch (RFC 7396).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
base: "my-base-chart"
```

### `chart`

A valid Helm chart name or URI (same as you'd input to `helm install`). Required if the module doesn't contain the Helm chart itself.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
chart: "stable/nginx-ingress"
```

### `chartPath`

The path, relative to the module path, to the chart sources (i.e. where the Chart.yaml file is, if any). Not used when `base` is specified.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `string` | No       | `"."`   |

### `dependencies`

List of names of services that should be deployed before this chart.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[string]` | No       | `[]`    |

### `releaseName`

Optionally override the release name used when installing (defaults to the module name).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `repo`

The repository URL to fetch the chart from.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `serviceResource`

The Deployment, DaemonSet or StatefulSet that Garden should regard as the _Garden service_ in this module (not to be confused with Kubernetes Service resources). Because a Helm chart can contain any number of Kubernetes resources, this needs to be specified for certain Garden features and commands to work, such as hot-reloading.
We currently map a Helm chart to a single Garden service, because all the resources in a Helm chart are deployed at once.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `serviceResource.kind`

[serviceResource](#serviceresource) > kind

The type of Kubernetes resource to sync files to.

| Type     | Required | Allowed Values                           | Default        |
| -------- | -------- | ---------------------------------------- | -------------- |
| `string` | Yes      | "Deployment", "DaemonSet", "StatefulSet" | `"Deployment"` |

### `serviceResource.name`

[serviceResource](#serviceresource) > name

The name of the resource to sync to. If the chart contains a single resource of the specified Kind, this can be omitted.
This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'. This allows you to easily match the dynamic names given by Helm. In most cases you should copy this directly from the template in question in order to match it. Note that you may need to add single quotes around the string for the YAML to be parsed correctly.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `serviceResource.containerName`

[serviceResource](#serviceresource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `serviceResource.containerModule`

[serviceResource](#serviceresource) > containerModule

The Garden module that contains the sources for the container. This needs to be specified under `serviceResource` in order to enable hot-reloading for the chart, but is not necessary for tasks and tests.
Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the container module.
Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
serviceResource:
  ...
  containerModule: "my-container-module"
```

### `serviceResource.hotReloadArgs[]`

[serviceResource](#serviceresource) > hotReloadArgs

If specified, overrides the arguments for the main container when running in hot-reload mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
serviceResource:
  ...
  hotReloadArgs:
    - nodemon
    - my-server.js
```

### `skipDeploy`

Set this to true if the chart should only be built, but not deployed as a service. Use this, for example, if the chart should only be used as a base for other modules.

| Type      | Required | Default |
| --------- | -------- | ------- |
| `boolean` | No       | `false` |

### `tasks`

The task definitions for this module.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

### `tasks[].name`

[tasks](#tasks) > name

The name of the task.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `tasks[].description`

[tasks](#tasks) > description

A description of the task.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tasks[].dependencies[]`

[tasks](#tasks) > dependencies

The names of any tasks that must be executed, and the names of any services that must be running, before this task is executed.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[string]` | No       | `[]`    |

### `tasks[].timeout`

[tasks](#tasks) > timeout

Maximum duration (in seconds) of the task's execution.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `null`  |

### `tasks[].resource`

[tasks](#tasks) > resource

The Deployment, DaemonSet or StatefulSet that Garden should use to execute this task. If not specified, the `serviceResource` configured on the module will be used. If neither is specified, an error will be thrown.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `tasks[].resource.kind`

[tasks](#tasks) > [resource](#tasks[].resource) > kind

The type of Kubernetes resource to sync files to.

| Type     | Required | Allowed Values                           | Default        |
| -------- | -------- | ---------------------------------------- | -------------- |
| `string` | Yes      | "Deployment", "DaemonSet", "StatefulSet" | `"Deployment"` |

### `tasks[].resource.name`

[tasks](#tasks) > [resource](#tasks[].resource) > name

The name of the resource to sync to. If the chart contains a single resource of the specified Kind, this can be omitted.
This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'. This allows you to easily match the dynamic names given by Helm. In most cases you should copy this directly from the template in question in order to match it. Note that you may need to add single quotes around the string for the YAML to be parsed correctly.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tasks[].resource.containerName`

[tasks](#tasks) > [resource](#tasks[].resource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tasks[].resource.containerModule`

[tasks](#tasks) > [resource](#tasks[].resource) > containerModule

The Garden module that contains the sources for the container. This needs to be specified under `serviceResource` in order to enable hot-reloading for the chart, but is not necessary for tasks and tests.
Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the container module.
Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
tasks:
  - resource:
      ...
      containerModule: "my-container-module"
```

### `tasks[].resource.hotReloadArgs[]`

[tasks](#tasks) > [resource](#tasks[].resource) > hotReloadArgs

If specified, overrides the arguments for the main container when running in hot-reload mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tasks:
  - resource:
      ...
      hotReloadArgs:
        - nodemon
        - my-server.js
```

### `tasks[].command[]`

[tasks](#tasks) > command

The command/entrypoint used to run the task inside the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tasks:
  - command:
    - /bin/sh
    - '-c'
```

### `tasks[].args[]`

[tasks](#tasks) > args

The arguments to pass to the pod used for execution.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tasks:
  - args:
    - rake
    - 'db:migrate'
```

### `tasks[].env`

[tasks](#tasks) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `object` | No       | `{}`    |

Example:

```yaml
tasks:
  - env:
      MY_VAR: some-value
      MY_SECRET_VAR:
        secretRef:
          name: my-secret
          key: some-key
```

### `tests`

The test suite definitions for this module.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[object]` | No       | `[]`    |

### `tests[].name`

[tests](#tests) > name

The name of the test.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `tests[].dependencies[]`

[tests](#tests) > dependencies

The names of any services that must be running, and the names of any tasks that must be executed, before the test is run.

| Type            | Required | Default |
| --------------- | -------- | ------- |
| `array[string]` | No       | `[]`    |

### `tests[].timeout`

[tests](#tests) > timeout

Maximum duration (in seconds) of the test run.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `number` | No       | `null`  |

### `tests[].resource`

[tests](#tests) > resource

The Deployment, DaemonSet or StatefulSet that Garden should use to execute this test suite. If not specified, the `serviceResource` configured on the module will be used. If neither is specified, an error will be thrown.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `tests[].resource.kind`

[tests](#tests) > [resource](#tests[].resource) > kind

The type of Kubernetes resource to sync files to.

| Type     | Required | Allowed Values                           | Default        |
| -------- | -------- | ---------------------------------------- | -------------- |
| `string` | Yes      | "Deployment", "DaemonSet", "StatefulSet" | `"Deployment"` |

### `tests[].resource.name`

[tests](#tests) > [resource](#tests[].resource) > name

The name of the resource to sync to. If the chart contains a single resource of the specified Kind, this can be omitted.
This can include a Helm template string, e.g. '{{ template "my-chart.fullname" . }}'. This allows you to easily match the dynamic names given by Helm. In most cases you should copy this directly from the template in question in order to match it. Note that you may need to add single quotes around the string for the YAML to be parsed correctly.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tests[].resource.containerName`

[tests](#tests) > [resource](#tests[].resource) > containerName

The name of a container in the target. Specify this if the target contains more than one container and the main container is not the first container in the spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tests[].resource.containerModule`

[tests](#tests) > [resource](#tests[].resource) > containerModule

The Garden module that contains the sources for the container. This needs to be specified under `serviceResource` in order to enable hot-reloading for the chart, but is not necessary for tasks and tests.
Must be a `container` module, and for hot-reloading to work you must specify the `hotReload` field on the container module.
Note: If you specify a module here, you don't need to specify it additionally under `build.dependencies`

| Type     | Required |
| -------- | -------- |
| `string` | No       |

Example:

```yaml
tests:
  - resource:
      ...
      containerModule: "my-container-module"
```

### `tests[].resource.hotReloadArgs[]`

[tests](#tests) > [resource](#tests[].resource) > hotReloadArgs

If specified, overrides the arguments for the main container when running in hot-reload mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tests:
  - resource:
      ...
      hotReloadArgs:
        - nodemon
        - my-server.js
```

### `tests[].args[]`

[tests](#tests) > args

The arguments to pass to the pod used for testing.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `tests[].env`

[tests](#tests) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `object` | No       | `{}`    |

Example:

```yaml
tests:
  - env:
      MY_VAR: some-value
      MY_SECRET_VAR:
        secretRef:
          name: my-secret
          key: some-key
```

### `version`

The chart version to deploy.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `values`

Map of values to pass to Helm when rendering the templates. May include arrays and nested objects.

| Type     | Required | Default |
| -------- | -------- | ------- |
| `object` | No       | `{}`    |


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
base:
chart:
chartPath: .
dependencies: []
releaseName:
repo:
serviceResource:
  kind: Deployment
  name:
  containerName:
  containerModule:
  hotReloadArgs:
skipDeploy: false
tasks:
  - name:
    description:
    dependencies: []
    timeout: null
    resource:
      kind: Deployment
      name:
      containerName:
      containerModule:
      hotReloadArgs:
    command:
    args:
    env: {}
tests:
  - name:
    dependencies: []
    timeout: null
    resource:
      kind: Deployment
      name:
      containerName:
      containerModule:
      hotReloadArgs:
    args:
    env: {}
version:
values: {}
```

## Outputs

The following keys are available via the `${modules.<module-name>}` template string key for `helm`
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

### `modules.<module-name>.outputs.release-name`

[outputs](#outputs) > release-name

The Helm release name of the service.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |
