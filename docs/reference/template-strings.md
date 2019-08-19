# Template string reference

Below you'll find the schema of the keys available when interpolating template strings (see our
[Configuration Files](../using-garden/configuration-files.md) guide for more information and usage examples).

Note that there are three sections below, since Project configs and Module configs have different keys available to
them, and since additional keys are available under `providers` in Project configs.
Please make sure to refer to the correct section.

Modules can reference `outputs` defined by other modules, via the `${modules.<module-name>.outputs}` key.
For details on which outputs are available for a given module type, please refer to the
[reference](https://docs.garden.io/reference/module-types) docs for the module type in question, and look for the
_Outputs_ section.

## Project configuration context

The following keys are available in any template strings within project definitions in `garden.yml` config files
(see the [Provider](#provider-configuration-context) section below for additional keys available when configuring
`providers`):

```yaml
# Type: object
#
local:
  # A map of all local environment variables (see
  # https://nodejs.org/api/process.html#process_process_env).
  #
  # Type: object
  #
  env:

  # A string indicating the platform that the framework is running on (see
  # https://nodejs.org/api/process.html#process_process_platform)
  #
  # Type: string
  #
  # Example: "posix"
  #
  platform:

  # The current username (as resolved by https://github.com/sindresorhus/username)
  #
  # Type: string
  #
  # Example: "tenzing_norgay"
  #
  username:
```

## Provider configuration context

The following keys are available in template strings under the `providers` key (or `environments[].providers)
in `garden.yml` project config files:

```yaml
# Type: object
#
local:
  # A map of all local environment variables (see
  # https://nodejs.org/api/process.html#process_process_env).
  #
  # Type: object
  #
  env:

  # A string indicating the platform that the framework is running on (see
  # https://nodejs.org/api/process.html#process_process_platform)
  #
  # Type: string
  #
  # Example: "posix"
  #
  platform:

  # The current username (as resolved by https://github.com/sindresorhus/username)
  #
  # Type: string
  #
  # Example: "tenzing_norgay"
  #
  username:

# Information about the environment that Garden is running against.
#
# Type: object
#
environment:
  # The name of the environment Garden is running against.
  #
  # Type: string
  #
  # Example: "local"
  #
  name:

# Information about the Garden project.
#
# Type: object
#
project:
  # The name of the Garden project.
  #
  # Type: string
  #
  # Example: "my-project"
  #
  name:

# Retrieve information about providers that are defined in the project.
#
# Type: object
#
# Example:
#   kubernetes:
#     config:
#       clusterHostname: my-cluster.example.com
#
providers: {}
```

## Module configuration context

The following keys are available in template strings with module definitions in `garden.yml` config files:

```yaml
# Type: object
#
local:
  # A map of all local environment variables (see
  # https://nodejs.org/api/process.html#process_process_env).
  #
  # Type: object
  #
  env:

  # A string indicating the platform that the framework is running on (see
  # https://nodejs.org/api/process.html#process_process_platform)
  #
  # Type: string
  #
  # Example: "posix"
  #
  platform:

  # The current username (as resolved by https://github.com/sindresorhus/username)
  #
  # Type: string
  #
  # Example: "tenzing_norgay"
  #
  username:

# Information about the environment that Garden is running against.
#
# Type: object
#
environment:
  # The name of the environment Garden is running against.
  #
  # Type: string
  #
  # Example: "local"
  #
  name:

# Information about the Garden project.
#
# Type: object
#
project:
  # The name of the Garden project.
  #
  # Type: string
  #
  # Example: "my-project"
  #
  name:

# Retrieve information about providers that are defined in the project.
#
# Type: object
#
# Example:
#   kubernetes:
#     config:
#       clusterHostname: my-cluster.example.com
#
providers: {}

# Retrieve information about modules that are defined in the project.
#
# Type: object
#
# Example:
#   my-module:
#     buildPath: /home/me/code/my-project/.garden/build/my-module
#     path: /home/me/code/my-project/my-module
#     outputs: {}
#     version: v-17ad4cb3fd
#
modules: {}

# Runtime outputs and information from services and tasks (only resolved at runtime when deploying
# services and running tasks).
#
# Type: object
#
runtime:
  # Runtime information from the services that the service/task being run depends on.
  #
  # Type: object
  #
  # Example:
  #   my-service:
  #     outputs:
  #       some-key: some value
  #
  services: {}

  # Runtime information from the tasks that the service/task being run depends on.
  #
  # Type: object
  #
  # Example:
  #   my-task:
  #     outputs:
  #       some-key: some value
  #
  tasks: {}

# A map of all variables defined in the project configuration.
#
# Type: object
#
# Example:
#   team-name: bananaramallama
#   some-service-endpoint: 'https://someservice.com/api/v2'
#
variables: {}

# Alias for the variables field.
#
# Type: object
#
var: {}
```