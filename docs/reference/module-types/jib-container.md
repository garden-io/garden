---
title: "`jib-container` Module Type"
tocTitle: "`jib-container`"
---

# `jib-container` Module Type

## Description

Extends the [container module type](./container.md) to build the image with [Jib](https://github.com/GoogleContainerTools/jib). Use this to efficiently build container images for Java services. Check out the [jib example](https://github.com/garden-io/garden/tree/0.12.41/examples/jib-container) to see it in action.

The image is always built locally, directly from the module source directory (see the note on that below), before shipping the container image to the right place. You can set `build.tarOnly: true` to only build the image as a tarball.

By default (and when not using remote building), the image is pushed to the local Docker daemon, to match the behavior of and stay compatible with normal `container` modules.

When using remote building with the `kubernetes` provider, the image is synced to the cluster (where individual layers are cached) and then pushed to the deployment registry from there. This is to make sure any registry auth works seamlessly and exactly like for normal Docker image builds.

Please consult the [Jib documentation](https://github.com/GoogleContainerTools/jib) for how to configure Jib in your Gradle or Maven project.

To provide additional arguments to Gradle/Maven when building, you can set the `extraFlags` field.

**Important note:** Unlike many other module types, `jib` modules are built from the module _source_ directory instead of the build staging directory, because of how Java projects are often laid out across a repository. This means `build.dependencies[].copy` directives are effectively ignored, and any include/exclude statements and .gardenignore files will not impact the build result. _Note that you should still configure includes, excludes and/or a .gardenignore to tell Garden which files to consider as part of the module version hash, to correctly detect whether a new build is required._

Below is the full schema reference. For an introduction to configuring Garden modules, please look at our [Configuration
guide](../../using-garden/configuration-overview.md).

The [first section](#complete-yaml-schema) contains the complete YAML schema, and the [second section](#configuration-keys) describes each schema key.

`jib-container` modules also export values that are available in template strings. See the [Outputs](#outputs) section below for details.

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

  # Maximum time in seconds to wait for build to finish.
  timeout: 1200

  # The type of project to build. Defaults to auto-detecting between gradle and maven (based on which
  # files/directories are found in the module root), but in some cases you may need to specify it.
  projectType: auto

  # The JDK version to use.
  jdkVersion: 11

  # Build the image and push to a local Docker daemon (i.e. use the `jib:dockerBuild` / `jibDockerBuild` target).
  dockerBuild: false

  # Don't load or push the resulting image to a Docker daemon or registry, only build it as a tar file.
  tarOnly: false

  # Specify the image format in the resulting tar file. Only used if `tarOnly: true`.
  tarFormat: docker

  # Specify extra flags to pass to maven/gradle when building the container image.
  extraFlags:

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
#
# If neither `include` nor `exclude` is set, and the module has a Dockerfile, Garden
# will parse the Dockerfile and automatically set `include` to match the files and
# folders added to the Docker image (via the `COPY` and `ADD` directives in the Dockerfile).
#
# If neither `include` nor `exclude` is set, and the module
# specifies a remote image, Garden automatically sets `include` to `[]`.
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

    # By default, Garden will attempt to resolve any Garden template strings in source files. Set this to false to
    # skip resolving template strings. Note that this does not apply when setting the `value` field, since that's
    # resolved earlier when parsing the configuration.
    resolveTemplates: true

    # The desired file contents as a string.
    value:

# A map of variables scoped to this particular module. These are resolved before any other parts of the module
# configuration and take precedence over project-scoped variables. They may reference project-scoped variables, and
# generally use any template strings normally allowed when resolving modules.
variables:

# Specify a path (relative to the module root) to a file containing variables, that we apply on top of the
# module-level `variables` field.
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
# To use different module-level varfiles in different environments, you can template in the environment name
# to the varfile name, e.g. `varfile: "my-module.\$\{environment.name\}.env` (this assumes that the corresponding
# varfiles exist).
varfile:

# Specify build arguments to use when building the container image.
#
# Note: Garden will always set a `GARDEN_MODULE_VERSION` argument with the module version at build time.
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
    - # POSIX-style path of the directory to sync to the target, relative to the module's top-level directory. Must be
      # a relative path. Defaults to the module's top-level directory if no value is provided.
      source: .

      # POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is not
      # allowed.
      target:

  # An optional command to run inside the container after syncing.
  postSyncCommand:

# POSIX-style name of Dockerfile, relative to module root.
dockerfile:

# A list of services to deploy from this container module.
services:
  - # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter,
    # and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer than 63
    # characters.
    name:

    # The names of any services that this service depends on at runtime, and the names of any tasks that should be
    # executed before this service is deployed.
    dependencies: []

    # Set this to `true` to disable the service. You can use this with conditional template strings to enable/disable
    # services based on, for example, the current environment or other variables (e.g. `enabled: \${environment.name
    # != "prod"}`). This can be handy when you only need certain services for specific environments, e.g. only for
    # development.
    #
    # Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a runtime
    # dependency for another service, test or task.
    #
    # Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to resolve
    # when the service is disabled, so you need to make sure to provide alternate values for those if you're using
    # them, using conditional expressions.
    disabled: false

    # Annotations to attach to the service _(note: May not be applicable to all providers)_.
    #
    # When using the Kubernetes provider, these annotations are applied to both Service and Pod resources. You can
    # generally specify the annotations intended for both Pods or Services here, and the ones that don't apply on
    # either side will be ignored (i.e. if you put a Service annotation here, it'll also appear on Pod specs but will
    # be safely ignored there, and vice versa).
    annotations: {}

    # The command/entrypoint to run the container with when starting the service.
    command:

    # The arguments to run the container with when starting the service.
    args:

    # Whether to run the service as a daemon (to ensure exactly one instance runs per node). May not be supported by
    # all providers.
    daemon: false

    # Specifies which files or directories to sync to which paths inside the running containers of the service when
    # it's in dev mode, and overrides for the container command and/or arguments.
    #
    # Dev mode is enabled when running the `garden dev` command, and by setting the `--dev` flag on the `garden
    # deploy` command.
    #
    # See the [Code Synchronization guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for more
    # information.
    devMode:
      # Override the default container arguments when in dev mode.
      args:

      # Override the default container command (i.e. entrypoint) when in dev mode.
      command:

      # Specify one or more source files or directories to automatically sync with the running container.
      sync:
        - # POSIX-style path of the directory to sync to the target, relative to the module's top-level directory.
          # Must be a relative path. Defaults to the module's top-level directory if no value is provided.
          source: .

          # POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is not
          # allowed.
          target:

          # Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.
          #
          # `.git` directories and `.garden` directories are always ignored.
          exclude:

          # The sync mode to use for the given paths. See the [Dev Mode
          # guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for details.
          mode: one-way-safe

          # The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0600
          # (user read/write). See the [Mutagen
          # docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.
          defaultFileMode:

          # The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to
          # 0700 (user read/write). See the [Mutagen
          # docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.
          defaultDirectoryMode:

          # Set the default owner of files and directories at the target. Specify either an integer ID or a string
          # name. See the [Mutagen
          # docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more
          # information.
          defaultOwner:

          # Set the default group on files and directories at the target. Specify either an integer ID or a string
          # name. See the [Mutagen
          # docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more
          # information.
          defaultGroup:

    # Specifies necessary configuration details of the local application which will replace a target remote service.
    #
    # The target service will be replaced by a proxy container with an SSH server running,
    # and the reverse port forwarding will be automatically configured to route the traffic to the local service and
    # back.
    #
    # Local mode is enabled by setting the `--local-mode` option on the `garden deploy` command.
    #
    # The health checks are disabled for services running in local mode.
    #
    # See the [Local Mode guide](https://docs.garden.io/guides/running-service-in-local-mode.md) for more information.
    localMode:
      # The command to run the local application. If not present, then the local application should be started
      # manually.
      command:

      # The working port of the local application.
      localPort:

    # List of ingress endpoints that the service exposes.
    ingresses:
      - # Annotations to attach to the ingress (Note: May not be applicable to all providers)
        annotations: {}

        # The hostname that should route to this service. Defaults to the default hostname configured in the provider
        # configuration.
        #
        # Note that if you're developing locally you may need to add this hostname to your hosts file.
        hostname:

        # The link URL for the ingress to show in the console and on the dashboard. Also used when calling the service
        # with the `call` command.
        #
        # Use this if the actual URL is different from what's specified in the ingress, e.g. because there's a load
        # balancer in front of the service that rewrites the paths.
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

      # The maximum number of seconds to wait until the readiness check counts as failed.
      readinessTimeoutSeconds: 3

      # The maximum number of seconds to wait until the liveness check counts as failed.
      livenessTimeoutSeconds: 3

    # If this module uses the `hotReload` field, the container will be run with this command/entrypoint when the
    # service is deployed with hot reloading enabled.
    hotReloadCommand:

    # If this module uses the `hotReload` field, the container will be run with these arguments when the service is
    # deployed with hot reloading enabled.
    hotReloadArgs:

    # The maximum duration (in seconds) to wait for resources to deploy and become healthy.
    timeout: 300

    cpu:
      # The minimum amount of CPU the service needs to be available for it to be deployed, in millicpus (i.e. 1000 = 1
      # CPU)
      min: 10

      # The maximum amount of CPU the service can use, in millicpus (i.e. 1000 = 1 CPU)
      max: 1000

    memory:
      # The minimum amount of RAM the service needs to be available for it to be deployed, in megabytes (i.e. 1024 = 1
      # GB)
      min: 90

      # The maximum amount of RAM the service can use, in megabytes (i.e. 1024 = 1 GB)
      max: 90

    # List of ports that the service container exposes.
    ports:
      - # The name of the port (used when referencing the port elsewhere in the service configuration).
        name:

        # The protocol of the port.
        protocol: TCP

        # The port exposed on the container by the running process. This will also be the default value for
        # `servicePort`.
        # This is the port you would expose in your Dockerfile and that your process listens on. This is commonly a
        # non-priviledged port like 8080 for security reasons.
        # The service port maps to the container port:
        # `servicePort:80 -> containerPort:8080 -> process:8080`
        containerPort:

        # Specify a preferred local port to attach to when creating a port-forward to the service port. If this port
        # is
        # busy, a warning will be shown and an alternative port chosen.
        localPort:

        # The port exposed on the service. Defaults to `containerPort` if not specified.
        # This is the port you use when calling a service from another service within the cluster. For example, if
        # your service name is my-service and the service port is 8090, you would call it with:
        # http://my-service:8090/some-endpoint.
        # It is common to use port 80, the default port number, so that you can call the service directly with
        # http://my-service/some-endpoint.
        # The service port maps to the container port:
        # `servicePort:80 -> containerPort:8080 -> process:8080`
        servicePort:

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

    # List of volumes that should be mounted when deploying the service.
    #
    # Note: If neither `hostPath` nor `module` is specified, an empty ephemeral volume is created and mounted when
    # deploying the container.
    volumes:
      - # The name of the allocated volume.
        name:

        # The path where the volume should be mounted in the container.
        containerPath:

        # _NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms
        # and providers. Some providers may not support it at all._
        #
        # A local path or path on the node that's running the container, to mount in the container, relative to the
        # module source path (or absolute).
        hostPath:

        # The name of a _volume module_ that should be mounted at `containerPath`. The supported module types will
        # depend on which provider you are using. The `kubernetes` provider supports the [persistentvolumeclaim
        # module](./persistentvolumeclaim.md), for example.
        #
        # When a `module` is specified, the referenced module/volume will be automatically configured as a runtime
        # dependency of this service, as well as a build dependency of this module.
        #
        # Note: Make sure to pay attention to the supported `accessModes` of the referenced volume. Unless it supports
        # the ReadWriteMany access mode, you'll need to make sure it is not configured to be mounted by multiple
        # services at the same time. Refer to the documentation of the module type in question to learn more.
        module:

    # If true, run the service's main container in privileged mode. Processes in privileged containers are essentially
    # equivalent to root on the host. Defaults to false.
    privileged:

    # Specify if containers in this module have TTY support enabled (which implies having stdin support enabled).
    tty: false

    # POSIX capabilities to add to the running service's main container.
    addCapabilities:

    # POSIX capabilities to remove from the running service's main container.
    dropCapabilities:

# A list of tests to run in the module.
tests:
  - # The name of the test.
    name:

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

    # Specify artifacts to copy out of the container after the run. The artifacts are stored locally under the
    # `.garden/artifacts` directory.
    #
    # Note: Depending on the provider, this may require the container image to include `sh` `tar`, in order to enable
    # the file transfer.
    artifacts:
      - # A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.
        source:

        # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at
        # `.garden/artifacts`.
        target: .

    # The command/entrypoint used to run the test inside the container.
    command:

    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives or references to secrets.
    env: {}

    cpu:
      # The minimum amount of CPU the test needs to be available for it to be deployed, in millicpus (i.e. 1000 = 1
      # CPU)
      min: 10

      # The maximum amount of CPU the test can use, in millicpus (i.e. 1000 = 1 CPU)
      max: 1000

    memory:
      # The minimum amount of RAM the test needs to be available for it to be deployed, in megabytes (i.e. 1024 = 1
      # GB)
      min: 90

      # The maximum amount of RAM the test can use, in megabytes (i.e. 1024 = 1 GB)
      max: 90

    # List of volumes that should be mounted when deploying the test.
    #
    # Note: If neither `hostPath` nor `module` is specified, an empty ephemeral volume is created and mounted when
    # deploying the container.
    volumes:
      - # The name of the allocated volume.
        name:

        # The path where the volume should be mounted in the container.
        containerPath:

        # _NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms
        # and providers. Some providers may not support it at all._
        #
        # A local path or path on the node that's running the container, to mount in the container, relative to the
        # module source path (or absolute).
        hostPath:

        # The name of a _volume module_ that should be mounted at `containerPath`. The supported module types will
        # depend on which provider you are using. The `kubernetes` provider supports the [persistentvolumeclaim
        # module](./persistentvolumeclaim.md), for example.
        #
        # When a `module` is specified, the referenced module/volume will be automatically configured as a runtime
        # dependency of this service, as well as a build dependency of this module.
        #
        # Note: Make sure to pay attention to the supported `accessModes` of the referenced volume. Unless it supports
        # the ReadWriteMany access mode, you'll need to make sure it is not configured to be mounted by multiple
        # services at the same time. Refer to the documentation of the module type in question to learn more.
        module:

    # If true, run the test's main container in privileged mode. Processes in privileged containers are essentially
    # equivalent to root on the host. Defaults to false.
    privileged:

    # POSIX capabilities to add to the running test's main container.
    addCapabilities:

    # POSIX capabilities to remove from the running test's main container.
    dropCapabilities:

# A list of tasks that can be run from this container module. These can be used as dependencies for services (executed
# before the service is deployed) or for other tasks.
tasks:
  - # The name of the task.
    name:

    # A description of the task.
    description:

    # The names of any tasks that must be executed, and the names of any services that must be running, before this
    # task is executed.
    dependencies: []

    # Set this to `true` to disable the task. You can use this with conditional template strings to enable/disable
    # tasks based on, for example, the current environment or other variables (e.g. `enabled: \${environment.name !=
    # "prod"}`). This can be handy when you only want certain tasks to run in specific environments, e.g. only for
    # development.
    #
    # Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime
    # dependency for another service, test or task.
    #
    # Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to resolve
    # when the task is disabled, so you need to make sure to provide alternate values for those if you're using them,
    # using conditional expressions.
    disabled: false

    # Maximum duration (in seconds) of the task's execution.
    timeout: null

    # The arguments used to run the task inside the container.
    args:

    # Specify artifacts to copy out of the container after the run. The artifacts are stored locally under the
    # `.garden/artifacts` directory.
    #
    # Note: Depending on the provider, this may require the container image to include `sh` `tar`, in order to enable
    # the file transfer.
    artifacts:
      - # A POSIX-style path or glob to copy. Must be an absolute path. May contain wildcards.
        source:

        # A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at
        # `.garden/artifacts`.
        target: .

    # Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any time
    # your project (or one or more of the task's dependants) is deployed. Otherwise the task is only re-run when its
    # version changes (i.e. the module or one of its dependencies is modified), or when you run `garden run task`.
    cacheResult: true

    # The command/entrypoint used to run the task inside the container.
    command:

    # Key/value map of environment variables. Keys must be valid POSIX environment variable names (must not start with
    # `GARDEN`) and values must be primitives or references to secrets.
    env: {}

    cpu:
      # The minimum amount of CPU the task needs to be available for it to be deployed, in millicpus (i.e. 1000 = 1
      # CPU)
      min: 10

      # The maximum amount of CPU the task can use, in millicpus (i.e. 1000 = 1 CPU)
      max: 1000

    memory:
      # The minimum amount of RAM the task needs to be available for it to be deployed, in megabytes (i.e. 1024 = 1
      # GB)
      min: 90

      # The maximum amount of RAM the task can use, in megabytes (i.e. 1024 = 1 GB)
      max: 90

    # List of volumes that should be mounted when deploying the task.
    #
    # Note: If neither `hostPath` nor `module` is specified, an empty ephemeral volume is created and mounted when
    # deploying the container.
    volumes:
      - # The name of the allocated volume.
        name:

        # The path where the volume should be mounted in the container.
        containerPath:

        # _NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms
        # and providers. Some providers may not support it at all._
        #
        # A local path or path on the node that's running the container, to mount in the container, relative to the
        # module source path (or absolute).
        hostPath:

        # The name of a _volume module_ that should be mounted at `containerPath`. The supported module types will
        # depend on which provider you are using. The `kubernetes` provider supports the [persistentvolumeclaim
        # module](./persistentvolumeclaim.md), for example.
        #
        # When a `module` is specified, the referenced module/volume will be automatically configured as a runtime
        # dependency of this service, as well as a build dependency of this module.
        #
        # Note: Make sure to pay attention to the supported `accessModes` of the referenced volume. Unless it supports
        # the ReadWriteMany access mode, you'll need to make sure it is not configured to be mounted by multiple
        # services at the same time. Refer to the documentation of the module type in question to learn more.
        module:

    # If true, run the task's main container in privileged mode. Processes in privileged containers are essentially
    # equivalent to root on the host. Defaults to false.
    privileged:

    # POSIX capabilities to add to the running task's main container.
    addCapabilities:

    # POSIX capabilities to remove from the running task's main container.
    dropCapabilities:
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

### `build.timeout`

[build](#build) > timeout

Maximum time in seconds to wait for build to finish.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1200`  | No       |

### `build.projectType`

[build](#build) > projectType

The type of project to build. Defaults to auto-detecting between gradle and maven (based on which files/directories are found in the module root), but in some cases you may need to specify it.

| Type     | Default  | Required |
| -------- | -------- | -------- |
| `string` | `"auto"` | No       |

### `build.jdkVersion`

[build](#build) > jdkVersion

The JDK version to use.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `11`    | No       |

### `build.dockerBuild`

[build](#build) > dockerBuild

Build the image and push to a local Docker daemon (i.e. use the `jib:dockerBuild` / `jibDockerBuild` target).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `build.tarOnly`

[build](#build) > tarOnly

Don't load or push the resulting image to a Docker daemon or registry, only build it as a tar file.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `build.tarFormat`

[build](#build) > tarFormat

Specify the image format in the resulting tar file. Only used if `tarOnly: true`.

| Type     | Default    | Required |
| -------- | ---------- | -------- |
| `string` | `"docker"` | No       |

### `build.extraFlags[]`

[build](#build) > extraFlags

Specify extra flags to pass to maven/gradle when building the container image.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

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

### `generateFiles[].resolveTemplates`

[generateFiles](#generatefiles) > resolveTemplates

By default, Garden will attempt to resolve any Garden template strings in source files. Set this to false to skip resolving template strings. Note that this does not apply when setting the `value` field, since that's resolved earlier when parsing the configuration.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

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

### `varfile`

Specify a path (relative to the module root) to a file containing variables, that we apply on top of the
module-level `variables` field.

The format of the files is determined by the configured file's extension:

* `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
* `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys may contain any value type.
* `.json` - JSON. Must contain a single JSON _object_ (not an array).

_NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of nested objects and arrays._

To use different module-level varfiles in different environments, you can template in the environment name
to the varfile name, e.g. `varfile: "my-module.\$\{environment.name\}.env` (this assumes that the corresponding
varfiles exist).

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
varfile: "my-module.env"
```

### `buildArgs`

Specify build arguments to use when building the container image.

Note: Garden will always set a `GARDEN_MODULE_VERSION` argument with the module version at build time.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `extraFlags[]`

Specify extra flags to use when building the container image. Note that arguments may not be portable across implementations.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `image`

Specify the image name for the container. Should be a valid Docker image identifier. If specified and the module does not contain a Dockerfile, this image will be used to deploy services for this module. If specified and the module does contain a Dockerfile, this identifier is used when pushing the built image.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `hotReload`

Specifies which files or directories to sync to which paths inside the running containers of hot reload-enabled services when those files or directories are modified. Applies to this module's services, and to services with this module as their `sourceModule`.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `hotReload.sync[]`

[hotReload](#hotreload) > sync

Specify one or more source files or directories to automatically sync into the running container.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | Yes      |

### `hotReload.sync[].source`

[hotReload](#hotreload) > [sync](#hotreloadsync) > source

POSIX-style path of the directory to sync to the target, relative to the module's top-level directory. Must be a relative path. Defaults to the module's top-level directory if no value is provided.

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

### `hotReload.sync[].target`

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

### `hotReload.postSyncCommand[]`

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

### `dockerfile`

POSIX-style name of Dockerfile, relative to module root.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

### `services[]`

A list of services to deploy from this container module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `services[].name`

[services](#services) > name

Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer than 63 characters.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `services[].dependencies[]`

[services](#services) > dependencies

The names of any services that this service depends on at runtime, and the names of any tasks that should be executed before this service is deployed.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `services[].disabled`

[services](#services) > disabled

Set this to `true` to disable the service. You can use this with conditional template strings to enable/disable services based on, for example, the current environment or other variables (e.g. `enabled: \${environment.name != "prod"}`). This can be handy when you only need certain services for specific environments, e.g. only for development.

Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a runtime dependency for another service, test or task.

Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to resolve when the service is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `services[].annotations`

[services](#services) > annotations

Annotations to attach to the service _(note: May not be applicable to all providers)_.

When using the Kubernetes provider, these annotations are applied to both Service and Pod resources. You can generally specify the annotations intended for both Pods or Services here, and the ones that don't apply on either side will be ignored (i.e. if you put a Service annotation here, it'll also appear on Pod specs but will be safely ignored there, and vice versa).

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

Example:

```yaml
services:
  - annotations:
        nginx.ingress.kubernetes.io/proxy-body-size: '0'
```

### `services[].command[]`

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

### `services[].args[]`

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

### `services[].daemon`

[services](#services) > daemon

Whether to run the service as a daemon (to ensure exactly one instance runs per node). May not be supported by all providers.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `services[].devMode`

[services](#services) > devMode

Specifies which files or directories to sync to which paths inside the running containers of the service when it's in dev mode, and overrides for the container command and/or arguments.

Dev mode is enabled when running the `garden dev` command, and by setting the `--dev` flag on the `garden deploy` command.

See the [Code Synchronization guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for more information.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `services[].devMode.args[]`

[services](#services) > [devMode](#servicesdevmode) > args

Override the default container arguments when in dev mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `services[].devMode.command[]`

[services](#services) > [devMode](#servicesdevmode) > command

Override the default container command (i.e. entrypoint) when in dev mode.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `services[].devMode.sync[]`

[services](#services) > [devMode](#servicesdevmode) > sync

Specify one or more source files or directories to automatically sync with the running container.

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `services[].devMode.sync[].source`

[services](#services) > [devMode](#servicesdevmode) > [sync](#servicesdevmodesync) > source

POSIX-style path of the directory to sync to the target, relative to the module's top-level directory. Must be a relative path. Defaults to the module's top-level directory if no value is provided.

| Type        | Default | Required |
| ----------- | ------- | -------- |
| `posixPath` | `"."`   | No       |

Example:

```yaml
services:
  - devMode:
      ...
      sync:
        - source: "src"
```

### `services[].devMode.sync[].target`

[services](#services) > [devMode](#servicesdevmode) > [sync](#servicesdevmodesync) > target

POSIX-style absolute path to sync the directory to inside the container. The root path (i.e. "/") is not allowed.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

Example:

```yaml
services:
  - devMode:
      ...
      sync:
        - target: "/app/src"
```

### `services[].devMode.sync[].exclude[]`

[services](#services) > [devMode](#servicesdevmode) > [sync](#servicesdevmodesync) > exclude

Specify a list of POSIX-style paths or glob patterns that should be excluded from the sync.

`.git` directories and `.garden` directories are always ignored.

| Type               | Required |
| ------------------ | -------- |
| `array[posixPath]` | No       |

Example:

```yaml
services:
  - devMode:
      ...
      sync:
        - exclude:
            - dist/**/*
            - '*.log'
```

### `services[].devMode.sync[].mode`

[services](#services) > [devMode](#servicesdevmode) > [sync](#servicesdevmodesync) > mode

The sync mode to use for the given paths. See the [Dev Mode guide](https://docs.garden.io/guides/code-synchronization-dev-mode) for details.

| Type     | Allowed Values                                                                                                                            | Default          | Required |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | -------- |
| `string` | "one-way", "one-way-safe", "one-way-replica", "one-way-reverse", "one-way-replica-reverse", "two-way", "two-way-safe", "two-way-resolved" | `"one-way-safe"` | Yes      |

### `services[].devMode.sync[].defaultFileMode`

[services](#services) > [devMode](#servicesdevmode) > [sync](#servicesdevmodesync) > defaultFileMode

The default permission bits, specified as an octal, to set on files at the sync target. Defaults to 0600 (user read/write). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `services[].devMode.sync[].defaultDirectoryMode`

[services](#services) > [devMode](#servicesdevmode) > [sync](#servicesdevmodesync) > defaultDirectoryMode

The default permission bits, specified as an octal, to set on directories at the sync target. Defaults to 0700 (user read/write). See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#permissions) for more information.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `services[].devMode.sync[].defaultOwner`

[services](#services) > [devMode](#servicesdevmode) > [sync](#servicesdevmodesync) > defaultOwner

Set the default owner of files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type              | Required |
| ----------------- | -------- |
| `number | string` | No       |

### `services[].devMode.sync[].defaultGroup`

[services](#services) > [devMode](#servicesdevmode) > [sync](#servicesdevmodesync) > defaultGroup

Set the default group on files and directories at the target. Specify either an integer ID or a string name. See the [Mutagen docs](https://mutagen.io/documentation/synchronization/permissions#owners-and-groups) for more information.

| Type              | Required |
| ----------------- | -------- |
| `number | string` | No       |

### `services[].localMode`

[services](#services) > localMode

Specifies necessary configuration details of the local application which will replace a target remote service.

The target service will be replaced by a proxy container with an SSH server running,
and the reverse port forwarding will be automatically configured to route the traffic to the local service and back.

Local mode is enabled by setting the `--local-mode` option on the `garden deploy` command.

The health checks are disabled for services running in local mode.

See the [Local Mode guide](https://docs.garden.io/guides/running-service-in-local-mode.md) for more information.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `services[].localMode.command[]`

[services](#services) > [localMode](#serviceslocalmode) > command

The command to run the local application. If not present, then the local application should be started manually.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `services[].localMode.localPort`

[services](#services) > [localMode](#serviceslocalmode) > localPort

The working port of the local application.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `services[].ingresses[]`

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

### `services[].ingresses[].annotations`

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

### `services[].ingresses[].hostname`

[services](#services) > [ingresses](#servicesingresses) > hostname

The hostname that should route to this service. Defaults to the default hostname configured in the provider configuration.

Note that if you're developing locally you may need to add this hostname to your hosts file.

| Type       | Required |
| ---------- | -------- |
| `hostname` | No       |

### `services[].ingresses[].linkUrl`

[services](#services) > [ingresses](#servicesingresses) > linkUrl

The link URL for the ingress to show in the console and on the dashboard. Also used when calling the service with the `call` command.

Use this if the actual URL is different from what's specified in the ingress, e.g. because there's a load balancer in front of the service that rewrites the paths.

Otherwise Garden will construct the link URL from the ingress spec.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `services[].ingresses[].path`

[services](#services) > [ingresses](#servicesingresses) > path

The path which should be routed to the service.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"/"`   | No       |

### `services[].ingresses[].port`

[services](#services) > [ingresses](#servicesingresses) > port

The name of the container port where the specified paths should be routed.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `services[].env`

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

### `services[].healthCheck`

[services](#services) > healthCheck

Specify how the service's health should be checked after deploying.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `services[].healthCheck.httpGet`

[services](#services) > [healthCheck](#serviceshealthcheck) > httpGet

Set this to check the service's health by making an HTTP request.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `services[].healthCheck.httpGet.path`

[services](#services) > [healthCheck](#serviceshealthcheck) > [httpGet](#serviceshealthcheckhttpget) > path

The path of the service's health check endpoint.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `services[].healthCheck.httpGet.port`

[services](#services) > [healthCheck](#serviceshealthcheck) > [httpGet](#serviceshealthcheckhttpget) > port

The name of the port where the service's health check endpoint should be available.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `services[].healthCheck.httpGet.scheme`

[services](#services) > [healthCheck](#serviceshealthcheck) > [httpGet](#serviceshealthcheckhttpget) > scheme

| Type     | Default  | Required |
| -------- | -------- | -------- |
| `string` | `"HTTP"` | No       |

### `services[].healthCheck.command[]`

[services](#services) > [healthCheck](#serviceshealthcheck) > command

Set this to check the service's health by running a command in its container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `services[].healthCheck.tcpPort`

[services](#services) > [healthCheck](#serviceshealthcheck) > tcpPort

Set this to check the service's health by checking if this TCP port is accepting connections.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `services[].healthCheck.readinessTimeoutSeconds`

[services](#services) > [healthCheck](#serviceshealthcheck) > readinessTimeoutSeconds

The maximum number of seconds to wait until the readiness check counts as failed.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `3`     | No       |

### `services[].healthCheck.livenessTimeoutSeconds`

[services](#services) > [healthCheck](#serviceshealthcheck) > livenessTimeoutSeconds

The maximum number of seconds to wait until the liveness check counts as failed.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `3`     | No       |

### `services[].hotReloadCommand[]`

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

### `services[].hotReloadArgs[]`

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

### `services[].timeout`

[services](#services) > timeout

The maximum duration (in seconds) to wait for resources to deploy and become healthy.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `300`   | No       |

### `services[].limits`

[services](#services) > limits

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

Specify resource limits for the service.

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `services[].limits.cpu`

[services](#services) > [limits](#serviceslimits) > cpu

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

The maximum amount of CPU the service can use, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `services[].limits.memory`

[services](#services) > [limits](#serviceslimits) > memory

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

The maximum amount of RAM the service can use, in megabytes (i.e. 1024 = 1 GB)

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `services[].cpu`

[services](#services) > cpu

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"min":10,"max":1000}` | No       |

### `services[].cpu.min`

[services](#services) > [cpu](#servicescpu) > min

The minimum amount of CPU the service needs to be available for it to be deployed, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `10`    | No       |

### `services[].cpu.max`

[services](#services) > [cpu](#servicescpu) > max

The maximum amount of CPU the service can use, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1000`  | No       |

### `services[].memory`

[services](#services) > memory

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"min":90,"max":1024}` | No       |

### `services[].memory.min`

[services](#services) > [memory](#servicesmemory) > min

The minimum amount of RAM the service needs to be available for it to be deployed, in megabytes (i.e. 1024 = 1 GB)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `90`    | No       |

### `services[].memory.max`

[services](#services) > [memory](#servicesmemory) > max

The maximum amount of RAM the service can use, in megabytes (i.e. 1024 = 1 GB)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `90`    | No       |

### `services[].ports[]`

[services](#services) > ports

List of ports that the service container exposes.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `services[].ports[].name`

[services](#services) > [ports](#servicesports) > name

The name of the port (used when referencing the port elsewhere in the service configuration).

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `services[].ports[].protocol`

[services](#services) > [ports](#servicesports) > protocol

The protocol of the port.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `string` | `"TCP"` | No       |

### `services[].ports[].containerPort`

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

### `services[].ports[].localPort`

[services](#services) > [ports](#servicesports) > localPort

Specify a preferred local port to attach to when creating a port-forward to the service port. If this port is
busy, a warning will be shown and an alternative port chosen.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

Example:

```yaml
services:
  - ports:
      - localPort: 10080
```

### `services[].ports[].servicePort`

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

### `services[].ports[].hostPort`

[services](#services) > [ports](#servicesports) > hostPort

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `services[].ports[].nodePort`

[services](#services) > [ports](#servicesports) > nodePort

Set this to expose the service on the specified port on the host node (may not be supported by all providers). Set to `true` to have the cluster pick a port automatically, which is most often advisable if the cluster is shared by multiple users.
This allows you to call the service from the outside by the node's IP address and the port number set in this field.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `services[].replicas`

[services](#services) > replicas

The number of instances of the service to deploy. Defaults to 3 for environments configured with `production: true`, otherwise 1.
Note: This setting may be overridden or ignored in some cases. For example, when running with `daemon: true`, with hot-reloading enabled, or if the provider doesn't support multiple replicas.

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `services[].volumes[]`

[services](#services) > volumes

List of volumes that should be mounted when deploying the service.

Note: If neither `hostPath` nor `module` is specified, an empty ephemeral volume is created and mounted when deploying the container.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `services[].volumes[].name`

[services](#services) > [volumes](#servicesvolumes) > name

The name of the allocated volume.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `services[].volumes[].containerPath`

[services](#services) > [volumes](#servicesvolumes) > containerPath

The path where the volume should be mounted in the container.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `services[].volumes[].hostPath`

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

### `services[].volumes[].module`

[services](#services) > [volumes](#servicesvolumes) > module

The name of a _volume module_ that should be mounted at `containerPath`. The supported module types will depend on which provider you are using. The `kubernetes` provider supports the [persistentvolumeclaim module](./persistentvolumeclaim.md), for example.

When a `module` is specified, the referenced module/volume will be automatically configured as a runtime dependency of this service, as well as a build dependency of this module.

Note: Make sure to pay attention to the supported `accessModes` of the referenced volume. Unless it supports the ReadWriteMany access mode, you'll need to make sure it is not configured to be mounted by multiple services at the same time. Refer to the documentation of the module type in question to learn more.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `services[].privileged`

[services](#services) > privileged

If true, run the service's main container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `services[].tty`

[services](#services) > tty

Specify if containers in this module have TTY support enabled (which implies having stdin support enabled).

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `services[].addCapabilities[]`

[services](#services) > addCapabilities

POSIX capabilities to add to the running service's main container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `services[].dropCapabilities[]`

[services](#services) > dropCapabilities

POSIX capabilities to remove from the running service's main container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `tests[]`

A list of tests to run in the module.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `tests[].name`

[tests](#tests) > name

The name of the test.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `tests[].dependencies[]`

[tests](#tests) > dependencies

The names of any services that must be running, and the names of any tasks that must be executed, before the test is run.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `tests[].disabled`

[tests](#tests) > disabled

Set this to `true` to disable the test. You can use this with conditional template strings to
enable/disable tests based on, for example, the current environment or other variables (e.g.
`enabled: \${environment.name != "prod"}`). This is handy when you only want certain tests to run in
specific environments, e.g. only during CI.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `tests[].timeout`

[tests](#tests) > timeout

Maximum duration (in seconds) of the test run.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `null`  | No       |

### `tests[].args[]`

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

### `tests[].artifacts[]`

[tests](#tests) > artifacts

Specify artifacts to copy out of the container after the run. The artifacts are stored locally under the `.garden/artifacts` directory.

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

### `tests[].artifacts[].source`

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

### `tests[].artifacts[].target`

[tests](#tests) > [artifacts](#testsartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

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

### `tests[].command[]`

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

### `tests[].env`

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

### `tests[].cpu`

[tests](#tests) > cpu

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"min":10,"max":1000}` | No       |

### `tests[].cpu.min`

[tests](#tests) > [cpu](#testscpu) > min

The minimum amount of CPU the test needs to be available for it to be deployed, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `10`    | No       |

### `tests[].cpu.max`

[tests](#tests) > [cpu](#testscpu) > max

The maximum amount of CPU the test can use, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1000`  | No       |

### `tests[].memory`

[tests](#tests) > memory

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"min":90,"max":1024}` | No       |

### `tests[].memory.min`

[tests](#tests) > [memory](#testsmemory) > min

The minimum amount of RAM the test needs to be available for it to be deployed, in megabytes (i.e. 1024 = 1 GB)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `90`    | No       |

### `tests[].memory.max`

[tests](#tests) > [memory](#testsmemory) > max

The maximum amount of RAM the test can use, in megabytes (i.e. 1024 = 1 GB)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `90`    | No       |

### `tests[].volumes[]`

[tests](#tests) > volumes

List of volumes that should be mounted when deploying the test.

Note: If neither `hostPath` nor `module` is specified, an empty ephemeral volume is created and mounted when deploying the container.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `tests[].volumes[].name`

[tests](#tests) > [volumes](#testsvolumes) > name

The name of the allocated volume.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `tests[].volumes[].containerPath`

[tests](#tests) > [volumes](#testsvolumes) > containerPath

The path where the volume should be mounted in the container.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `tests[].volumes[].hostPath`

[tests](#tests) > [volumes](#testsvolumes) > hostPath

_NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms
and providers. Some providers may not support it at all._

A local path or path on the node that's running the container, to mount in the container, relative to the
module source path (or absolute).

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
tests:
  - volumes:
      - hostPath: "/some/dir"
```

### `tests[].volumes[].module`

[tests](#tests) > [volumes](#testsvolumes) > module

The name of a _volume module_ that should be mounted at `containerPath`. The supported module types will depend on which provider you are using. The `kubernetes` provider supports the [persistentvolumeclaim module](./persistentvolumeclaim.md), for example.

When a `module` is specified, the referenced module/volume will be automatically configured as a runtime dependency of this service, as well as a build dependency of this module.

Note: Make sure to pay attention to the supported `accessModes` of the referenced volume. Unless it supports the ReadWriteMany access mode, you'll need to make sure it is not configured to be mounted by multiple services at the same time. Refer to the documentation of the module type in question to learn more.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tests[].privileged`

[tests](#tests) > privileged

If true, run the test's main container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `tests[].addCapabilities[]`

[tests](#tests) > addCapabilities

POSIX capabilities to add to the running test's main container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `tests[].dropCapabilities[]`

[tests](#tests) > dropCapabilities

POSIX capabilities to remove from the running test's main container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `tasks[]`

A list of tasks that can be run from this container module. These can be used as dependencies for services (executed before the service is deployed) or for other tasks.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

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

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[string]` | `[]`    | No       |

### `tasks[].disabled`

[tasks](#tasks) > disabled

Set this to `true` to disable the task. You can use this with conditional template strings to enable/disable tasks based on, for example, the current environment or other variables (e.g. `enabled: \${environment.name != "prod"}`). This can be handy when you only want certain tasks to run in specific environments, e.g. only for development.

Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime dependency for another service, test or task.

Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to resolve when the task is disabled, so you need to make sure to provide alternate values for those if you're using them, using conditional expressions.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `tasks[].timeout`

[tasks](#tasks) > timeout

Maximum duration (in seconds) of the task's execution.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `null`  | No       |

### `tasks[].args[]`

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

### `tasks[].artifacts[]`

[tasks](#tasks) > artifacts

Specify artifacts to copy out of the container after the run. The artifacts are stored locally under the `.garden/artifacts` directory.

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

### `tasks[].artifacts[].source`

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

### `tasks[].artifacts[].target`

[tasks](#tasks) > [artifacts](#tasksartifacts) > target

A POSIX-style path to copy the artifacts to, relative to the project artifacts directory at `.garden/artifacts`.

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

### `tasks[].cacheResult`

[tasks](#tasks) > cacheResult

Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any time your project (or one or more of the task's dependants) is deployed. Otherwise the task is only re-run when its version changes (i.e. the module or one of its dependencies is modified), or when you run `garden run task`.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `true`  | No       |

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

### `tasks[].env`

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

### `tasks[].cpu`

[tasks](#tasks) > cpu

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"min":10,"max":1000}` | No       |

### `tasks[].cpu.min`

[tasks](#tasks) > [cpu](#taskscpu) > min

The minimum amount of CPU the task needs to be available for it to be deployed, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `10`    | No       |

### `tasks[].cpu.max`

[tasks](#tasks) > [cpu](#taskscpu) > max

The maximum amount of CPU the task can use, in millicpus (i.e. 1000 = 1 CPU)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `1000`  | No       |

### `tasks[].memory`

[tasks](#tasks) > memory

| Type     | Default                 | Required |
| -------- | ----------------------- | -------- |
| `object` | `{"min":90,"max":1024}` | No       |

### `tasks[].memory.min`

[tasks](#tasks) > [memory](#tasksmemory) > min

The minimum amount of RAM the task needs to be available for it to be deployed, in megabytes (i.e. 1024 = 1 GB)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `90`    | No       |

### `tasks[].memory.max`

[tasks](#tasks) > [memory](#tasksmemory) > max

The maximum amount of RAM the task can use, in megabytes (i.e. 1024 = 1 GB)

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `90`    | No       |

### `tasks[].volumes[]`

[tasks](#tasks) > volumes

List of volumes that should be mounted when deploying the task.

Note: If neither `hostPath` nor `module` is specified, an empty ephemeral volume is created and mounted when deploying the container.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `tasks[].volumes[].name`

[tasks](#tasks) > [volumes](#tasksvolumes) > name

The name of the allocated volume.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `tasks[].volumes[].containerPath`

[tasks](#tasks) > [volumes](#tasksvolumes) > containerPath

The path where the volume should be mounted in the container.

| Type        | Required |
| ----------- | -------- |
| `posixPath` | Yes      |

### `tasks[].volumes[].hostPath`

[tasks](#tasks) > [volumes](#tasksvolumes) > hostPath

_NOTE: Usage of hostPath is generally discouraged, since it doesn't work reliably across different platforms
and providers. Some providers may not support it at all._

A local path or path on the node that's running the container, to mount in the container, relative to the
module source path (or absolute).

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
tasks:
  - volumes:
      - hostPath: "/some/dir"
```

### `tasks[].volumes[].module`

[tasks](#tasks) > [volumes](#tasksvolumes) > module

The name of a _volume module_ that should be mounted at `containerPath`. The supported module types will depend on which provider you are using. The `kubernetes` provider supports the [persistentvolumeclaim module](./persistentvolumeclaim.md), for example.

When a `module` is specified, the referenced module/volume will be automatically configured as a runtime dependency of this service, as well as a build dependency of this module.

Note: Make sure to pay attention to the supported `accessModes` of the referenced volume. Unless it supports the ReadWriteMany access mode, you'll need to make sure it is not configured to be mounted by multiple services at the same time. Refer to the documentation of the module type in question to learn more.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `tasks[].privileged`

[tasks](#tasks) > privileged

If true, run the task's main container in privileged mode. Processes in privileged containers are essentially equivalent to root on the host. Defaults to false.

| Type      | Required |
| --------- | -------- |
| `boolean` | No       |

### `tasks[].addCapabilities[]`

[tasks](#tasks) > addCapabilities

POSIX capabilities to add to the running task's main container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `tasks[].dropCapabilities[]`

[tasks](#tasks) > dropCapabilities

POSIX capabilities to remove from the running task's main container.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |


## Outputs

### Module Outputs

The following keys are available via the `${modules.<module-name>}` template string key for `jib-container`
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

The following keys are available via the `${runtime.services.<service-name>}` template string key for `jib-container` module services.
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

The following keys are available via the `${runtime.tasks.<task-name>}` template string key for `jib-container` module tasks.
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

