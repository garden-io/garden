---
order: 30
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
  | `--logger-type` |  | `quiet` `basic` `fancy` `json`  | Set logger type. fancy updates log lines in-place when their status changes (e.g. when tasks complete), basic appends a new log line when a log line&#x27;s status changes, json same as basic, but renders log lines as JSON, quiet suppresses all log output, same as --silent.
  | `--log-level` | `-l` | `error` `warn` `info` `verbose` `debug` `silly` `0` `1` `2` `3` `4` `5`  | Set logger level. Values can be either string or numeric and are prioritized from 0 to 5 (highest to lowest) as follows: error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5.
  | `--output` | `-o` | `json` `yaml`  | Output command result in specified format (note: disables progress logging and interactive functionality).
  | `--emoji` |  | boolean | Enable emoji in output (defaults to true if the environment supports it).
  | `--show-timestamps` |  | boolean | Show timestamps with log output. When enabled, Garden will use the basic logger. I.e., log status changes are rendered as new lines instead of being updated in-place.
  | `--yes` | `-y` | boolean | Automatically approve any yes/no prompts during execution.
  | `--force-refresh` |  | boolean | Force refresh of any caches, e.g. cached provider statuses.
  | `--var` |  | array:string | Set a specific variable value, using the format &lt;key&gt;&#x3D;&lt;value&gt;, e.g. &#x60;--var some-key&#x3D;custom-value&#x60;. This will override any value set in your project configuration. You can specify multiple variables by separating with a comma, e.g. &#x60;--var key-a&#x3D;foo,key-b&#x3D;&quot;value with quotes&quot;&#x60;.
  | `--version` | `-v` | boolean | Show the current CLI version.
  | `--help` | `-h` | boolean | Show help
  | `--disable-port-forwards` |  | boolean | Disable automatic port forwarding when in watch/hot-reload mode. Note that you can also set GARDEN_DISABLE_PORT_FORWARDS&#x3D;true in your environment.

### garden build

**Build your modules.**

Builds all or specified modules, taking into account build dependency order.
Optionally stays running and automatically builds modules if their source (or their dependencies' sources) change.

Examples:

    garden build            # build all modules in the project
    garden build my-module  # only build my-module
    garden build --force    # force rebuild of modules
    garden build --watch    # watch for changes to code

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
  | `--with-dependants` |  | boolean | Also rebuild modules that have build dependencies on one of the modules specified as CLI arguments (recursively). Note: This option has no effect unless a list of module names is specified as CLI arguments (since then, every module in the project will be rebuilt).

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

    # Whether the service was deployed with dev mode enabled.
    devMode:

    # Whether the service was deployed with local mode enabled.
    localMode:

    namespaceStatuses:
      - pluginName:

        # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash) and must not be longer than 63 characters.
        namespaceName:

        state:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

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
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

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

    namespaceStatus:
      pluginName:

      # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
      # letter, and cannot end with a dash) and must not be longer than 63 characters.
      namespaceName:

      state:

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

#### Usage

    garden create project [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--skip-comments` |  | boolean | Set to true to disable comment generation.
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

#### Usage

    garden create module [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--skip-comments` |  | boolean | Set to true to disable comment generation.
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

    namespaceStatuses:
      - pluginName:

        # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash) and must not be longer than 63 characters.
        namespaceName:

        state:

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

    # Whether the service was deployed with dev mode enabled.
    devMode:

    # Whether the service was deployed with local mode enabled.
    localMode:

    namespaceStatuses:
      - pluginName:

        # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash) and must not be longer than 63 characters.
        namespaceName:

        state:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

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
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

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

Deletes (i.e. un-deploys) the specified services. Deletes all services in the project if no arguments are provided.
Note that this command does not take into account any services depending on the deleted service/services, and might
therefore leave the project in an unstable state. Running `garden deploy` will re-deploy any missing services.

Examples:

    garden delete service my-service # deletes my-service
    garden delete service            # deletes all deployed services in the project

#### Usage

    garden delete service [services] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `services` | No | The name(s) of the service(s) to delete. Use comma as a separator to specify multiple services.


#### Outputs

```yaml
<name>:
  # When the service was first deployed by the provider.
  createdAt:

  # Additional detail, specific to the provider.
  detail:

  # Whether the service was deployed with dev mode enabled.
  devMode:

  # Whether the service was deployed with local mode enabled.
  localMode:

  namespaceStatuses:
    - pluginName:

      # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
      # letter, and cannot end with a dash) and must not be longer than 63 characters.
      namespaceName:

      state:

  # The ID used for the service by the provider (if not the same as the service name).
  externalId:

  # The provider version of the deployed service (if different from the Garden module version.
  externalVersion:

  # A list of ports that can be forwarded to from the Garden agent by the provider.
  forwardablePorts:
    - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
      name:

      # The preferred local port to use for forwarding.
      preferredLocalPort:

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
    - # The port number that the service is exposed on internally.
      # This defaults to the first specified port for the service.
      port:

      # The ingress path that should be matched to route to this service.
      path:

      # The protocol to use for the ingress.
      protocol:

      # The hostname where the service can be accessed.
      hostname:

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
    garden deploy --dev=my-service     # deploys all services, with dev mode enabled for my-service
    garden deploy --dev                # deploys all compatible services with dev mode enabled
    garden deploy --env stage          # deploy your services to an environment called stage
    garden deploy --skip service-b     # deploy all services except service-b

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
  | `--dev-mode` | `-dev` | array:string | The name(s) of the service(s) to deploy with dev mode enabled. Use comma as a separator to specify multiple services. Use * to deploy all services with dev mode enabled. When this option is used, the command is run in watch mode (i.e. implicitly sets the --watch/-w flag).
  | `--hot-reload` | `-hot` | array:string | The name(s) of the service(s) to deploy with hot reloading enabled. Use comma as a separator to specify multiple services. Use * to deploy all services with hot reloading enabled (ignores services belonging to modules that don&#x27;t support or haven&#x27;t configured hot reloading). When this option is used, the command is run in watch mode (i.e. implicitly sets the --watch/-w flag).
  | `--local-mode` | `-local` | array:string | [EXPERIMENTAL] The name(s) of the service(s) to be started locally with local mode enabled. Use comma as a separator to specify multiple services. Use * to deploy all services with local mode enabled. When this option is used, the command is run in persistent mode.
  | `--skip` |  | array:string | The name(s) of services you&#x27;d like to skip when deploying.
  | `--skip-dependencies` | `-no-deps` | boolean | Deploy the specified services, but don&#x27;t deploy any additional services that they depend on or run any tasks that they depend on. This option can only be used when a list of service names is passed as CLI arguments. This can be useful e.g. when your stack has already been deployed, and you want to deploy a subset of services in dev mode without redeploying any service dependencies that may have changed since you last deployed.
  | `--forward` |  | boolean | Create port forwards and leave process running without watching for changes. Ignored if --watch/-w flag is set or when in dev or hot-reload mode.

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

    # Whether the service was deployed with dev mode enabled.
    devMode:

    # Whether the service was deployed with local mode enabled.
    localMode:

    namespaceStatuses:
      - pluginName:

        # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash) and must not be longer than 63 characters.
        namespaceName:

        state:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

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
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

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

    namespaceStatus:
      pluginName:

      # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
      # letter, and cannot end with a dash) and must not be longer than 63 characters.
      namespaceName:

      state:

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
    garden dev --force                        # force redeploy of services when the command starts
    garden dev --name integ                   # run all tests with the name 'integ' in the project
    garden test --name integ*                 # run all tests with the name starting with 'integ' in the project

#### Usage

    garden dev [services] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `services` | No | Specify which services to develop (defaults to all configured services).

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force redeploy of service(s).
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

### garden cloud secrets list

**[EXPERIMENTAL] List secrets.**

List all secrets from Garden Cloud. Optionally filter on environment, user IDs, or secret names.

Examples:
    garden cloud secrets list                                          # list all secrets
    garden cloud secrets list --filter-envs dev                        # list all secrets from the dev environment
    garden cloud secrets list --filter-envs dev --filter-names *_DB_*  # list all secrets from the dev environment that have '_DB_' in their name.

#### Usage

    garden cloud secrets list [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--filter-envs` |  | array:string | Filter on environment. Use comma as a separator to filter on multiple environments. Accepts glob patterns.&quot;
  | `--filter-user-ids` |  | array:string | Filter on user ID. Use comma as a separator to filter on multiple user IDs. Accepts glob patterns.
  | `--filter-names` |  | array:string | Filter on secret name. Use comma as a separator to filter on multiple secret names. Accepts glob patterns.


### garden cloud secrets create

**[EXPERIMENTAL] Create secrets**

Create secrets in Garden Cloud. You can create project wide secrets or optionally scope
them to an environment, or an environment and a user.

To scope secrets to a user, you will need the user's ID which you can get from the
`garden cloud users list` command.

You can optionally read the secrets from a file.

Examples:
    garden cloud secrets create DB_PASSWORD=my-pwd,ACCESS_KEY=my-key   # create two secrets
    garden cloud secrets create ACCESS_KEY=my-key --scope-to-env ci    # create a secret and scope it to the ci environment
    garden cloud secrets create ACCESS_KEY=my-key --scope-to-env ci --scope-to-user 9  # create a secret and scope it to the ci environment and user with ID 9
    garden cloud secrets create --from-file /path/to/secrets.txt  # create secrets from the key value pairs in the secrets.txt file

#### Usage

    garden cloud secrets create [secrets] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `secrets` | No | The names and values of the secrets to create, separated by &#x27;&#x3D;&#x27;. Use comma as a separator to specify multiple secret name/value pairs. Note that you can also leave this empty and have Garden read the secrets from file.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--scope-to-user-id` |  | number | Scope the secret to a user with the given ID. User scoped secrets must be scoped to an environment as well.
  | `--scope-to-env` |  | string | Scope the secret to an environment. Note that this does not default to the environment that the command runs in (i.e. the one set via the --env flag) and that you need to set this explicitly if you want to create an environment scoped secret.
  | `--from-file` |  | path | Read the secrets from the file at the given path. The file should have standard &quot;dotenv&quot; format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).


### garden cloud secrets delete

**[EXPERIMENTAL] Delete secrets.**

Delete secrets in Garden Cloud. You will nee the IDs of the secrets you want to delete,
which you which you can get from the `garden cloud secrets list` command.

Examples:
    garden cloud secrets delete 1,2,3   # delete secrets with IDs 1,2, and 3.

#### Usage

    garden cloud secrets delete [ids] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `ids` | No | The IDs of the secrets to delete.



### garden cloud users list

**[EXPERIMENTAL] List users.**

List all users from Garden Cloud. Optionally filter on group names or user names.

Examples:
    garden cloud users list                            # list all users
    garden cloud users list --filter-names Gordon*     # list all the Gordons in Garden Cloud. Useful if you have a lot of Gordons.
    garden cloud users list --filter-groups devs-*     # list all users in groups that with names that start with 'dev-'

#### Usage

    garden cloud users list [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--filter-names` |  | array:string | Filter on user name. Use comma as a separator to filter on multiple names. Accepts glob patterns.
  | `--filter-groups` |  | array:string | Filter on the groups the user belongs to. Use comma as a separator to filter on multiple groups. Accepts glob patterns.


### garden cloud users create

**[EXPERIMENTAL] Create users**

Create users in Garden Cloud and optionally add the users to specific groups.
You can get the group IDs from the `garden cloud users list` command.

To create a user, you'll need their GitHub or GitLab username, depending on which one is your VCS provider, and the name
they should have in Garden Cloud. Note that it **must** the their GitHub/GitLab username, not their email, as people
can have several emails tied to their GitHub/GitLab accounts.

You can optionally read the users from a file. The file must have the format vcs-username="Actual Username". For example:

fatema_m="Fatema M"
gordon99="Gordon G"

Examples:
    garden cloud users create fatema_m="Fatema M",gordon99="Gordon G"      # create two users
    garden cloud users create fatema_m="Fatema M" --add-to-groups 1,2  # create a user and add two groups with IDs 1,2
    garden cloud users create --from-file /path/to/users.txt           # create users from the key value pairs in the users.txt file

#### Usage

    garden cloud users create [users] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `users` | No | The VCS usernames and the names of the users to create, separated by &#x27;&#x3D;&#x27;. Use comma as a separator to specify multiple VCS username/name pairs. Note that you can also leave this empty and have Garden read the users from file.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--add-to-groups` |  | array:string | Add the user to the group with the given ID. Use comma as a separator to add the user to multiple groups.
  | `--from-file` |  | path | Read the users from the file at the given path. The file should have standard &quot;dotenv&quot; format (as defined by [dotenv](https://github.com/motdotla/dotenv#rules)) where the VCS username is the key and the name is the value.


### garden cloud users delete

**[EXPERIMENTAL] Delete users.**

Delete users in Garden Cloud. You will nee the IDs of the users you want to delete,
which you which you can get from the `garden cloud users list` command.

Examples:
    garden cloud users delete 1,2,3   # delete users with IDs 1,2, and 3.

#### Usage

    garden cloud users delete [ids] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `ids` | No | The IDs of the users to delete.



### garden cloud groups list

**[EXPERIMENTAL] List groups.**

List all groups from Garden Cloud. This is useful for getting the group IDs when creating
users via the `garden cloud users create` command.

Examples:
    garden cloud groups list                       # list all groups
    garden cloud groups list --filter-names dev-*  # list all groups that start with 'dev-'

#### Usage

    garden cloud groups list [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--filter-names` |  | array:string | Filter on group name. Use comma as a separator to filter on multiple names. Accepts glob patterns.


### garden get graph

**Outputs the dependency relationships specified in this project's garden.yml files.**


#### Usage

    garden get graph 



### garden get config

**Outputs the full configuration for this project and environment.**


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
  - # The name of the provider plugin to use.
    name:

    # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
    # disables the provider. To use a provider in all environments, omit this field.
    environments:

    # Map of all the providers that this provider depends on.
    dependencies:
      <name>:

    config:
      # The name of the provider plugin to use.
      name:

      # List other providers that should be resolved before this one.
      dependencies:

      # If specified, this provider will only be used in the listed environments. Note that an empty array effectively
      # disables the provider. To use a provider in all environments, omit this field.
      environments:

    moduleConfigs:
      - # The schema version of this config (currently not used).
        apiVersion:

        kind:

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
                  target:

          # Maximum time in seconds to wait for build to finish.
          timeout:

        # A description of the module.
        description:

        # Set this to `true` to disable the module. You can use this with conditional template strings to disable
        # modules based on, for example, the current environment or other variables (e.g. `disabled:
        # \${environment.name == "prod"}`). This can be handy when you only need certain modules for specific
        # environments, e.g. only for development.
        #
        # Disabling a module means that any services, tasks and tests contained in it will not be deployed or run. It
        # also means that the module is not built _unless_ it is declared as a build dependency by another enabled
        # module (in which case building this module is necessary for the dependant to be built).
        #
        # If you disable the module, and its services, tasks or tests are referenced as _runtime_ dependencies, Garden
        # will automatically ignore those dependency declarations. Note however that template strings referencing the
        # module's service or task outputs (i.e. runtime outputs) will fail to resolve when the module is disabled, so
        # you need to make sure to provide alternate values for those if you're using them, using conditional
        # expressions.
        disabled:

        # Specify a list of POSIX-style paths or globs that should be regarded as the source files for this module.
        # Files that do *not* match these paths or globs are excluded when computing the version of the module, when
        # responding to filesystem watch events, and when staging builds.
        #
        # Note that you can also _exclude_ files using the `exclude` field or by placing `.gardenignore` files in your
        # source tree, which use the same format as `.gitignore` files. See the [Configuration Files
        # guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories)
        # for details.
        #
        # Also note that specifying an empty list here means _no sources_ should be included.
        include:

        # Specify a list of POSIX-style paths or glob patterns that should be excluded from the module. Files that
        # match these paths or globs are excluded when computing the version of the module, when responding to
        # filesystem watch events, and when staging builds.
        #
        # Note that you can also explicitly _include_ files using the `include` field. If you also specify the
        # `include` field, the files/patterns specified here are filtered from the files matched by `include`. See the
        # [Configuration Files
        # guide](https://docs.garden.io/using-garden/configuration-overview#including-excluding-files-and-directories)
        # for details.
        #
        # Unlike the `modules.exclude` field in the project config, the filters here have _no effect_ on which files
        # and directories are watched for changes. Use the project `modules.exclude` field to affect those, if you
        # have large directories that should not be watched for changes.
        exclude:

        # A remote repository URL. Currently only supports git servers. Must contain a hash suffix pointing to a
        # specific branch or tag, with the format: <git remote url>#<branch|tag>
        #
        # Garden will import the repository source code into this module, but read the module's config from the local
        # garden.yml file.
        repositoryUrl:

        # When false, disables pushing this module to remote registries.
        allowPublish:

        # A map of variables scoped to this particular module. These are resolved before any other parts of the module
        # configuration and take precedence over project-scoped variables. They may reference project-scoped
        # variables, and generally use any template strings normally allowed when resolving modules.
        variables:
          <name>:

        # Specify a path (relative to the module root) to a file containing variables, that we apply on top of the
        # module-level `variables` field.
        #
        # The format of the files is determined by the configured file's extension:
        #
        # * `.env` - Standard "dotenv" format, as defined by [dotenv](https://github.com/motdotla/dotenv#rules).
        # * `.yaml`/`.yml` - YAML. The file must consist of a YAML document, which must be a map (dictionary). Keys
        # may contain any value type.
        # * `.json` - JSON. Must contain a single JSON _object_ (not an array).
        #
        # _NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of
        # nested objects and arrays._
        #
        # To use different module-level varfiles in different environments, you can template in the environment name
        # to the varfile name, e.g. `varfile: "my-module.\$\{environment.name\}.env` (this assumes that the
        # corresponding
        # varfiles exist).
        varfile:

        # The filesystem path of the module.
        path:

        # The filesystem path of the module config file.
        configPath:

        # The resolved build configuration of the module. If this is returned by the configure handler for the module
        # type, we can provide more granular versioning for the module, with a separate build version (i.e. module
        # version), as well as separate service, task and test versions, instead of applying the same version to all
        # of them.
        #
        # When this is specified, it is **very important** that this field contains all configurable (or otherwise
        # dynamic) parameters that will affect the built artifacts/images, aside from source files that is (the hash
        # of those is separately computed).
        buildConfig:

        # List of services configured by this module.
        serviceConfigs:
          - # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
            # letter, and cannot end with a dash), cannot contain consecutive dashes or start with `garden`, or be
            # longer than 63 characters.
            name:

            # The names of any services that this service depends on at runtime, and the names of any tasks that
            # should be executed before this service is deployed.
            dependencies:

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
            disabled:

            # Set this to true if the module and service configuration supports hot reloading.
            hotReloadable:

            # The `validate` module action should populate this, if the service's code sources are contained in a
            # separate module from the parent module. For example, when the service belongs to a module that contains
            # manifests (e.g. a Helm chart), but the actual code lives in a different module (e.g. a container
            # module).
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

            # Set this to `true` to disable the task. You can use this with conditional template strings to
            # enable/disable tasks based on, for example, the current environment or other variables (e.g. `enabled:
            # \${environment.name != "prod"}`). This can be handy when you only want certain tasks to run in specific
            # environments, e.g. only for development.
            #
            # Disabling a task means that it will not be run, and will also be ignored if it is declared as a runtime
            # dependency for another service, test or task.
            #
            # Note however that template strings referencing the task's outputs (i.e. runtime outputs) will fail to
            # resolve when the task is disabled, so you need to make sure to provide alternate values for those if
            # you're using them, using conditional expressions.
            disabled:

            # Maximum duration (in seconds) of the task's execution.
            timeout:

            # Set to false if you don't want the task's result to be cached. Use this if the task needs to be run any
            # time your project (or one or more of the task's dependants) is deployed. Otherwise the task is only
            # re-run when its version changes (i.e. the module or one of its dependencies is modified), or when you
            # run `garden run task`.
            cacheResult:

            # The task's specification, as defined by its provider plugin.
            spec:

        # List of tests configured by this module.
        testConfigs:
          - # The name of the test.
            name:

            # The names of any services that must be running, and the names of any tasks that must be executed, before
            # the test is run.
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

            # POSIX-style filename to write the resolved file contents to, relative to the path of the module source
            # directory (for remote modules this means the root of the module repository, otherwise the directory of
            # the module configuration).
            #
            # Note that any existing file with the same name will be overwritten. If the path contains one or more
            # directories, they will be automatically created if missing.
            targetPath:

            # By default, Garden will attempt to resolve any Garden template strings in source files. Set this to
            # false to skip resolving template strings. Note that this does not apply when setting the `value` field,
            # since that's resolved earlier when parsing the configuration.
            resolveTemplates:

            # The desired file contents as a string.
            value:

            sourcePath:

        # The name of the parent module (e.g. a templated module that generated this module), if applicable.
        parentName:

        # The module template that generated the module, if applicable.
        templateName:

        # Inputs provided when rendering the module from a module template, if applicable.
        inputs:
          <name>:

    # Description of an environment's status for a provider.
    status:
      # Set to true if the environment is fully configured for a provider.
      ready:

      # Use this to include additional information that is specific to the provider.
      detail:

      namespaceStatuses:
        - pluginName:

          # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
          # letter, and cannot end with a dash) and must not be longer than 63 characters.
          namespaceName:

          state:

      # Output variables that modules and other variables can reference.
      outputs:
        <name>:

      # Set to true to disable caching of the status.
      disableCache:

    # A list of pages that the provider adds to the Garden dashboard.
    dashboardPages:
      - # A unique identifier for the page.
        name:

        # The link title to show in the menu bar (max length 32).
        title:

        # A description to show when hovering over the link.
        description:

        # The URL to open in the dashboard pane when clicking the link. If none is specified, the provider must
        # specify a `getDashboardPage` handler that resolves the URL given the `name` of this page.
        url:

        # Set to true if the link should open in a new browser tab/window.
        newWindow:

# All configured variables in the environment.
variables:
  <name>:

# All module configs in the project.
moduleConfigs:
  - # The schema version of this config (currently not used).
    apiVersion:

    kind:

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
              target:

      # Maximum time in seconds to wait for build to finish.
      timeout:

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

    # A map of variables scoped to this particular module. These are resolved before any other parts of the module
    # configuration and take precedence over project-scoped variables. They may reference project-scoped variables,
    # and generally use any template strings normally allowed when resolving modules.
    variables:
      <name>:

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
    # _NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of
    # nested objects and arrays._
    #
    # To use different module-level varfiles in different environments, you can template in the environment name
    # to the varfile name, e.g. `varfile: "my-module.\$\{environment.name\}.env` (this assumes that the corresponding
    # varfiles exist).
    varfile:

    # The filesystem path of the module.
    path:

    # The filesystem path of the module config file.
    configPath:

    # The resolved build configuration of the module. If this is returned by the configure handler for the module
    # type, we can provide more granular versioning for the module, with a separate build version (i.e. module
    # version), as well as separate service, task and test versions, instead of applying the same version to all of
    # them.
    #
    # When this is specified, it is **very important** that this field contains all configurable (or otherwise
    # dynamic) parameters that will affect the built artifacts/images, aside from source files that is (the hash of
    # those is separately computed).
    buildConfig:

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

        # POSIX-style filename to write the resolved file contents to, relative to the path of the module source
        # directory (for remote modules this means the root of the module repository, otherwise the directory of the
        # module configuration).
        #
        # Note that any existing file with the same name will be overwritten. If the path contains one or more
        # directories, they will be automatically created if missing.
        targetPath:

        # By default, Garden will attempt to resolve any Garden template strings in source files. Set this to false to
        # skip resolving template strings. Note that this does not apply when setting the `value` field, since that's
        # resolved earlier when parsing the configuration.
        resolveTemplates:

        # The desired file contents as a string.
        value:

        sourcePath:

    # The name of the parent module (e.g. a templated module that generated this module), if applicable.
    parentName:

    # The module template that generated the module, if applicable.
    templateName:

    # Inputs provided when rendering the module from a module template, if applicable.
    inputs:
      <name>:

# All workflow configs in the project.
workflowConfigs:
  - # The schema version of this workflow's config (currently not used).
    apiVersion:

    kind:

    # The name of this workflow.
    name:

    # A description of the workflow.
    description:

    # A map of environment variables to use for the workflow. These will be available to all steps in the workflow.
    envVars:
      # Number, string or boolean
      <name>:

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
        # **Any existing file with the same path will be overwritten, so be careful not to accidentally overwrite
        # files unrelated to your workflow.**
        path:

        # The file data as a string.
        data:

        # The name of a Garden secret to copy the file data from (Garden Cloud only).
        secretName:

    # The number of hours to keep the workflow pod running after completion.
    keepAliveHours:

    resources:
      requests:
        # The minimum amount of CPU the workflow needs in order to be scheduled, in millicpus (i.e. 1000 = 1 CPU).
        cpu:

        # The minimum amount of RAM the workflow needs in order to be scheduled, in megabytes (i.e. 1024 = 1 GB).
        memory:

      limits:
        # The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU).
        cpu:

        # The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB).
        memory:

      # The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU).
      cpu:

      # The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB).
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
        #
        # Note that commands that are _persistent_—e.g. the dev command, commands with a watch flag set, the logs
        # command with following enabled etc.—are not supported. In general, workflow steps should run to completion.
        #
        # Global options like --env, --log-level etc. are currently not supported for built-in commands, since they
        # are handled before the individual steps are run.
        command:

        # A description of the workflow step.
        description:

        # A map of environment variables to use when running script steps. Ignored for `command` steps.
        #
        # Note: Environment variables provided here take precedence over any environment variables configured at the
        # workflow level.
        envVars:
          # Number, string or boolean
          <name>:

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

        # If used, this step will be run under the following conditions (may use template strings):
        #
        # `onSuccess` (default): This step will be run if all preceding steps succeeded or were skipped.
        #
        # `onError`: This step will be run if a preceding step failed, or if its preceding step has `when: onError`.
        # If the next step has `when: onError`, it will also be run. Otherwise, all subsequent steps are ignored.
        #
        # `always`: This step will always be run, regardless of whether any preceding steps have failed.
        #
        # `never`: This step will always be ignored.
        #
        # See the [workflows guide](https://docs.garden.io/using-garden/workflows#the-skip-and-when-options) for
        # details
        # and examples.
        when:

    # A list of triggers that determine when the workflow should be run, and which environment should be used (Garden
    # Cloud only).
    triggers:
      - # The environment name (from your project configuration) to use for the workflow when matched by this trigger.
        environment:

        # The namespace to use for the workflow when matched by this trigger. Follows the namespacing setting used for
        # this trigger's environment, as defined in your project's environment configs.
        namespace:

        # A list of [GitHub
        # events](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads) that
        # should trigger this workflow.
        #
        # See the Garden Cloud documentation on [configuring
        # workflows](https://cloud.docs.garden.io/getting-started/workflows) for more details.
        #
        # Supported events:
        #
        # `pull-request`, `pull-request-closed`, `pull-request-merged`, `pull-request-opened`,
        # `pull-request-reopened`, `pull-request-updated`, `push`
        #
        #
        events:

        # If specified, only run the workflow for branches matching one of these filters. These filters refer to the
        # pull/merge request's head branch (e.g. `my-feature-branch`), not the base branch that the pull/merge request
        # would be merged into if approved (e.g. `main`).
        branches:

        # If specified, only run the workflow for pull/merge requests whose base branch matches one of these filters.
        baseBranches:

        # If specified, do not run the workflow for branches matching one of these filters. These filters refer to the
        # pull/merge request's head branch (e.g. `my-feature-branch`), not the base branch that the pull/merge request
        # would be merged into if approved (e.g. `main`).
        ignoreBranches:

        # If specified, do not run the workflow for pull/merge requests whose base branch matches one of these
        # filters.
        ignoreBaseBranches:

# The name of the project.
projectName:

# The local path to the project root.
projectRoot:

# The project ID (Garden Cloud only).
projectId:

# The Garden Cloud domain (Garden Cloud only).
domain:
```

### garden get linked-repos

**Outputs a list of all linked remote sources and modules for this project.**


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

#### Usage

    garden get outputs 


#### Outputs

```yaml
<name>:
```

### garden get modules

**Outputs all or specified modules.**

Outputs all or specified modules. Use with --output=json and jq to extract specific fields.

Examples:

    garden get modules                                                # list all modules in the project
    garden get modules --exclude-disabled=true                        # skip disabled modules
    garden get modules --full                                         # show resolved config for each module
    garden get modules -o=json | jq '.modules["my-module"].version'   # get version of my-module

#### Usage

    garden get modules [modules] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | Specify module(s) to list. Use comma as a separator to specify multiple modules. Skip to return all modules.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--full` |  | boolean | Show the full config for each module, with template strings resolved. Has no effect when the --output option is used.
  | `--exclude-disabled` |  | boolean | Exclude disabled modules from output.

#### Outputs

```yaml
# Key/value map. Keys must be valid identifiers.
modules:
  # The configuration for a module.
  <name>:
    # The schema version of this config (currently not used).
    apiVersion:

    kind:

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
              target:

      # Maximum time in seconds to wait for build to finish.
      timeout:

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

    # A map of variables scoped to this particular module. These are resolved before any other parts of the module
    # configuration and take precedence over project-scoped variables. They may reference project-scoped variables,
    # and generally use any template strings normally allowed when resolving modules.
    variables:
      <name>:

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
    # _NOTE: The default varfile format will change to YAML in Garden v0.13, since YAML allows for definition of
    # nested objects and arrays._
    #
    # To use different module-level varfiles in different environments, you can template in the environment name
    # to the varfile name, e.g. `varfile: "my-module.\$\{environment.name\}.env` (this assumes that the corresponding
    # varfiles exist).
    varfile:

    # The filesystem path of the module.
    path:

    # The resolved build configuration of the module. If this is returned by the configure handler for the module
    # type, we can provide more granular versioning for the module, with a separate build version (i.e. module
    # version), as well as separate service, task and test versions, instead of applying the same version to all of
    # them.
    #
    # When this is specified, it is **very important** that this field contains all configurable (or otherwise
    # dynamic) parameters that will affect the built artifacts/images, aside from source files that is (the hash of
    # those is separately computed).
    buildConfig:

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

        # POSIX-style filename to write the resolved file contents to, relative to the path of the module source
        # directory (for remote modules this means the root of the module repository, otherwise the directory of the
        # module configuration).
        #
        # Note that any existing file with the same name will be overwritten. If the path contains one or more
        # directories, they will be automatically created if missing.
        targetPath:

        # By default, Garden will attempt to resolve any Garden template strings in source files. Set this to false to
        # skip resolving template strings. Note that this does not apply when setting the `value` field, since that's
        # resolved earlier when parsing the configuration.
        resolveTemplates:

        # The desired file contents as a string.
        value:

        sourcePath:

    # The name of the parent module (e.g. a templated module that generated this module), if applicable.
    parentName:

    # The module template that generated the module, if applicable.
    templateName:

    # Inputs provided when rendering the module from a module template, if applicable.
    inputs:
      <name>:

    # The path to the build staging directory for the module.
    buildPath:

    # The path to the build metadata directory for the module.
    buildMetadataPath:

    # A list of types that this module is compatible with (i.e. the module type itself + all bases).
    compatibleTypes:

    # The path to the module config file, if applicable.
    configPath:

    version:
      # A Stack Graph node (i.e. module, service, task or test) version.
      versionString:

      # The version of each of the dependencies of the module.
      dependencyVersions:
        # version hash of the dependency module
        <name>:

      # List of file paths included in the version.
      files:

    # A map of all modules referenced under `build.dependencies`.
    buildDependencies:
      <name>:

    # Indicate whether the module needs to be built (i.e. has a build handler or needs to copy dependencies).
    needsBuild:

    # The outputs defined by the module (referenceable in other module configs).
    outputs:
      <name>:

    # The names of the services that the module provides.
    serviceNames:

    # The names of all the services and tasks that the services in this module depend on.
    serviceDependencyNames:

    # The names of the tasks that the module provides.
    taskNames:

    # The names of all the tasks and services that the tasks in this module depend on.
    taskDependencyNames:
```

### garden get status

**Outputs the full status of your environment.**


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

    namespaceStatuses:
      - pluginName:

        # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash) and must not be longer than 63 characters.
        namespaceName:

        state:

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

    # Whether the service was deployed with dev mode enabled.
    devMode:

    # Whether the service was deployed with local mode enabled.
    localMode:

    namespaceStatuses:
      - pluginName:

        # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash) and must not be longer than 63 characters.
        namespaceName:

        state:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

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
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

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


#### Usage

    garden get tasks [tasks] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `tasks` | No | Specify task(s) to list. Use comma as a separator to specify multiple tasks.



### garden get tests

**Lists the tests defined in your project's modules.**


#### Usage

    garden get tests [tests] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `tests` | No | Specify tests(s) to list. Use comma as a separator to specify multiple tests.



### garden get task-result

**Outputs the latest execution result of a provided task.**


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

namespaceStatus:
  pluginName:

  # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter,
  # and cannot end with a dash) and must not be longer than 63 characters.
  namespaceName:

  state:

# Local file paths to any exported artifacts from the task run.
artifacts:
```

### garden get test-result

**Outputs the latest execution result of a provided test.**


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

namespaceStatus:
  pluginName:

  # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter,
  # and cannot end with a dash) and must not be longer than 63 characters.
  namespaceName:

  state:

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

#### Usage

    garden get debug-info [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--format` |  | `json` `yaml`  | The output format for plugin-generated debug info.
  | `--include-project` |  | boolean | Include project-specific information from configured providers.
Note that this may include sensitive data, depending on the provider and your configuration.


### garden get vaccine

**Get notifications and appointments open up at the Berlin vaccination centers.**

Check for openings at Berlin's vaccination centers at a 2
second interval. If it finds one, you'll receive a notification
with links to book an appointment.

#### Usage

    garden get vaccine 



### garden link source

**Link a remote source to a local directory.**

After linking a remote source, Garden will read it from its local directory instead of
from the remote URL. Garden can only link remote sources that have been declared in the project
level `garden.yml` config.

Examples:

    garden link source my-source path/to/my-source # links my-source to its local version at the given path

#### Usage

    garden link source <source> <path> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `source` | Yes | Name of the source to link as declared in the project config.
  | `path` | Yes | Path to the local directory that contains the source.


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

#### Usage

    garden link module <module> <path> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | Name of the module to link.
  | `path` | Yes | Path to the local directory that contains the module.


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

Outputs logs for all or specified services, and optionally waits for news logs to come in. Defaults
to getting logs from the last minute when in `--follow` mode. You can change this with the `--since` option.

Examples:

    garden logs                            # interleaves color-coded logs from all services (up to a certain limit)
    garden logs --since 2d                 # interleaves color-coded logs from all services from the last 2 days
    garden logs --tail 100                 # interleaves the last 100 log lines from all services
    garden logs service-a,service-b        # interleaves color-coded logs for service-a and service-b
    garden logs --follow                   # keeps running and streams all incoming logs to the console
    garden logs --tag container=service-a  # only shows logs from containers with names matching the pattern

#### Usage

    garden logs [services] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `services` | No | The name(s) of the service(s) to log (skip to log all services). Use comma as a separator to specify multiple services.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--tag` |  | array:tag | Only show log lines that match the given tag, e.g. &#x60;--tag &#x27;container&#x3D;foo&#x27;&#x60;. If you specify multiple filters in a single tag option (e.g. &#x60;--tag &#x27;container&#x3D;foo,someOtherTag&#x3D;bar&#x27;&#x60;), they must all be matched. If you provide multiple &#x60;--tag&#x60; options (e.g. &#x60;--tag &#x27;container&#x3D;api&#x27; --tag &#x27;container&#x3D;frontend&#x27;&#x60;), they will be OR-ed together (i.e. if any of them match, the log line will be included). You can specify glob-style wildcards, e.g. &#x60;--tag &#x27;container&#x3D;prefix-*&#x27;&#x60;.
  | `--follow` | `-f` | boolean | Continuously stream new logs from the service(s).
  | `--tail` | `-t` | number | Number of lines to show for each service. Defaults to showing all log lines (up to a certain limit). Takes precedence over the &#x60;--since&#x60; flag if both are set. Note that we don&#x27;t recommend using a large value here when in follow mode.
  | `--show-container` |  | boolean | Show the name of the container with log output. May not apply to all providers
  | `--show-tags` |  | boolean | Show any tags attached to each log line. May not apply to all providers
  | `--timestamps` |  | boolean | Show timestamps with log output.
  | `--since` |  | moment | Only show logs newer than a relative duration like 5s, 2m, or 3h. Defaults to &#x60;&quot;1m&quot;&#x60; when &#x60;--follow&#x60; is true unless &#x60;--tail&#x60; is set. Note that we don&#x27;t recommend using a large value here when in follow mode.
  | `--hide-service` |  | boolean | Hide the service name and render the logs directly.


### garden migrate

**Migrate `garden.yml` configuration files to version 0.12**

Scans the project for `garden.yml` configuration files and updates those that are not compatible with version 0.12.
By default the command prints the updated versions to the terminal. You can optionally update the files in place with the `write` flag.

Note: This command does not validate the configs per se. It will simply try to convert a given configuration file so that
it is compatible with version 0.12 or greater, regardless of whether that file was ever a valid Garden config. It is therefore
recommended that this is used on existing `garden.yml` files that were valid in version v0.10.x.

Examples:

    garden migrate              # scans all garden.yml files and prints the updated versions along with the paths to them.
    garden migrate --write      # scans all garden.yml files and overwrites them with the updated versions.
    garden migrate ./garden.yml # scans the provided garden.yml file and prints the updated version.

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

#### Usage

    garden plugins [plugin] [command] 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `plugin` | No | The name of the plugin, whose command you wish to run.
  | `command` | No | The name of the command to run.



### garden publish

**Build and publish module(s) (e.g. container images) to a remote registry.**

Publishes built module artifacts for all or specified modules.
Also builds modules and build dependencies if needed.

By default the artifacts/images are tagged with the Garden module version, but you can also specify the `--tag` option to specify a specific string tag _or_ a templated tag. Any template values that can be used on the module being tagged are available, in addition to ${module.name}, ${module.version} and ${module.hash} tags that allows referencing the name of the module being tagged, as well as its Garden version. ${module.version} includes the "v-" prefix normally used for Garden versions, and ${module.hash} doesn't.

Examples:

    garden publish                # publish artifacts for all modules in the project
    garden publish my-container   # only publish my-container
    garden publish --force-build  # force re-build of modules before publishing artifacts
    garden publish --allow-dirty  # allow publishing dirty builds (which by default triggers error)

    # Publish my-container with a tag of v0.1
    garden publish my-container --tag "v0.1"

    # Publish my-container with a tag of v1.2-<hash> (e.g. v1.2-abcdef123)
    garden publish my-container --tag "v1.2-${module.hash}"

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
  | `--tag` |  | string | Override the tag on the built artifacts. You can use the same sorts of template strings as when templating values in module configs, with the addition of ${module.*} tags, allowing you to reference the name and Garden version of the module being tagged.

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

    # Whether the service was deployed with dev mode enabled.
    devMode:

    # Whether the service was deployed with local mode enabled.
    localMode:

    namespaceStatuses:
      - pluginName:

        # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash) and must not be longer than 63 characters.
        namespaceName:

        state:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

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
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

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

    namespaceStatus:
      pluginName:

      # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
      # letter, and cannot end with a dash) and must not be longer than 63 characters.
      namespaceName:

      state:

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

    # The published artifact identifier, if applicable.
    identifier:

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
  | `--command` | `-c` | string | The base command (a.k.a. entrypoint) to run in the module. For container modules, for example, this overrides the image&#x27;s default command/entrypoint. This option may not be relevant for all module types. Example: &#x27;/bin/sh -c&#x27;.


### garden run service

**Run an ad-hoc instance of the specified service.**

This can be useful for debugging or ad-hoc experimentation with services.

Examples:

    garden run service my-service   # run an ad-hoc instance of a my-service and attach to it

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

  namespaceStatus:
    pluginName:

    # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter,
    # and cannot end with a dash) and must not be longer than 63 characters.
    namespaceName:

    state:

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

  namespaceStatus:
    pluginName:

    # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a letter,
    # and cannot end with a dash) and must not be longer than 63 characters.
    namespaceName:

    state:

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

#### Usage

    garden run workflow <workflow> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `workflow` | Yes | The name of the workflow to be run.



### garden scan

**Scans your project and outputs an overview of all modules.**


#### Usage

    garden scan 



### garden dashboard

**Starts the Garden dashboard for the current project and environment.**

Starts the Garden dashboard for the current project, and your selected environment+namespace. The dashboard can be used to monitor your Garden project, look at logs, provider-specific dashboard pages and more.

The dashboard will receive and display updates from other Garden processes that you run with the same Garden project, environment and namespace.

Note: You must currently run one dashboard per-environment and namespace.

#### Usage

    garden dashboard [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--port` |  | number | The port number for the Garden dashboard to listen on.


### garden self-update

**Update the Garden CLI.**

Updates your Garden CLI in-place.

Defaults to the latest release version, but you can also request a specific release version as an argument.

Examples:

   garden self-update          # update to the latest Garden CLI version
   garden self-update edge     # switch to the latest edge build (which is created anytime a PR is merged)
   garden self-update 0.12.24  # switch to the 0.12.24 version of the CLI
   garden self-update --force  # re-install even if the same version is detected
   garden self-update --install-dir ~/garden  # install to ~/garden instead of detecting the directory

#### Usage

    garden self-update [version] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `version` | No | Specify which version to switch/update to.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Install the Garden CLI even if the specified or detected latest version is the same as the current version.
  | `--install-dir` |  | string | Specify an installation directory, instead of using the directory of the Garden CLI being used. Implies --force.
  | `--platform` |  | `macos` `linux` `windows`  | Override the platform, instead of detecting it automatically.


### garden test

**Test all or specified modules.**

Runs all or specified tests defined in the project. Also builds modules and dependencies,
and deploys service dependencies if needed.

Optionally stays running and automatically re-runs tests if their module source
(or their dependencies' sources) change.

Examples:

    garden test                   # run all tests in the project
    garden test my-module         # run all tests in the my-module module
    garden test --name integ      # run all tests with the name 'integ' in the project
    garden test --name integ*     # run all tests with the name starting with 'integ' in the project
    garden test -n unit -n lint   # run all tests called either 'unit' or 'lint' in the project
    garden test --force           # force tests to be re-run, even if they've already run successfully
    garden test --watch           # watch for changes to code

#### Usage

    garden test [modules] [options]

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the module(s) to test (skip to test all modules). Use comma as a separator to specify multiple modules.

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--name` | `-n` | array:string | Only run tests with the specfied name (e.g. unit or integ). Accepts glob patterns (e.g. integ* would run both &#x27;integ&#x27; and &#x27;integration&#x27;).
  | `--force` | `-f` | boolean | Force re-test of module(s).
  | `--force-build` |  | boolean | Force rebuild of module(s).
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-test.
  | `--skip` |  | array:string | The name(s) of tests you&#x27;d like to skip. Accepts glob patterns (e.g. integ* would skip both &#x27;integ&#x27; and &#x27;integration&#x27;). Applied after the &#x27;name&#x27; filter.
  | `--skip-dependencies` | `-no-deps` | boolean | Don&#x27;t deploy any services or run any tasks that the requested tests depend on. This can be useful e.g. when your stack has already been deployed, and you want to run tests with runtime dependencies without redeploying any service dependencies that may have changed since you last deployed. Warning: Take great care when using this option in CI, since Garden won&#x27;t ensure that the runtime dependencies of your test suites are up to date when this option is used.
  | `--skip-dependants` |  | boolean | When using the modules argument, only run tests for those modules (and skip tests in other modules with dependencies on those modules).

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

    # Whether the service was deployed with dev mode enabled.
    devMode:

    # Whether the service was deployed with local mode enabled.
    localMode:

    namespaceStatuses:
      - pluginName:

        # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
        # letter, and cannot end with a dash) and must not be longer than 63 characters.
        namespaceName:

        state:

    # The ID used for the service by the provider (if not the same as the service name).
    externalId:

    # The provider version of the deployed service (if different from the Garden module version.
    externalVersion:

    # A list of ports that can be forwarded to from the Garden agent by the provider.
    forwardablePorts:
      - # A descriptive name for the port. Should correspond to user-configured ports where applicable.
        name:

        # The preferred local port to use for forwarding.
        preferredLocalPort:

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
      - # The port number that the service is exposed on internally.
        # This defaults to the first specified port for the service.
        port:

        # The ingress path that should be matched to route to this service.
        path:

        # The protocol to use for the ingress.
        protocol:

        # The hostname where the service can be accessed.
        hostname:

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

    namespaceStatus:
      pluginName:

      # Valid RFC1035/RFC1123 (DNS) label (may contain lowercase letters, numbers and dashes, must start with a
      # letter, and cannot end with a dash) and must not be longer than 63 characters.
      namespaceName:

      state:

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

#### Usage

    garden util fetch-tools [options]

#### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` |  | boolean | Fetch all tools for registered plugins, instead of just ones in the current env/project.


### garden util hide-warning

**Hide a specific warning message.**

Hides the specified warning message. The command and key is generally provided along with displayed warning messages.

#### Usage

    garden util hide-warning <key> 

#### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `key` | Yes | The key of the warning to hide (this will be shown along with relevant warning messages).



### garden validate

**Check your garden configuration for errors.**

Throws an error and exits with code 1 if something's not right in your garden.yml files.

#### Usage

    garden validate 



