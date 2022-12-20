---
title: Container
order: 4
---
# Container

Garden includes a `container` plugin, which provides a high-level abstraction around container-based services, that's easy to understand and use.

The plugin is built-in and doesn't require any configuration.

The corresponding `container` module type can be used to just _build_ container images, or it can specify deployable services through the optional `services` key, as well as `tasks` and `tests`. So you might in one scenario use a `container` module to both build and deploy services, and in another you might only build the image using a `container` module, and then refer to that image in a `helm` or `kubernetes` module.

Below we'll walk through some usage examples. For a full reference of the `container` module type, please take a look at the [reference](../reference/module-types/container.md).

_Note: Even though we've spent the most time on supporting Kubernetes, we've tried to design this module type in a way that makes it generically applicable to other container orchestrators as well, such as Docker Swarm, Docker Compose, AWS ECS etc. This will come in handy as we add more providers, that can then use the same module type._

## Building images

A bare minimum `container` module just specifies common required fields:

```yaml
# garden.yml
kind: Module
type: container
name: my-container
```

If you have a `Dockerfile` next to this file, this is enough to tell Garden to build it. You can also specify `dockerfile: <path-to-Dockerfile>` if you need to override the Dockerfile name. You might also want to explicitly [include or exclude](../using-garden/configuration-overview.md#includingexcluding-files-and-directories) files in the build context.

### Build arguments

You can specify [build arguments](https://docs.docker.com/engine/reference/commandline/build/#set-build-time-variables---build-arg) using the [`buildArgs`](../reference/module-types/container.md#buildArgs) field. This can be quite handy, especially when e.g. referencing other modules such as build dependencies:

```yaml
# garden.yml
kind: Module
type: container
name: my-container
build:
  dependencies: [base-image]
buildArgs:
  baseImageVersion: ${modules.base-image.version}
```

Garden will also automatically set `GARDEN_MODULE_VERSION` as a build argument, so that you can reference the version of module being built.

## Using remote images

If you're not building the container image yourself and just need to deploy an external image, you can skip the Dockerfile and specify the `image` field:

```yaml
# garden.yml
kind: Module
type: container
name: redis
image: redis:5.0.5-alpine   # <- replace with any docker image ID
services:
  ...
```

{% hint style="warning" %}
Note that if there is a _Dockerfile_ in the same directory as the module configuration, and you still don't want to build it, you have to tell Garden not to pick it up by setting `include: []` in your module configuration.
{% endhint %}

## Publishing images

You can publish images that have been built in your cluster using the `garden publish` command.

Unless you're publishing to your configured deployment registry (when using the `kubernetes` provider), you need to specify the `image` field on the `container` module in question to indicate where the image should be published. For example:

```yaml
kind: Module
name: my-module
image: my-repo/my-image:v1.2.3   # <- if you omit the tag here, the Garden module version will be used by default
...
```

By default, we use the tag specified in the `container` module `image` field, if any. If none is set there, we default to the Garden module version.

You can also set the `--tag` option on the `garden publish` command to override the tag used for images. You can both set a specific tag or you can _use template strings for the tag_. For example, you can

- Set a specific tag on all published modules: `garden publish --tag "v1.2.3"`
- Set a custom prefix on tags but include the Garden version hash: `garden publish --tag 'v0.1-${module.hash}'`
- Set a custom prefix on tags with the current git branch: `garden publish --tag 'v0.1-${git.branch}'`

{% hint style="warning" %}
Note that you most likely need to wrap templated tags with single quotes, to prevent your shell from attempting to perform its own substitution.
{% endhint %}

Generally, you can use any template strings available for module configs for the tags, with the addition of the following:

- `${module.name}` — the name of the module being tagged
- `${module.version}` — the full Garden version of the module being tagged, e.g. `v-abcdef1234`
- `${module.hash}` — the Garden version hash of the module being tagged, e.g. `abcdef1234` (i.e. without the `v-` prefix)

## Deploying services

The Kubernetes plugins (local or remote) can deploy container modules. You'll find the relevant information in [this guide](./kubernetes/module-types/container.md) and the full spec in our [reference docs](../reference/module-types/container.md#services).

## Running tests

You can define both tests and tasks as part of any container module. The two are configured in very similar ways, using the `tests` and `tasks` keys, respectively. Here, for example, is a configuration for two different test suites:

```yaml
kind: Module
type: container
name: my-container
...
tests:
  - name: unit
    command: [npm, test]
  - name: integ
    command: [npm, run, integ]
    dependencies:
      - some-service
...
```

Here we first define a `unit` test suite, which has no dependencies, and simply runs `npm test` in the container. The `integ` suite is similar but adds a _runtime dependency_. This means that before the `integ` test is run, Garden makes sure that `some-service` is running and up-to-date.

When you run `garden test` or `garden dev` we will run those tests. In both cases, the tests will be executed by running the container with the specified command _in your configured environment_ (as opposed to locally on the machine you're running the `garden` CLI from).

The names and commands to run are of course completely up to you, but we suggest naming the test suites consistently across your different modules.

See the [reference](../reference/module-types/container.md#tests) for all the configurable parameters for container tests.

## Running tasks

Tasks are defined very similarly to tests:

```yaml
kind: Module
type: container
name: my-container
...
tasks:
  - name: db-migrate
    command: [rake, db:migrate]
    dependencies:
      - my-database
...
```

In this example, we define a `db-migrate` task that runs `rake db:migrate` (which is commonly used for database migrations, but you can run anything you like of course). The task has a dependency on `my-database`, so that Garden will make sure the database is up and running before running the migration task.

Unlike tests, tasks can also be dependencies for services and other tasks. For example, you might define another task or a service with `db-migrate` as a dependency, so that it only runs after the migrations have been executed.

One thing to note, is that tasks should in most cases be _idempotent_, meaning that running the same task multiple times should be safe.

See the [reference](../reference/module-types/container.md#tasks) for all the configurable parameters for container tasks.

## Referencing from other modules

Modules can reference outputs from each other using [template strings](../using-garden/variables-and-templating.md#template-string-basics). `container` modules are, for instance, often referenced by other module types such as `helm` module types. For example:

```yaml
kind: Module
description: Helm chart for the worker container
type: helm
name: my-service
...
build:
  dependencies: [my-image]
values:
  image:
    name: ${modules.my-image.outputs.deployment-image-name}
    tag: ${modules.my-image.version}
```

Here, we declare `my-image` as a dependency for the `my-service` Helm chart. In order for the Helm chart to be able to reference the built container image, we must provide the correct image name and version.

For a full list of keys that are available for the `container` module type, take a look at the [outputs reference](../reference/module-types/container.md#outputs).

## Mounting volumes and Kubernetes ConfigMaps

`container` services, tasks and tests can all mount volumes and Kubernetes Configmaps.

For mounting volumes, check out our guide on the [`persistentvolumeclaim` module type](./kubernetes/module-types/persistentvolumeclaim.md), supported by the `kubernetes` provider.

And for ConfigMaps, check out this guide on the [`configmap` module type](./kubernetes/module-types/configmap.md), also supported by the `kubernetes` provider.

