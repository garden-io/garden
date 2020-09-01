---
order: 3
title: Commands
---

## Garden CLI commands

Below is a list of Garden CLI commands and usage information.

The commands should be run in a Garden project, and are always scoped to that project.

Note: You can get a list of commands in the CLI by running `garden -h/--help`,
and detailed help for each command using `garden <command> -h/--help`

The _Outputs_ sections show the output structure when running the command with `--output yaml`. The same structure is used when `--output json` is used and when querying through the REST API, but in JSON format.

##### Global options

The following option flags can be used with any of the CLI commands:

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--root` | `-r` | path | Override project root directory (defaults to working directory). Can be absolute or relative to current directory.
  | `--silent` | `-s` | boolean | Suppress log output. Same as setting --logger-type&#x3D;quiet.
  | `--env` | `-e` | string | The environment (and optionally namespace) to work against.
  | `--logger-type` |  | `quiet` `basic` `fancy` `fullscreen` `json`  | Set logger type. fancy updates log lines in-place when their status changes (e.g. when tasks complete), basic appends a new log line when a log line&#x27;s status changes, json same as basic, but renders log lines as JSON, quiet suppresses all log output, same as --silent.
  | `--log-level` | `-l` | `error` `warn` `info` `verbose` `debug` `silly` `0` `1` `2` `3` `4` `5`  | Set logger level. Values can be either string or numeric and are prioritized from 0 to 5 (highest to lowest) as follows: error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5.
  | `--output` | `-o` | `json` `yaml`  | Output command result in specified format (note: disables progress logging and interactive functionality).
  | `--emoji` |  | boolean | Enable emoji in output (defaults to true if the environment supports it).
  | `--yes` | `-y` | boolean | Automatically approve any yes/no prompts during execution.
  | `--force-refresh` |  | boolean | Force refresh of any caches, e.g. cached provider statuses.
  | `--var` |  | array:string | Set a specific variable value, using the format &lt;key&gt;&#x3D;&lt;value&gt;, e.g. &#x60;--var some-key&#x3D;custom-value&#x60;. This will override any value set in your project configuration. You can specify multiple variables by separating with a comma, e.g. &#x60;--var key-a&#x3D;foo,key-b&#x3D;&quot;value with quotes&quot;&#x60;.
  | `--version` | `-v` | boolean | Show the current CLI version.
  | `--help` | `-h` | boolean | Show help

### garden build

**Build your modules.**

Builds all or specified modules, taking into account build dependency order.
Optionally stays running and automatically builds modules if their source (or their dependencies' sources) change.

Examples:

    garden build            # build all modules in the project
    garden build my-module  # only build my-module
    garden build --force    # force rebuild of modules
    garden build --watch    # watch for changes to code

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden build [modules] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | Specify module(s) to build. Use comma as a separator to specify multiple modules.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` | `-f` | boolean | Force rebuild of module(s).
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-build.

#### Outputs

```yaml
# A map of all modules that were built (or builds scheduled/attempted for) and information about the builds.
builds:
  <module name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all services that were deployed (or deployment scheduled/attempted for) and the service status.
deployments:
  <service name>:
    # When the service was first deployed by the provider.
    createdAt:

    # Additional detail, specific to the provider.
    detail:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

        # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # A map of values output from the service.
    outputs:
      <name>:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # When the service was last updated by the provider.
    updatedAt:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all tests that were run (or scheduled/attempted) and the test results.
tests:
  <test name>:
    # The name of the module that was run.
    moduleName:

    # The command that was run in the module.
    command:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

    # A map of primitive values, output from the test.
    outputs:
      # Number, string or boolean
      <name>:

    # The name of the test that was run.
    testName:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all raw graph results. Avoid using this programmatically if you can, and use more structured keys instead.
graphResults:
```

### garden call

**Call a service ingress endpoint.**

Resolves the deployed ingress endpoint for the given service and path, calls the given endpoint and
outputs the result.

Examples:

    garden call my-container
    garden call my-container/some-path

Note: Currently only supports simple GET requests for HTTP/HTTPS ingresses.

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden call <serviceAndPath> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `serviceAndPath` | Yes | The name of the service to call followed by the ingress path (e.g. my-container/somepath).



### garden config analytics-enabled

**Update your preferences regarding analytics.**

To help us make Garden better, you can opt in to the collection of usage data.
We make sure all the data collected is anonymized and stripped of sensitive
information. We collect data about which commands are run, what tasks they trigger,
which API calls are made to your local Garden server, as well as some info
about the environment in which Garden runs.

You will be asked if you want to opt-in when running Garden for the
first time and you can use this command to update your preferences later.

Examples:

    garden config analytics-enabled true   # enable analytics
    garden config analytics-enabled false  # disable analytics

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden config analytics-enabled [enable] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `enable` | No | Enable analytics. Defaults to &quot;true&quot;



### garden create project

**Create a new Garden project.**

Creates a new Garden project configuration. The generated config includes some default values, as well as the
schema of the config in the form of commentented-out fields. Also creates a default (blank) .gardenignore file
in the same path.

Examples:

    garden create project                     # create a Garden project config in the current directory
    garden create project --dir some-dir      # create a Garden project config in the ./some-dir directory
    garden create project --name my-project   # set the project name to my-project
    garden create project --interactive=false # don't prompt for user inputs when creating the config

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden create project [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--dir` |  | path | Directory to place the project in (defaults to current directory).
  | `--filename` |  | string | Filename to place the project config in (defaults to project.garden.yml).
  | `--interactive` | `-i` | boolean | Set to false to disable interactive prompts.
  | `--name` |  | string | Name of the project (defaults to current directory name).


### garden create module

**Create a new Garden module.**

Creates a new Garden module configuration. The generated config includes some default values, as well as the
schema of the config in the form of commentented-out fields.

Examples:

    garden create module                      # create a Garden module config in the current directory
    garden create module --dir some-dir       # create a Garden module config in the ./some-dir directory
    garden create module --name my-module     # set the module name to my-module
    garden create module --interactive=false  # don't prompt for user inputs when creating the module

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden create module [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--dir` |  | path | Directory to place the module in (defaults to current directory).
  | `--filename` |  | string | Filename to place the module config in (defaults to garden.yml).
  | `--interactive` | `-i` | boolean | Set to false to disable interactive prompts.
  | `--name` |  | string | Name of the module (defaults to current directory name).
  | `--type` |  | string | The module type to create. Required if --interactive&#x3D;false.


### garden delete secret

**Delete a secret from the environment.**

Returns with an error if the provided key could not be found by the provider.

Examples:

    garden delete secret kubernetes somekey
    garden del secret local-kubernetes some-other-key

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden delete secret <provider> <key> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `provider` | Yes | The name of the provider to remove the secret from.
  | `key` | Yes | The key of the configuration variable. Separate with dots to get a nested key (e.g. key.nested).



### garden delete environment

**Deletes a running environment.**

This will delete all services in the specified environment, and trigger providers to clear up any other resources
and reset it. When you then run `garden deploy`, the environment will be reconfigured.

This can be useful if you find the environment to be in an inconsistent state, or need/want to free up
resources.

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden delete environment 


#### Outputs

```yaml
# The status of each provider in the environment.
providerStatuses:
  # Description of an environment's status for a provider.
  <name>:
    # Set to true if the environment is fully configured for a provider.
    ready:

    # Use this to include additional information that is specific to the provider.
    detail:

    # Output variables that modules and other variables can reference.
    outputs:
      <name>:

    # Set to true to disable caching of the status.
    disableCache:

# The status of each service in the environment.
serviceStatuses:
  <name>:
    # When the service was first deployed by the provider.
    createdAt:

    # Additional detail, specific to the provider.
    detail:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

        # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # A map of values output from the service.
    outputs:
      <name>:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # When the service was last updated by the provider.
    updatedAt:

    # The Garden module version of the deployed service.
    version:
```

### garden delete service

**Deletes running services.**

Deletes (i.e. un-deploys) the specified services. Note that this command does not take into account any
services depending on the deleted service, and might therefore leave the project in an unstable state.
Running `garden deploy` will re-deploy any missing services.

Examples:

    garden delete service my-service # deletes my-service

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden delete service <services> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `services` | Yes | The name(s) of the service(s) to delete. Use comma as a separator to specify multiple services.


#### Outputs

```yaml
<name>:
  # When the service was first deployed by the provider.
  createdAt:

  # Additional detail, specific to the provider.
  detail:

  # The ID used for the service by the provider (if not the same as the service name).
  externalId:

  # The provider version of the deployed service (if different from the Garden module version.
  externalVersion:

  # A list of ports that can be forwarded to from the Garden agent by the provider.
  forwardablePorts:
    - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
      name:

      # The protocol of the port.
      protocol:

      # The target name/hostname to forward to (defaults to the service name).
      targetName:

      # The target port on the service.
      targetPort:

      # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
      urlProtocol:

  # List of currently deployed ingress endpoints for the service.
  ingresses:
    - # The ingress path that should be matched to route to this service.
      path:

      # The protocol to use for the ingress.
      protocol:

      # The hostname where the service can be accessed.
      hostname:

      # The port number that the service is exposed on internally.
      # This defaults to the first specified port for the service.
      port:

  # Latest status message of the service (if any).
  lastMessage:

  # Latest error status message of the service (if any).
  lastError:

  # A map of values output from the service.
  outputs:
    <name>:

  # How many replicas of the service are currently running.
  runningReplicas:

  # The current deployment status of the service.
  state:

  # When the service was last updated by the provider.
  updatedAt:

  # The Garden module version of the deployed service.
  version:
```

### garden deploy

**Deploy service(s) to your environment.**

Deploys all or specified services, taking into account service dependency order.
Also builds modules and dependencies if needed.

Optionally stays running and automatically re-builds and re-deploys services if their module source
(or their dependencies' sources) change.

Examples:

    garden deploy                      # deploy all modules in the project
    garden deploy my-service           # only deploy my-service
    garden deploy service-a,service-b  # only deploy service-a and service-b
    garden deploy --force              # force re-deploy of modules, even if they're already deployed
    garden deploy --watch              # watch for changes to code
    garden deploy --hot=my-service     # deploys all services, with hot reloading enabled for my-service
    garden deploy --hot=*              # deploys all compatible services with hot reloading enabled
    garden deploy --env stage          # deploy your services to an environment called stage

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden deploy [services] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `services` | No | The name(s) of the service(s) to deploy (skip to deploy all services). Use comma as a separator to specify multiple services.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force redeploy of service(s).
  | `--force-build` |  | boolean | Force rebuild of module(s).
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-deploy.
  | `--hot-reload` | `-hot` | array:string | The name(s) of the service(s) to deploy with hot reloading enabled. Use comma as a separator to specify multiple services. Use * to deploy all services with hot reloading enabled (ignores services belonging to modules that don&#x27;t support or haven&#x27;t configured hot reloading). When this option is used, the command is run in watch mode (i.e. implicitly assumes the --watch/-w flag).

#### Outputs

```yaml
# A map of all modules that were built (or builds scheduled/attempted for) and information about the builds.
builds:
  <module name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all services that were deployed (or deployment scheduled/attempted for) and the service status.
deployments:
  <service name>:
    # When the service was first deployed by the provider.
    createdAt:

    # Additional detail, specific to the provider.
    detail:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

        # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # A map of values output from the service.
    outputs:
      <name>:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # When the service was last updated by the provider.
    updatedAt:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all tests that were run (or scheduled/attempted) and the test results.
tests:
  <test name>:
    # The name of the module that was run.
    moduleName:

    # The command that was run in the module.
    command:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

    # A map of primitive values, output from the test.
    outputs:
      # Number, string or boolean
      <name>:

    # The name of the test that was run.
    testName:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all raw graph results. Avoid using this programmatically if you can, and use more structured keys instead.
graphResults:
```

### garden dev

**Starts the garden development console.**

The Garden dev console is a combination of the `build`, `deploy` and `test` commands.
It builds, deploys and tests all your modules and services, and re-builds, re-deploys and re-tests
as you modify the code.

Examples:

    garden dev
    garden dev --hot=foo-service,bar-service  # enable hot reloading for foo-service and bar-service
    garden dev --hot=*                        # enable hot reloading for all compatible services
    garden dev --skip-tests=                  # skip running any tests
    garden dev --name integ                   # run all tests with the name 'integ' in the project
    garden test --name integ*                 # run all tests with the name starting with 'integ' in the project

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden dev [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--hot-reload` | `-hot` | array:string | The name(s) of the service(s) to deploy with hot reloading enabled. Use comma as a separator to specify multiple services. Use * to deploy all services with hot reloading enabled (ignores services belonging to modules that don&#x27;t support or haven&#x27;t configured hot reloading).
  | `--skip-tests` |  | boolean | Disable running the tests.
  | `--test-names` | `-tn` | array:string | Filter the tests to run by test name across all modules (leave unset to run all tests). Accepts glob patterns (e.g. integ* would run both &#x27;integ&#x27; and &#x27;integration&#x27;).


### garden exec

**Executes a command (such as an interactive shell) in a running service.**

Finds an active container for a deployed service and executes the given command within the container.
Supports interactive shells.

_NOTE: This command may not be supported for all module types._

Examples:

     garden exec my-service /bin/sh   # runs a shell in the my-service container

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden exec <service> <command> [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | Yes | The service to exec the command in.
  | `command` | Yes | The command to run.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` |  | boolean | Set to false to skip interactive mode and just output the command result

#### Outputs

```yaml
# The exit code of the command executed in the service container.
code:

# The output of the executed command.
output:

# The stdout output of the executed command (if available).
stdout:

# The stderr output of the executed command (if available).
stderr:
```

### garden get graph

**Outputs the dependency relationships specified in this project's garden.yml files.**


| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden get graph 



### garden get config

**Outputs the full configuration for this project and environment.**


| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden get config [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--exclude-disabled` |  | boolean | Exclude disabled module, service, test, and task configs from output.
  | `--resolve` |  | `full` `partial`  | Choose level of resolution of config templates. Defaults to full. Specify --resolve&#x3D;partial to avoid resolving providers.

#### Outputs

```yaml
allEnvironmentNames:

# The name of the environment.
environmentName:

# The namespace of the current environment (if applicable).
namespace:

# A list of all configured providers in the environment.
providers:

# All configured variables in the environment.
variables:
  <name>:

# All module configs in the project.
moduleConfigs:
  - # The schema version of this module's config (currently not used).
    apiVersion:

    kind:

    # The type of this module.
    type:

    # The name of this module.
    name:

    # A description of the module.
    description:

    # Set this to `true` to disable the module. You can use this with conditional template strings to disable modules
    # based on, for example, the current environment or other variables (e.g. `disabled: \${environment.name ==
    # "prod"}`). This can be handy when you only need certain modules for specific environments, e.g. only for
    # development.
    #
    # Disabling a module means that any services, tasks and tests contained in it will not be deployed or run. It also
    # means that the module is not built _unless_ it is declared as a build dependency by another enabled module (in
    # which case building this module is necessary for the dependant to be built).
    #
    # If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
    # will automatically ignore those dependency declarations. Note however that template strings referencing the
    # module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so you
    # need to make sure to provide alternate values for those if you're using them, using conditional expressions.
    disabled:

    # Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module. Files
    # that do *not* match these paths or globs are excluded when computing the version of the module, when responding
    # to filesystem watch events, and when staging builds.
    #
    # Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
    # source tree, which use the same format as `.gitignore` files. See the [Configuration Files
    # guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
    # details.
    #
    # Also note that specifying an empty list here means _no sources_ should be included.
    include:

    # Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that match
    # these paths or globs are excluded when computing the version of the module, when responding to filesystem watch
    # events, and when staging builds.
    #
    # Note that you can also explicitly _include_ files using the `include` field. If you also specify the `include`
    # field, the files/patterns specified here are filtered from the files matched by `include`. See the
    # [Configuration Files
    # guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories) for
    # details.
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
    allowPublish:

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
              target:

    # The outputs defined by the module (referenceable in other module configs).
    outputs:
      <name>:

    # The filesystem path of the module.
    path:

    # The filesystem path of the module config file.
    configPath:

    # List of services configured by this module.
    serviceConfigs:
      - # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be longer
        # than 63 characters.
        name:

        # The names of any services that this service depends on at runtime, and the names of any tasks that should be
        # executed before this service is deployed.
        dependencies:

        # Set this to `true` to disable the service. You can use this with conditional template strings to
        # enable/disable services based on, for example, the current environment or other variables (e.g. `enabled:
        # \${environment.name != "prod"}`). This can be handy when you only need certain services for specific
        # environments, e.g. only for development.
        #
        # Disabling a service means that it will not be deployed, and will also be ignored if it is declared as a
        # runtime dependency for another service, test or task.
        #
        # Note however that template strings referencing the service's outputs (i.e. runtime outputs) will fail to
        # resolve when the service is disabled, so you need to make sure to provide alternate values for those if
        # you're using them, using conditional expressions.
        disabled:

        # Set this to true if the module and service configuration supports hot reloading.
        hotReloadable:

        # The `validate` module action should populate this, if the service's code sources are contained in a separate
        # module from the parent module. For example, when the service belongs to a module that contains manifests
        # (e.g. a Helm chart), but the actual code lives in a different module (e.g. a container module).
        sourceModuleName:

        # The service's specification, as defined by its provider plugin.
        spec:

    # List of tasks configured by this module.
    taskConfigs:
      - # The name of the task.
        name:

        # A description of the task.
        description:

        # The names of any tasks that must be executed, and the names of any services that must be running, before
        # this task is executed.
        dependencies:

        # Set this to `true` to disable the task. You can use this with conditional template strings to enable/disable
        # tasks based on, for example, the current environment or other variables (e.g. `enabled: \${environment.name
        # != "prod"}`). This can be handy when you only want certain tasks to run in specific environments, e.g. only
        # for development.
        #
        # Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime
        # dependency for another service, test or task.
        #
        # Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to
        # resolve when the task is disabled, so you need to make sure to provide alternate values for those if you're
        # using them, using conditional expressions.
        disabled:

        # Maximum duration (in seconds) of the task's execution.
        timeout:

        # Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any time
        # your project (or one or more of the task's dependants) is deployed. Otherwise the task is only re-run when
        # its version changes (i.e. the module or one of its dependencies is modified), or when you run `garden run
        # task`.
        cacheResult:

        # The task's specification, as defined by its provider plugin.
        spec:

    # List of tests configured by this module.
    testConfigs:
      - # The name of the test.
        name:

        # The names of any services that must be running, and the names of any tasks that must be executed, before the
        # test is run.
        dependencies:

        # Set this to `true` to disable the test. You can use this with conditional template strings to
        # enable/disable tests based on, for example, the current environment or other variables (e.g.
        # `enabled: \${environment.name != "prod"}`). This is handy when you only want certain tests to run in
        # specific environments, e.g. only during CI.
        disabled:

        # Maximum duration (in seconds) of the test run.
        timeout:

        # The configuration for the test, as specified by its module's provider.
        spec:

    # The module spec, as defined by the provider plugin.
    spec:

# All workflow configs in the project.
workflowConfigs:
  - # The schema version of this workflow's config (currently not used).
    apiVersion:

    kind:

    # The name of this workflow.
    name:

    # A description of the workflow.
    description:

    # A list of files to write before starting the workflow.
    #
    # This is useful to e.g. create files required for provider authentication, and can be created from data stored in
    # secrets or templated strings.
    #
    # Note that you cannot reference provider configuration in template strings within this field, since they are
    # resolved after these files are generated. This means you can reference the files specified here in your provider
    # configurations.
    files:
      - # POSIX-style path to write the file to, relative to the project root (or absolute). If the path contains one
        # or more directories, they are created automatically if necessary.
        # If any of those directories conflict with existing file paths, or if the file path conflicts with an
        # existing directory path, an error will be thrown.
        # **Any existing file with the same path will be overwritten, so be careful not to accidentally accidentally
        # overwrite files unrelated to your workflow.**
        path:

        # The file data as a string.
        data:

        # The name of a Garden secret to copy the file data from (Garden Enterprise only).
        secretName:

    # The number of hours to keep the workflow pod running after completion.
    keepAliveHours:

    limits:
      # The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU)
      cpu:

      # The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB)
      memory:

    # The steps the workflow should run. At least one step is required. Steps are run sequentially. If a step fails,
    # subsequent steps are skipped.
    steps:
      - # An identifier to assign to this step. If none is specified, this defaults to "step-<number of step>", where
        # <number of step> is the sequential number of the step (first step being number 1).
        #
        # This identifier is useful when referencing command outputs in following steps. For example, if you set this
        # to "my-step", following steps can reference the \${steps.my-step.outputs.*} key in the `script` or `command`
        # fields.
        name:

        # A Garden command this step should run, followed by any required or optional arguments and flags.
        # Arguments and options for the commands may be templated, including references to previous steps, but for now
        # the commands themselves (as listed below) must be hard-coded.
        #
        # Supported commands:
        #
        # `[build]`
        # `[delete, environment]`
        # `[delete, service]`
        # `[deploy]`
        # `[exec]`
        # `[get, config]`
        # `[get, outputs]`
        # `[get, status]`
        # `[get, task-result]`
        # `[get, test-result]`
        # `[link, module]`
        # `[link, source]`
        # `[publish]`
        # `[run, task]`
        # `[run, test]`
        # `[test]`
        # `[update-remote, all]`
        # `[update-remote, modules]`
        # `[update-remote, sources]`
        #
        #
        command:

        # A description of the workflow step.
        description:

        # A bash script to run. Note that the host running the workflow must have bash installed and on path.
        # It is considered to have run successfully if it returns an exit code of 0. Any other exit code signals an
        # error,
        # and the remainder of the workflow is aborted.
        #
        # The script may include template strings, including references to previous steps.
        script:

        # Set to true to skip this step. Use this with template conditionals to skip steps for certain environments or
        # scenarios.
        skip:

    # A list of triggers that determine when the workflow should be run, and which environment should be used (Garden
    # Enterprise only).
    triggers:
      - # The environment name (from your project configuration) to use for the workflow when matched by this trigger.
        environment:

        # The namespace to use for the workflow when matched by this trigger. Follows the namespacing setting used for
        # this trigger's environment, as defined in your project's environment configs.
        namespace:

        # A list of [GitHub
        # events](https://docs.github.com/en/developers/webhooks-and-events/webhook-events-and-payloads) that should
        # trigger this workflow.
        #
        # Supported events:
        #
        # `create`, `pull-request`, `pull-request-created`, `pull-request-updated`, `push`, `release`,
        # `release-created`, `release-deleted`, `release-edited`, `release-prereleased`, `release-published`,
        # `release-unpublished`
        #
        #
        events:

        # If specified, only run the workflow for branches matching one of these filters.
        branches:

        # If specified, only run the workflow for tags matching one of these filters.
        tags:

        # If specified, do not run the workflow for branches matching one of these filters.
        ignoreBranches:

        # If specified, do not run the workflow for tags matching one of these filters.
        ignoreTags:

# The name of the project.
projectName:

# The local path to the project root.
projectRoot:

# The project ID (Garden Enterprise only).
projectId:
```

### garden get linked-repos

**Outputs a list of all linked remote sources and modules for this project.**


| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden get linked-repos 



### garden get outputs

**Resolves and returns the outputs of the project.**

Resolves and returns the outputs of the project. If necessary, this may involve deploying services and/or running
tasks referenced by the outputs in the project configuration.

Examples:

    garden get outputs                 # resolve and print the outputs from the project
    garden get outputs --env=prod      # resolve and print the outputs from the project for the prod environment
    garden get outputs --output=json   # resolve and return the project outputs in JSON format

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden get outputs 


#### Outputs

```yaml
<name>:
```

### garden get status

**Outputs the full status of your environment.**


| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden get status 


#### Outputs

```yaml
# A map of statuses for each configured provider.
providers:
  # Description of an environment's status for a provider.
  <name>:
    # Set to true if the environment is fully configured for a provider.
    ready:

    # Use this to include additional information that is specific to the provider.
    detail:

    # Output variables that modules and other variables can reference.
    outputs:
      <name>:

    # Set to true to disable caching of the status.
    disableCache:

# A map of statuses for each configured service.
services:
  <name>:
    # When the service was first deployed by the provider.
    createdAt:

    # Additional detail, specific to the provider.
    detail:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

        # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # A map of values output from the service.
    outputs:
      <name>:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # When the service was last updated by the provider.
    updatedAt:

    # The Garden module version of the deployed service.
    version:

# A map of statuses for each configured task.
tasks:
  <name>:
    state:

    # When the last run was started (if applicable).
    startedAt:

    # When the last run completed (if applicable).
    completedAt:

# A map of statuses for each configured test.
tests:
  <name>:
    state:

    # When the last run was started (if applicable).
    startedAt:

    # When the last run completed (if applicable).
    completedAt:
```

### garden get tasks

**Lists the tasks defined in your project's modules.**


| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden get tasks [tasks] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `tasks` | No | Specify task(s) to list. Use comma as a separator to specify multiple tasks.



### garden get task-result

**Outputs the latest execution result of a provided task.**


| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden get task-result <name> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `name` | Yes | The name of the task


#### Outputs

```yaml
# The name of the module that the task belongs to.
moduleName:

# The name of the task that was run.
taskName:

# The command that the task ran in the module.
command:

# The string version of the task.
version:

# Whether the task was successfully run.
success:

# When the task run was started.
startedAt:

# When the task run was completed.
completedAt:

# The output log from the run.
log:

# A map of primitive values, output from the task.
outputs:
  # Number, string or boolean
  <name>:

# Local file paths to any exported artifacts from the task run.
artifacts:
```

### garden get test-result

**Outputs the latest execution result of a provided test.**


| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden get test-result <module> <name> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | Module name of where the test runs.
  | `name` | Yes | Test name.


#### Outputs

```yaml
# The name of the module that was run.
moduleName:

# The command that was run in the module.
command:

# Whether the module was successfully run.
success:

# The exit code of the run (if applicable).
exitCode:

# When the module run was started.
startedAt:

# When the module run was completed.
completedAt:

# The output log from the run.
log:

# A map of primitive values, output from the test.
outputs:
  # Number, string or boolean
  <name>:

# The name of the test that was run.
testName:

# The test run's version, as a string. In addition to the parent module's version, this also factors in the module
# versions of the test's runtime dependencies (if any).
version:

# Local file paths to any exported artifacts from the test run.
artifacts:
```

### garden get debug-info

**Outputs the status of your environment for debug purposes.**

Examples:

garden get debug-info                    # create a zip file at the root of the project with debug information
garden get debug-info --format yaml      # output provider info as YAML files (default is JSON)
garden get debug-info --include-project  # include provider info for the project namespace (disabled by default)

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden get debug-info [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--format` |  | `json` `yaml`  | The output format for plugin-generated debug info.
  | `--include-project` |  | boolean | Include project-specific information from configured providers.
Note that this may include sensitive data, depending on the provider and your configuration.


### garden link source

**Link a remote source to a local directory.**

After linking a remote source, Garden will read it from its local directory instead of
from the remote URL. Garden can only link remote sources that have been declared in the project
level `garden.yml` config.

Examples:

    garden link source my-source path/to/my-source # links my-source to its local version at the given path

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden link source <source> <path> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `source` | Yes | Name of the source to link as declared in the project config.
  | `path` | Yes | Path to the local directory that containes the source.


#### Outputs

```yaml
# A list of all locally linked external sources.
sources:
  - # The name of the linked source.
    name:

    # The local directory path of the linked repo clone.
    path:
```

### garden link module

**Link a module to a local directory.**

After linking a remote module, Garden will read the source from the module's local directory instead of from
the remote URL. Garden can only link modules that have a remote source,
i.e. modules that specifiy a `repositoryUrl` in their `garden.yml` config file.

Examples:

    garden link module my-module path/to/my-module # links my-module to its local version at the given path

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden link module <module> <path> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | Name of the module to link.
  | `path` | Yes | Path to the local directory that containes the module.


#### Outputs

```yaml
# A list of all locally linked external modules.
sources:
  - # The name of the linked module.
    name:

    # The local directory path of the linked repo clone.
    path:
```

### garden logs

**Retrieves the most recent logs for the specified service(s).**

Outputs logs for all or specified services, and optionally waits for news logs to come in.

Examples:

    garden logs               # prints latest logs from all services
    garden logs my-service    # prints latest logs for my-service
    garden logs -t            # keeps running and streams all incoming logs to the console

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden logs [services] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `services` | No | The name(s) of the service(s) to log (skip to log all services). Use comma as a separator to specify multiple services.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--follow` | `-f` | boolean | Continuously stream new logs from the service(s).
  | `--tail` | `-t` | number | Number of lines to show for each service. Defaults to -1, showing all log lines.


### garden migrate

**Migrate `garden.yml` configuration files to version v0.11.x**

Scans the project for `garden.yml` configuration files and updates those that are not compatible with version v0.11.
By default the command prints the updated versions to the terminal. You can optionally update the files in place with the `write` flag.

Note: This command does not validate the configs per se. It will simply try to convert a given configuration file so that
it is compatible with version v0.11 or greater, regardless of whether that file was ever a valid Garden config. It is therefore
recommended that this is used on existing `garden.yml` files that were valid in version v0.10.x.

Examples:

    garden migrate              # scans all garden.yml files and prints the updated versions along with the paths to them.
    garden migrate --write      # scans all garden.yml files and overwrites them with the updated versions.
    garden migrate ./garden.yml # scans the provided garden.yml file and prints the updated version.

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden migrate [configPaths] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `configPaths` | No | Specify the path to a &#x60;garden.yml&#x60; file to convert. Use comma as a separator to specify multiple files.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--write` |  | boolean | Update the &#x60;garden.yml&#x60; in place.


### garden options

**Print global options.**

Prints all global options (options that can be applied to any command).

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden options 



### garden plugins

**Plugin-specific commands.**

Execute a command defined by a plugin in your project.
Run without arguments to get a list of all plugin commands available.
Run with just the plugin name to get a list of commands provided by that plugin.

Examples:

    # Run the `cleanup-cluster-registry` command from the `kubernetes` plugin.
    garden plugins kubernetes cleanup-cluster-registry

    # List all available commands.
    garden plugins

    # List all the commands from the `kubernetes` plugin.
    garden plugins kubernetes

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden plugins [plugin] [command] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `plugin` | No | The name of the plugin, whose command you wish to run.
  | `command` | No | The name of the command to run.



### garden publish

**Build and publish module(s) to a remote registry.**

Publishes built module artifacts for all or specified modules.
Also builds modules and dependencies if needed.

Examples:

    garden publish                # publish artifacts for all modules in the project
    garden publish my-container   # only publish my-container
    garden publish --force-build  # force re-build of modules before publishing artifacts
    garden publish --allow-dirty  # allow publishing dirty builds (which by default triggers error)

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden publish [modules] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the module(s) to publish (skip to publish all modules). Use comma as a separator to specify multiple modules.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force-build` |  | boolean | Force rebuild of module(s) before publishing.
  | `--allow-dirty` |  | boolean | Allow publishing dirty builds (with untracked/uncommitted changes).

#### Outputs

```yaml
# A map of all modules that were built (or builds scheduled/attempted for) and information about the builds.
builds:
  <module name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all services that were deployed (or deployment scheduled/attempted for) and the service status.
deployments:
  <service name>:
    # When the service was first deployed by the provider.
    createdAt:

    # Additional detail, specific to the provider.
    detail:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

        # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # A map of values output from the service.
    outputs:
      <name>:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # When the service was last updated by the provider.
    updatedAt:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all tests that were run (or scheduled/attempted) and the test results.
tests:
  <test name>:
    # The name of the module that was run.
    moduleName:

    # The command that was run in the module.
    command:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

    # A map of primitive values, output from the test.
    outputs:
      # Number, string or boolean
      <name>:

    # The name of the test that was run.
    testName:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all raw graph results. Avoid using this programmatically if you can, and use more structured keys instead.
graphResults:

# A map of all modules that were published (or scheduled/attempted for publishing) and the results.
published:
  <name>:
    # Set to true if the module was published.
    published:

    # Optional result message from the provider.
    message:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:
```

### garden run module

**Run an ad-hoc instance of a module.**

This is useful for debugging or ad-hoc experimentation with modules.

Examples:

    garden run module my-container                                   # run an ad-hoc instance of a my-container container and attach to it
    garden run module my-container /bin/sh                           # run an interactive shell in a new my-container container
    garden run module my-container --interactive=false /some/script  # execute a script in my-container and return the output

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden run module <module> [arguments] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | The name of the module to run.
  | `arguments` | No | The arguments to run the module with. Example: &#x27;yarn run my-script&#x27;.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` |  | boolean | Set to false to skip interactive mode and just output the command result.
  | `--force-build` |  | boolean | Force rebuild of module before running.
  | `--command` | `-c` | array:string | The base command (a.k.a. entrypoint) to run in the module. For container modules, for example, this overrides the image&#x27;s default command/entrypoint. This option may not be relevant for all module types. Example: &#x27;/bin/sh -c&#x27;.


### garden run service

**Run an ad-hoc instance of the specified service.**

This can be useful for debugging or ad-hoc experimentation with services.

Examples:

    garden run service my-service   # run an ad-hoc instance of a my-service and attach to it

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden run service <service> [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | Yes | The service to run.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Run the service even if it&#x27;s disabled for the environment.
  | `--force-build` |  | boolean | Force rebuild of module.


### garden run task

**Run a task (in the context of its parent module).**

This is useful for re-running tasks ad-hoc, for example after writing/modifying database migrations.

Examples:

    garden run task my-db-migration   # run my-migration

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden run task <task> [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `task` | Yes | The name of the task to run.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Run the task even if it&#x27;s disabled for the environment.
  | `--force-build` |  | boolean | Force rebuild of module before running.

#### Outputs

```yaml
# The result of the task.
result:
  # The name of the module that the task belongs to.
  moduleName:

  # The name of the task that was run.
  taskName:

  # The command that the task ran in the module.
  command:

  # When the task run was started.
  startedAt:

  # When the task run was completed.
  completedAt:

  # The output log from the run.
  log:

  # A map of primitive values, output from the task.
  outputs:
    # Number, string or boolean
    <name>:

  # Set to true if the build was not attempted, e.g. if a dependency build failed.
  aborted:

  # The duration of the build in msec, if applicable.
  durationMsec:

  # Whether the build was succeessful.
  success:

  # An error message, if the build failed.
  error:

  # The version of the module, service, task or test.
  version:

# A map of all raw graph results. Avoid using this programmatically if you can, and use more structured keys instead.
graphResults:
```

### garden run test

**Run the specified module test.**

This can be useful for debugging tests, particularly integration/end-to-end tests.

Examples:

    garden run test my-module integ                      # run the test named 'integ' in my-module
    garden run test my-module integ --interactive=false  # do not attach to the test run, just output results when completed

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden run test <module> <test> [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | The name of the module to run.
  | `test` | Yes | The name of the test to run in the module.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` | `-i` | boolean | Set to false to skip interactive mode and just output the command result. Note that Garden won&#x27;t retrieve artifacts if set to true (the default).
  | `--force` |  | boolean | Run the test even if it&#x27;s disabled for the environment.
  | `--force-build` |  | boolean | Force rebuild of module before running.

#### Outputs

```yaml
# The result of the test.
result:
  # The name of the module that was run.
  moduleName:

  # The command that was run in the module.
  command:

  # The exit code of the run (if applicable).
  exitCode:

  # When the module run was started.
  startedAt:

  # When the module run was completed.
  completedAt:

  # The output log from the run.
  log:

  # A map of primitive values, output from the test.
  outputs:
    # Number, string or boolean
    <name>:

  # The name of the test that was run.
  testName:

  # Set to true if the build was not attempted, e.g. if a dependency build failed.
  aborted:

  # The duration of the build in msec, if applicable.
  durationMsec:

  # Whether the build was succeessful.
  success:

  # An error message, if the build failed.
  error:

  # The version of the module, service, task or test.
  version:

# A map of all raw graph results. Avoid using this programmatically if you can, and use more structured keys instead.
graphResults:
```

### garden run workflow

**Run a workflow.**

Runs the commands and/or scripts defined in the workflow's steps, in sequence.

Examples:

    garden run workflow my-workflow    # run my-workflow

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden run workflow <workflow> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `workflow` | Yes | The name of the workflow to be run.



### garden scan

**Scans your project and outputs an overview of all modules.**


| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden scan 



### garden dashboard

**Starts the Garden dashboard for the current project and environment.**

Starts the Garden dashboard for the current project, and your selected environment+namespace. The dashboard can be used to monitor your Garden project, look at logs, provider-specific dashboard pages and more.

The dashboard will receive and display updates from other Garden processes that you run with the same Garden project, environment and namespace.

Note: You must currently run one dashboard per-environment and namespace.

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden dashboard [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--port` |  | number | The port number for the Garden dashboard to listen on.


### garden test

**Test all or specified modules.**

Runs all or specified tests defined in the project. Also builds modules and dependencies,
and deploys service dependencies if needed.

Optionally stays running and automatically re-runs tests if their module source
(or their dependencies' sources) change.

Examples:

    garden test               # run all tests in the project
    garden test my-module     # run all tests in the my-module module
    garden test --name integ  # run all tests with the name 'integ' in the project
    garden test --name integ* # run all tests with the name starting with 'integ' in the project
    garden test --force       # force tests to be re-run, even if they've already run successfully
    garden test --watch       # watch for changes to code

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden test [modules] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the module(s) to test (skip to test all modules). Use comma as a separator to specify multiple modules.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--name` | `-n` | string | Only run tests with the specfied name (e.g. unit or integ). Accepts glob patterns (e.g. integ* would run both &#x27;integ&#x27; and &#x27;integration&#x27;)
  | `--force` | `-f` | boolean | Force re-test of module(s).
  | `--force-build` |  | boolean | Force rebuild of module(s).
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-test.

#### Outputs

```yaml
# A map of all modules that were built (or builds scheduled/attempted for) and information about the builds.
builds:
  <module name>:
    # The full log from the build.
    buildLog:

    # Set to true if the build was fetched from a remote registry.
    fetched:

    # Set to true if the build was performed, false if it was already built, or fetched from a registry
    fresh:

    # Additional information, specific to the provider.
    details:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all services that were deployed (or deployment scheduled/attempted for) and the service status.
deployments:
  <service name>:
    # When the service was first deployed by the provider.
    createdAt:

    # Additional detail, specific to the provider.
    detail:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The protocol of the port.
        protocol:

        # The target name/hostname to forward to (defaults to the service name).
        targetName:

        # The target port on the service.
        targetPort:

        # The protocol to use for URLs pointing at the port. This can be any valid URI protocol.
        urlProtocol:

    # List of currently deployed ingress endpoints for the service.
    ingresses:
      - # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

        # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

    # Latest status message of the service (if any).
    lastMessage:

    # Latest error status message of the service (if any).
    lastError:

    # A map of values output from the service.
    outputs:
      <name>:

    # How many replicas of the service are currently running.
    runningReplicas:

    # The current deployment status of the service.
    state:

    # When the service was last updated by the provider.
    updatedAt:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all tests that were run (or scheduled/attempted) and the test results.
tests:
  <test name>:
    # The name of the module that was run.
    moduleName:

    # The command that was run in the module.
    command:

    # The exit code of the run (if applicable).
    exitCode:

    # When the module run was started.
    startedAt:

    # When the module run was completed.
    completedAt:

    # The output log from the run.
    log:

    # A map of primitive values, output from the test.
    outputs:
      # Number, string or boolean
      <name>:

    # The name of the test that was run.
    testName:

    # Set to true if the build was not attempted, e.g. if a dependency build failed.
    aborted:

    # The duration of the build in msec, if applicable.
    durationMsec:

    # Whether the build was succeessful.
    success:

    # An error message, if the build failed.
    error:

    # The version of the module, service, task or test.
    version:

# A map of all raw graph results. Avoid using this programmatically if you can, and use more structured keys instead.
graphResults:
```

### garden tools

**Access tools included by providers.**

Run a tool defined by a provider in your project, downloading and extracting it if necessary. Run without arguments to get a list of all tools available.

Run with the --get-path flag to just print the path to the binary or library directory (depending on the tool type). If the tool is a non-executable library, this flag is implicit.

When multiple plugins provide a tool with the same name, you can choose a specific plugin/version by specifying <plugin name>.<tool name>, instead of just <tool name>. This is generally advisable when using this command in scripts, to avoid accidental conflicts.

When there are name conflicts and a plugin name is not specified, we first prefer tools defined by configured providers in the current project (if applicable), and then alphabetical by plugin name.

Examples:

    # Run kubectl with <args>.
    garden tools kubectl -- <args>

    # Run the kubectl version defined specifically by the `kubernetes` plugin.
    garden tools kubernetes.kubectl -- <args>

    # Print the path to the kubernetes.kubectl tool to stdout, instead of running it.
    garden tools kubernetes.kubectl --get-path

    # List all available tools.
    garden tools

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden tools [tool] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `tool` | No | The name of the tool to run.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--get-path` |  | boolean | If specified, we print the path to the binary or library instead of running it.


### garden unlink source

**Unlink a previously linked remote source from its local directory.**

After unlinking a remote source, Garden will go back to reading it from its remote URL instead
of its local directory.

Examples:

    garden unlink source my-source  # unlinks my-source
    garden unlink source --all      # unlinks all sources

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden unlink source [sources] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `sources` | No | The name(s) of the source(s) to unlink. Use comma as a separator to specify multiple sources.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` | `-a` | boolean | Unlink all sources.


### garden unlink module

**Unlink a previously linked remote module from its local directory.**

After unlinking a remote module, Garden will go back to reading the module's source from
its remote URL instead of its local directory.

Examples:

    garden unlink module my-module  # unlinks my-module
    garden unlink module --all      # unlink all modules

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden unlink module [modules] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the module(s) to unlink. Use comma as a separator to specify multiple modules.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` | `-a` | boolean | Unlink all modules.


### garden update-remote sources

**Update remote sources.**

Updates the remote sources declared in the project level `garden.yml` config file.

Examples:

    garden update-remote sources            # update all remote sources
    garden update-remote sources my-source  # update remote source my-source

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden update-remote sources [sources] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `sources` | No | The name(s) of the remote source(s) to update. Use comma as a separator to specify multiple sources.


#### Outputs

```yaml
# A list of all configured external project sources.
sources:
  - # The name of the source to import
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:
```

### garden update-remote modules

**Update remote modules.**

Updates remote modules, i.e. modules that have a `repositoryUrl` field
in their `garden.yml` config that points to a remote repository.

Examples:

    garden update-remote modules            # update all remote modules in the project
    garden update-remote modules my-module  # update remote module my-module

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden update-remote modules [modules] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the remote module(s) to update. Use comma as a separator to specify multiple modules.


#### Outputs

```yaml
# A list of all external module sources in the project.
sources:
  - # The name of the module.
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:
```

### garden update-remote all

**Update all remote sources and modules.**

Examples:

    garden update-remote all # update all remote sources and modules in the project

| Supported in workflows |   |
| ---------------------- |---|
| Yes |                                                  |

#### Usage

    garden update-remote all 


#### Outputs

```yaml
# A list of all configured external project sources.
projectSources:
  - # The name of the source to import
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:

# A list of all external module sources in the project.
moduleSources:
  - # The name of the module.
    name:

    # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a specific
    # branch or tag, with the format: <git remote url>#<branch|tag>
    repositoryUrl:
```

### garden util fetch-tools

**Pre-fetch plugin tools.**

Pre-fetch all the available tools for the configured providers in the current
project/environment, or all registered providers if the --all parameter is
specified.

Examples:

    garden util fetch-tools        # fetch for just the current project/env
    garden util fetch-tools --all  # fetch for all registered providers

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden util fetch-tools [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` |  | boolean | Fetch all tools for registered plugins, instead of just ones in the current env/project.


### garden util hide-warning

**Hide a specific warning message.**

Hides the specified warning message. The command and key is generally provided along with displayed warning messages.

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden util hide-warning <key> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `key` | Yes | The key of the warning to hide (this will be shown along with relevant warning messages).



### garden validate

**Check your garden configuration for errors.**

Throws an error and exits with code 1 if something's not right in your garden.yml files.

| Supported in workflows |   |
| ---------------------- |---|
| No |                                                  |

#### Usage

    garden validate 



