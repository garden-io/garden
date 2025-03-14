---
title: Container
order: 1
---

# Container

Garden includes a `container` plugin, which provides:

* A `Build` action for Docker builds.
* `Test` and `Run` actions for running scripts or tests in one-off containers.
* A `Deploy` action that provides a simple way to define a Kubernetes Deployment, Service and Ingress in a single
  config.
  * Note: `container`-type `Deploy`s are mostly intended to help users get up and running on Kubernetes quickly, and
    don't support the full range of configuration options for the underlying resources.
  * If you're already using Kubernetes in production, we strongly recommend using the `Deploy` actions of `kubernetes`
    or `helm` type instead.
  * This ensures you're developing and testing in a production-like environment, and lets you reuse your production
    manifests and charts during development and CI.

The plugin is built-in and doesn't require any configuration.

The corresponding `container` action type can be used to

* [build](../reference/action-types/Build/container.md) container images
* [deploy](../reference/action-types/Deploy/container.md) container-based applications
* [run scripts](../reference/action-types/Run/container.md) inside deployed container-based applications
* [run tests](../reference/action-types/Test/container.md) inside deployed container-based applications

Below we'll walk through some usage examples. For a full reference of the `container` action type, please take a look at
the [reference guides](../reference/action-types).

_Note: Despite the `container` action types being mostly Kubernetes-oriented up to this point, we've tried to design
this action type in a way that makes it generically deployable to other container orchestrators as well, such as
Docker Swarm, AWS ECS etc._

## Building images

Following is a bare minimum `Build` action using the `container` type:

```yaml
# garden.yml
kind: Build
type: container
name: my-container
```

If you have a `Dockerfile` in the same directory as this file, this is enough to tell Garden to build it. However, you
can override the `Dockerfile` name or path by specifying `spec.dockerfile: <path-to-Dockerfile>`.
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
# Here, we ensure that the base image is built first. This is useful e.g. when you want to build a prod and a
# dev/testing variant of the image in your pipeline.
dependencies: [ build.base-image ]
spec:
  buildArgs:
    baseImageVersion: ${actions.build.base-image.version}
```

Additionally, Garden automatically sets `GARDEN_ACTION_VERSION` as a build argument, which you can use to reference the
version of action being built. You use it internally as
a [Docker buildArg](https://docs.docker.com/engine/reference/commandline/build/#build-arg). For instance, to set
versions, render docs, or clear caches.

## Using remote images

If you're not building the container image yourself and just need to deploy an image that already exists in a registry,
you need to specify the `image` in the `Deploy` action's `spec`:

```yaml
# garden.yml
kind: Deploy
type: container
name: redis
spec:
  image: redis:5.0.5-alpine   # <- replace with any docker image ID
```

## Multi-Platform builds

Garden supports building container images for multiple platforms and architectures. Use the `platforms` configuration field, to configure the platforms you want to build for e.g.:

```yaml
# garden.yml
kind: Build
type: container
name: my-container
spec:
  platforms: ["linux/amd64", "linux/arm64"]
```

Garden interacts with several local and remote builders. Currently support for multi-platform builds varies based on the builder backend.
The following build backends support multi-platform builds out of the box: [Garden Container Builder](../reference/providers/container.md), `cluster-buildkit`, `kaniko`.

In-cluster building with `kaniko` does *not* support multi-platform builds.

The `local-docker` build backend requires some additional configurations. Docker Desktop users can enable the experimental containerd image store to also store multi-platform images locally. All other local docker solutions e.g. orbstack, podman currently need a custom buildx builder of type `docker-container`. Documemtation for both can be found here https://docs.docker.com/build/building/multi-platform.
If your local docker image store does not support storing multi-platform images, consider configuring an environment where you only build single platform images when building locally e.g.:

```yaml
# garden.yml
kind: Build
type: container
name: my-container
spec:
  platforms:
    $if: ${environment.name == "local"}
    $then: [ "linux/amd64"]
    $else: [ "linux/amd64", "linux/arm64" ]
```

Or you can specifiy to push your locally build images to a remote registry. If you are also using a Kubernetes provider and have a `deploymentRegistry` defined, the image will be pushed to this registry by default. If you are using garden only for building with the container provider, you can achieve the same behavior by specifying `--push` as an extra flag in your container action and setting `localId` to your registry name.

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
we default to the corresponding `Build` action's version.

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

After your application has been built, you probably also want to deploy it.
For this, check out our [guide on deploying to Kubernetes using `container` `Deploy`
actions](../k8s-plugins/actions/deploy/container.md), or the [`kubernetes`](../k8s-plugins/actions/deploy/kubernetes.md)
or [`helm`](../k8s-plugins/actions/deploy/helm.md) type of `Deploy` actions for more advanced capabilities.

See the full spec of the `Deploy` action of `container` type in
our [reference docs](../reference/action-types/Deploy/container.md).

## Running tests

`Test` actions of `container` type run the command you specify in a one-off Kubernetes Pod, stream the logs and monitor
for success or failure.

This is a great way to run tests in a standardized environment, especially integration tests, API tests or end-to-end
tests (since Garden's ability to build, deploy and test in dependency order can easily be used to spin up the required
components for a test suite before running it).

Here is a configuration example for two different test suites:

```yaml
kind: Test
name: my-app-unit
type: container
dependencies:
  - build.my-app
spec:
  image: ${actions.build.my-app.outputs.deploymentImageId}
  args: [ npm, test ]

---

kind: Test
name: my-app-integ
type: container
dependencies:
  - build.my-app
  - deploy.my-app
spec:
  image: ${actions.build.my-app.outputs.deploymentImageId}
  args: [ npm, run, integ ]

```

Here we first define a `unit` test suite, which has no dependencies, and simply runs `npm test` in the `my-app`
container.

The `integ` suite is similar but adds a _runtime dependency_. This means that before the `integ` test is run, Garden
makes sure that `my-app` is running and up-to-date.

When you run `garden test`, we will run those tests. The tests will be executed by running the container with the
specified command _in your configured environment_ (as opposed to locally on the machine you're running the `garden` CLI
from). Typically, this is a local or remote Kubernetes cluster—whatever you specify in your project configuration.

The names and commands to run are of course completely up to you, but we suggest naming the test suites consistently
across your project's action configurations.

See the [reference](../reference/action-types/Test/container.md) for all the configurable parameters
for `Test` actions of `container` type.

## Running arbitrary workloads

To run arbitrary workloads, you can use the `Run` actions. These can include any scripts or commands, and will be run
within a container. The configuration is very similar to the `Test` actions:

```yaml
kind: Run
type: container
name: db-migrate
dependencies: [ deploy.my-database ]
spec:
  command: [ rake, db:migrate ]
```

In this example, we define a `db-migrate` action that executes `rake db:migrate` (which is commonly used for
database migrations in Ruby, but you can run anything you like of course). The action has a dependency on
the `my-database` deployment, so that Garden will make sure the database is deployed before running the migration job.

One thing to note, is that `Run` actions should in most cases be _idempotent_, meaning that running the same Run
action multiple times should be safe. This can be achieved by making sure that the script or tool your `Run` executes
performs the relevant checks to decide if it should run (e.g. whether the DB exists and has the right schema already).

See the [reference](../reference/action-types/Run/container.md) for all the configurable parameters
for `Run` actions of `container` type.

## Referencing other actions

Since Garden version `0.13` any action (of any `kind` and `type`) can depend on any other action.

Actions can reference outputs from each other
using [template strings](../using-garden/variables-and-templating.md#template-string-overview).
For example, `Build` actions of `container` type are often referenced by `Deploy` actions of `helm` type:

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

Here, we do not need to declare an explicit _build_ dependency on `my-image` like `dependencies: [ build.my-app ]`.
Instead, we do it implicitly via the references to the `Build` action outputs in `spec.values.image`.

For a full list of keys that are available for the `container` action type, take a look at
the _outputs_ reference
of [`Build`](../reference/action-types/Build/container.md#outputs),
[`Deploy`](../reference/action-types/Deploy/container.md#outputs),
[`Run`](../reference/action-types/Run/container.md#outputs),
and [`Test`](../reference/action-types/Test/container.md#outputs) action kinds.

## Mounting volumes and Kubernetes ConfigMaps

Volumes and ConfigMaps can be mounted in all `Deploy`, `Run`, and `Test` actions of the `container` type.

For mounting volumes, check out our guide on
the [`persistentvolumeclaim` action type](../k8s-plugins/actions/deploy/persistentvolumeclaim.md), supported by
the `kubernetes` provider.

And for ConfigMaps, check out this guide on the [`configmap` action type](../k8s-plugins/actions/deploy/configmap.md),
also supported by the `kubernetes` provider.

