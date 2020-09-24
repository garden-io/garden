---
order: 70
title: Workflows
---

# Workflows

Workflows allow users to define simple, CI-like sequences of Garden commands and script _steps_, that can be run from a command line, in CI pipelines or directly triggered from PRs or branches using Garden Enterprise.

Custom shell scripts can be used for preparation ahead of running Garden commands, handling outputs from the commands, and more.

A sequence of commands executed in a workflow is also generally more efficent than scripting successive runs of Garden CLI commands, since state is cached between the commands, and there is no startup delay between the commands.

## How it Works

Workflows are defined with a separate _kind_ of configuration file, with a list of _steps_:

```yaml
# workflows.garden.yml
kind: Workflow
name: my-workflow
steps:
  - ...
```

We suggest making a `workflows.garden.yml` next to your project configuration in your project root. You can also place your workflow definitions in your project root `project.garden.yml`/`garden.yml` file (with a `---` separator after the project configuration).

Each step in your workflow can either trigger Garden commands, or run custom scripts. The steps are executed in succession. If a step fails, the remainder of the workflow is aborted.

You can run a workflow by running `garden run workflow <name>`, or have it [trigger automatically](#triggers) via Garden Enterprise.

### Command steps

A simple command step looks like this:

```yaml
kind: Workflow
name: my-workflow
steps:
  - command: [deploy]  # runs garden deploy
```

You can also provide arguments to commands, and even template them:

```yaml
kind: Workflow
name: my-workflow
steps:
  - command: [run, task, ${var.task-name}]  # runs a specific task, configured by the `task-name` variable
```

{% hint style="warning" %}
Not all Garden commands can be run in workflows, and some option flags are not available. Please see the [command reference](../reference/commands.md) to see which commands are supported in workflows.
{% endhint %}

The available keys for templating can be found in the [template reference](../reference/template-strings.md#workflow-configuration-context).

### Script steps

A script step looks something like this:

```yaml
kind: Workflow
name: my-workflow
steps:
  - script: |
      echo "Hello there!"
```

Scripts can also be templated:

```yaml
kind: Workflow
name: my-workflow
steps:
  - script: |
      echo "Hello ${project.name}!"
```

### Step outputs

Workflow steps can reference outputs from previous steps, using template strings. This is particularly useful when feeding command outputs to custom scripts, e.g. for custom publishing flows, handling artifacts and whatever else you can think of.

For example, to retrieve a module version after a build:

```yaml
kind: Workflow
name: my-workflow
steps:
  - command: [build]
  - script: |
      echo "Built version ${steps.step-1.outputs.builds.my-module.version}"
```

You can also set a `name` on a step, to make it easier to reference:

```yaml
kind: Workflow
name: my-workflow
steps:
  - name: build
    command: [build]
  - name: project-outputs
    command: [get, outputs]
  - script: |
      echo "Project output foo: ${steps.project-outputs.outputs.foo}"
```

The schema of command outputs can be found in the [command reference](../reference/commands.md). Every step also exports a `log` key for the full command or script log.

### Triggers

Garden Enterprise can monitor your project repository for updates, and trigger workflows automatically on e.g. PR and branch updates.

For example, here's how you'd trigger a workflow for PRs made from any `feature/*` branch:

```yaml
kind: Workflow
name: my-workflow
steps:
  - ...
triggers:
  - environment: local
    events: [pull-request]
    branches: [feature/*]
```

For a full description of how to configure triggers, check out the [workflows reference](../reference/workflow-config.md#triggers).

## Workflows and the Stack Graph

Unlike _modules_, workflows stand outside of the Stack Graph. They cannot currently depend on each other, and nothing in the Stack Graph can reference or otherwise depend on workflows.

## Examples

### Authenticate with Google Cloud before deploying a project

{% hint style="info" %}
Here we use _secrets_ (which are a Garden Enterprise feature) for the auth key, but you can replace those template keys with corresponding `${var.*}` or `${local.env.*}` keys as well.
{% endhint %}

```yaml
kind: Workflow
name: deploy
steps:
  - name: gcloud-auth
    description: Authenticate with Google Cloud
    script: |
      export GOOGLE_APPLICATION_CREDENTIALS=$HOME/gcloud-key.json
      echo ${secrets.GCLOUD_SERVICE_KEY} > $GOOGLE_APPLICATION_CREDENTIALS
      gcloud auth activate-service-account --key-file=$GOOGLE_APPLICATION_CREDENTIALS
      gcloud --quiet config set project ${var.GOOGLE_PROJECT_ID}
      gcloud --quiet config set compute/zone ${var.GOOGLE_COMPUTE_ZONE}
      gcloud --quiet container clusters get-credentials ${var.GOOGLE_CLUSTER_ID} --zone ${var.GOOGLE_COMPUTE_ZONE}
      gcloud --quiet auth configure-docker
  - name: deploy
    command: [deploy]
```

## Next Steps

Take a look at our [Variables and Templating section](./variables-and-templating.md) for details on how to use templating in your configuration files.

Also check out [Using the CLI](./using-the-cli.md) for CLI usage examples, and some common day-to-day usage tips.
