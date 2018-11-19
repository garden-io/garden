## garden.yml reference

Below is the full schema for the `garden.yml` configuration files. For an introduction,
please look at our [configuration guide](../using-garden/configuration-files.md).

Note that individual module types, e.g. `container`, add additional configuration keys. The built-in module types
are listed in the [Built-in module types](#built-in-module-types) section. Please refer to those for more details
on module configuration.

```yaml

# The schema version of the config file (currently not used).
#
# Required.
# Allowed values: "0"
version: 0

# Configure a module whose sources are located in this directory.
#
# Optional.
module: 
  # The type of this module.
  #
  # Example: "container"
  #
  # Required.
  type:

  # The name of this module.
  #
  # Example: "my-sweet-module"
  #
  # Required.
  name:

  description:

  # A remote repository URL. Currently only supports git servers. Must contain a hash suffix
  # pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>
  #
  # Garden will import the repository source code into this module, but read the module's
  # config from the local garden.yml file.
  #
  # Example: "git+https://github.com/org/repo.git#v2.0"
  #
  # Optional.
  repositoryUrl:

  # Variables that this module can reference and expose as environment variables.
  #
  # Example:
  #   my-variable: some-value
  #
  # Optional.
  variables: 
    {}

  # When false, disables pushing this module to remote registries.
  #
  # Optional.
  allowPublish: true

  # Specify how to build the module. Note that plugins may define additional keys on this object.
  #
  # Optional.
  build: 
    # The command to run inside the module's directory to perform the build.
    #
    # Example:
    #   - npm
    #   - run
    #   - build
    #
    # Optional.
    command: 
      -

    # A list of modules that must be built before this module is built.
    #
    # Example:
    #   - name: some-other-module-name
    #
    # Optional.
    dependencies: 
      - # Module name to build ahead of this module.
        #
        # Required.
        name:

        # Specify one or more files or directories to copy from the built dependency to this
        # module.
        #
        # Optional.
        copy: 
          - # POSIX-style path or filename of the directory or file(s) to copy to the target.
            #
            # Required.
            source:

            # POSIX-style path or filename to copy the directory or file(s) to (defaults to same
            # as source path).
            #
            # Optional.
            target:

# Configuration for a Garden project. This should be specified in the garden.yml file in your
# project root.
#
# Optional.
project: 
  # The name of the project.
  #
  # Example: "my-sweet-project"
  #
  # Required.
  name:

  # The default environment to use when calling commands without the `--env` parameter.
  #
  # Optional.
  defaultEnvironment:

  # Default environment settings. These are inherited (but can be overridden) by each configured
  # environment.
  #
  # Example:
  #   providers: []
  #   variables: {}
  #
  # Optional.
  environmentDefaults: 
    # A list of providers that should be used for this environment, and their configuration.
    # Please refer to individual plugins/providers for details on how to configure them.
    #
    # Optional.
    providers: 
      - # The name of the provider plugin to use.
        #
        # Example: "local-kubernetes"
        #
        # Required.
        name:

    # A key/value map of variables that modules can reference when using this environment.
    #
    # Optional.
    variables: 
      {}

  # A list of environments to configure for the project.
  #
  # Example:
  #   - name: local
  #     providers:
  #       - name: local-kubernetes
  #     variables: {}
  #
  # Optional.
  environments: 
    - # A list of providers that should be used for this environment, and their configuration.
      # Please refer to individual plugins/providers for details on how to configure them.
      #
      # Optional.
      providers: 
        - # The name of the provider plugin to use.
          #
          # Example: "local-kubernetes"
          #
          # Required.
          name:

      # A key/value map of variables that modules can reference when using this environment.
      #
      # Optional.
      variables: 
        {}

      # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must
      # start with a letter, and cannot end with a dash) and additionally cannot contain
      # consecutive dashes, or be longer than 63 characters.
      #
      # Required.
      name:

  # A list of remote sources to import into project.
  #
  # Optional.
  sources: 
    - # The name of the source to import
      #
      # Required.
      name:

      # A remote repository URL. Currently only supports git servers. Must contain a hash suffix
      # pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>
      #
      # Example: "git+https://github.com/org/repo.git#v2.0"
      #
      # Required.
      repositoryUrl:
```

## Built-in module types

### generic

```yaml

# The module specification for a generic module.
#
# Required.
module: 
  # The type of this module.
  #
  # Example: "container"
  #
  # Required.
  type:

  # The name of this module.
  #
  # Example: "my-sweet-module"
  #
  # Required.
  name:

  description:

  # A remote repository URL. Currently only supports git servers. Must contain a hash suffix
  # pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>
  #
  # Garden will import the repository source code into this module, but read the module's
  # config from the local garden.yml file.
  #
  # Example: "git+https://github.com/org/repo.git#v2.0"
  #
  # Optional.
  repositoryUrl:

  # Variables that this module can reference and expose as environment variables.
  #
  # Example:
  #   my-variable: some-value
  #
  # Optional.
  variables: 
    {}

  # When false, disables pushing this module to remote registries.
  #
  # Optional.
  allowPublish: true

  # Specify how to build the module. Note that plugins may define additional keys on this object.
  #
  # Optional.
  build: 
    # The command to run inside the module's directory to perform the build.
    #
    # Example:
    #   - npm
    #   - run
    #   - build
    #
    # Optional.
    command: 
      -

    # A list of modules that must be built before this module is built.
    #
    # Example:
    #   - name: some-other-module-name
    #
    # Optional.
    dependencies: 
      - # Module name to build ahead of this module.
        #
        # Required.
        name:

        # Specify one or more files or directories to copy from the built dependency to this
        # module.
        #
        # Optional.
        copy: 
          - # POSIX-style path or filename of the directory or file(s) to copy to the target.
            #
            # Required.
            source:

            # POSIX-style path or filename to copy the directory or file(s) to (defaults to same
            # as source path).
            #
            # Optional.
            target:

  # Key/value map of environment variables. Keys must be valid POSIX environment variable names
  # (must not start with `GARDEN`) and values must be primitives.
  #
  # Optional.
  env: 
    {}

  # A list of tests to run in the module.
  #
  # Optional.
  tests: 
    # The test specification of a generic module.
    #
    # Optional.
    - # The name of the test.
      #
      # Required.
      name:

      # The names of any services that must be running, and the names of any tasks that must be
      # executed, before the test is run.
      #
      # Optional.
      dependencies: 
        -

      # Maximum duration (in seconds) of the test run.
      #
      # Optional.
      timeout: null

      # The command to run in the module build context in order to test it.
      #
      # Optional.
      command: 
        -

      # Key/value map of environment variables. Keys must be valid POSIX environment variable
      # names (must not start with `GARDEN`) and values must be primitives.
      #
      # Optional.
      env: 
        {}
```

### container

```yaml

# Configuration for a container module.
#
# Required.
module: 
  # The type of this module.
  #
  # Example: "container"
  #
  # Required.
  type:

  # The name of this module.
  #
  # Example: "my-sweet-module"
  #
  # Required.
  name:

  description:

  # A remote repository URL. Currently only supports git servers. Must contain a hash suffix
  # pointing to a specific branch or tag, with the format: <git remote url>#<branch|tag>
  #
  # Garden will import the repository source code into this module, but read the module's
  # config from the local garden.yml file.
  #
  # Example: "git+https://github.com/org/repo.git#v2.0"
  #
  # Optional.
  repositoryUrl:

  # Variables that this module can reference and expose as environment variables.
  #
  # Example:
  #   my-variable: some-value
  #
  # Optional.
  variables: 
    {}

  # When false, disables pushing this module to remote registries.
  #
  # Optional.
  allowPublish: true

  # Specify how to build the module. Note that plugins may define additional keys on this object.
  #
  # Optional.
  build: 
    # The command to run inside the module's directory to perform the build.
    #
    # Example:
    #   - npm
    #   - run
    #   - build
    #
    # Optional.
    command: 
      -

    # A list of modules that must be built before this module is built.
    #
    # Example:
    #   - name: some-other-module-name
    #
    # Optional.
    dependencies: 
      - # Module name to build ahead of this module.
        #
        # Required.
        name:

        # Specify one or more files or directories to copy from the built dependency to this
        # module.
        #
        # Optional.
        copy: 
          - # POSIX-style path or filename of the directory or file(s) to copy to the target.
            #
            # Required.
            source:

            # POSIX-style path or filename to copy the directory or file(s) to (defaults to same
            # as source path).
            #
            # Optional.
            target:

  # Specify build arguments to use when building the container image.
  #
  # Optional.
  buildArgs: 
    {}

  # Specify the image name for the container. Should be a valid Docker image identifier. If
  # specified and the module does not contain a Dockerfile, this image will be used to deploy
  # services for this module. If specified and the module does contain a Dockerfile, this
  # identifier is used when pushing the built image.
  #
  # Optional.
  image:

  # When this field is used, the files or directories specified within are automatically synced
  # into the running container when they're modified. Additionally, any of this module's services
  # that define a `hotReloadCommand` will be run with that command instead of the one specified in
  # their `command` field. Services are only deployed with hot reloading enabled when their names
  # are passed to the `--hot-reload` option in a call to the `deploy` or `dev` command.
  #
  # Optional.
  hotReload: 
    # Specify one or more source files or directories to automatically sync into the running
    # container.
    #
    # Required.
    sync: 
      - # POSIX-style path of the directory to sync to the target, relative to the module's
        # top-level directory. Must be a relative path if provided. Defaults to the module's
        # top-level directory if no value is provided.
        #
        # Example: "src"
        #
        # Optional.
        source: .

        # POSIX-style absolute path to sync the directory to inside the container. The root path
        # (i.e. "/") is not allowed.
        #
        # Example: "/app/src"
        #
        # Required.
        target:

  # POSIX-style name of Dockerfile, relative to project root. Defaults to $MODULE_ROOT/Dockerfile.
  #
  # Optional.
  dockerfile:

  # The list of services to deploy from this container module.
  #
  # Optional.
  services: 
    # The required attributes of a service. This is generally further defined by plugins.
    #
    # Optional.
    - # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must
      # start with a letter, and cannot end with a dash) and additionally cannot contain
      # consecutive dashes, or be longer than 63 characters.
      #
      # Required.
      name:

      # The names of any services that this service depends on at runtime, and the names of any
      # tasks that should be executed before this service is deployed.
      #
      # Optional.
      dependencies: 
        # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes,
        # must start with a letter, and cannot end with a dash) and additionally cannot contain
        # consecutive dashes, or be longer than 63 characters.
        #
        # Optional.
        -

      # Key/value map. Keys must be valid identifiers.
      #
      # Optional.
      outputs: 
        {}

      # The arguments to run the container with when starting the service.
      #
      # Optional.
      command: 
        -

      # Whether to run the service as a daemon (to ensure only one runs per node).
      #
      # Optional.
      daemon: false

      # List of ingress endpoints that the service exposes.
      #
      # Example:
      #   - path: /api
      #     port: http
      #
      # Optional.
      ingresses: 
        - # The hostname that should route to this service. Defaults to the default hostname
          # configured in the provider configuration.
          #
          # Note that if you're developing locally you may need to add this hostname to your hosts
          # file.
          #
          # Optional.
          hostname:

          # The path which should be routed to the service.
          #
          # Optional.
          path: /

          # The name of the container port where the specified paths should be routed.
          #
          # Required.
          port:

      # Key/value map of environment variables. Keys must be valid POSIX environment variable
      # names (must not start with `GARDEN`) and values must be primitives.
      #
      # Optional.
      env: 
        {}

      # Specify how the service's health should be checked after deploying.
      #
      # Optional.
      healthCheck: 
        # Set this to check the service's health by making an HTTP request.
        #
        # Optional.
        httpGet: 
          # The path of the service's health check endpoint.
          #
          # Required.
          path:

          # The name of the port where the service's health check endpoint should be available.
          #
          # Required.
          port:

          scheme: HTTP

        # Set this to check the service's health by running a command in its container.
        #
        # Optional.
        command: 
          -

        # Set this to check the service's health by checking if this TCP port is accepting
        # connections.
        #
        # Optional.
        tcpPort:

      # If this module uses the `hotReload` field, the container will be run with these arguments
      # instead of those in `command` when the service is deployed with hot reloading enabled.
      #
      # Optional.
      hotReloadCommand: 
        -

      # List of ports that the service container exposes.
      #
      # Optional.
      ports: 
        #
        # Required.
        - # The name of the port (used when referencing the port elsewhere in the service
          # configuration).
          #
          # Required.
          name:

          # The protocol of the service container port.
          #
          # Optional.
          protocol: TCP

          # The port number on the service container.
          #
          # Required.
          containerPort:

          hostPort:

          # Set this to expose the service on the specified port on the host node (may not be
          # supported by all providers).
          #
          # Optional.
          nodePort:

      # List of volumes that should be mounted when deploying the container.
      #
      # Optional.
      volumes: 
        - # The name of the allocated volume.
          #
          # Required.
          name:

          # The path where the volume should be mounted in the container.
          #
          # Required.
          containerPath:

          hostPath:

  # A list of tests to run in the module.
  #
  # Optional.
  tests: 
    # The test specification of a generic module.
    #
    # Optional.
    - # The name of the test.
      #
      # Required.
      name:

      # The names of any services that must be running, and the names of any tasks that must be
      # executed, before the test is run.
      #
      # Optional.
      dependencies: 
        -

      # Maximum duration (in seconds) of the test run.
      #
      # Optional.
      timeout: null

      # The command to run in the module build context in order to test it.
      #
      # Optional.
      command: 
        -

      # Key/value map of environment variables. Keys must be valid POSIX environment variable
      # names (must not start with `GARDEN`) and values must be primitives.
      #
      # Optional.
      env: 
        {}

  # A list of tasks that can be run from this container module. These can be used as dependencies
  # for services (executed before the service is deployed) or for other tasks.
  #
  # Optional.
  tasks: 
    # A task that can be run in this module.
    #
    # Optional.
    - # The name of the task.
      #
      # Required.
      name:

      # The names of any tasks that must be executed, and the names of any services that must be
      # running, before this task is executed.
      #
      # Optional.
      dependencies: 
        -

      # Maximum duration (in seconds) of the task's execution.
      #
      # Optional.
      timeout: null

      # The command that the task should run inside the container.
      #
      # Optional.
      command: 
        -
```

