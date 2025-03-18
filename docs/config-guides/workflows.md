---
order: 5
title: Workflows
---

# Workflows

Workflows allow users to define simple, CI-like sequences of Garden commands and script _steps_, that can be run from a command line, in CI pipelines or directly triggered from PRs or branches using Garden Cloud.

Custom shell scripts can be used for preparation ahead of running Garden commands, handling outputs from the commands, and more.

A sequence of commands executed in a workflow is also generally more efficent than scripting successive runs of Garden CLI commands, since state is cached between the commands, and there is no startup delay between the commands.

{% hint style="warning" %}
As of Garden 0.13, the CLI command to run a Workflow is `garden workflow` instead of `garden run workflow`.
{% endhint %}

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

You can run a workflow by running `garden workflow <name>`, or have it [trigger automatically](#triggers) via Garden Cloud.

### Command steps

A simple command step looks like this:

```yaml
kind: Workflow
name: my-workflow
steps:
  - command: [deploy] # runs garden deploy
```

You can also provide arguments to commands, and even template them:

```yaml
kind: Workflow
name: my-workflow
steps:
  - command: [run, ${var.task-name}]  # runs a specific task, configured by the `task-name` variable
```

{% hint style="warning" %}
Not all Garden commands can be run in workflows, and some option flags are not available. Please see the [command reference](../reference/commands.md) to see which commands are supported in workflows.
{% endhint %}

The available keys for templating can be found in the [template reference](../reference/template-strings/workflows.md).

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

### Environment variables

To explicitly provide environment variables to the steps of a workflow, you can use the `workflow.envVars` field:

```yaml
kind: Workflow
name: my-workflow
envVars:
  MY_ENV_VAR: some-value
  MY_PROJECT_VAR: ${var.my-var} # Use template strings
  SECRET_ACCESS_TOKEN: ${secrets.SECRET_ACCESS_TOKEN} # Use a Garden Enterprise secret
```

Workflow-level environment variables like this can be useful e.g. for providing templated values (such as secrets or project variables) to several script steps, or to initialize providers in the context of a CI system.

Note that workflow-level environment variables apply to all steps of a workflow (both command and script steps).

### The `skip` and `when` options

By default, a workflow step is run if all previous steps have been run without errors. Sometimes, it can be useful to override this default behavior with the `skip` and `when` fields on workflow steps.

The `skip` field is a boolean. If its value is `true`, the step will be skipped, and the next step will be run as if the skipped step succeeded.

Note that skipped steps don't produce any outputs (see the [step outputs](#step-outputs) section below for more). However, skipped steps are shown in the command log.

The `when` field can be used with the following values:

- `onSuccess` (default): This step will be run if all preceding steps succeeded or were skipped.
- `onError`: This step will be run if a preceding step failed, or if its preceding step has `when: onError`. If the next step has `when: onError`, it will also be run. Otherwise, all subsequent steps are ignored. See below for more.
- `always`: The step will always be run, regardless of whether any previous steps have failed.
- `never`: The step will always be ignored, even if all previous steps succeeded. Note: Ignored steps don't show up in the command logs.

The simplest usage pattern for `onError` steps is to place them at the end of your workflow (which ensures that they're run if any step in your workflow fails):

```yaml
kind: Workflow
name: my-workflow
steps:
  - command: [run, my-task]
  - command: [deploy]
  - command: [test]
  - script: |
      echo "Run if any of the previous steps failed"
    when: onError
  - script: echo "This task is always run, regardless of whether any previous steps failed."
    when: always
```

A more advanced use case is to use `onError` steps to set up "error handling checkpoints" in your workflow.

For example, if the first step (`run my-task`) fails in this workflow:

```yaml
kind: Workflow
name: my-workflow
steps:
  - command: [run, my-task]
  - script: |
      echo "Run if my-task step failed"
    when: onError
  - script: |
      echo "Also run if my-task step failed"
    when: onError
  - command: [deploy]
  - command: [test]
  - script: |
      echo "Run if the deploy or test steps failed"
    when: onError
  - script: | # Finally, an `always` step (for example, to clean up the staging environment)
      echo "This task is always run, regardless of whether any previous steps failed."
    when: always
```

then the first two `onError` steps will be run, and all other steps will be skipped (except for the last one, since it has `when: always`). This can be useful for rollback operations that are relevant only at certain points in the workflow.

You can also template the values of `skip` and `when` for even more flexibility. For example:

```yaml
kind: Workflow
name: my-workflow
steps:
  - script: |
      echo "Fetching credentials for staging environment"
    skip: ${environment.name != "staging"} # This step is only run in the staging environment
  - command: [deploy]
  - script: |
      echo "Run if deploy step failed"
    when: onError
  - script: |
      echo "Also run if deploy step failed"
    when: onError
  - command: [build]
    when: never # This is never run
  - command: [test]
  - script: |
      echo "Run if test step failed, but not if the deploy step failed"
    when: onError
  - script: | # Finally, an `always` step (for example, to clean up the staging environment)
      echo "Clean up staging environment, regardless of whether the workflow succeeded or failed."
    when: "${environment.name == 'staging' ? 'always' : 'never'}"
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
      echo "Built version ${steps.step-1.outputs.build.my-build-action.version}"
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

Garden Cloud can monitor your project repository for updates, and trigger workflows automatically on e.g. PR and branch updates.

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

Unlike _actions_, workflows stand outside of the Stack Graph. They cannot currently depend on each other, and nothing in the Stack Graph can reference or otherwise depend on workflows.

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

Also check out [Using the CLI](../guides/using-the-cli.md) for CLI usage examples, and some common day-to-day usage tips.
