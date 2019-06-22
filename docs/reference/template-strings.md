# Template strings reference

Below you'll find the schema for the keys available when interpolating template strings (see our
[Configuration Files](../using-garden/configuration-files.md) guide for information and usage examples).

Note that there are two sections below, because Project configs and Module configs have different keys available to
them. Please make sure to refer to the correct section.

## Project configuration context

The following keys are available in template strings under the `project` key in `garden.yml` files:

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
```

## Module configuration context

The following keys are available in template strings under the `module` key in `garden.yml` files:

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
#     path: /home/me/code/my-project/my-module
#     version: v-17ad4cb3fd
#
modules: {}

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