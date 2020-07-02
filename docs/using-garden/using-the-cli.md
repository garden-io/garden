# Using the CLI

Here, we'll describe at a high level the common day-to-day usage of the Garden CLI, with specific examples.

## CLI introduction

The `garden` CLI is how you work with Garden in most scenarios, during development and in CI pipelines. It features a fairly large number of commands, so we'll list the most common ones below. You can run `garden --help` to list them, and use `garden <command> --help` to learn more about individual commands, arguments, option flags, usage examples etc. You can also find a full reference [here](../reference/commands.md).

If you've not installed the CLI yet, please check out the [installation guide](../getting-started/1-installation.md).

Most of the examples below assume that you've already defined a Garden project.

The [garden dev](#garden-dev) command, as well as the [build](#building), [deploy](#services) and [test](#tests) commands (when run with the `--watch` flag) all start a web dashboard that you can open in a browser. See [the dashboard section](#the-dashboard) for more on that.

{% hint style="warning" %}
It is currently not advisable to run multiple dev, build, deploy or test commands in parallel, especially with `--watch`  because they may interfere with each other. It is fine, however, to run one of those and then run other commands to the side, such as `garden logs`. We plan on improving this in the future.
{% endhint %}

### Common option flags

Every Garden command supports a common set of option flags. The full reference can be found [here](../reference/commands.md#global-options), but here are the most important ones:

- `--env` sets the environment (and optionally namespace) that the command should act on. Most Garden commands only act on a specific environment, so in most cases you'll specify this, unless you're working on the default environment for the project. See [here](./projects.md#environments-and-namespaces) for more about environments and namespaces.
- `--log-level` / `-l` sets the log level. Use e.g. `-l=debug` to get debug logs for the command.
- `--logger-type=basic` disables the fancy log output (with spinners etc.) and just prints a simple line-by-line output. Setting `GARDEN_LOGGER_TYPE=basic` does the same thing. You should set that environment variable in CI and other automated environments.
- `--output` / `-o` sets the output format. Use this to get structured output from the commands. `--output=json` outputs JSON, and `--output=yaml` outputs YAML. The structure of the outputs is documented in [the reference](../reference/commands.md) for most commands.

All option flags can be specified with a space or a `=` between the flag and the value.

## Services

### Deploying all services in a project

This deploys all your services to the default environment and namespace.

```sh
garden deploy
```

### Deploying all services in a project to a non-default environment and namespace

This deploys your services to `my-namespace` in the `dev` environment.

```sh
garden deploy --env my-namespace.dev
```

### Deploying a single service

```sh
garden deploy my-service
```

### Deploying more than one specific service

When arguments accept one or more services, modules etc. we comma-separate the names.

```sh
garden deploy service-a,service-b
```

### Deploying a service and watching for changes

```sh
garden deploy my-service --watch  # or -w for short
```

### Deploying a service in hot-reload mode

See the [Hot reload guide](../guides/hot-reload.md.md) for more information on how to configure and use hot reloading for rapid iteration on services.
Enabling `--hot-reload` implicitly sets `--watch=true`.

```sh
garden deploy my-service --hot-reload=*  # or --hot for short
```

### Running a single ad-hoc service and attaching

```sh
garden run service my-service --interactive  # or -i for short
```

### Executing a command in a running service container

```sh
garden exec my-service <command>
```

### Executing an interactive shell in a running service container

_Note: This assumes that `sh` is available in the container._

```sh
garden exec my-service -i sh
```

### Getting the status of your services

```sh
garden get status
```

### Getting the status of your services in JSON format

This is suitable for parsing with e.g. the `jq` utility.

```sh
garden get status --output=json  # or `-o json` for short
```

### Stopping all running services

This removes all running services in `my-namespace` in the `dev` environment.

```sh
garden delete env --env=my-namespace.dev
```

### Stopping a single running service

```sh
garden delete service my-service
```

## Tests

### Running all tests in a project

```sh
garden test
```

### Running all tests for a specific module, and watching for changes

```sh
garden test my-module --watch
```

### Running a specific test for a module, and watching for changes

This runs the `integ` test, defined in `my-module`, and watches for changes (including changes in modules and services that the test depends on).

```sh
garden test my-module --name integ -w
```

### Running a specific test and attaching

This is handy for running a single test and streaming the log outputs (`garden test`, in comparison, is more meant to run multiple ones or watch for changes, and is less suitable for getting log output).

```sh
garden run test my-module my-test -i
```

## Tasks

### Running a specific task

```sh
garden run task my-module my-task
```

## Building

### Building all modules

```sh
garden build
```

### Building all modules, forcing a rebuild

```sh
garden build --force  # or -f for short
```

### Building a specific module

```sh
garden build my-module
```

### Building a specific module, and wathcing for changes

```sh
garden build my-module -w
```

This will start a dashboard as well.

## Workflows

### Running a workflow

Runs `my-workflow` in `my-namespace` in the `dev` environment.

```sh
garden run workflow my-workflow --env=my-namespace.dev
```

## Logs

### Retrieving the latest logs for all services

```sh
garden logs
```

### Retrieving the latest logs for a service

```sh
garden logs my-service
```

### Stream logs for a service

```sh
garden logs my-service --follow  # or -f for short
```

## garden dev

The `garden dev` command builds, deploys and tests all parts of your project, and also runs any tasks that are listed as dependencies for your services and tests. It then waits for any code changes, and automatically re-builds, re-deploys and re-runs any parts affected by your code changes.

This is handy for small projects, and when your code changes don't tend to trigger a lot of heavy operations, but may be too "busy" to run for large projects or when you're making big changes to your code.

### Running garden dev

```sh
garden dev
```

### Running garden dev but skipping tests

```sh
garden dev --skip-tests
```

### Running garden dev with hot reloading enabled for all supported services

See the [Hot reload guide](../guides/hot-reload.md.md) for more information on how to configure and use hot reloading for rapid iteration on services.

```sh
garden dev --hot-reload=*
```

### Running garden dev with hot reloading enabled for a specific service

```sh
garden dev --hot-reload=my-service
```

## The dashboard

The [garden dev](#garden-dev) command, as well as the [build](#building), [deploy](#services) and [test](#tests) commands when run with the `--watch` flag all start a web dashboard that you can open in a browser. See [the dashboard section](#the-dashboard) for more on that.

The CLI will print a URL which you can copy or click (or Cmd/Ctrl-click, depending on your terminal). The dashboard stays open while the command is running.

![The Stack Graph](../stack-graph-screenshot.png "The Stack Graph, shown in the Garden dashboard")

The dashboard gives you:

- An overview of all the parts of your project, including links to any configured _ingresses_ on your services.
- A visualization of your Stack Graph, where you can see the status of each node, and click them to get the most recent status or logs.
- A log viewer, which you can use to fetch the latest logs for your services.

## Hot reloading

For rapid iteration on a running service, you can use an advanced feature called _hot reloading_.
See the [Hot reload guide](../guides/hot-reload.md.md) for details on how to configure and use that feature.

## Project outputs

[Project outputs](./projects.md#project-outputs) are a handy way to extract generated values from your project.

### Printing project outputs

```sh
garden get outputs
```

### Getting project outputs in JSON format

This you can use to parse in scripts, e.g. using `jq`.

```sh
garden get outputs --output=json  # or `-o json` for short
```

You can also output in YAML with `--output=yaml`.

## Creating new configs

### Creating a new project

This bootstraps a boilerplate `garden.yml` with a project definition in the current directory, and a `.gardenignore` file.

```sh
garden create project
```

### Creating a module

This bootstraps a boilerplate `garden.yml` with a module definition in the current directory. You'll get an interactive menu to select a module type. You may get suggestions for appropriate module types, depending on which files are found in the directory (such as a `container` module when a `Dockerfile` is found).

```sh
garden create module
```

## Remote sources

_Remote sources_ are a mechanism to connect multiple git repositories in a single Garden project. See the [remote sources guide](../advanced/using-remote-sources.md) for more information, including how to use the CLI to manage these sources.

## Plugin commands

Individual plugins (currently referred to as `providers` in your project configuration) may include specific commands that help with their usage and operation. The available commands will depend on which providers are configured in your project.

You can run `garden plugins` without arguments to list the available commands.

### Initializing a Kubernetes cluster for in-cluster building

When using a remote Kubernetes cluster and in-cluster building, the cluster needs to be set up with some shared services when you first start using it, when you update the provider configuration, or sometimes when you update to a new Garden version. See the [remote kubernetes guide](../guides/remote-kubernetes.md) for more information.

Here we initialize the cluster configured for the `dev` environment:

```sh
garden plugins kubernetes cluster-init --env=dev
```

### Cleaning up the in-cluster builder and registry

When you use in-cluster building, the image caches build up over time and need to be cleaned up periodically. Use this command for that:

```sh
garden plugins kubernetes cleanup-cluster-registry --env=dev
```

### Planning and applying Terraform stacks

The `terraform` provider includes several commands that facilitate interaction with the Terraform stacks in your project. See the [Terraform guide](../advanced/terraform.md#planning-and-applying) for more information.

## Plugin tools

Garden plugins generally define their external tool dependencies, such that Garden can automatically fetch them ahead of use. The `garden tools` command exposes these tools, so that you can use them without having to install them separately. You can also use these to ensure that you're using the exact same versions as the Garden plugins.

{% hint style="warning" %}
Note that this command currently only works when run within a Garden project root.
{% endhint %}

If you use this frequently, we recommend defining the following helper function for quick access:

```sh
# Note: This is made to work in bash and zsh, other shells may need a different syntax
function gt() {
  garden tools $1 -- "${@:2}"
}
```

You can then type e.g. `gt docker build .` to run `docker build .` using the Garden-provided version of the `docker CLI`.

Run `garden tools` to get a full list of available tools, and `garden tools --help` for more usage information.

### Running a plugin tool

Note that the `--` is necessary to distinguish between Garden options, and kubectl arguments. See above for a shorthand function you can put in your shell profile.

```sh
garden tools kubectl -- <args>
```

### Getting the path of a plugin tool

This prints the absolute path to the `kubectl` binary defined by the `kubernetes` provider, downloading it first if necessary.

```sh
garden tools kubectl --get-path
```

## Next Steps

Take a look at our [Guides section](../guides/README.md) for in-depth guides on specific use cases and setups, or keep exploring other sections under [Using Garden](./README.md) to learn more about Garden concepts and configuration.
