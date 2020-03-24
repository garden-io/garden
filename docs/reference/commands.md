---
order: 3
title: Commands
---

## Garden CLI commands

Below is a list of Garden CLI commands and usage information.

The commands should be run in a Garden project, and are always scoped to that project.

Note: You can get a list of commands in the CLI by running `garden -h/--help`,
and detailed help for each command using `garden <command> -h/--help`

##### Global options

The following option flags can be used with any of the CLI commands:

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--root` | `-r` | string | Override project root directory (defaults to working directory).
  | `--silent` | `-s` | boolean | Suppress log output. Same as setting --logger-type&#x3D;quiet.
  | `--env` | `-e` | string | The environment (and optionally namespace) to work against.
  | `--logger-type` |  | `quiet` `basic` `fancy` `fullscreen` `json`  | Set logger type.
fancy: updates log lines in-place when their status changes (e.g. when tasks complete),
basic: appends a new log line when a log line&#x27;s status changes,
json: same as basic, but renders log lines as JSON,
quiet: suppresses all log output, same as --silent.
  | `--log-level` | `-l` | `error` `warn` `info` `verbose` `debug` `silly` `0` `1` `2` `3` `4` `5`  | Set logger level. Values can be either string or numeric and are prioritized from 0 to 5 (highest to lowest) as follows: error: 0, warn: 1, info: 2, verbose: 3, debug: 4, silly: 5.
  | `--output` | `-o` | `json` `yaml`  | Output command result in specified format (note: disables progress logging and interactive functionality).
  | `--emoji` |  | boolean | Enable emoji in output (defaults to true if the environment supports it).
  | `--yes` | `-y` | boolean | Automatically approve any yes/no prompts during execution.

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

    garden build [modules] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | Specify module(s) to build. Use comma as a separator to specify multiple modules.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force rebuild of module(s).
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-build.

### garden call

Call a service ingress endpoint.

Resolves the deployed ingress endpoint for the given service and path, calls the given endpoint and
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
  | `serviceAndPath` | Yes | The name of the service to call followed by the ingress path (e.g. my-container/somepath).

### garden create project

Create a new Garden project.

Creates a new Garden project configuration. The generated config includes some default values, as well as the
schema of the config in the form of commentented-out fields. Also creates a default (blank) .gardenignore file
in the same path.

Examples:

    garden create project                     # create a Garden project config in the current directory
    garden create project --dir some-dir      # create a Garden project config in the ./some-dir directory
    garden create project --name my-project   # set the project name to my-project
    garden create project --interactive=false # don't prompt for user inputs when creating the config

##### Usage

    garden create project [options]

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--dir` |  | path | Directory to place the project in (defaults to current directory).
  | `--interactive` | `-i` | boolean | Set to false to disable interactive prompts.
  | `--name` |  | string | Name of the project (defaults to current directory name).

### garden create module

Create a new Garden module.

Creates a new Garden module configuration. The generated config includes some default values, as well as the
schema of the config in the form of commentented-out fields.

Examples:

    garden create module                      # create a Garden module config in the current directory
    garden create module --dir some-dir       # create a Garden module config in the ./some-dir directory
    garden create module --name my-module     # set the module name to my-module
    garden create module --interactive=false  # don't prompt for user inputs when creating the module

##### Usage

    garden create module [options]

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--dir` |  | path | Directory to place the module in (defaults to current directory).
  | `--interactive` | `-i` | boolean | Set to false to disable interactive prompts.
  | `--name` |  | string | Name of the module (defaults to current directory name).
  | `--type` |  | string | The module type to create. Required if --interactive&#x3D;false.

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

This will delete all services in the specified environment, and trigger providers to clear up any other resources
and reset it. When you then run `garden deploy`, the environment will be reconfigured.

This can be useful if you find the environment to be in an inconsistent state, or need/want to free up
resources.

##### Usage

    garden delete environment 

### garden delete service

Deletes running services.

Deletes (i.e. un-deploys) the specified services. Note that this command does not take into account any
services depending on the deleted service, and might therefore leave the project in an unstable state.
Running `garden deploy` will re-deploy any missing services.

Examples:

    garden delete service my-service # deletes my-service

##### Usage

    garden delete service <services> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `services` | Yes | The name(s) of the service(s) to delete. Use comma as a separator to specify multiple services.

### garden deploy

Deploy service(s) to your environment.

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

##### Usage

    garden deploy [services] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `services` | No | The name(s) of the service(s) to deploy (skip to deploy all services). Use comma as a separator to specify multiple services.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force redeploy of service(s).
  | `--force-build` |  | boolean | Force rebuild of module(s).
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-deploy.
  | `--hot-reload` | `-hot` | array:string | The name(s) of the service(s) to deploy with hot reloading enabled. Use comma as a separator to specify multiple services. Use * to deploy all services with hot reloading enabled (ignores services belonging to modules that don&#x27;t support or haven&#x27;t configured hot reloading). When this option is used, the command is run in watch mode (i.e. implicitly assumes the --watch/-w flag).

### garden dev

Starts the garden development console.

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

##### Usage

    garden dev [options]

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--hot-reload` | `-hot` | array:string | The name(s) of the service(s) to deploy with hot reloading enabled. Use comma as a separator to specify multiple services. Use * to deploy all services with hot reloading enabled (ignores services belonging to modules that don&#x27;t support or haven&#x27;t configured hot reloading).
  | `--skip-tests` |  | boolean | Disable running the tests.
  | `--test-names` | `-tn` | array:string | Filter the tests to run by test name across all modules (leave unset to run all tests). Accepts glob patterns (e.g. integ* would run both &#x27;integ&#x27; and &#x27;integration&#x27;).

### garden exec

Executes a command (such as an interactive shell) in a running service.

Finds an active container for a deployed service and executes the given command within the container.
Supports interactive shells.

_NOTE: This command may not be supported for all module types._

Examples:

     garden exec my-service /bin/sh   # runs a shell in the my-service container

##### Usage

    garden exec <service> <command> [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | Yes | The service to exec the command in.
  | `command` | Yes | The command to run.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` |  | boolean | Set to false to skip interactive mode and just output the command result

### garden get graph

Outputs the dependency relationships specified in this project&#x27;s garden.yml files.


##### Usage

    garden get graph 

### garden get config

Outputs the fully resolved configuration for this project and environment.


##### Usage

    garden get config [options]

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--exclude-disabled` |  | boolean | Exclude disabled module, service, test, and task configs from output.

### garden get eysi

Meet our CTO.

Just try it.

##### Usage

    garden get eysi 

### garden get linked-repos

Outputs a list of all linked remote sources and modules for this project.


##### Usage

    garden get linked-repos 

### garden get outputs

Resolves and returns the outputs of the project.

Resolves and returns the outputs of the project. If necessary, this may involve deploying services and/or running
tasks referenced by the outputs in the project configuration.

Examples:

    garden get outputs                 # resolve and print the outputs from the project
    garden get outputs --env=prod      # resolve and print the outputs from the project for the prod environment
    garden get outputs --output=json   # resolve and return the project outputs in JSON format

##### Usage

    garden get outputs 

### garden get secret

Get a secret from the environment.

Returns with an error if the provided key could not be found.

>**Note**: The `get|set secret` commands are currently quite limited.
For Kubernetes secrets, we recommend using kubectl for
most non-trivial use-cases.

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

### garden get tasks

Lists the tasks defined in your project&#x27;s modules.


##### Usage

    garden get tasks [tasks] 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `tasks` | No | Specify task(s) to list. Use comma as a separator to specify multiple tasks.

### garden get task-result

Outputs the latest execution result of a provided task.


##### Usage

    garden get task-result <name> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `name` | Yes | The name of the task

### garden get test-result

Outputs the latest execution result of a provided test.


##### Usage

    garden get test-result <module> <name> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | Module name of where the test runs.
  | `name` | Yes | Test name.

### garden get debug-info

Outputs the status of your environment for debug purposes.

Examples:

garden get debug-info                    # create a zip file at the root of the project with debug information
garden get debug-info --format yaml      # output provider info as YAML files (default is JSON)
garden get debug-info --include-project  # include provider info for the project namespace (disabled by default)

##### Usage

    garden get debug-info [options]

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--format` |  | `json` `yaml`  | The output format for plugin-generated debug info.
  | `--include-project` |  | boolean | Include project-specific information from configured providers.
Note that this may include sensitive data, depending on the provider and your configuration.

### garden link source

Link a remote source to a local directory.

After linking a remote source, Garden will read it from its local directory instead of
from the remote URL. Garden can only link remote sources that have been declared in the project
level `garden.yml` config.

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
i.e. modules that specifiy a `repositoryUrl` in their `garden.yml` config file.

Examples:

    garden link module my-module path/to/my-module # links my-module to its local version at the given path

##### Usage

    garden link module <module> <path> 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | Name of the module to link.
  | `path` | Yes | Path to the local directory that containes the module.

### garden logs

Retrieves the most recent logs for the specified service(s).

Outputs logs for all or specified services, and optionally waits for news logs to come in.

Examples:

    garden logs               # prints latest logs from all services
    garden logs my-service    # prints latest logs for my-service
    garden logs -t            # keeps running and streams all incoming logs to the console

##### Usage

    garden logs [services] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `services` | No | The name(s) of the service(s) to log (skip to log all services). Use comma as a separator to specify multiple services.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--follow` | `-f` | boolean | Continuously stream new logs from the service(s).
  | `--tail` | `-t` | number | Number of lines to show for each service. Defaults to -1, showing all log lines.

### garden migrate

Migrate &#x60;garden.yml&#x60; configuration files to version v0.11.x

Scans the project for `garden.yml` configuration files and updates those that are not compatible with version v0.11.
By default the command prints the updated versions to the terminal. You can optionally update the files in place with the `write` flag.

Note: This command does not validate the configs per se. It will simply try to convert a given configuration file so that
it is compatible with version v0.11 or greater, regardless of whether that file was ever a valid Garden config. It is therefore
recommended that this is used on existing `garden.yml` files that were valid in version v0.10.x.

Examples:

    garden migrate              # scans all garden.yml files and prints the updated versions along with the paths to them.
    garden migrate --write      # scans all garden.yml files and overwrites them with the updated versions.
    garden migrate ./garden.yml # scans the provided garden.yml file and prints the updated version.

##### Usage

    garden migrate [configPaths] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `configPaths` | No | Specify the path to a &#x60;garden.yml&#x60; file to convert. Use comma as a separator to specify multiple files.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--write` |  | boolean | Update the &#x60;garden.yml&#x60; in place.

### garden options

Print global options.

Prints all global options (options that can be applied to any command).

##### Usage

    garden options 

### garden plugins

Plugin-specific commands.

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

##### Usage

    garden plugins [plugin] [command] 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `plugin` | No | The name of the plugin, whose command you wish to run.
  | `command` | No | The name of the command to run.

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

    garden publish [modules] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the module(s) to publish (skip to publish all modules). Use comma as a separator to specify multiple modules.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force-build` |  | boolean | Force rebuild of module(s) before publishing.
  | `--allow-dirty` |  | boolean | Allow publishing dirty builds (with untracked/uncommitted changes).

### garden run module

Run an ad-hoc instance of a module.

This is useful for debugging or ad-hoc experimentation with modules.

Examples:

    garden run module my-container                                   # run an ad-hoc instance of a my-container container and attach to it
    garden run module my-container /bin/sh                           # run an interactive shell in a new my-container container
    garden run module my-container --interactive=false /some/script  # execute a script in my-container and return the output

##### Usage

    garden run module <module> [arguments] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | The name of the module to run.
  | `arguments` | No | The arguments to run the module with. Example: &#x27;npm run my-script&#x27;.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` |  | boolean | Set to false to skip interactive mode and just output the command result.
  | `--force-build` |  | boolean | Force rebuild of module before running.
  | `--command` | `-c` | array:string | The base command (a.k.a. entrypoint) to run in the module. For container modules, for example, this overrides the image&#x27;s default command/entrypoint. This option may not be relevant for all module types. Example: &#x27;/bin/sh -c&#x27;.

### garden run service

Run an ad-hoc instance of the specified service.

This can be useful for debugging or ad-hoc experimentation with services.

Examples:

    garden run service my-service   # run an ad-hoc instance of a my-service and attach to it

##### Usage

    garden run service <service> [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | Yes | The service to run.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Run the service even if it&#x27;s disabled for the environment.
  | `--force-build` |  | boolean | Force rebuild of module.

### garden run task

Run a task (in the context of its parent module).

This is useful for re-running tasks ad-hoc, for example after writing/modifying database migrations.

Examples:

    garden run task my-db-migration   # run my-migration

##### Usage

    garden run task <task> [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `task` | Yes | The name of the task to run.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Run the task even if it&#x27;s disabled for the environment.
  | `--force-build` |  | boolean | Force rebuild of module before running.

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
  | `--force` |  | boolean | Run the test even if it&#x27;s disabled for the environment.
  | `--force-build` |  | boolean | Force rebuild of module before running.

### garden scan

Scans your project and outputs an overview of all modules.


##### Usage

    garden scan 

### garden serve

Starts the Garden HTTP API service - **Experimental**

**Experimental**

Starts an HTTP server that exposes Garden commands and events.

##### Usage

    garden serve [options]

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--port` |  | number | The port number for the Garden service to listen on.

### garden set secret

Set a secret value for a provider in an environment.

These secrets are handled by each provider, and may for example be exposed as environment
variables for services or mounted as files, depending on how the provider is implemented
and configured.

The value is currently always stored as a string.

>**Note**: The `get|set secret` commands are currently quite limited.
For Kubernetes secrets, we recommend using kubectl for
most non-trivial use-cases.

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

##### Usage

    garden test [modules] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the module(s) to test (skip to test all modules). Use comma as a separator to specify multiple modules.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--name` | `-n` | string | Only run tests with the specfied name (e.g. unit or integ). Accepts glob patterns (e.g. integ* would run both &#x27;integ&#x27; and &#x27;integration&#x27;)
  | `--force` | `-f` | boolean | Force re-test of module(s).
  | `--force-build` |  | boolean | Force rebuild of module(s).
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-test.

### garden unlink source

Unlink a previously linked remote source from its local directory.

After unlinking a remote source, Garden will go back to reading it from its remote URL instead
of its local directory.

Examples:

    garden unlink source my-source  # unlinks my-source
    garden unlink source --all      # unlinks all sources

##### Usage

    garden unlink source [sources] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `sources` | No | The name(s) of the source(s) to unlink. Use comma as a separator to specify multiple sources.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` | `-a` | boolean | Unlink all sources.

### garden unlink module

Unlink a previously linked remote module from its local directory.

After unlinking a remote module, Garden will go back to reading the module's source from
its remote URL instead of its local directory.

Examples:

    garden unlink module my-module  # unlinks my-module
    garden unlink module --all      # unlink all modules

##### Usage

    garden unlink module [modules] [options]

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the module(s) to unlink. Use comma as a separator to specify multiple modules.

##### Options

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--all` | `-a` | boolean | Unlink all modules.

### garden update-remote sources

Update remote sources.

Updates the remote sources declared in the project level `garden.yml` config file.

Examples:

    garden update-remote sources            # update all remote sources
    garden update-remote sources my-source  # update remote source my-source

##### Usage

    garden update-remote sources [sources] 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `sources` | No | The name(s) of the remote source(s) to update. Use comma as a separator to specify multiple sources.

### garden update-remote modules

Update remote modules.

Updates remote modules, i.e. modules that have a `repositoryUrl` field
in their `garden.yml` config that points to a remote repository.

Examples:

    garden update-remote modules            # update all remote modules in the project
    garden update-remote modules my-module  # update remote module my-module

##### Usage

    garden update-remote modules [modules] 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `modules` | No | The name(s) of the remote module(s) to update. Use comma as a separator to specify multiple modules.

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

### garden config analytics-enabled

Update your preferences regarding analytics.

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

##### Usage

    garden config analytics-enabled [enable] 

##### Arguments

| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `enable` | No | Enable analytics. Defaults to &quot;true&quot;

