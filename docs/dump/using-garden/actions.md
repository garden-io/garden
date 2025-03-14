---
order: 5
title: Actions
---

# Actions

_Actions_ were introduced in `0.13` and are the basic **building blocks** of a Garden project. They are usually the first thing you
add after creating the [project configuration](./projects.md).

## Motivation

Before we dive in, let's consider what's involved in building and testing an app that runs on Kubernetes—in a realistic way, like people typically do in their CI pipelines.

First, we _build_ a Docker image from source.

Then we _deploy_ the app to a Kubernetes cluster using a deployment tool like `kubectl` or `helm`. We also deploy any _dependencies_ the app may require, like databases.

Next, we may need to _run some scripts_ to load the database with a schema and some test data.

Finally, we run all our _test_ suites. Some of these (e.g. unit tests) don't require our services to be running, but others (like end-to-end tests) require several services to be running first.

This sequence of steps (some of which can be run in parallel) boils down to a set of _actions_ that need to be run in dependency order: Builds, Deploys, Tests and Runs (the last of which refers to glue steps, like the one for seeding the DB).

The same applies to large systems with tens or even hundreds of services. The only difference is that the dependency graph is correspondingly larger.

Garden is all about making your workweek more fun and productive by capturing this executable graph of actions.

## Action kinds

There are four different _kinds_ of actions in Garden.

Each of them is generic, and has several implementations in Garden via its built-in plugins.

For example, `helm` Deploys (i.e. those with `type: helm` in their configuration) deploy a Helm chart to a Kubernetes cluster, `exec` Deploys start a local process (a great fit for local development), and `terraform` Deploys apply a Terraform stack.

The four action kinds in Garden are:

- `Build` actions, e.g. to build a Docker image or to run a local build script.
- `Deploy` actions to _deploy_ a service, e.g. a Kubernetes Deployment, Helm chart or Terraform stack.
  - For those of you who have been using Garden for a while: These correspond to services in 0.12.
- `Run` actions for arbitrary scripts, e.g. to perform stateful operations (load test data into databases), download tools or any other miscellaneous steps.
  - These correspond to tasks in 0.12.
- `Test` actions to _test_ components, e.g. run unit tests, end-to-end tests or any other test suite you may have defined.

Below is a sample of the action configurations for the API service in the [`vote-helm` example project](../../examples/demo-project):

```yaml
# from examples/vote-helm/api-image/garden.yml
kind: Build
description: Image for the API backend for the voting UI
type: container # This makes Garden aware that there's a Dockerfile here that needs to be built.
name: api-image

# from examples/vote-helm/api.garden.yml
kind: Deploy
description: The API backend for the voting UI
# This action makes Garden aware there's a Helm chart here that should be deployed with the provided values.
type: helm
name: api
dependencies:
  - deploy.redis
spec:
  chart:
    path: ./base-chart/
  values:
    name: api
    image:
      # Here, we're using Garden's templating to dynamically provide the newest tag from the api-image Docker build.
      repository: ${actions.build.api-image.outputs.deployment-image-name}
      tag: ${actions.build.api-image.version}
    ingress:
      enabled: true
      paths: [/]
      # Here, we reference a shared variable from the project config at examples/vote-helm/garden.yml.
      hosts: ["api.${var.baseHostname}"]
    healthCheckPath: /api
```

## How it Works

A Garden project is usually split up into the project-level config file and several action config
files (which usually sit next to their corresponding Dockerfile/Helm chart/Terraform stack/script etc.).

```console
.
├── project.garden.yml
├── application-a
│   ├── actions.garden.yml
│   └── ...
├── application-b
│   └── build.garden.yml
|   └── Dockerfile
│   └── helm_charts
|       └── some-chart.garden.yml
|        ...
|   ...
├── application-c
     └── actions.garden.yml
     └── ...
```

Filenames ending with `.garden.yml` will be picked up by Garden.
For example, you might prefer to set the application name in the filename, e.g. `application-a.actions.garden.yml` to
make it easier to find in a large project.

Alternatively, you can have the actions grouped by [`kind`](#action-kinds) in a dedicated config file,
i.e. `deploy-actions.garden.yml`, `test-actions.garden.yml`, and so on.

Another option is to have each action defined in a separate configuration file. It might be not convenient if you have a
large number of actions in your project.

Read the sections below for more information on configuring actions, including how to control which files and
directories are included in a single action.

### Action types

Each [`kind`](#action-kinds) of action must have a _type_. Different action _types_ behave in different ways.

Garden is pluggable and features a number of action types. You can find all of them and their full reference
documentation [here](../reference/action-types/README.md), but we'll provide a high-level overview of the most commonly
used types below.

Generally, we recommend using the same deployment tools you use in CI or in production. That way, you can get up and running with Garden more easily, and also minimize the difference between your Garden environment and your production environment.

- [kubernetes](../k8s-plugins/actions/deploy/kubernetes.md) action types use Kubernetes manifests for Deploys, Tests and Runs. These support [Kustomize](https://kustomize.io/) out of the box. Use these actions when you prefer the more lightweight deployment approach of using Kubernetes manifests directly, which is a valid alternative to the Helm chart-based `helm` actions.
- [helm](../k8s-plugins/actions/deploy/helm.md) action type allow you to deploy your own Helm charts, or 3rd-party
  charts from remote repositories. [Helm](https://helm.sh/) is a powerful tool, especially when deploying 3rd-party (or
  otherwise external) charts. You can also make your own charts, but we recommend only doing so when you need its
  flexible templating capabilities, or if you aim to publish the charts.
- `exec` actions offer a flexible way to weave in arbitrary scripts and
  commands that are executed locally. These can be custom build steps, unit tests, scripts, tests or really anything else. The
  caveat is that they always run on the same machine as the Garden CLI, and not e.g. in a Kubernetes cluster, and thus
  not quite as portable. See the reference guide for the `exec` [Build](../reference/action-types/Build/exec.md), [Deploy](../reference/action-types/Deploy/exec.md), [Test](../reference/action-types/Test/exec.md) and [Run](../reference/action-types/Run/exec.md) actions for more details.
- [container](../other-plugins/container.md) action type is a high level and portable way to describe how container
  images are both built and deployed. When working with containers you'll at least use this to build the images, but you
  may also specify `Deploy`, `Run` and `Test` actions on them. The `kubernetes` providers, for example, can take these
  service definitions, generate Kubernetes manifests and deploy them. This is generally much easier to use than the
  below `kubernetes` and `helm` action types, but in turn loses some flexibility of those two.
- [terraform](../reference/action-types/Deploy/terraform.md) offer a powerful way to deploy any cloud resources as part
  of your project. See the [Terraform guide](../terraform-plugin/README.md) for more information.

There are several other action types available as well. See
the [action types reference](../reference/action-types/README.md) for a full list of supported action types, and their
configuration reference.

### Including and excluding files

By default, all files in the same directory as an action configuration file are included as source files for that
action.
Sometimes you need more granular control over the context, not least if you have multiple actions in the same directory.

The `include` and `exclude` fields are used to explicitly specify which sources should belong to a particular
action. Both of them accept a list of POSIX-style paths or globs. For example:

```yaml
kind: Build
description: My container
type: container
include:
  - Dockerfile
  - my-sources/**/*.py
exclude:
  - my-sources/tmp/**/*
```

{% hint style="info" %}
Generally, using `.gardenignore` files is far more performant than exclude config statements and will decrease
graph resolution time. Read more about `.gardenignore` files in the
[configuration-overview documentation](./configuration-overview.md#includingexcluding-files-and-directories)
{% endhint %}

Here we only include the `Dockerfile` and all the `.py` files under `my-sources/`, but exclude the `my-sources/tmp`
directory.

If you specify a list with `include`, only those files/patterns are included. If you then specify one or more `exclude`
files or patterns, those are filtered out of the files matched by `include`. If you _only_ specify `exclude`, those
patterns will be filtered out of all files in the action directory.

Note that the action `include` and `exclude` fields have no effect on which paths Garden watches for changes. Use
the [project `scan.exclude` field](./projects.md) for that purpose.

You can also use [.gardenignore file](./configuration-overview.md#ignore-file), much like `.gitignore` files, to exclude
files across your project. You can place them in your project root, in action roots, and even in individual
sub-directories of actions.

{% hint style="warning" %}
Note that you **must** use the `include` and/or `exclude` directives (described above) when action paths overlap. This
is to help users steer away from subtle bugs that can occur when actions unintentionally consume source files from other
actions. See the next section for details on including and excluding files.
{% endhint %}

### Differences in exclude behavior between the `repo` and `subtree` Git scan modes when no include is configured

This section is only relevant for users who have set `scan.git.mode` to `subtree` in their project config.

Garden supports two modes for scanning Git repositories (and any submodules) for files:
* `repo` (the default): Scans entire repositories and then filters down to files matching the paths, includes and
excludes for each action/module. This can be considerably more efficient than the `subtree` mode for large projects
with many actions/modules.
* `subtree` (legacy): This was Garden's scan algoithm before the `repo` scan mode was introduced. This method runs
individual `git` scans on each action/module path.

When no includes are configured in the module/action config but there are one or more excludes in the config,
the `subtree` mode will interpret all exclude paths as globs. For example, excluding `foo.txt` would also exclude
`dir/foo.txt` (and any path that contains the string `foo.txt`).

This is because the `subtree` scan mode uses the `--exclude` flag of `git ls-files` under the hood for perfomance
reasons. Note that this only happens when no includes are specified, and only when using the `subtree` scan mode
(which needs to be explicitly set in the project config).

We're leaving this inconsistency with the older `subtree` mode in place to avoid breaking changes to the Garden configs
of users with older projects whose include/exclude configs rely on the exclude semantics of the `subtree` mode as is.

The newer `repo` mode doesn't have this inconsistency, since it uses a different method to compute the file list for
an action/module.

## Actions in the Stack Graph

The key concept and the main benefit of having _actions_ instead of modules is that **anything can depend on anything**.

Some [prior constraints](./modules.md#modules-in-the-stack-graph), that have tripped people up in the past, have been
dropped. A dependency is then specified as `<kind>.<name>`, e.g. `build.my-image` or `deploy.my-deploy`.
There will still be some specific semantics for different types of dependencies, but quite a bit simpler than before
(which was often difficult to reason about as well).

## Examples

In this section we consider a few very basic examples with configuration code-snippets.
See more [examples on our GitHub repository](../../examples).

### Container Build action

Below is the configuration for a simple container `Build` action. Here we're assuming that the `Dockerfile` and source
files are in the same directory as the `garden.yml` file.

```yaml
kind: Build
name: backend
description: Backend app container
type: container
```

### Multiple Actions in the Same File

In this example, we declare multiple container `Build` actions in the same file. We use the `include` directive to tell
Garden where the source code for each action resides.

```yaml
kind: Build
name: backend
description: Backend app container
type: container
include:
  - backend/**/*
---
kind: Build
name: frontend
description: Frontend app container
type: container
include:
  - frontend/**/*
```

### Container Build Action with a Remote Image

In this example, we use the `image` directive to include an external Docker image with the project. This action has no
source code of its own.

```yaml
kind: Build
name: postgres-db
description: Postgres DB container
type: container
image: postgres:11.7-alpine
```

## Advanced

### Disabling Actions

You can disable actions by setting `disabled: true` in the action config file. You can also disable it conditionally
using template strings. For example, to disable a particular action for a specific environment, you could do something
like this:

```yaml
kind: Deploy
description: Postgres container for storing voting results
type: helm
name: db
disabled: ${environment.name == "prod"}
spec:
  chart:
    name: postgresql
    repo: https://charts.bitnami.com/bitnami
    version: "12.4.2"
  values:
    # This is a more digestable name than the default one in the template
    fullnameOverride: postgres
    auth:
      # This should of course not be used in production
      postgresPassword: postgres
```

If a disabled action is referenced as a _build_ dependency of another action it will still
be executed to ensure the dependant action can be built as expected.

Disabled actions are skipped with other action kinds and dependency declarations to them are ignored.
Template strings referencing runtime outputs will fail to resolve when the action is
disabled, so you need to make sure to provide alternate values for them using conditional
expressions.

See the [disabled-config example](../../examples/disabled-configs) for more details.

## Further Reading

- [Action type reference docs](../reference/action-types/README.md).
- [A guide on the container action type](../other-plugins/container.md).

## Next Steps

Take a look at our [Workflows section](./workflows.md) to learn how to define sequences of Garden commands and custom
scripts.
