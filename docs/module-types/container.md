---
title: container
---

# `container` Module Type

Specify a container image to build or pull from a remote registry.
You may also optionally specify services to deploy, tasks or tests to run inside the container.

Note that the runtime services have somewhat limited features in this module type. For example, you cannot
specify replicas for redundancy, and various platform-specific options are not included. For those, look at
other module types like [helm](https://docs.garden.io/module-types/helm) or
[kubernetes](https://github.com/garden-io/garden/blob/master/docs/module-types/kubernetes.md).

## Reference

Below is the schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../guides/configuration-files.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`container` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

### Complete YAML Schema

The values in the schema below are the default values.

```yaml
# The schema version of this module's config (currently not used).
apiVersion: garden.io/v0

kind: Module

# The type of this module.
type:

# The name of this module.
name:

description:

# Set this to `true` to disable the module. You can use this with conditional template strings to
# disable modules based on, for example, the current environment or other variables (e.g.
# `disabled: \${environment.name == "prod"}`). This can be handy when you only need certain modules for
# specific environments, e.g. only for development.
#
# Disabling a module means that any services, tasks and tests contained in it will not be deployed or run.
# It also means that the module is not built _unless_ it is declared as a build dependency by another enabled
# module (in which case building this module is necessary for the dependant to be built).
#
# If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
# will automatically ignore those dependency declarations. Note however that template strings referencing the
# module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled,
# so you need to make sure to provide alternate values for those if you're using them, using conditional
# expressions.
disabled: false

# Specify a list of POSIX-style paths or globs that should be regarded as the source files for this
# module. Files that do *not* match these paths or globs are excluded when computing the version of the module,
# when responding to filesystem watch events, and when staging builds.
#
# Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
# source tree, which use the same format as `.gitignore` files. See the
# [Configuration Files
# guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.
#
# Also note that specifying an empty list here means _no sources_ should be included.
#
# If neither `include` nor `exclude` is set, and the module has a Dockerfile, Garden
# will parse the Dockerfile and automatically set `include` to match the files and
# folders added to the Docker image (via the `COPY` and `ADD` directives in the Dockerfile).
#
# If neither `include` nor `exclude` is set, and the module
# specifies a remote image, Garden automatically sets `include` to `[]`.
include:

# Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that
# match these paths or globs are excluded when computing the version of the module, when responding to filesystem
# watch events, and when staging builds.
#
# Note that you can also explicitly _include_ files using the `include` field. If you also specify the
# `include` field, the files/patterns specified here are filtered from the files matched by `include`. See the
# [Configuration Files
# guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)for details.
#
# Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on which files
# and directories are watched for changes. Use the project `modules.exclude` field to affect those, if you have
# large directories that should not be watched for changes.
exclude:

# A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
# branch or tag, with the format: <git remote url>#<branch|tag>
#
# Garden will import the repository source code into this module, but read the module's
# config from the local garden.yml file.
repositoryUrl:

# When false, disables pushing this module to remote registries.
allowPublish: true

# Specify how to build the module. Note that plugins may define additional keys on this object.
build:
  # A list of modules that must be built before this module is built.
  dependencies:
    # Module name to build ahead of this module.
    - name:
      # Specify one or more files or directories to copy from the built dependency to this module.
      copy:
        # POSIX-style path or filename of the directory or file(s) to copy to the target.
        - source:
          # POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
          # Defaults to to same as source path.
          target: ''

  # For multi-stage Dockerfiles, specify which image to build (see
  # https://docs.docker.com/engine/reference/commandline/build/#specifying-target-build-stage---target for details).
  targetImage:

  # Maximum time in seconds to wait for build to finish.
  timeout: 1200

# Specify build arguments to use when building the container image.
buildArgs: {}

# Specify extra flags to use when building the container image. Note that arguments may not be portable across
# implementations.
extraFlags:

# Specify the image name for the container. Should be a valid Docker image identifier. If specified and the module
# does not contain a Dockerfile, this image will be used to deploy services for this module. If specified and the
# module does contain a Dockerfile, this identifier is used when pushing the built image.
image:

# Specifies which files or directories to sync to which paths inside the running containers of hot reload-enabled
# services when those files or directories are modified. Applies to this module's services, and to services with this
# module as their `sourceModule`.
hotReload:
  # Specify one or more source files or directories to automatically sync into the running container.
  sync:
    # POSIX-style path of the directory to sync to the target, relative to the module's top-level directory. Must be
    # a relative path if provided. Defaults to the module's top-level directory if no value is provided.
    - source: .
      # POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is not
      # allowed.
      target:

  # An optional command to run inside the container after syncing.
  postSyncCommand:

# POSIX-style name of Dockerfile, relative to module root.
dockerfile:

# The list of services to deploy from this container module.
services:
  # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter,
  # and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer than 63
  # characters.
  - name:
    # The names of any services that this service depends on at runtime, and the names of any tasks that should be
    # executed before this service is deployed.
    dependencies: []
    # Set this to `true` to disable the service. You can use this with conditional template strings to
    # enable/disable services based on, for example, the current environment or other variables (e.g.
    # `enabled: \${environment.name != "prod"}`). This can be handy when you only need certain services for
    # specific environments, e.g. only for development.
    #
    # Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a
    # runtime dependency for another service, test or task.
    #
    # Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to
    # resolve when the service is disabled, so you need to make sure to provide alternate values for those if
    # you're using them, using conditional expressions.
    disabled: false
    # Annotations to attach to the service (Note: May not be applicable to all providers).
    annotations: {}
    # The command/entrypoint to run the container with when starting the service.
    command:
    # The arguments to run the container with when starting the service.
    args:
    # Whether to run the service as a daemon (to ensure exactly one instance runs per node). May not be supported by
    # all providers.
    daemon: false
    # List of ingress endpoints that the service exposes.
    ingresses:
      # Annotations to attach to the ingress (Note: May not be applicable to all providers)
      - annotations: {}
        # The hostname that should route to this service. Defaults to the default hostname
        # configured in the provider configuration.
        #
        # Note that if you're developing locally you may need to add this hostname to your hosts file.
        hostname:
        # The link URL for the ingress to show in the console and on the dashboard.
        # Also used when calling the service with the `call` command.
        #
        # Use this if the actual URL is different from what's specified in the ingress,
        # e.g. because there's a load balancer in front of the service that rewrites the paths.
        #
        # Otherwise Garden will construct the link URL from the ingress spec.
        linkUrl:
        # The path which should be routed to the service.
        path: /
        # The name of the container port where the specified paths should be routed.
        port:
    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives or references to secrets.
    env: {}
    # Specify how the service's health should be checked after deploying.
    healthCheck:
      # Set this to check the service's health by making an HTTP request.
      httpGet:
        # The path of the service's health check endpoint.
        path:

        # The name of the port where the service's health check endpoint should be available.
        port:

        scheme: HTTP

      # Set this to check the service's health by running a command in its container.
      command:

      # Set this to check the service's health by checking if this TCP port is accepting connections.
      tcpPort:
    # If this module uses the `hotReload` field, the container will be run with this command/entrypoint when the
    # service is deployed with hot reloading enabled.
    hotReloadCommand:
    # If this module uses the `hotReload` field, the container will be run with these arguments when the service is
    # deployed with hot reloading enabled.
    hotReloadArgs:
    # Specify resource limits for the service.
    limits:
      # The maximum amount of CPU the service can use, in millicpus (i.e. 1000 = 1 CPU)
      cpu: 1000

      # The maximum amount of RAM the service can use, in megabytes (i.e. 1024 = 1 GB)
      memory: 1024
    # List of ports that the service container exposes.
    ports:
      # The name of the port (used when referencing the port elsewhere in the service configuration).
      - name:
        # The protocol of the port.
        protocol: TCP
        # The port exposed on the container by the running process. This will also be the default value for
        # `servicePort`.
        # This is the port you would expose in your Dockerfile and that your process listens on. This is commonly a
        # non-priviledged port like 8080 for security reasons.
        # The service port maps to the container port:
        # `servicePort:80 -> containerPort:8080 -> process:8080`
        containerPort:
        # The port exposed on the service. Defaults to `containerPort` if not specified.
        # This is the port you use when calling a service from another service within the cluster. For example, if
        # your service name is my-service and the service port is 8090, you would call it with:
        # http://my-service:8090/some-endpoint.
        # It is common to use port 80, the default port number, so that you can call the service directly with
        # http://my-service/some-endpoint.
        # The service port maps to the container port:
        # `servicePort:80 -> containerPort:8080 -> process:8080`
        servicePort:
        hostPort:
        # Set this to expose the service on the specified port on the host node (may not be supported by all
        # providers). Set to `true` to have the cluster pick a port automatically, which is most often advisable if
        # the cluster is shared by multiple users.
        # This allows you to call the service from the outside by the node's IP address and the port number set in
        # this field.
        nodePort:
    # The number of instances of the service to deploy. Defaults to 3 for environments configured with `production:
    # true`, otherwise 1.
    # Note: This setting may be overridden or ignored in some cases. For example, when running with `daemon: true`,
    # with hot-reloading enabled, or if the provider doesn't support multiple replicas.
    replicas:
    # List of volumes that should be mounted when deploying the container.
    volumes:
      # The name of the allocated volume.
      - name:
        # The path where the volume should be mounted in the container.
        containerPath:
        # _NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms
        # and providers. Some providers may not support it at all._
        #
        # A local path or path on the node that's running the container, to mount in the container, relative to the
        # module source path (or absolute).
        hostPath:

# A list of tests to run in the module.
tests:
  # The name of the test.
  - name:
    # The names of any services that must be running, and the names of any tasks that must be executed, before the
    # test is run.
    dependencies: []
    # Set this to `true` to disable the test. You can use this with conditional template strings to
    # enable/disable tests based on, for example, the current environment or other variables (e.g.
    # `enabled: \${environment.name != "prod"}`). This is handy when you only want certain tests to run in
    # specific environments, e.g. only during CI.
    disabled: false
    # Maximum duration (in seconds) of the test run.
    timeout: null
    # The arguments used to run the test inside the container.
    args:
    # Specify artifacts to copy out of the container after the run.
    # Note: Depending on the provider, this may require the container image to include `sh` `tar`, in order to enable
    # the file transfer.
    artifacts:
      # A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.
      - source:
        # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory.
        target: .
    # The command/entrypoint used to run the test inside the container.
    command:
    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives or references to secrets.
    env: {}

# A list of tasks that can be run from this container module. These can be used as dependencies for services (executed
# before the service is deployed) or for other tasks.
tasks:
  # The name of the task.
  - name:
    # A description of the task.
    description:
    # The names of any tasks that must be executed, and the names of any services that must be running, before this
    # task is executed.
    dependencies: []
    # Set this to `true` to disable the task. You can use this with conditional template strings to
    # enable/disable tasks based on, for example, the current environment or other variables (e.g.
    # `enabled: \${environment.name != "prod"}`). This can be handy when you only want certain tasks to run in
    # specific environments, e.g. only for development.
    #
    # Disabling a task means that it will not be run, and will also be ignored if it is declared as a
    # runtime dependency for another service, test or task.
    #
    # Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to
    # resolve when the task is disabled, so you need to make sure to provide alternate values for those if
    # you're using them, using conditional expressions.
    disabled: false
    # Maximum duration (in seconds) of the task's execution.
    timeout: null
    # The arguments used to run the task inside the container.
    args:
    # Specify artifacts to copy out of the container after the run.
    # Note: Depending on the provider, this may require the container image to include `sh` `tar`, in order to enable
    # the file transfer.
    artifacts:
      # A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.
      - source:
        # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory.
        target: .
    # The command/entrypoint used to run the task inside the container.
    command:
    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives or references to secrets.
    env: {}
```

### Configuration Keys

#### `apiVersion`

The schema version of this module's config (currently not used).

| Type     | Allowed Values | Default          | Required |
| -------- | -------------- | ---------------- | -------- |
| `string` | "garden.io/v0" | `"garden.io/v0"` | Yes      |

#### `kind`

| Type     | Allowed Values | Default    | Required |
| -------- | -------------- | ---------- | -------- |
| `string` | "Module"       | `"Module"` | Yes      |

#### `type`

The type of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
type: "container"
```

#### `name`

The name of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
name: "my-sweet-module"
```

#### `description`

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `disabled`

Set this to `true` to disable the module. You can use this with conditional template strings to
disable modules based on, for example, the current environment or other variables (e.g.
`disabled: \${environment.name == "prod"}`). This can be handy when you only need certain modules for
specific environments, e.g. only for development.

Disabling a module means that any services, tasks and tests contained in it will not be deployed or run.
It also means that the module is not built _unless_ it is declared as a build dependency by another enabled
module (in which case building this module is necessary for the dependant to be built).

If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
will automatically ignore those dependency declarations. Note however that template strings referencing the
module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled,
so you need to make sure to provide alternate values for those if you're using them, using conditional
expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

#### `include`

Specify a list of POSIX-style paths or globs that should be regarded as the source files for this
module. Files that do *not* match these paths or globs are excluded when computing the version of the module,
when responding to filesystem watch events, and when staging builds.

Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
source tree, which use the same format as `.gitignore` files. See the
[Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories) for details.

Also note that specifying an empty list here means _no sources_ should be included.

If neither `include` nor `exclude` is set, and the module has a Dockerfile, Garden
will parse the Dockerfile and automatically set `include` to match the files and
folders added to the Docker image (via the `COPY` and `ADD` directives in the Dockerfile).

If neither `include` nor `exclude` is set, and the module
specifies a remote image, Garden automatically sets `include` to `[]`.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
include:
  - Dockerfile
  - my-app.js
```

#### `exclude`

Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that
match these paths or globs are excluded when computing the version of the module, when responding to filesystem
watch events, and when staging builds.

Note that you can also explicitly _include_ files using the `include` field. If you also specify the
`include` field, the files/patterns specified here are filtered from the files matched by `include`. See the
[Configuration Files guide](https://docs.garden.io/guides/configuration-files#including-excluding-files-and-directories)for details.

Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on which files
and directories are watched for changes. Use the project `modules.exclude` field to affect those, if you have
large directories that should not be watched for changes.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
exclude:
  - tmp/**/*
  - '*.log'
```

#### `repositoryUrl`

A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>

Garden will import the repository source code into this module, but read the module's
config from the local garden.yml file.

| Type              | Required |
| ----------------- | -------- |
| `gitUrl | string` | No       |

Example:

```yaml
repositoryUrl: "git+https://github.com/org/repo.git#v2.0"
```

#### `allowPublish`

When false, disables pushing this module to remote registries.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

#### `build`

Specify how to build the module. Note that plugins may define additional keys on this object.

| Type     | Default               | Required |
| -------- | --------------------- | -------- |
| `object` | `{"dependencies":[]}` | No       |

#### `build.dependencies[]`

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

#### `build.dependencies[].name`

[build](#build) > [dependencies](#builddependencies) > name

Module name to build ahead of this module.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `build.dependencies[].copy[]`

[build](#build) > [dependencies](#builddependencies) > copy

Specify one or more files or directories to copy from the built dependency to this module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `build.dependencies[].copy[].source`

[build](#build) > [dependencies](#builddependencies) > [copy](#builddependenciescopy) > source

POSIX-style path or filename of the directory or file(s) to copy to the target.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

#### `build.dependencies[].copy[].target`

[build](#build) > [dependencies](#builddependencies) > [copy](#builddependenciescopy) > target

POSIX-style path or filename to copy the directory or file(s), relative to the build directory.
Defaults to to same as source path.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `""`    | No       |

#### `build.targetImage`

[build](#build) > targetImage

For multi-stage Dockerfiles, specify which image to build (see https://docs.docker.com/engine/reference/commandline/build/#specifying-target-build-stage---target for details).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `build.timeout`

[build](#build) > timeout

Maximum time in seconds to wait for build to finish.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1200`  | No       |

#### `buildArgs`

Specify build arguments to use when building the container image.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

#### `extraFlags`

Specify extra flags to use when building the container image. Note that arguments may not be portable across implementations.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

#### `image`

Specify the image name for the container. Should be a valid Docker image identifier. If specified and the module does not contain a Dockerfile, this image will be used to deploy services for this module. If specified and the module does contain a Dockerfile, this identifier is used when pushing the built image.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `hotReload`

Specifies which files or directories to sync to which paths inside the running containers of hot reload-enabled services when those files or directories are modified. Applies to this module's services, and to services with this module as their `sourceModule`.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

#### `hotReload.sync[]`

[hotReload](#hotreload) > sync

Specify one or more source files or directories to automatically sync into the running container.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | Yes      |

#### `hotReload.sync[].source`

[hotReload](#hotreload) > [sync](#hotreloadsync) > source

POSIX-style path of the directory to sync to the target, relative to the module's top-level directory. Must be a relative path if provided. Defaults to the module's top-level directory if no value is provided.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
hotReload:
  ...
  sync:
    - source: "src"
```

#### `hotReload.sync[].target`

[hotReload](#hotreload) > [sync](#hotreloadsync) > target

POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is not allowed.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
hotReload:
  ...
  sync:
    - target: "/app/src"
```

#### `hotReload.postSyncCommand[]`

[hotReload](#hotreload) > postSyncCommand

An optional command to run inside the container after syncing.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
hotReload:
  ...
  postSyncCommand:
    - rebuild-static-assets.sh
```

#### `dockerfile`

POSIX-style name of Dockerfile, relative to module root.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

#### `services`

The list of services to deploy from this container module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `services[].name`

[services](#services) > name

Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `services[].dependencies[]`

[services](#services) > dependencies

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

#### `services[].disabled`

[services](#services) > disabled

Set this to `true` to disable the service. You can use this with conditional template strings to
enable/disable services based on, for example, the current environment or other variables (e.g.
`enabled: \${environment.name != "prod"}`). This can be handy when you only need certain services for
specific environments, e.g. only for development.

Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a
runtime dependency for another service, test or task.

Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to
resolve when the service is disabled, so you need to make sure to provide alternate values for those if
you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

#### `services[].annotations`

[services](#services) > annotations

Annotations to attach to the service (Note: May not be applicable to all providers).

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
services:
  - annotations:
      nginx.ingress.kubernetes.io/proxy-body-size: '0'
```

#### `services[].command[]`

[services](#services) > command

The command/entrypoint to run the container with when starting the service.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
services:
  - command:
    - /bin/sh
    - '-c'
```

#### `services[].args[]`

[services](#services) > args

The arguments to run the container with when starting the service.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
services:
  - args:
    - npm
    - start
```

#### `services[].daemon`

[services](#services) > daemon

Whether to run the service as a daemon (to ensure exactly one instance runs per node). May not be supported by all providers.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

#### `services[].ingresses[]`

[services](#services) > ingresses

List of ingress endpoints that the service exposes.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

Example:

```yaml
services:
  - ingresses:
    - path: /api
      port: http
```

#### `services[].ingresses[].annotations`

[services](#services) > [ingresses](#servicesingresses) > annotations

Annotations to attach to the ingress (Note: May not be applicable to all providers)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
services:
  - ingresses:
    - path: /api
      port: http
      - annotations:
          nginx.ingress.kubernetes.io/proxy-body-size: '0'
```

#### `services[].ingresses[].hostname`

[services](#services) > [ingresses](#servicesingresses) > hostname

The hostname that should route to this service. Defaults to the default hostname
configured in the provider configuration.

Note that if you're developing locally you may need to add this hostname to your hosts file.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `services[].ingresses[].linkUrl`

[services](#services) > [ingresses](#servicesingresses) > linkUrl

The link URL for the ingress to show in the console and on the dashboard.
Also used when calling the service with the `call` command.

Use this if the actual URL is different from what's specified in the ingress,
e.g. because there's a load balancer in front of the service that rewrites the paths.

Otherwise Garden will construct the link URL from the ingress spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `services[].ingresses[].path`

[services](#services) > [ingresses](#servicesingresses) > path

The path which should be routed to the service.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"/"`   | No       |

#### `services[].ingresses[].port`

[services](#services) > [ingresses](#servicesingresses) > port

The name of the container port where the specified paths should be routed.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `services[].env`

[services](#services) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
services:
  - env:
      - MY_VAR: some-value
        MY_SECRET_VAR:
          secretRef:
            name: my-secret
            key: some-key
      - {}
```

#### `services[].healthCheck`

[services](#services) > healthCheck

Specify how the service's health should be checked after deploying.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

#### `services[].healthCheck.httpGet`

[services](#services) > [healthCheck](#serviceshealthcheck) > httpGet

Set this to check the service's health by making an HTTP request.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

#### `services[].healthCheck.httpGet.path`

[services](#services) > [healthCheck](#serviceshealthcheck) > [httpGet](#serviceshealthcheckhttpget) > path

The path of the service's health check endpoint.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `services[].healthCheck.httpGet.port`

[services](#services) > [healthCheck](#serviceshealthcheck) > [httpGet](#serviceshealthcheckhttpget) > port

The name of the port where the service's health check endpoint should be available.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `services[].healthCheck.httpGet.scheme`

[services](#services) > [healthCheck](#serviceshealthcheck) > [httpGet](#serviceshealthcheckhttpget) > scheme

| Type     | Default  | Required |
| -------- | -------- | -------- |
| `string` | `"HTTP"` | No       |

#### `services[].healthCheck.command[]`

[services](#services) > [healthCheck](#serviceshealthcheck) > command

Set this to check the service's health by running a command in its container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

#### `services[].healthCheck.tcpPort`

[services](#services) > [healthCheck](#serviceshealthcheck) > tcpPort

Set this to check the service's health by checking if this TCP port is accepting connections.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `services[].hotReloadCommand[]`

[services](#services) > hotReloadCommand

If this module uses the `hotReload` field, the container will be run with this command/entrypoint when the service is deployed with hot reloading enabled.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
services:
  - hotReloadCommand:
    - /bin/sh
    - '-c'
```

#### `services[].hotReloadArgs[]`

[services](#services) > hotReloadArgs

If this module uses the `hotReload` field, the container will be run with these arguments when the service is deployed with hot reloading enabled.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
services:
  - hotReloadArgs:
    - npm
    - run
    - dev
```

#### `services[].limits`

[services](#services) > limits

Specify resource limits for the service.

| Type     | Default                      | Required |
| -------- | ---------------------------- | -------- |
| `object` | `{"cpu":1000,"memory":1024}` | No       |

#### `services[].limits.cpu`

[services](#services) > [limits](#serviceslimits) > cpu

The maximum amount of CPU the service can use, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1000`  | No       |

#### `services[].limits.memory`

[services](#services) > [limits](#serviceslimits) > memory

The maximum amount of RAM the service can use, in megabytes (i.e. 1024 = 1 GB)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1024`  | No       |

#### `services[].ports[]`

[services](#services) > ports

List of ports that the service container exposes.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `services[].ports[].name`

[services](#services) > [ports](#servicesports) > name

The name of the port (used when referencing the port elsewhere in the service configuration).

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `services[].ports[].protocol`

[services](#services) > [ports](#servicesports) > protocol

The protocol of the port.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"TCP"` | No       |

#### `services[].ports[].containerPort`

[services](#services) > [ports](#servicesports) > containerPort

The port exposed on the container by the running process. This will also be the default value for `servicePort`.
This is the port you would expose in your Dockerfile and that your process listens on. This is commonly a non-priviledged port like 8080 for security reasons.
The service port maps to the container port:
`servicePort:80 -> containerPort:8080 -> process:8080`

| Type     | Required |
| -------- | -------- |
| `number` | Yes      |

Example:

```yaml
services:
  - ports:
      - containerPort: 8080
```

#### `services[].ports[].servicePort`

[services](#services) > [ports](#servicesports) > servicePort

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
services:
  - ports:
      - servicePort: 80
```

#### `services[].ports[].hostPort`

[services](#services) > [ports](#servicesports) > hostPort

| Type     | Required |
| -------- | -------- |
| `number` | No       |

#### `services[].ports[].nodePort`

[services](#services) > [ports](#servicesports) > nodePort

Set this to expose the service on the specified port on the host node (may not be supported by all providers). Set to `true` to have the cluster pick a port automatically, which is most often advisable if the cluster is shared by multiple users.
This allows you to call the service from the outside by the node's IP address and the port number set in this field.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

#### `services[].replicas`

[services](#services) > replicas

The number of instances of the service to deploy. Defaults to 3 for environments configured with `production: true`, otherwise 1.
Note: This setting may be overridden or ignored in some cases. For example, when running with `daemon: true`, with hot-reloading enabled, or if the provider doesn't support multiple replicas.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

#### `services[].volumes[]`

[services](#services) > volumes

List of volumes that should be mounted when deploying the container.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `services[].volumes[].name`

[services](#services) > [volumes](#servicesvolumes) > name

The name of the allocated volume.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `services[].volumes[].containerPath`

[services](#services) > [volumes](#servicesvolumes) > containerPath

The path where the volume should be mounted in the container.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

#### `services[].volumes[].hostPath`

[services](#services) > [volumes](#servicesvolumes) > hostPath

_NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms
and providers. Some providers may not support it at all._

A local path or path on the node that's running the container, to mount in the container, relative to the
module source path (or absolute).

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
services:
  - volumes:
      - hostPath: "/some/dir"
```

#### `tests`

A list of tests to run in the module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `tests[].name`

[tests](#tests) > name

The name of the test.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `tests[].dependencies[]`

[tests](#tests) > dependencies

The names of any services that must be running, and the names of any tasks that must be executed, before the test is run.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

#### `tests[].disabled`

[tests](#tests) > disabled

Set this to `true` to disable the test. You can use this with conditional template strings to
enable/disable tests based on, for example, the current environment or other variables (e.g.
`enabled: \${environment.name != "prod"}`). This is handy when you only want certain tests to run in
specific environments, e.g. only during CI.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

#### `tests[].timeout`

[tests](#tests) > timeout

Maximum duration (in seconds) of the test run.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `null`  | No       |

#### `tests[].args[]`

[tests](#tests) > args

The arguments used to run the test inside the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tests:
  - args:
    - npm
    - test
```

#### `tests[].artifacts[]`

[tests](#tests) > artifacts

Specify artifacts to copy out of the container after the run.
Note: Depending on the provider, this may require the container image to include `sh` `tar`, in order to enable the file transfer.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

Example:

```yaml
tests:
  - artifacts:
    - source: /report/**/*
```

#### `tests[].artifacts[].source`

[tests](#tests) > [artifacts](#testsartifacts) > source

A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
tests:
  - artifacts:
    - source: /report/**/*
      - source: "/output/**/*"
```

#### `tests[].artifacts[].target`

[tests](#tests) > [artifacts](#testsartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
tests:
  - artifacts:
    - source: /report/**/*
      - target: "outputs/foo/"
```

#### `tests[].command[]`

[tests](#tests) > command

The command/entrypoint used to run the test inside the container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
tests:
  - command:
    - /bin/sh
    - '-c'
```

#### `tests[].env`

[tests](#tests) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
tests:
  - env:
      - MY_VAR: some-value
        MY_SECRET_VAR:
          secretRef:
            name: my-secret
            key: some-key
      - {}
```

#### `tasks`

A list of tasks that can be run from this container module. These can be used as dependencies for services (executed before the service is deployed) or for other tasks.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

#### `tasks[].name`

[tasks](#tasks) > name

The name of the task.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

#### `tasks[].description`

[tasks](#tasks) > description

A description of the task.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

#### `tasks[].dependencies[]`

[tasks](#tasks) > dependencies

The names of any tasks that must be executed, and the names of any services that must be running, before this task is executed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

#### `tasks[].disabled`

[tasks](#tasks) > disabled

Set this to `true` to disable the task. You can use this with conditional template strings to
enable/disable tasks based on, for example, the current environment or other variables (e.g.
`enabled: \${environment.name != "prod"}`). This can be handy when you only want certain tasks to run in
specific environments, e.g. only for development.

Disabling a task means that it will not be run, and will also be ignored if it is declared as a
runtime dependency for another service, test or task.

Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to
resolve when the task is disabled, so you need to make sure to provide alternate values for those if
you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

#### `tasks[].timeout`

[tasks](#tasks) > timeout

Maximum duration (in seconds) of the task's execution.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `null`  | No       |

#### `tasks[].args[]`

[tasks](#tasks) > args

The arguments used to run the task inside the container.

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

#### `tasks[].artifacts[]`

[tasks](#tasks) > artifacts

Specify artifacts to copy out of the container after the run.
Note: Depending on the provider, this may require the container image to include `sh` `tar`, in order to enable the file transfer.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

Example:

```yaml
tasks:
  - artifacts:
    - source: /report/**/*
```

#### `tasks[].artifacts[].source`

[tasks](#tasks) > [artifacts](#tasksartifacts) > source

A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
tasks:
  - artifacts:
    - source: /report/**/*
      - source: "/output/**/*"
```

#### `tasks[].artifacts[].target`

[tasks](#tasks) > [artifacts](#tasksartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
tasks:
  - artifacts:
    - source: /report/**/*
      - target: "outputs/foo/"
```

#### `tasks[].command[]`

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

#### `tasks[].env`

[tasks](#tasks) > env

Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with `GARDEN`) and values must be primitives or references to secrets.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
tasks:
  - env:
      - MY_VAR: some-value
        MY_SECRET_VAR:
          secretRef:
            name: my-secret
            key: some-key
      - {}
```


### Outputs

#### Module Outputs

The following keys are available via the `${modules.<module-name>}` template string key for `container`
modules.

#### `${modules.<module-name>.buildPath}`

The build path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.buildPath}
```

#### `${modules.<module-name>.path}`

The local path of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.path}
```

#### `${modules.<module-name>.version}`

The current version of the module.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.version}
```

#### `${modules.<module-name>.outputs.local-image-name}`

The name of the image (without tag/version) that the module uses for local builds and deployments.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.outputs.local-image-name}
```

#### `${modules.<module-name>.outputs.deployment-image-name}`

The name of the image (without tag/version) that the module will use during deployment.

| Type     |
| -------- |
| `string` |

Example:

```yaml
my-variable: ${modules.my-module.outputs.deployment-image-name}
```


#### Task Outputs

The following keys are available via the `${runtime.tasks.<task-name>}` template string key for `container` module tasks.
Note that these are only resolved when deploying/running dependants of the task, so they are not usable for every field.

#### `${runtime.tasks.<task-name>.outputs.log}`

The full log from the executed task. (Pro-tip: Make it machine readable so it can be parsed by dependant tasks and services!)

| Type     | Default |
| -------- | ------- |
| `string` | `""`    |

