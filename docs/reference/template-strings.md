# Template strings

## Introduction

String configuration values in `garden.yml` can be templated to inject, among other things, variables,
information about the user's environment, references to other modules/services etc.

The syntax for templated strings is `${some.key}`. The key is looked up from the context available when
resolving the string. The context depends on which top-level key the configuration value belongs to (`project`
or `module`). See below for the full context that is available for each of those.

For example, for one service you might want to reference something from another module and expose it as an
environment variable:

```yaml
module:
  name: some-module
  services:
    - name: some-service
      # ...
      env:
        OTHER_MODULE_VERSION: ${modules.other-module.version}
```

You can also inject a template variable into a string. For instance, you might need to include a module's
version as part of a URI:

```yaml
      # ...
      env:
        OTHER_MODULE_ENDPOINT: http://other-module/api/${modules.other-module.version}
```

Note that while the syntax looks similar to template strings in Javascript, you can currently only do simple
lookups of keys. However, it is possible to do nested templating. For a somewhat contrived example:

```yaml
      # ...
      env:
        OTHER_MODULE_ENDPOINT: http://${var.auth-module}/api/${modules.${var.auth-module}.version}
```

There the name of the module is pulled from the project/environment configuration, and used to find the
appropriate key under the `modules` configuration context.

You can also do simple OR statements:


```yaml
      # ...
      env:
        PROFILE_NAME: ${local.env.PROFILE || "default"}
        LOG_LEVEL: ${local.env.LOG_LEVEL || variables.default-log-level}
```

This allows you to easily set default values when certain template keys are not available.

## Reference

### Project configuration context

The following keys are available in template strings under the `project` key in `garden.yml` files:

```yaml

local:
  # A map of all local environment variables (see
  # https://nodejs.org/api/process.html#process_process_env).
  env: {}

  # A string indicating the platform that the framework is running on (see
  # https://nodejs.org/api/process.html#process_process_platform)
  #
  # Example: "posix"
  #
  platform:
```

### Module configuration context

The following keys are available in template strings under the `module` key in `garden.yml` files:

```yaml

local:
  # A map of all local environment variables (see
  # https://nodejs.org/api/process.html#process_process_env).
  env: {}

  # A string indicating the platform that the framework is running on (see
  # https://nodejs.org/api/process.html#process_process_platform)
  #
  # Example: "posix"
  #
  platform:

# Information about the environment that Garden is running against.
environment:
  # The name of the environment Garden is running against.
  #
  # Example: "local"
  #
  name:

# Retrieve information about modules that are defined in the project.
#
# Example:
#   my-module:
#     path: /home/me/code/my-project/my-module
#     version: v17ad4cb3fd
#
modules:
  {}

# A map of all configured plugins/providers for this environment and their configuration.
#
# Example:
#   kubernetes:
#     name: local-kubernetes
#     context: my-kube-context
#
providers:
  {}

# A map of all variables defined in the project configuration.
#
# Example:
#   team-name: bananaramallama
#   some-service-endpoint: 'https://someservice.com/api/v2'
#
variables:
  {}
```
