---
order: 45
title: Workflow Configuration
---

# Workflow Configuration Reference

Below is the schema reference for [Workflow](../features/workflows.md) configuration files.

The reference is divided into two sections:
* [YAML Schema](#yaml-schema) contains the config YAML schema
* [Configuration keys](#configuration-keys) describes each individual schema key for the configuration files.

## YAML Schema

The values in the schema below are the default values.

```yaml
kind: Workflow

# The name of this workflow.
name:

# A description of the workflow.
description:

# A map of environment variables to use for the workflow. These will be available to all steps in the workflow.
envVars: {}

# A list of files to write before starting the workflow.
#
# This is useful to e.g. create files required for provider authentication, and can be created from data stored in
# secrets or templated strings.
#
# Note that you cannot reference provider configuration in template strings within this field, since they are resolved
# after these files are generated. This means you can reference the files specified here in your provider
# configurations.
files:
  - # POSIX-style path to write the file to, relative to the project root (or absolute). If the path contains one
    # or more directories, they are created automatically if necessary.
    # If any of those directories conflict with existing file paths, or if the file path conflicts with an existing
    # directory path, an error will be thrown.
    # **Any existing file with the same path will be overwritten, so be careful not to accidentally overwrite files
    # unrelated to your workflow.**
    path:

    # The file data as a string.
    data:

    # The name of a Garden secret to copy the file data from (Garden Cloud only).
    secretName:

# The number of hours to keep the workflow pod running after completion.
keepAliveHours: 48

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

limits:
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
    # to "my-step", following steps can reference the ${steps.my-step.outputs.*} key in the `script` or `command`
    # fields.
    name:

    # A Garden command this step should run, followed by any required or optional arguments and flags.
    #
    # Note that commands that are _persistent_—e.g. the dev command, commands with a watch flag set, the logs command
    # with following enabled etc.—are not supported. In general, workflow steps should run to completion.
    #
    # Global options like --env, --log-level etc. are currently not supported for built-in commands, since they are
    # handled before the individual steps are run.
    command:

    # A description of the workflow step.
    description:

    # A map of environment variables to use when running script steps. Ignored for `command` steps.
    #
    # Note: Environment variables provided here take precedence over any environment variables configured at the
    # workflow level.
    envVars: {}

    # A bash script to run. Note that the host running the workflow must have bash installed and on path.
    # It is considered to have run successfully if it returns an exit code of 0. Any other exit code signals an error,
    # and the remainder of the workflow is aborted.
    #
    # The script may include template strings, including references to previous steps.
    script:

    # Set to true to skip this step. Use this with template conditionals to skip steps for certain environments or
    # scenarios.
    skip: false

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
    # See the [workflows guide](https://docs.garden.io/cedar-0.14/features/workflows#the-skip-and-when-options) for
    # details
    # and examples.
    when: onSuccess

    # Set to true to continue if the step errors.
    continueOnError: false

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
    # `pull-request`, `pull-request-closed`, `pull-request-merged`, `pull-request-opened`, `pull-request-reopened`,
    # `pull-request-updated`, `push`
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

    # If specified, do not run the workflow for pull/merge requests whose base branch matches one of these filters.
    ignoreBaseBranches:
```

## Configuration Keys


### `kind`

| Type     | Allowed Values | Default      | Required |
| -------- | -------------- | ------------ | -------- |
| `string` | "Workflow"     | `"Workflow"` | Yes      |

### `name`

The name of this workflow.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

Example:

```yaml
name: "my-workflow"
```

### `description`

A description of the workflow.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `envVars`

A map of environment variables to use for the workflow. These will be available to all steps in the workflow.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `files[]`

A list of files to write before starting the workflow.

This is useful to e.g. create files required for provider authentication, and can be created from data stored in secrets or templated strings.

Note that you cannot reference provider configuration in template strings within this field, since they are resolved after these files are generated. This means you can reference the files specified here in your provider configurations.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | No       |

### `files[].path`

[files](#files) > path

POSIX-style path to write the file to, relative to the project root (or absolute). If the path contains one
or more directories, they are created automatically if necessary.
If any of those directories conflict with existing file paths, or if the file path conflicts with an existing directory path, an error will be thrown.
**Any existing file with the same path will be overwritten, so be careful not to accidentally overwrite files unrelated to your workflow.**

| Type        | Required |
| ----------- | -------- |
| `posixPath` | No       |

Example:

```yaml
files:
  - path: ".auth/kubeconfig.yaml"
```

### `files[].data`

[files](#files) > data

The file data as a string.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `files[].secretName`

[files](#files) > secretName

The name of a Garden secret to copy the file data from (Garden Cloud only).

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `keepAliveHours`

The number of hours to keep the workflow pod running after completion.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `number` | `48`    | No       |

### `resources`

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `resources.requests`

[resources](#resources) > requests

| Type     | Default                  | Required |
| -------- | ------------------------ | -------- |
| `object` | `{"cpu":50,"memory":64}` | No       |

### `resources.requests.cpu`

[resources](#resources) > [requests](#resourcesrequests) > cpu

The minimum amount of CPU the workflow needs in order to be scheduled, in millicpus (i.e. 1000 = 1 CPU).

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `resources.requests.memory`

[resources](#resources) > [requests](#resourcesrequests) > memory

The minimum amount of RAM the workflow needs in order to be scheduled, in megabytes (i.e. 1024 = 1 GB).

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `resources.limits`

[resources](#resources) > limits

| Type     | Default                      | Required |
| -------- | ---------------------------- | -------- |
| `object` | `{"cpu":1000,"memory":1024}` | No       |

### `resources.limits.cpu`

[resources](#resources) > [limits](#resourceslimits) > cpu

The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU).

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `resources.limits.memory`

[resources](#resources) > [limits](#resourceslimits) > memory

The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB).

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `limits`

{% hint style="warning" %}
**Deprecated**: Please use the `resources.limits` configuration field instead.
{% endhint %}

| Type     | Required |
| -------- | -------- |
| `object` | No       |

### `limits.cpu`

[limits](#limits) > cpu

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

The maximum amount of CPU the workflow pod can use, in millicpus (i.e. 1000 = 1 CPU).

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `limits.memory`

[limits](#limits) > memory

{% hint style="warning" %}
**Deprecated**: This field will be removed in a future release.
{% endhint %}

The maximum amount of RAM the workflow pod can use, in megabytes (i.e. 1024 = 1 GB).

| Type     | Required |
| -------- | -------- |
| `number` | No       |

### `steps[]`

The steps the workflow should run. At least one step is required. Steps are run sequentially. If a step fails, subsequent steps are skipped.

| Type            | Default | Required |
| --------------- | ------- | -------- |
| `array[object]` | `[]`    | Yes      |

### `steps[].name`

[steps](#steps) > name

An identifier to assign to this step. If none is specified, this defaults to "step-<number of step>", where
<number of step> is the sequential number of the step (first step being number 1).

This identifier is useful when referencing command outputs in following steps. For example, if you set this
to "my-step", following steps can reference the ${steps.my-step.outputs.*} key in the `script` or `command`
fields.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `steps[].command[]`

[steps](#steps) > command

A Garden command this step should run, followed by any required or optional arguments and flags.

Note that commands that are _persistent_—e.g. the dev command, commands with a watch flag set, the logs command with following enabled etc.—are not supported. In general, workflow steps should run to completion.

Global options like --env, --log-level etc. are currently not supported for built-in commands, since they are handled before the individual steps are run.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

Example:

```yaml
steps:
  - command:
      - run
      - my-task
```

### `steps[].description`

[steps](#steps) > description

A description of the workflow step.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `steps[].envVars`

[steps](#steps) > envVars

A map of environment variables to use when running script steps. Ignored for `command` steps.

Note: Environment variables provided here take precedence over any environment variables configured at the
workflow level.

| Type     | Default | Required |
| -------- | ------- | -------- |
| `object` | `{}`    | No       |

### `steps[].script`

[steps](#steps) > script

A bash script to run. Note that the host running the workflow must have bash installed and on path.
It is considered to have run successfully if it returns an exit code of 0. Any other exit code signals an error,
and the remainder of the workflow is aborted.

The script may include template strings, including references to previous steps.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `steps[].skip`

[steps](#steps) > skip

Set to true to skip this step. Use this with template conditionals to skip steps for certain environments or scenarios.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

Example:

```yaml
steps:
  - skip: "${environment.name != 'prod'}"
```

### `steps[].when`

[steps](#steps) > when

If used, this step will be run under the following conditions (may use template strings):

`onSuccess` (default): This step will be run if all preceding steps succeeded or were skipped.

`onError`: This step will be run if a preceding step failed, or if its preceding step has `when: onError`.
If the next step has `when: onError`, it will also be run. Otherwise, all subsequent steps are ignored.

`always`: This step will always be run, regardless of whether any preceding steps have failed.

`never`: This step will always be ignored.

See the [workflows guide](https://docs.garden.io/cedar-0.14/features/workflows#the-skip-and-when-options) for details
and examples.

| Type     | Default       | Required |
| -------- | ------------- | -------- |
| `string` | `"onSuccess"` | No       |

### `steps[].continueOnError`

[steps](#steps) > continueOnError

Set to true to continue if the step errors.

| Type      | Default | Required |
| --------- | ------- | -------- |
| `boolean` | `false` | No       |

### `triggers[]`

A list of triggers that determine when the workflow should be run, and which environment should be used (Garden Cloud only).

| Type            | Required |
| --------------- | -------- |
| `array[object]` | No       |

### `triggers[].environment`

[triggers](#triggers) > environment

The environment name (from your project configuration) to use for the workflow when matched by this trigger.

| Type     | Required |
| -------- | -------- |
| `string` | Yes      |

### `triggers[].namespace`

[triggers](#triggers) > namespace

The namespace to use for the workflow when matched by this trigger. Follows the namespacing setting used for this trigger's environment, as defined in your project's environment configs.

| Type     | Required |
| -------- | -------- |
| `string` | No       |

### `triggers[].events[]`

[triggers](#triggers) > events

A list of [GitHub events](https://docs.github.com/en/developers/webhooks-and-events/webhooks/webhook-events-and-payloads) that should trigger this workflow.

See the Garden Cloud documentation on [configuring workflows](https://cloud.docs.garden.io/getting-started/workflows) for more details.

Supported events:

`pull-request`, `pull-request-closed`, `pull-request-merged`, `pull-request-opened`, `pull-request-reopened`, `pull-request-updated`, `push`



| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `triggers[].branches[]`

[triggers](#triggers) > branches

If specified, only run the workflow for branches matching one of these filters. These filters refer to the pull/merge request's head branch (e.g. `my-feature-branch`), not the base branch that the pull/merge request would be merged into if approved (e.g. `main`).

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `triggers[].baseBranches[]`

[triggers](#triggers) > baseBranches

If specified, only run the workflow for pull/merge requests whose base branch matches one of these filters.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `triggers[].ignoreBranches[]`

[triggers](#triggers) > ignoreBranches

If specified, do not run the workflow for branches matching one of these filters. These filters refer to the pull/merge request's head branch (e.g. `my-feature-branch`), not the base branch that the pull/merge request would be merged into if approved (e.g. `main`).

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

### `triggers[].ignoreBaseBranches[]`

[triggers](#triggers) > ignoreBaseBranches

If specified, do not run the workflow for pull/merge requests whose base branch matches one of these filters.

| Type            | Required |
| --------------- | -------- |
| `array[string]` | No       |

