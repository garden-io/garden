## Garden CLI commands

Below is a list of Garden CLI commands and usage information.

The commands should be run in a Garden project root, and are always scoped to that project.

Note: You can get a list of commands in the CLI by running `garden -h/--help`,
and detailed help for each command using `garden <command> -h/--help`

##### Global options

The following option flags can be used with any of the CLI commands:

| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--root` | `-r` | string | override project root directory (defaults to working directory)
  | `--silent` | `-s` | boolean | suppress log output
  | `--env` | `-e` | string | The environment (and optionally namespace) to work against
  | `--loglevel` | `-log` | `error` `warn` `info` `verbose` `debug` `silly`  | set logger level
  | `--output` | `-o` | `json` `yaml`  | output command result in specified format (note: disables progress logging)

### garden build

Build your modules.

##### Usage

    garden build [module] [options]

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | No | Specify module(s) to build. Use comma separator to specify multiple modules.

##### Options
| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force rebuild of module(s)
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-build

### garden call

Call a service endpoint.

This resolves the external endpoint for the given service and path, calls the given endpoint and outputs the result.
##### Usage

    garden call <serviceAndPath> 

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `serviceAndPath` | Yes | The name of the service(s) to call followed by the endpoint path (e.g. my-container/somepath)

### garden config get

Get a configuration variable.

##### Usage

    garden config get <key> 

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `key` | Yes | The key of the configuration variable. Separate with dots to get a nested key (e.g. key.nested)

### garden config set

Set a configuration variable.

##### Usage

    garden config set <key> <value> 

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `key` | Yes | The key of the configuration variable. Separate with dots to set a nested key (e.g. key.nested)
  | `value` | Yes | The value of the configuration variable

### garden config delete

Delete a configuration variable.

##### Usage

    garden config delete <key> 

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `key` | Yes | The key of the configuration variable

### garden deploy

Deploy service(s) to the specified environment.

##### Usage

    garden deploy [service] [options]

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | No | The name of the service(s) to deploy (skip to deploy all services). Use comma as separator to specify multiple services.

##### Options
| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force redeploy of service(s)
  | `--force-build` |  | boolean | Force rebuild of module(s)
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-deploy

### garden dev

Starts the garden development console.

##### Usage

    garden dev 

### garden environment configure

Configures your environment.

##### Usage

    garden environment configure [options]

##### Options
| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force` |  | boolean | Force reconfiguration of environment

### garden environment destroy

Destroy environment.

##### Usage

    garden environment destroy 

### garden login

Log into the Garden framework.

##### Usage

    garden login 

### garden logout

Log into the Garden framework.

##### Usage

    garden logout 

### garden logs

Retrieves the most recent logs for the specified service(s).

##### Usage

    garden logs [service] [options]

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | No | The name of the service(s) to logs (skip to logs all services). Use comma as separator to specify multiple services.

##### Options
| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--tail` | `-t` | boolean | Continuously stream new logs from the service(s)

### garden push

Build and push module(s) to remote registry.

##### Usage

    garden push [module] [options]

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | No | The name of the module(s) to push (skip to push all modules). Use comma as separator to specify multiple modules.

##### Options
| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--force-build` |  | boolean | Force rebuild of module(s) before pushing
  | `--allow-dirty` |  | boolean | Allow pushing dirty builds (with untracked/uncommitted files)

### garden run module

Run the specified module.

##### Usage

    garden run module <module> [command] [options]

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | The name of the module to run
  | `command` | No | The command to run in the module

##### Options
| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` |  | boolean | Set to false to skip interactive mode and just output the command result
  | `--force-build` |  | boolean | Force rebuild of module

### garden run service

Run an ad-hoc instance of the specified service.

##### Usage

    garden run service <service> [options]

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `service` | Yes | The service to run

##### Options
| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` |  | boolean | Set to false to skip interactive mode and just output the command result
  | `--force-build` |  | boolean | Force rebuild of module

### garden run test

Run the specified module test.

##### Usage

    garden run test <module> <test> [options]

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | Yes | The name of the module to run
  | `test` | Yes | The name of the test to run in the module

##### Options
| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--interactive` |  | boolean | Set to false to skip interactive mode and just output the command result
  | `--force-build` |  | boolean | Force rebuild of module

### garden scan

Scans your project and outputs an overview of all modules.

##### Usage

    garden scan 

### garden status

Outputs the status of your environment.

##### Usage

    garden status 

### garden test

Test all or specified modules.

##### Usage

    garden test [module] [options]

##### Arguments
| Argument | Required | Description |
| -------- | -------- | ----------- |
  | `module` | No | The name of the module(s) to deploy (skip to test all modules). Use comma as separator to specify multiple modules.

##### Options
| Argument | Alias | Type | Description |
| -------- | ----- | ---- | ----------- |
  | `--group` | `-g` | string | Only run tests with the specfied group (e.g. unit or integ)
  | `--force` | `-f` | boolean | Force re-test of module(s)
  | `--force-build` |  | boolean | Force rebuild of module(s)
  | `--watch` | `-w` | boolean | Watch for changes in module(s) and auto-test

### garden validate

Check your garden configuration for errors.

##### Usage

    garden validate 

