## Garden CLI commands

Below is a list of Garden CLI commands and usage information.

The commands should be run in a Garden project root, and are always scoped to that project.

Note: You can get a list of commands in the CLI by running `garden -h/--help`,
and detailed help for each command using `garden <command> -h/--help`

##### Global options

The following option flags can be used with any of the CLI commands:

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--root` | `-r` | string | Override project root directory (defaults to working directory).
  | `--silent` | `-s` | boolean | Suppress log output.
  | `--env` | `-e` | string | The environment (and optionally namespace) to work against
  | `--loglevel` | `-l` | `error` `warn` `info` `verbose` `debug` `silly` `0` `1` `2` `3` `4` `5`  | Set logger level. Values can be either string or numeric and are prioritized from 0 to 5 (highest to lowest) as follows: error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5
  | `--output` | `-o` | `json` `yaml`  | Output command result in specified format (note: disables progress logging).

### garden build

Build your modules.

Builds all or specified modules, taking into account build dependency order.
Optionally stays running and automatically builds modules if their source (or their dependencies' sources) change.

Examples:

    garden build            # build all modules in the project
    garden build my-module  # only build my-module
    garden build --force    # force rebuild of modules
    garden build --watch    # watch for changes to code

##### Usage

    garden build [module] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | No | Specify module(s) to build. Use comma separator to specify multiple modules.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force rebuild of module(s).
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-build.

### garden call

Call a service ingress endpoint.

This command resolves the deployed ingress endpoint for the given service and path, calls the given endpoint and
outputs the result.

Examples:

    garden call my-container
    garden call my-container/some-path

Note: Currently only supports simple GET requests for HTTP/HTTPS ingresses.

##### Usage

    garden call <serviceAndPath> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `serviceAndPath` | Yes | The name of the service(s) to call followed by the ingress path (e.g. my-container/somepath).

### garden create project

Creates a new Garden project.

The 'create project' command walks the user through setting up a new Garden project and
generates scaffolding based on user input.

Examples:

    garden create project # creates a new Garden project in the current directory (project name defaults to
    directory name)
    garden create project my-project # creates a new Garden project in my-project directory
    garden create project --module-dirs=path/to/modules1,path/to/modules2
    # creates a new Garden project and looks for pre-existing modules in the modules1 and modules2 directories
    garden create project --name my-project
    # creates a new Garden project in the current directory and names it my-project

##### Usage

    garden create project [project-dir] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `project-dir` | No | Directory of the project. (Defaults to current directory.)

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--module-dirs` |  | array:path | Relative path to modules directory. Use comma as a separator to specify multiple directories
  | `--name` |  | string | Assigns a custom name to the project. (Defaults to name of the current directory.)

### garden create module

Creates a new Garden module.

Creates a new Garden module of the given type

Examples:

    garden create module # creates a new module in the current directory (module name defaults to directory name)
    garden create module my-module # creates a new module in my-module directory
    garden create module --type=container # creates a new container module
    garden create module --name=my-module # creates a new module in current directory and names it my-module

##### Usage

    garden create module [module-dir] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module-dir` | No | Directory of the module. (Defaults to current directory.)

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--name` |  | string | Assigns a custom name to the module. (Defaults to name of the current directory.)
  | `--type` |  | `container` `google-cloud-function` `npm-package`  | Type of module.

### garden delete secret

Delete a secret from the environment.

Returns with an error if the provided key could not be found by the provider.

Examples:

    garden delete secret kubernetes somekey
    garden del secret local-kubernetes some-other-key

##### Usage

    garden delete secret <provider> <key> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `provider` | Yes | The name of the provider to remove the secret from.
  | `key` | Yes | The key of the configuration variable. Separate with dots to get a nested key (e.g. key.nested).

### garden delete environment

Deletes a running environment.

This will trigger providers to clear up any deployments in a Garden environment and reset it.
When you then run `garden configure env` or any deployment command, the environment will be reconfigured.

This can be useful if you find the environment to be in an inconsistent state, or need/want to free up
resources.

##### Usage

    garden delete environment 

### garden delete service

Deletes a running service.

Deletes (i.e. un-deploys) the specified services. Note that this command does not take into account any
services depending on the deleted service, and might therefore leave the project in an unstable state.
Running `garden deploy` will re-deploy any missing services.

Examples:

    garden delete service my-service # deletes my-service

##### Usage

    garden delete service <service> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | Yes | The name of the service(s) to delete. Use comma as separator to specify multiple services.

### garden deploy

Deploy service(s) to your environment.


    Deploys all or specified services, taking into account service dependency order.
    Also builds modules and dependencies if needed.

    Optionally stays running and automatically re-builds and re-deploys services if their module source
    (or their dependencies' sources) change.

    Examples:

        garden deploy              # deploy all modules in the project
        garden deploy my-service   # only deploy my-service
        garden deploy --force      # force re-deploy of modules, even if they're already deployed
        garden deploy --watch      # watch for changes to code
        garden deploy --env stage  # deploy your services to an environment called stage
  

##### Usage

    garden deploy [service] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | No | The name of the service(s) to deploy (skip to deploy all services). Use comma as separator to specify multiple services.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force redeploy of service(s).
  | `--force-build` |  | boolean | Force rebuild of module(s).
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-deploy.

### garden dev

Starts the garden development console.


    The Garden dev console is a combination of the `build`, `deploy` and `test` commands.
    It builds, deploys and tests all your modules and services, and re-builds, re-deploys and re-tests
    as you modify the code.

    Examples:

        garden dev
  

##### Usage

    garden dev 

### garden exec

Executes a command (such as an interactive shell) in a running service.

Finds an active container for a deployed service and executes the given command within the container.
Supports interactive shells.

_NOTE: This command may not be supported for all module types._

Examples:

     garden exec my-service /bin/sh   # runs a shell in the my-service container

##### Usage

    garden exec <service> <command> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | Yes | The service to exec the command in.
  | `command` | Yes | The command to run.

### garden get secret

Get a secret from the environment.

Returns with an error if the provided key could not be found.

Examples:

    garden get secret kubernetes somekey
    garden get secret local-kubernetes some-other-key

##### Usage

    garden get secret <provider> <key> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `provider` | Yes | The name of the provider to read the secret from.
  | `key` | Yes | The key of the configuration variable.

### garden get status

Outputs the status of your environment.


##### Usage

    garden get status 

### garden init environment

Initializes your environment.

Generally, environments are initialized automatically as part of other commands that you run.
However, this command is useful if you want to make sure the environment is ready before running
another command, or if you need to force a re-initialization using the --force flag.

Examples:

    garden init env
    garden init env --force

##### Usage

    garden init environment [options]

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force initalization of environment, ignoring the environment status check.

### garden link source

Link a remote source to a local directory.

After linking a remote source, Garden will read it from its local directory instead of
from the remote URL. Garden can only link remote sources that have been declared in the project
level garden.yml config.

Examples:

    garden link source my-source path/to/my-source # links my-source to its local version at the given path

##### Usage

    garden link source <source> <path> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `source` | Yes | Name of the source to link as declared in the project config.
  | `path` | Yes | Path to the local directory that containes the source.

### garden link module

Link a module to a local directory.

After linking a remote module, Garden will read the source from the module's local directory instead of from
the remote URL. Garden can only link modules that have a remote source,
i.e. modules that specifiy a repositoryUrl in their garden.yml config file.

Examples:

    garden link module my-module path/to/my-module # links my-module to its local version at the given path

##### Usage

    garden link module <module> <path> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | Name of the module to link.
  | `path` | Yes | Path to the local directory that containes the module.

### garden login

Log into configured providers for this project and environment.

Executes the login flow for any provider that requires login (such as the `kubernetes` provider).

Examples:

     garden login

##### Usage

    garden login 

### garden logout

Log out of configured providers for this project and environment.

Examples:

     garden logout

##### Usage

    garden logout 

### garden logs

Retrieves the most recent logs for the specified service(s).

Outputs logs for all or specified services, and optionally waits for news logs to come in.

Examples:

    garden logs               # prints latest logs from all services
    garden logs my-service    # prints latest logs for my-service
    garden logs -t            # keeps running and streams all incoming logs to the console

##### Usage

    garden logs [service] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | No | The name of the service(s) to logs (skip to logs all services). Use comma as separator to specify multiple services.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--tail` | `-t` | boolean | Continuously stream new logs from the service(s).

### garden publish

Build and publish module(s) to a remote registry.

Publishes built module artifacts for all or specified modules.
Also builds modules and dependencies if needed.

Examples:

    garden publish                # publish artifacts for all modules in the project
    garden publish my-container   # only publish my-container
    garden publish --force-build  # force re-build of modules before publishing artifacts
    garden publish --allow-dirty  # allow publishing dirty builds (which by default triggers error)

##### Usage

    garden publish [module] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | No | The name of the module(s) to publish (skip to publish all modules). Use comma as separator to specify multiple modules.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force-build` |  | boolean | Force rebuild of module(s) before publishing.
  | `--allow-dirty` |  | boolean | Allow publishing dirty builds (with untracked/uncommitted changes).

### garden run module

Run an ad-hoc instance of a module.

This is useful for debugging or ad-hoc experimentation with modules.

Examples:

    garden run module my-container           # run an ad-hoc instance of a my-container container and attach to it
    garden run module my-container /bin/sh   # run an interactive shell in a new my-container container
    garden run module my-container --i=false /some/script  # execute a script in my-container and return the output

##### Usage

    garden run module <module> [command] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | The name of the module to run.
  | `command` | No | The command to run in the module.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` |  | boolean | Set to false to skip interactive mode and just output the command result.
  | `--force-build` |  | boolean | Force rebuild of module before running.

### garden run service

Run an ad-hoc instance of the specified service

This can be useful for debugging or ad-hoc experimentation with services.

Examples:

    garden run service my-service   # run an ad-hoc instance of a my-service and attach to it

##### Usage

    garden run service <service> [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | Yes | The service to run

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force-build` |  | boolean | Force rebuild of module

### garden run test

Run the specified module test.

This can be useful for debugging tests, particularly integration/end-to-end tests.

Examples:

    garden run test my-module integ            # run the test named 'integ' in my-module
    garden run test my-module integ --i=false  # do not attach to the test run, just output results when completed

##### Usage

    garden run test <module> <test> [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | The name of the module to run.
  | `test` | Yes | The name of the test to run in the module.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` |  | boolean | Set to false to skip interactive mode and just output the command result.
  | `--force-build` |  | boolean | Force rebuild of module before running.

### garden scan

Scans your project and outputs an overview of all modules.


##### Usage

    garden scan 

### garden set secret

Set a secret value for a provider in an environment.

These secrets are handled by each provider, and may for example be exposed as environment
variables for services or mounted as files, depending on how the provider is implemented
and configured.

_Note: The value is currently always stored as a string._

Examples:

    garden set secret kubernetes somekey myvalue
    garden set secret local-kubernets somekey myvalue

##### Usage

    garden set secret <provider> <key> <value> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `provider` | Yes | The name of the provider to store the secret with.
  | `key` | Yes | A unique identifier for the secret.
  | `value` | Yes | The value of the secret.

### garden test

Test all or specified modules.


    Runs all or specified tests defined in the project. Also builds modules and dependencies,
    and deploy service dependencies if needed.

    Optionally stays running and automatically re-runs tests if their module source
    (or their dependencies' sources) change.

    Examples:

        garden test              # run all tests in the project
        garden test my-module    # run all tests in the my-module module
        garden test -n integ     # run all tests with the name 'integ' in the project
        garden test --force      # force tests to be re-run, even if they're already run successfully
        garden test --watch      # watch for changes to code
  

##### Usage

    garden test [module] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | No | The name of the module(s) to deploy (skip to test all modules). Use comma as separator to specify multiple modules.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--name` | `-n` | string | Only run tests with the specfied name (e.g. unit or integ).
  | `--force` | `-f` | boolean | Force re-test of module(s).
  | `--force-build` |  | boolean | Force rebuild of module(s).
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-test.

### garden unlink source

Unlink a previously linked remote source from its local directory.

After unlinking a remote source, Garden will go back to reading it from its remote URL instead
of its local directory.

Examples:

    garden unlink source my-source # unlinks my-source
    garden unlink source --all # unlinks all sources

##### Usage

    garden unlink source [source] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `source` | No | Name of the source(s) to unlink. Use comma separator to specify multiple sources.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` | `-a` | boolean | Unlink all sources.

### garden unlink module

Unlink a previously linked remote module from its local directory.

After unlinking a remote module, Garden will go back to reading the module's source from
its remote URL instead of its local directory.

Examples:

    garden unlink module my-module # unlinks my-module
    garden unlink module --all # unlink all modules

##### Usage

    garden unlink module [module] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | No | Name of the module(s) to unlink. Use comma separator to specify multiple modules.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` | `-a` | boolean | Unlink all modules.

### garden update-remote sources

Update remote sources.

Update the remote sources declared in the project config.

Examples:

    garden update-remote sources            # update all remote sources in the project config
    garden update-remote sources my-source  # update remote source my-source

##### Usage

    garden update-remote sources [source] 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `source` | No | Name of the remote source(s) to update. Use comma separator to specify multiple sources.

### garden update-remote modules

Update remote modules.

Remote modules are modules that have a repositoryUrl field
in their garden.yml config that points to a remote repository.

Examples:

    garden update-remote modules            # update all remote modules in the project
    garden update-remote modules my-module  # update remote module my-module

##### Usage

    garden update-remote modules [module] 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | No | Name of the remote module(s) to update. Use comma separator to specify multiple modules.

### garden update-remote all

Update all remote sources and modules.

Examples:

    garden update-remote all # update all remote sources and modules in the project

##### Usage

    garden update-remote all 

### garden validate

Check your garden configuration for errors.

Throws an error and exits with code 1 if something's not right in your garden.yml files.

##### Usage

    garden validate 

