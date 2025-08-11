---
title: "`container` Deploy"
tocTitle: "`container` Deploy"
---

# `container` Deploy

## Description

Deploy a container image, e.g. in a Kubernetes namespace (when used with the `kubernetes` provider).

This is a simplified abstraction, which can be convenient for simple deployments, but has limited features compared to more platform-specific types. For example, you cannot specify replicas for redundancy, and various platform-specific options are not included. For more flexibility, please look at other Deploy types like [helm](./helm.md) or [kubernetes](./kubernetes.md).

Below is the full schema reference for the action.

`container` actions also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

## Configuration Keys

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

You can override the directory that is used for the build context by setting `source.path`.

You can use `source.repository` to get the source from an external repository. For more information on remote actions, please refer to the [Remote Sources guide](https://docs.garden.io/cedar-0.14/advanced/using-remote-sources).

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `source.path`

[source](#source) > path

A relative POSIX-style path to the source directory for this action.

If specified together with `source.repository`, the path will be relative to the repository root.

Otherwise, the path will be relative to the directory containing the Garden configuration file.

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

| Type               | Required |
| ------------------ | -------- |
| `gitUrl \| string` | Yes      |

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

Set this to `true` to disable the action. You can use this with conditional template strings to disable actions based on, for example, the current environment or other variables (e.g. `disabled: ${environment.name == "prod"}`). This can be handy when you only need certain actions for specific environments, e.g. only for development.

For Build actions, this means the build is not performed _unless_ it is declared as a dependency by another enabled action (in which case the Build is assumed to be necessary for the dependant action to be run or built).

For other action kinds, the action is skipped in all scenarios, and dependency declarations to it are ignored. Note however that template strings referencing outputs (i.e. runtime outputs) will fail to resolve when the action is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `environments[]`

If set, the action is only enabled for the listed environment types. This is effectively a cleaner shorthand for the `disabled` field with an expression for environments. For example, `environments: ["prod"]` is equivalent to `disabled: ${environment.name != "prod"}`.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `include[]`

Specify a list of POSIX-style paths or globs that should be regarded as source files for this action, and thus will affect the computed _version_ of the action.

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. An exception would be e.g. an `exec` action without a `build` reference, where the relevant files cannot be inferred and you want to define which files should affect the version of the action, e.g. to make sure a Test action is run when certain files are modified.

_Build_ actions have a different behavior, since they generally are based on some files in the source tree, so please reference the docs for more information on those.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your source tree, which use the same format as `.gitignore` files. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

For actions other than _Build_ actions, this is usually not necessary to specify, or is implicitly inferred. For _Deploy_, _Run_ and _Test_ actions, the exclusions specified here only applied on top of explicitly set `include` paths, or such paths inferred by providers. See the [Configuration Files guide](https://docs.garden.io/cedar-0.14/using-garden/configuration-overview#including-excluding-files-and-directories) for details.

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

### `varfiles[]`

Specify a list of paths (relative to the directory where the action is defined) to a file containing variables, that we apply on top of the action-level `variables` field, and take precedence over group-level variables (if applicable) and project-level variables, in that order.

If you specify multiple paths, they are merged in the order specified, i.e. the last one takes precedence over the previous ones.

The format of the files is determined by the configured file's extension:

* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type. YAML format is used by default.
* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format was changed to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

To use different varfiles in different environments, you can template in the environment name to the varfile name, e.g. `varfile: "my-action.${environment.name}.env"` (this assumes that the corresponding varfiles exist).

If a listed varfile cannot be found, throwing an error.
To add optional varfiles, you can use a list item object with a `path` and an optional `optional` boolean field.
```yaml
varfiles:
  - path: my-action.env
    optional: true
```

| Type                  | Default | Required |
| --------------------- | ------- | -------- |
| `array[alternatives]` | `[]`    | No       |

Example:

```yaml
varfiles:
  "my-action.env"
```

### `varfiles[].path`

[varfiles](#varfiles) > path

Path to a file containing a path.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `varfiles[].optional`

[varfiles](#varfiles) > optional

Whether the varfile is optional.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `version`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `version.excludeValues[]`

[version](#version) > excludeValues

Specify one or more string values that should be ignored when computing the version hash for this action. You may use template expressions here. This is useful to avoid dynamic values affecting cache versions.

For example, you might have a variable that naturally changes for every individual test or dev environment, such as a dynamic hostname. You could solve for that with something like this:

```yaml
version:
  excludeValues:
    - ${var.hostname}
```

With the `hostname` variable being defined in the Project configuration.

For each value specified under this field, every occurrence of that string value (even as part of a longer string) will be replaced when calculating the action version. The action configuration is not affected.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `build`

Specify a _Build_ action, and resolve this action from the context of that Build.

For example, you might create an `exec` Build which prepares some manifests, and then reference that in a `kubernetes` _Deploy_ action, and the resulting manifests from the Build.

This would mean that instead of looking for manifest files relative to this action's location in your project structure, the output directory for the referenced `exec` Build would be the source.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `kind`

| Type     | Allowed Values | Required |
| -------- | -------------- | -------- |
| `string` | "Deploy"       | Yes      |

### `timeout`

Timeout for the deploy to complete, in seconds.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `300`   | No       |

### `spec`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.command[]`

[spec](#spec) > command

The command/entrypoint to run the container with.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
spec:
  ...
  command:
    - /bin/sh
    - '-c'
```

### `spec.args[]`

[spec](#spec) > args

The arguments (on top of the `command`, i.e. entrypoint) to run the container with.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
spec:
  ...
  args:
    - npm
    - start
```

### `spec.env`

[spec](#spec) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
spec:
  ...
  env:
      - MY_VAR: some-value
        MY_SECRET_VAR:
          secretRef:
            name: my-secret
            key: some-key
      - {}
```

### `spec.cpu`

[spec](#spec) > cpu

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"min":10,"max":1000}` | No       |

### `spec.cpu.min`

[spec](#spec) > [cpu](#speccpu) > min

The minimum amount of CPU the container needs to be available for it to be deployed, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `10`    | No       |

### `spec.cpu.max`

[spec](#spec) > [cpu](#speccpu) > max

The maximum amount of CPU the container can use, in millicpus (i.e. 1000 = 1 CPU). If set to null will result in no limit being set.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1000`  | No       |

### `spec.memory`

[spec](#spec) > memory

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"min":90,"max":1024}` | No       |

### `spec.memory.min`

[spec](#spec) > [memory](#specmemory) > min

The minimum amount of RAM the container needs to be available for it to be deployed, in megabytes (i.e. 1024 = 1 GB)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `90`    | No       |

### `spec.memory.max`

[spec](#spec) > [memory](#specmemory) > max

The maximum amount of RAM the container can use, in megabytes (i.e. 1024 = 1 GB) If set to null will result in no limit being set.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1024`  | No       |

### `spec.volumes[]`

[spec](#spec) > volumes

List of volumes that should be mounted when starting the container.

Note: If neither `hostPath` nor `action` is specified,
an empty ephemeral volume is created and mounted when deploying the container.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `spec.volumes[].name`

[spec](#spec) > [volumes](#specvolumes) > name

The name of the allocated volume.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.volumes[].containerPath`

[spec](#spec) > [volumes](#specvolumes) > containerPath

The path where the volume should be mounted in the container.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `spec.volumes[].hostPath`

[spec](#spec) > [volumes](#specvolumes) > hostPath

_NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms and providers. Some providers may not support it at all._

A local path or path on the node that's running the container, to mount in the container, relative to the config source directory (or absolute).

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
spec:
  ...
  volumes:
    - hostPath: "/some/dir"
```

### `spec.privileged`

[spec](#spec) > privileged

If true, run the main container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `spec.addCapabilities[]`

[spec](#spec) > addCapabilities

POSIX capabilities to add when running the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `spec.dropCapabilities[]`

[spec](#spec) > dropCapabilities

POSIX capabilities to remove when running the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `spec.tty`

[spec](#spec) > tty

Specify if containers in this action have TTY support enabled (which implies having stdin support enabled).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.deploymentStrategy`

[spec](#spec) > deploymentStrategy

Specifies the container's deployment strategy.

| Type     | Allowed Values              | Default           | Required |
| -------- | --------------------------- | ----------------- | -------- |
| `string` | "RollingUpdate", "Recreate" | `"RollingUpdate"` | Yes      |

### `spec.annotations`

[spec](#spec) > annotations

Annotations to attach to the service _(note: May not be applicable to all providers)_.

When using the Kubernetes provider, these annotations are applied to both Service and Pod resources. You can generally specify the annotations intended for both Pods or Services here, and the ones that don't apply on either side will be ignored (i.e. if you put a Service annotation here, it'll also appear on Pod specs but will be safely ignored there, and vice versa).

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
spec:
  ...
  annotations:
      nginx.ingress.kubernetes.io/proxy-body-size: '0'
```

### `spec.daemon`

[spec](#spec) > daemon

Whether to run the service as a daemon (to ensure exactly one instance runs per node). May not be supported by all providers.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `spec.sync`

[spec](#spec) > sync

Specifies which files or directories to sync to which paths inside the running containers of the service when it's in sync mode, and overrides for the container command and/or arguments.

Sync is enabled e.g. by setting the `--sync` flag on the `garden deploy` command.

See the [Code Synchronization guide](https://docs.garden.io/cedar-0.14/guides/code-synchronization) for more information.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.sync.args[]`

[spec](#spec) > [sync](#specsync) > args

Override the default container arguments when in sync mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `spec.sync.command[]`

[spec](#spec) > [sync](#specsync) > command

Override the default container command (i.e. entrypoint) when in sync mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `spec.sync.paths[]`

[spec](#spec) > [sync](#specsync) > paths

Specify one or more source files or directories to automatically sync with the running container.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `spec.sync.paths[].source`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > source

Path to a local directory to be synchronized with the target.
This should generally be a templated path to another action's source path (e.g. `${actions.build.my-container-image.sourcePath}`), or a relative path.
If a path is hard-coded, we recommend sticking with relative paths here, and using forward slashes (`/`) as a delimiter, as Windows-style paths with back slashes (`\`) and absolute paths will work on some platforms, but they are not portable and will not work for users on other platforms.
Defaults to the Deploy action's config's directory if no value is provided.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"."`   | No       |

Example:

```yaml
spec:
  ...
  sync:
    ...
    paths:
      - source: "src"
```

### `spec.sync.paths[].target`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > target

POSIX-style absolute path to sync to inside the container. The root path (i.e. "/") is not allowed.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
spec:
  ...
  sync:
    ...
    paths:
      - target: "/app/src"
```

### `spec.sync.paths[].exclude[]`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

`.git` directories and `.garden` directories are always ignored.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
spec:
  ...
  sync:
    ...
    paths:
      - exclude:
          - dist/**/*
          - '*.log'
```

### `spec.sync.paths[].mode`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > mode

The sync mode to use for the given paths. See the [Code Synchronization guide](https://docs.garden.io/cedar-0.14/guides/code-synchronization) for details.

| Type     | Allowed Values                                                                                                                            | Default          | Required |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- |
| `string` | "one-way", "one-way-safe", "one-way-replica", "one-way-reverse", "one-way-replica-reverse", "two-way", "two-way-safe", "two-way-resolved" | `"one-way-safe"` | Yes      |

### `spec.sync.paths[].defaultFileMode`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > defaultFileMode

The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0o644 (user can read/write, everyone else can read). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `0o644` | No       |

### `spec.sync.paths[].defaultDirectoryMode`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > defaultDirectoryMode

The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to 0o755 (user can read/write, everyone else can read). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `0o755` | No       |

### `spec.sync.paths[].defaultOwner`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > defaultOwner

Set the default owner of files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type               | Required |
| ------------------ | -------- |
| `number \| string` | No       |

### `spec.sync.paths[].defaultGroup`

[spec](#spec) > [sync](#specsync) > [paths](#specsyncpaths) > defaultGroup

Set the default group on files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type               | Required |
| ------------------ | -------- |
| `number \| string` | No       |

### `spec.image`

[spec](#spec) > image

Specify an image ID to deploy. Should be a valid Docker image identifier. Required.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.ingresses[]`

[spec](#spec) > ingresses

List of ingress endpoints that the service exposes.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

Example:

```yaml
spec:
  ...
  ingresses:
    - path: /api
      port: http
```

### `spec.ingresses[].annotations`

[spec](#spec) > [ingresses](#specingresses) > annotations

Annotations to attach to the ingress (Note: May not be applicable to all providers)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
spec:
  ...
  ingresses:
    - path: /api
      port: http
    - annotations:
          nginx.ingress.kubernetes.io/proxy-body-size: '0'
```

### `spec.ingresses[].hostname`

[spec](#spec) > [ingresses](#specingresses) > hostname

The hostname that should route to this service. Defaults to the default hostname configured in the provider configuration.

Note that if you're developing locally you may need to add this hostname to your hosts file.

| Type       | Required |
| ---------- | -------- |
| `hostname` | No       |

### `spec.ingresses[].linkUrl`

[spec](#spec) > [ingresses](#specingresses) > linkUrl

The link URL for the ingress to show in the console and in dashboards. Also used when calling the service with the `call` command.

Use this if the actual URL is different from what's specified in the ingress, e.g. because there's a load balancer in front of the service that rewrites the paths.

Otherwise Garden will construct the link URL from the ingress spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.ingresses[].path`

[spec](#spec) > [ingresses](#specingresses) > path

The path which should be routed to the service.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"/"`   | No       |

### `spec.ingresses[].port`

[spec](#spec) > [ingresses](#specingresses) > port

The name of the container port where the specified paths should be routed.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.healthCheck`

[spec](#spec) > healthCheck

Specify how the service's health should be checked after deploying.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.healthCheck.httpGet`

[spec](#spec) > [healthCheck](#spechealthcheck) > httpGet

Set this to check the service's health by making an HTTP request.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.healthCheck.httpGet.path`

[spec](#spec) > [healthCheck](#spechealthcheck) > [httpGet](#spechealthcheckhttpget) > path

The path of the service's health check endpoint.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.healthCheck.httpGet.port`

[spec](#spec) > [healthCheck](#spechealthcheck) > [httpGet](#spechealthcheckhttpget) > port

The name of the port where the service's health check endpoint should be available.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.healthCheck.httpGet.scheme`

[spec](#spec) > [healthCheck](#spechealthcheck) > [httpGet](#spechealthcheckhttpget) > scheme

| Type     | Default  | Required |
| -------- | -------- | -------- |
| `string` | `"HTTP"` | No       |

### `spec.healthCheck.command[]`

[spec](#spec) > [healthCheck](#spechealthcheck) > command

Set this to check the service's health by running a command in its container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `spec.healthCheck.tcpPort`

[spec](#spec) > [healthCheck](#spechealthcheck) > tcpPort

Set this to check the service's health by checking if this TCP port is accepting connections.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `spec.healthCheck.readinessTimeoutSeconds`

[spec](#spec) > [healthCheck](#spechealthcheck) > readinessTimeoutSeconds

The maximum number of seconds to wait until the readiness check counts as failed.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `3`     | No       |

### `spec.healthCheck.livenessTimeoutSeconds`

[spec](#spec) > [healthCheck](#spechealthcheck) > livenessTimeoutSeconds

The maximum number of seconds to wait until the liveness check counts as failed.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `3`     | No       |

### `spec.timeout`

[spec](#spec) > timeout

The maximum duration (in seconds) to wait for resources to deploy and become healthy.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `300`   | No       |

### `spec.limits`

[spec](#spec) > limits

{% hint style="warning" %}
**Deprecated**: Please use the `cpu` and `memory` configuration fields instead.
{% endhint %}

Specify resource limits for the service.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `spec.limits.cpu`

[spec](#spec) > [limits](#speclimits) > cpu

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

The maximum amount of CPU the service can use, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `spec.limits.memory`

[spec](#spec) > [limits](#speclimits) > memory

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

The maximum amount of RAM the service can use, in megabytes (i.e. 1024 = 1 GB)

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `spec.ports[]`

[spec](#spec) > ports

List of ports that the service container exposes.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `spec.ports[].name`

[spec](#spec) > [ports](#specports) > name

The name of the port (used when referencing the port elsewhere in the service configuration).

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `spec.ports[].protocol`

[spec](#spec) > [ports](#specports) > protocol

The protocol of the port.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"TCP"` | No       |

### `spec.ports[].containerPort`

[spec](#spec) > [ports](#specports) > containerPort

The port exposed on the container by the running process. This will also be the default value for `servicePort`.
This is the port you would expose in your Dockerfile and that your process listens on. This is commonly a non-privileged port like 8080 for security reasons.
The service port maps to the container port:
`servicePort:80 -> containerPort:8080 -> process:8080`

| Type     | Required |
| -------- | -------- |
| `number` | Yes      |

Example:

```yaml
spec:
  ...
  ports:
    - containerPort: 8080
```

### `spec.ports[].localPort`

[spec](#spec) > [ports](#specports) > localPort

Specify a preferred local port to attach to when creating a port-forward to the service port. If this port is
busy, a warning will be shown and an alternative port chosen.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
spec:
  ...
  ports:
    - localPort: 10080
```

### `spec.ports[].servicePort`

[spec](#spec) > [ports](#specports) > servicePort

The port exposed on the service. Defaults to `containerPort` if not specified.
This is the port you use when calling a service from another service within the cluster. For example, if your service name is my-service and the service port is 8090, you would call it with: http://my-service:8090/some-endpoint.
It is common to use port 80, the default port number, so that you can call the service directly with http://my-service/some-endpoint.
The service port maps to the container port:
`servicePort:80 -> containerPort:8080 -> process:8080`

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
spec:
  ...
  ports:
    - servicePort: 80
```

### `spec.ports[].hostPort`

[spec](#spec) > [ports](#specports) > hostPort

{% hint style="warning" %}
**Deprecated**: It's generally not recommended to use the `hostPort` field of the `V1ContainerPort` spec. You can learn more about Kubernetes best practices at: https://kubernetes.io/docs/concepts/configuration/overview/
{% endhint %}

Number of port to expose on the pod's IP address.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `spec.ports[].nodePort`

[spec](#spec) > [ports](#specports) > nodePort

Set this to expose the service on the specified port on the host node (may not be supported by all providers). Set to `true` to have the cluster pick a port automatically, which is most often advisable if the cluster is shared by multiple users.
This allows you to call the service from the outside by the node's IP address and the port number set in this field.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `spec.replicas`

[spec](#spec) > replicas

The number of instances of the service to deploy. Defaults to 3 for environments configured with `production: true`, otherwise 1.
Note: This setting may be overridden or ignored in some cases. For example, when running with `daemon: true` or if the provider doesn't support multiple replicas.

| Type     | Required |
| -------- | -------- |
| `number` | No       |


## Outputs

The following keys are available via the `${actions.deploy.<name>}` template string key for `container`
action.

### `${actions.deploy.<name>.name}`

The name of the action.

| Type     |
| -------- |
| `string` |

### `${actions.deploy.<name>.disabled}`

Whether the action is disabled.

| Type      |
| --------- |
| `boolean` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.disabled}
```

### `${actions.deploy.<name>.buildPath}`

The local path to the action build directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.buildPath}
```

### `${actions.deploy.<name>.sourcePath}`

The local path to the action source directory.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.sourcePath}
```

### `${actions.deploy.<name>.mode}`

The mode that the action should be executed in (e.g. 'sync' or 'local' for Deploy actions). Set to 'default' if no special mode is being used.

Build actions inherit the mode from Deploy actions that depend on them. E.g. If a Deploy action is in 'sync' mode and depends on a Build action, the Build action will inherit the 'sync' mode setting from the Deploy action. This enables installing different tools that may be necessary for different development modes.

| Type     | Default     |
| -------- | ----------- |
| `string` | `"default"` |

Example:

```yaml
my-variable: ${actions.deploy.my-deploy.mode}
```

### `${actions.deploy.<name>.var.*}`

The variables configured on the action.

| Type     | Default |
| -------- | ------- |
| `object` | `{}`    |

### `${actions.deploy.<name>.var.<name>}`

| Type                                                 |
| ---------------------------------------------------- |
| `string \| number \| boolean \| link \| array[link]` |

### `${actions.deploy.<name>.outputs.deployedImageId}`

The ID of the image that was deployed.

| Type     |
| -------- |
| `string` |

