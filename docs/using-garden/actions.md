---
order: 95
title: Actions
---

# Actions

_Actions_ were introduced in `0.13` and are the basic **unit of work** in Garden. They are usually the first thing you
add after creating the project-level configuration.

## Action kinds

There are 4 different _kinds_ of the actions supported by Garden:

* `Build` action to _build_ something, e,g, an application container. It is a replacement for [module](./modules.md)-based build configuration.
* `Deploy` action to _deploy_ something, e.g. a built and configured application container. It is a replacement for old module-based [services](./services.md) configuration.
* `Run` action to _run_ something, e.g. some custom scripts. It is a replacement for old module-based [tasks](./tasks.md) configuration.
* `Test` action to _test_ something, e.g. run a single application's test suite. It is a replacement for old module-based [test](./tests.md) configuration.

Generally, a Garden project may contain multiple _components_ like applications, databases, etc.
Each component can have multiple actions. For example, a single application can have different build and deployment
scenarios (`Build` snd `Deploy` actions), multiple test suites (`Test` actions), and various helper scripts (`Run` actions).

Each action can be defined in it's own Garden configuration file, but for the sake of simplicity and maintainability it
might be easier to have one `garden.yml` configuration file per project's component.

Below is a simple example of the action configurations of the `backend` application (from
the [`demo-project`](../../examples/demo-project) example project):

```yaml
kind: Build
name: backend
description: Backend app container image
type: container

---

kind: Deploy
name: backend
description: Backend app container deployment
type: container

build: backend

# You can specify variables here at the action level
variables:
  ingressPath: /hello-backend

spec:
  healthCheck:
    httpGet:
      path: /hello-backend
      port: http
  ports:
    - name: http
      containerPort: 8080
      servicePort: 80
  ingresses:
    - path: ${var.ingressPath}
      port: http

---

kind: Run
name: backend-test
type: container
build: backend
spec:
  command: [ "sh", "-c", "echo task output" ]
```

The action configuration style above resembles the old-fashioned [module-based](./modules.md) configuration
where [services](./services.md), [tasks](./tasks.md), and [tests](./tests.md) were configured in the same file. Such
configuration style pattern makes the migration to `0.13` easier and faster.

## How it Works

A Garden project is usually split up into the project-level configuration file and several action-level configuration
files, each in the root directory of the respective part of the project:

```console
.
├── project.garden.yml
├── application-a
│   ├── actions.garden.yml
│   └── ...
├── application-b
│   └── actions.garden.yml
│   └── ...
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
For example, the `container` type of the `Build` action corresponds to a Docker image, either built from a
local `Dockerfile` or pulled from a remote repository.

You use the `garden build` command to execute your `Build` actions.

Garden is pluggable and features a number of action types. You can find all of them and their full reference
documentation [here](../reference/action-types/README.md), but we'll provide a high-level overview of the most commonly
used types below:

- [container](../other-plugins/container.md) action type is a high level and portable way to describe how container
  images are both built and deployed. When working with containers you'll at least use this to build the images, but you
  may also specify `Deploy`, `Run` and `Test` actions on them. The `kubernetes` providers, for example, can take these
  service definitions, generate Kubernetes manifests and deploy them. This is generally much easier to use than the
  below `kubernetes` and `helm` action types, but in turn loses some flexibility of those two.
- [kubernetes](../k8s-plugins/action-types/kubernetes.md) action type is quite simple. They allow you to provide your
  own Kubernetes manifests, which the `kubernetes` providers can then deploy. Use this for any custom manifests you need
  or already have, and when you don't need the capabilities of the more complex `helm` type.
- [helm](../k8s-plugins/action-types/helm.md) action type allow you to deploy your own Helm charts, or 3rd-party
  charts from remote repositories. [Helm](https://helm.sh/) is a powerful tool, especially when deploying 3rd-party (or
  otherwise external) charts. You can also make your own charts, but we recommend only doing so when you need its
  flexible templating capabilities, or if you aim to publish the charts.
- [exec](../reference/action-types/Run/exec.md) `Run` actions offer a flexible way to weave in arbitrary scripts and
  commands that are executed locally. These can be custom build steps, scripts, tests or really anything else. The
  caveat is that they always run on the same machine as the Garden CLI, and not e.g. in a Kubernetes cluster, and thus
  not quite as portable.
- [terraform](../reference/action-types/Deploy/terraform.md)  offer a powerful way to deploy any cloud resources as part
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
...
```

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

[//]: # (TODO: Review this and correct/remove if necessary. This seems to be unnecessary for actions.)
**TODO: Review this and correct/remove if necessary. This seems to be unnecessary for actions.**
{% hint style="warning" %}
Note that you **must** use the `include` and/or `exclude` directives (described above) when module paths overlap. This
is to help users steer away from subtle bugs that can occur when modules unintentionally consume source files from other
modules. See the next section for details on including and excluding files.
{% endhint %}

## Actions in the Stack Graph

The key concept and the main benefit of having _actions_ instead of modules is that **anything can depend on anything**.

Some [prior constraints](./modules.md#modules-in-the-stack-graph), that have tripped people up in the past, have been
dropped. A dependency is then specified as `<kind>.<name>`, e.g. `build.my-image` or `deploy.my-deploy`.
There will still be some specific semantics for different types of dependencies, but quite a bit simpler than before
(which was often difficult to reason about as well).

## Examples

In this section we consider a few very basic examples with configuration code-snippets.
See more [examples on our GitHut repository](../../examples).

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
kind: Build
name: postgres-db
description: Postgres DB container
type: container
disabled: ${environment.name == "prod"}
image: postgres:11.7-alpine
```

[//]: # (TODO: Review this and correct if necessary)
**TODO: Review this and correct if necessary**
Disabling a module disables all services, tasks and tests defined in the module.
Note, however, that if a disabled module is referenced as a build dependency of another module, the module will still be
built when needed, to ensure the dependant module can be built as expected.

See the [disabled-config example](../../examples/disabled-configs) for more details.

## Further Reading

- [Action type reference docs](../reference/action-types/README.md).
- [A guide on the container action type](../other-plugins/container.md).

## Next Steps

Take a look at our [Workflows section](./workflows.md) to learn how to define sequences of Garden commands and custom
scripts.
