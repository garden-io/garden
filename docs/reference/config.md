## garden.yml reference

Below is the full schema for the `garden.yml` configuration files. For an introduction,
please look at our [configuration guide](../guides/configuration.md).

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
  
  # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must
  # start with a letter, and cannot end with a dash) and additionally cannot contain consecutive
  # dashes or be longer than 63 characters.
  # 
  # Optional.
  name: 
  
  description: 
  
  # Variables that this module can reference and expose as environment variables.
  # 
  # Example:
  #   my-variable: some-value
  # 
  # Optional.
  variables: 
    {}
  
  # Set to false to disable pushing this module to remote registries.
  # 
  # Optional.
  allowPush: true
  
  # Specify how to build the module. Note that plugins may specify additional keys on this object.
  # 
  # Optional.
  build: 
    # The command to run inside the module directory to perform the build.
    # 
    # Example: "npm run build"
    # 
    # Optional.
    command: 
    
    # A list of modules that must be built before this module is built.
    # 
    # Example:
    #   - name: some-other-module-name
    # 
    # Optional.
    dependencies: 
      - # Module name to build ahead of this module
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
      

# The configuration for a Garden project. This should be specified in the garden.yml file in your
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
  
  # Default environment settings, that are inherited (but can be overridden) by each configured
  # environment
  # 
  # Example:
  #   providers: []
  #   variables: {}
  # 
  # Optional.
  environmentDefaults: 
    # Specify the provider that should store configuration variables for this environment. Use
    # this when you configure multiple providers that can manage configuration.
    # 
    # Optional.
    configurationHandler: 
    
    # A list of providers that should be used for this environment, and their configuration.
    # Please refer to individual plugins/providers for details on how to configure them.
    # 
    # Optional.
    providers: 
      - # The name of the provider plugin to configure.
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
    - # Specify the provider that should store configuration variables for this environment. Use
      # this when you configure multiple providers that can manage configuration.
      # 
      # Optional.
      configurationHandler: 
      
      # A list of providers that should be used for this environment, and their configuration.
      # Please refer to individual plugins/providers for details on how to configure them.
      # 
      # Optional.
      providers: 
        - # The name of the provider plugin to configure.
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
      # consecutive dashes or be longer than 63 characters.
      # 
      # Required.
      name:
    
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
  
  # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must
  # start with a letter, and cannot end with a dash) and additionally cannot contain consecutive
  # dashes or be longer than 63 characters.
  # 
  # Optional.
  name: 
  
  description: 
  
  # Variables that this module can reference and expose as environment variables.
  # 
  # Example:
  #   my-variable: some-value
  # 
  # Optional.
  variables: 
    {}
  
  # Set to false to disable pushing this module to remote registries.
  # 
  # Optional.
  allowPush: true
  
  # Specify how to build the module. Note that plugins may specify additional keys on this object.
  # 
  # Optional.
  build: 
    # The command to run inside the module directory to perform the build.
    # 
    # Example: "npm run build"
    # 
    # Optional.
    command: 
    
    # A list of modules that must be built before this module is built.
    # 
    # Example:
    #   - name: some-other-module-name
    # 
    # Optional.
    dependencies: 
      - # Module name to build ahead of this module
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
  # (must be uppercase, may not start with `GARDEN`) and values must be primitives.
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
      
      # The names of services that must be running before the test is run.
      # 
      # Optional.
      dependencies: 
        - 
        
      
      # Maximum duration (in seconds) of the test run.
      # 
      # Optional.
      timeout: 
      
      # The command to run in the module build context in order to test it.
      # 
      # Optional.
      command: 
        - 
        
      
      # Key/value map of environment variables. Keys must be valid POSIX environment variable
      # names (must be uppercase, may not start with `GARDEN`) and values must be primitives.
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
  
  # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must
  # start with a letter, and cannot end with a dash) and additionally cannot contain consecutive
  # dashes or be longer than 63 characters.
  # 
  # Optional.
  name: 
  
  description: 
  
  # Variables that this module can reference and expose as environment variables.
  # 
  # Example:
  #   my-variable: some-value
  # 
  # Optional.
  variables: 
    {}
  
  # Set to false to disable pushing this module to remote registries.
  # 
  # Optional.
  allowPush: true
  
  # Specify how to build the module. Note that plugins may specify additional keys on this object.
  # 
  # Optional.
  build: 
    # The command to run inside the module directory to perform the build.
    # 
    # Example: "npm run build"
    # 
    # Optional.
    command: 
    
    # A list of modules that must be built before this module is built.
    # 
    # Example:
    #   - name: some-other-module-name
    # 
    # Optional.
    dependencies: 
      - # Module name to build ahead of this module
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
      
  
  # Specify build arguments when building the container image.
  # 
  # Optional.
  buildArgs: 
    {}
  
  # Specify the image name for the container. Should be a valid docker image identifier. If
  # specified and the module does not contain a Dockerfile, this image will be used to deploy the
  # container services. If specified and the module does contain a Dockerfile, this identifier is
  # used when pushing the built image.
  # 
  # Optional.
  image: 
  
  # List of services to deploy from this container module.
  # 
  # Optional.
  services: 
    # The required attributes of a service. This is generally further defined by plugins.
    # 
    # Optional.
    - # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must
      # start with a letter, and cannot end with a dash) and additionally cannot contain
      # consecutive dashes or be longer than 63 characters.
      # 
      # Required.
      name: 
      
      # The names of services that this service depends on at runtime.
      # 
      # Optional.
      dependencies: 
        # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes,
        # must start with a letter, and cannot end with a dash) and additionally cannot contain
        # consecutive dashes or be longer than 63 characters.
        # 
        # Optional.
        - 
        
      
      # Key/value map, keys must be valid identifiers.
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
      
      # List of endpoints that the service exposes.
      # 
      # Optional.
      endpoints: 
        - # The paths which should be routed to the service.
          # 
          # Optional.
          paths: 
            - 
            
          
          # The name of the container port where the specified paths should be routed.
          # 
          # Required.
          port:
        
      
      # Key/value map of environment variables. Keys must be valid POSIX environment variable
      # names (must be uppercase, may not start with `GARDEN`) and values must be primitives.
      # 
      # Optional.
      env: 
        {}
      
      # Specify how the service's health should be checked after deploying.
      # 
      # Optional.
      healthCheck: 
        # Set this to check the service's health by making an HTTP request
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
      
      # List of ports that the service container exposes.
      # 
      # Optional.
      ports: 
        # Required.
        - # The name of the port (used when referencing the port elsewhere in the service
          # configuration.
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
      
      # The names of services that must be running before the test is run.
      # 
      # Optional.
      dependencies: 
        - 
        
      
      # Maximum duration (in seconds) of the test run.
      # 
      # Optional.
      timeout: 
      
      # The command to run in the module build context in order to test it.
      # 
      # Optional.
      command: 
        - 
        
      
      # Key/value map of environment variables. Keys must be valid POSIX environment variable
      # names (must be uppercase, may not start with `GARDEN`) and values must be primitives.
      # 
      # Optional.
      env: 
        {}
    
```

