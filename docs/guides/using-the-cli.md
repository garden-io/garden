---
order: 7
title: Using the CLI
---

# Using the CLI

Here, we'll describe at a high level the common day-to-day usage of the Garden CLI, with specific examples.

## CLI introduction

The `garden` CLI is how you work with Garden in most scenarios, during development and in CI pipelines. It features a fairly large number of commands, so we'll list the most common ones below. You can run `garden --help` to list them, and use `garden <command> --help` to learn more about individual commands, arguments, option flags, usage examples etc. You can also find a full reference [here](../reference/commands.md).

If you've not installed the CLI yet, please check out the [installation guide](../guides/installation.md).

Most of the examples below assume that you've already defined a Garden project.

{% hint style="warning" %}
It is currently not advisable to run multiple `dev`, `build`, `deploy` or `test` commands in parallel because they may interfere with each other. It is fine, however, to run one of those and then run other commands to the side, such as `garden logs`. We plan on improving this in the future.
{% endhint %}

### Common option flags

Every Garden command supports a common set of option flags. The full reference can be found [here](../reference/commands.md#global-options), but here are the most important ones:

- `--env` sets the environment (and optionally namespace) that the command should act on. Most Garden commands only act on a specific environment, so in most cases you'll specify this, unless you're working on the default environment for the project. See [here](../guides/namespaces.md) for more about environments and namespaces.
- `--log-level` / `-l` sets the log level. Use e.g. `-l=debug` to get debug logs for the command.
- `--output` / `-o` sets the output format. Use this to get structured output from the commands. `--output=json` outputs JSON, and `--output=yaml` outputs YAML. The structure of the outputs is documented in [the reference](../reference/commands.md) for most commands.

All option flags can be specified with a space or a `=` between the flag and the value.

## `Deploy` actions

### Deploying all `Deploy`s in a project

This deploys all `Deploy` actions to the default environment and namespace.

```sh
garden deploy
```

### Deploying all `Deploy`s in a project to a non-default environment and namespace

This deploys all `Deploy` actions to `my-namespace` in the `dev` environment.

```sh
garden deploy --env my-namespace.dev
```

### Deploying a single `Deploy`

```sh
garden deploy my-deploy
```

### Deploying more than one specific `Deploy`

When arguments accept one or more actions we space-separate the names.

```sh
garden deploy deploy-a deploy-b
```

### Deploying a `Deploy` with sync enabled

See the [Code synchronization guide](../config-guides/code-synchronization.md) for more information on how to configure and use syncing for rapid iteration on `Deploy`s.

```sh
garden deploy my-deploy --sync=*
```

### Executing a command in a running `Deploy` container

```sh
garden exec my-deploy -- <command>
```

### Executing an interactive shell in a running `Deploy` container

_Note: This assumes that `sh` is available in the container._

```sh
garden exec my-deploy -- sh
```

### Getting the status of your `Deploy`s

```sh
garden get status
```

### Getting the status of your `Deploy`s in JSON format

This is suitable for parsing with e.g. the `jq` utility.

```sh
garden get status --output=json  # or `-o json` for short
```

### Stopping all running `Deploys`s

This removes all running `Deploy` actions in `my-namespace` in the `dev` environment.

```sh
garden cleanup env --env=my-namespace.dev
```

### Stopping a single running `Deploy`

```sh
garden cleanup deploy my-deploy
```

## `Test` actions

### Running all tests in a project

```sh
garden test
```

### Running a specific test and attaching

This is handy for running a single test and streaming the log outputs (`garden test`, in comparison, is more meant to run multiple ones or watch for changes, and is less suitable for getting log output).

```sh
garden test my-test -i
```

## `Run` actions

### Running a specific `Run` action

```sh
garden run my-run-action
```

## `Build` actions

### Building all `Build`s

```sh
garden build
```

### Building all `Build`s, forcing a rebuild

```sh
garden build --force  # or -f for short
```

### Building a specific `Build`

```sh
garden build my-build
```

## Workflows

### Running a workflow

Runs `my-workflow` in `my-namespace` in the `dev` environment.

```sh
garden workflow my-workflow --env=my-namespace.dev
```

## Logs

### Retrieving the latest logs for all `Deploy`s

```sh
garden logs
```

### Retrieving the latest logs for a single `Deploy`

```sh
garden logs my-deploy
```

### Stream logs for a `Deploy` action

```sh
garden logs my-deploy --follow  # or -f for short
```

## garden dev

The `garden dev` command runs the Garden interactive development console.
In that console you can execute Garden commands in interactive mode, like `build`, `deploy`, `run`, `test` and others.
To see the full list of available commands execute the `help` command in the development console.

### Running interactive development console

```sh
garden dev
```

## Sync mode

For rapid iteration on a running `Deploy` action, you can use a feature called _sync mode_.
See the [Code synchronization guide](../config-guides/code-synchronization.md) for details on how to configure and use that feature.

## Project outputs

[Project outputs](../reference/project-config.md#outputs[]) are a handy way to extract generated values from your project.

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

### Creating actions

See the [Garden basics guide](../getting-started/basics.md) to learn more about actions and how to create them.

## Remote sources

_Remote sources_ are a mechanism to connect multiple git repositories in a single Garden project. See the [remote sources guide](../config-guides/remote-sources.md) for more information, including how to use the CLI to manage these sources.

## Plugin commands

Individual plugins (currently referred to as `providers` in your project configuration) may include specific commands that help with their usage and operation. The available commands will depend on which providers are configured in your project.

You can run `garden plugins` without arguments to list the available commands.

### Initializing a Kubernetes cluster for in-cluster building

When using a remote Kubernetes cluster and in-cluster building, the cluster needs to be set up with some shared services when you first start using it, when you update the provider configuration, or sometimes when you update to a new Garden version. See the [remote kubernetes guide](../garden-for/kubernetes/remote-kubernetes.md) for more information.

Here we initialize the cluster configured for the `dev` environment:

```sh
garden plugins kubernetes cluster-init --env=dev
```

### Planning and applying Terraform stacks

The `terraform` provider includes several commands that facilitate interaction with the Terraform stacks in your project. See the [Terraform guide](../garden-for/terraform/README.md) for more information.

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
