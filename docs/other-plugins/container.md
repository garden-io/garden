---
title: Container
order: 1
---

# Container

Garden includes a `container` plugin, which provides a high-level abstraction around container-based applications.

The plugin is built-in and doesn't require any configuration.

The corresponding `container` action type can be used to

* [build](../reference/action-types/Build/container.md) container images
* [deploy](../reference/action-types/Deploy/container.md) container-based applications
* [run scripts](../reference/action-types/Run/container.md) inside deployed container-based applications
* [run tests](../reference/action-types/Test/container.md) inside deployed container-based applications

Below we'll walk through some usage examples. For a full reference of the `container` action type, please take a look at
the [reference guides](../reference/action-types).

_Note: Even though we've spent the most time on supporting Kubernetes, we've tried to design this action type in a way
that makes it generically applicable to other container orchestrators as well, such as Docker Swarm, Docker Compose, AWS
ECS etc. This will come in handy as we add more providers, that can then use the same action type._

## Building images

Following is a bare minimum `container Build` action configuration using the required fields:

```yaml
# garden.yml
kind: Build
type: container
name: my-container
```

If you have a `Dockerfile` next to this file, this is enough to tell Garden to build it. However, you can override
the `Dockerfile` name or path by specifying `spec.dockerfile: <path-to-Dockerfile>`.
You might also want to
explicitly [include or exclude](../using-garden/configuration-overview.md#includingexcluding-files-and-directories)
files in the build context.

### Build arguments

You can specify
[build arguments](https://docs.docker.com/engine/reference/commandline/build/#build-arg)
using the [`spec.buildArgs`](../reference/action-types/Build/container.md#specbuildargs) field. This can be quite handy,
especially when e.g. referencing other `Build` action as build dependencies:

```yaml
# garden.yml
kind: Build
type: container
name: my-container
dependencies: [ build.base-image ]
spec:
  buildArgs:
    baseImageVersion: ${actions.build.base-image.version}
```

Additionally, Garden automatically sets `GARDEN_ACTION_VERSION` as a build argument, which you can use to reference the
version of action being built.

## Using remote images

If you're not building the container image yourself and just need to deploy an external image, you do not need to
define a `Build` action. You only need to define a `Deploy` action:

```yaml
# garden.yml
kind: Deploy
type: container
name: redis
spec:
  image: redis:5.0.5-alpine   # <- replace with any docker image ID
```

## Publishing images

You can publish images that have been built in your cluster using the `garden publish` command.

Unless you're publishing to your configured deployment registry (when using the `kubernetes` provider), you need to
specify the `publishId` field on the `container` action's `spec` in question to indicate where the image should be
published. For example:

```yaml
kind: Build
name: my-build
type: container
spec:
  publishId: my-repo/my-image:v1.2.3   # <- if you omit the tag here, the Garden action version will be used by default
```

By default, we use the tag specified in the `container` action's `spec.publishId` field. If none is set,
we default to the Garden `Build` action version.

You can also set the `--tag` option on the `garden publish` command to override the tag used for images. You can both
set a specific tag or you can _use template strings for the tag_. For example, you can

- Set a specific tag on all published builds: `garden publish --tag "v1.2.3"`
- Set a custom prefix on tags but include the Garden version hash: `garden publish --tag 'v0.1-${build.hash}'`
- Set a custom prefix on tags with the current git branch: `garden publish --tag 'v0.1-${git.branch}'`

{% hint style="warning" %}
Note that you most likely need to wrap templated tags with single quotes, to prevent your shell from attempting to
perform its own substitution.
{% endhint %}

Generally, you can use any template strings available for action configs for the tags, with the addition of the
following:

- `${build.name}` — the name of the build being tagged
- `${build.version}` — the full Garden version of the build being tagged, e.g. `v-abcdef1234`
- `${build.hash}` — the Garden version hash of the build being tagged, e.g. `abcdef1234` (i.e. without the `v-`
  prefix)

## Deploying applications

The Kubernetes plugins (local or remote) can deploy `container Deploy` actions. You'll find the relevant information
in [this guide](../k8s-plugins/action-types/container.md) and the full spec in
our [reference docs](../reference/action-types/Deploy/container.md).

## Running tests

For `container` type, you can define both `Test` and `Run` actions. The two are configured in a very similar way.
Here is a configuration example for two different test suites:

```yaml
kind: Test
name: my-app-unit
type: container
build: my-app
spec:
  args: [ npm, test ]

---

kind: Test
name: my-app-integ
type: container
build: my-app
dependencies:
  - deploy.my-app
spec:
  args: [ npm, run, integ ]

```

Here we first define a `unit` test suite, which has no dependencies, and simply runs `npm test` in the `my-app`
container.

The `integ` suite is similar but adds a _runtime dependency_. This means that before the `integ` test is run, Garden
makes sure that `my-app` is running and up-to-date.

When you run `garden test`, we will run those tests. The tests will be executed by running the container with the
specified command _in your configured environment_ (as opposed to locally on the machine you're running the `garden` CLI
from).

The names and commands to run are of course completely up to you, but we suggest naming the test suites consistently
across your different action configurations.

See the [reference](../reference/action-types/Test/container.md) for all the configurable parameters
for `container Test` actions.

## Running arbitrary workloads

To run arbitrary workloads, any scripts or jobs, you can use the `Run` action which is defined similarly to the `Test`
action:

```yaml
kind: Run
type: container
name: my-container
dependencies: [ deploy.my-database ]
spec:
  command: [ rake, db:migrate ]
```

In this example, we define a `db-migrate` `Run` action that executes `rake db:migrate` (which is commonly used for
database migrations, but you can run anything you like of course). The action has a dependency on `my-database` `Deploy`
action, so that Garden will make sure the database is deployed before running the migration job.

Since Garden `0.13` `Test` actions can also be dependencies for any other kinds of actions, e.g `Build`, `Deploy`
and `Run` actions.

One thing to note, is that `Run` actions should in most cases be _idempotent_, meaning that running the same `Run`
action
multiple times should be safe.

See the [reference](../reference/action-types/Run/container.md#tasks) for all the configurable parameters
for `container Run` actions.

## Referencing from other actions

Actions can reference outputs from each other
using [template strings](../using-garden/variables-and-templating.md#template-string-basics).
For example, `container` actions are often referenced by `helm` actions:

```yaml
kind: Deploy
description: Helm chart for the worker container
type: helm
name: my-app
spec:
  values:
    image:
      name: ${actions.build.my-image.outputs.deployment-image-name}
      tag: ${actions.build.my-image.version}
```

Here we do not need to declare an explicit _build_ dependency on `my-image` like `dependencies: [ build.my-app ]`.
Instead, we do it implicitly via the references to the `Build` action outputs in `spec.values.image`.

For a full list of keys that are available for the `container` action type, take a look at
the _outputs_ reference
of [`Build`](../reference/action-types/Build/container.md#outputs),
[`Deploy`](../reference/action-types/Deploy/container.md#outputs),
[`Run`](../reference/action-types/Run/container.md#outputs),
and [`Test`](../reference/action-types/Test/container.md#outputs) action kinds.

## Mounting volumes and Kubernetes ConfigMaps

_Runtime_ `container` actions (i.e. `Deploy`, `Run`, and `Test`) can all mount volumes and Kubernetes Configmaps.

For mounting volumes, check out our guide on
the [`persistentvolumeclaim` action type](../k8s-plugins/action-types/persistentvolumeclaim.md), supported by
the `kubernetes` provider.

And for `ConfigMap`s, check out this guide on the [`configmap` action type](../k8s-plugins/action-types/configmap.md),
also supported by the `kubernetes` provider.

