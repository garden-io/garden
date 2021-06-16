---
order: 30
title: Modules
---

# Modules

Modules are the basic **unit of building** in Garden. They are usually the first thing you add after creating the project-level configuration.

A module can correspond to a Dockerfile and its associated code, a remote Docker image, a Helm chart, an OpenFaaS function, and more, all depending on the module type.

Below is a simple example of a module's `garden.yml` (from the [`demo-project`](https://github.com/garden-io/garden/tree/0.12.23/examples/demo-project) example project):

```yaml
kind: Module
name: backend
description: Backend service container
type: container
services:
    ...
tasks:
    ...
tests:
    ...
```

## How it Works

A Garden project is usually split up into the project-level configuration file, and several module-level configuration files, each in the root directory of the respective module:

```console
.
├── project.garden.yml
├── module-a
│   ├── garden.yml
│   └── ...
├── module-b
│   └── garden.yml
│   └── ...
├── module-c
     └── garden.yml
     └── ...
```

You can also choose any `*.garden.yml` filename for each module configuration file. For example, you might prefer to set the module name in the filename, e.g. `my-module.garden.yml` to make it easier to find in a large project.

{% hint style="info" %}
It's also possible to [define several modules in the same `garden.yml` file](#multiple-modules-in-the-same-directory) and/or in the same file as the the project-level configuration. If you only have a couple of modules, you might for example define them together in a single `modules.garden.yml` file. See [below](#multiple-modules-in-the-same-directory) for more details.
{% endhint %}

Modules must have a type. Different [module _types_](#module-types) behave in different ways. For example, the `container` module type corresponds to a Docker image, either built from a local Dockerfile or pulled from a remote repository.

Furthermore, modules can have [`services`](./services.md), [`tests`](./tests.md) and [`tasks`](./tasks.md).

You use the `garden build` command to build your modules.

Read the sections below for more information on configuring modules, including how to control which files and directories are included in a module.

### Module types

Garden is pluggable and features a number of module types. You can find all of them and their full reference documentation [here](../reference/module-types/README.md), but we'll provide a high-level overview of the most commonly used types below:

- [container](../guides/container-modules.md) modules are a high level and portable way to describe how container images are both built and deployed. When working with containers you'll at least use this to build the images, but you may also specify `services`, `tasks` and `tests` on them. The `kubernetes` providers, for example, can take these service definitions, generate Kubernetes manifests and deploy them. This is generally much easier to use than the below `kubernetes` and `helm` module types, but in turn loses some of the flexibility of those two.
- [kubernetes](../reference/module-types/kubernetes.md) modules are quite simple. They allow you to provide your own Kubernetes manifests, which the `kubernetes` providers can then deploy. Use this for any custom manifests you need or already have, and when you don't need the capabilities of the more complex `helm` modules.
- [helm](../guides/using-helm-charts.md) modules allow you to deploy your own Helm charts, or 3rd-party charts from remote repositories. [Helm](https://helm.sh/) is a powerful tool, especially when deploying 3rd-party (or otherwise external) charts. You can also make your own charts, but we recommend only doing so when you need its flexible templating capabilities, or if you aim to publish the charts.
- [exec](../reference/module-types/exec.md) modules offer a flexible way to weave in arbitrary scripts and commands that are executed locally. These can be custom build steps, tasks, tests or really anything else. The caveat is that they always run on the same machine as the Garden CLI, and not e.g. in a Kubernetes cluster, and thus not quite as portable.
- [terraform](../reference/module-types/terraform.md) modules offer a powerful way to deploy any cloud resources as part of your project. See the [Terraform guide](../advanced/terraform.md) for more information.

There are several other module types available as well. See the [module types reference](../reference/module-types/README.md) for a full list of supported module types, and their configuration reference.

### Including and excluding files

By default, all files in the same directory as a module configuration file are included as source files for that module. Sometimes you need more granular control over the context, not least if you have multiple modules in the same directory.

The `include` and `exclude` fields are a simple way to explicitly specify which sources should belong to a particular module. They both accept a list of POSIX-style paths or globs. For example:

```yaml
kind: Module
description: My container
type: container
include:
  - Dockerfile
  - my-sources/**/*.py
exclude:
  - my-sources/tmp/**/*
...
```

Here, we only include the `Dockerfile` and all the `.py` files under `my-sources/`, but exclude the `my-sources/tmp` directory.

If you specify a list with `include`, only those files/patterns are included. If you then specify one or more `exclude` files or patterns, those are filtered out of the files matched by `include`. If you _only_ specify `exclude`, those patterns will be filtered out of all files in the module directory.

Note that the module `include` and `exclude` fields have no effect on which paths Garden watches for changes. Use the [project `modules.exclude` field](./projects.md#) for that purpose.

You can also use [.gardenignore files](./configuration-overview.md#ignore-files), much like `.gitignore` files, to exclude files across your project. You can place them in your project root, in module roots, and even in individual sub-directories of modules.

### Multiple modules in the same directory

Sometimes, it's useful to define several modules in the same `garden.yml` file. One common situation is where more than one Dockerfile is in use (e.g. one for a development build and one for a production build). You may only have a handful of modules, and it may be the cleanest approach to define all of them in a `modules.garden.yml` in your project root.

Another example is when the dev configuration and the production configuration have different integration testing suites, which may depend on different external services being available.

To do this, add a document separator (`---`) between the module definitions. Here's a simple (if a bit contrived) example:

```yaml
kind: Module
description: My container - configuration A
type: container
dockerfile: Dockerfile-a
exclude: ["Dockerfile-b"]
...
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ-a]
    dependencies:
      - a-integration-testing-backend

---

kind: Module
description: My container - configuration B
type: container
dockerfile: Dockerfile-b
exclude: ["Dockerfile-a"]
...
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ-b]
    dependencies:
      - b-integration-testing-backend
```

{% hint style="warning" %}
Note that you **must** use the `include` and/or `exclude` directives (described above) when module paths overlap. This is to help users steer away from subtle bugs that can occur when modules unintentionally consume source files from other modules. See the next section for details on including and excluding files.
{% endhint %}

## Modules in the Stack Graph

Modules correspond to a **build** action in the Stack Graph.

- **Modules** can depend on other **modules** (via build dependencies).
- **Tasks**, **tests**, and **services** can depend on **modules** (via build dependencies).

## Examples

You can learn more about different module types in the [module type reference docs](../reference/module-types/README.md).

### Container Module

Below is the configuration for a simple container module. Here we're assuming that the the Dockerfile and source files are in the same directory as the `garden.yml` file.

```yaml
kind: Module
name: backend
description: Backend service container
type: container
```

### Multiple Modules in the Same File

In this example, we declare multiple container modules in the same file. We use the `include` directive to tell Garden where the source code for each modules resides.

```yaml
kind: Module
name: backend
description: Backend service container
type: container
include:
  - backend/**/*
---
kind: Module
name: frontend
description: Frontend service container
type: container
include:
  - frontend/**/*
```

### Container Module with a Remote Image

In this example, we use the `image` directive to include an external Docker image with the project. This module has no source code of its own.

```yaml
kind: Module
name: backend
description: Postgres DB container
type: container
image: postgres:11.7-alpine
```

## Advanced

### Disabling Modules

You can disable modules by setting `disabled: true` in the module config file. You can also disable it conditionally using template strings. For example, to disable a particular module for a specific environment, you could do something like this:

```yaml
kind: Module
name: backend
description: Postgres DB container
type: container
disabled: ${environment.name == "prod"}
image: postgres:11.7-alpine
```

Disabling a module disables all services, tasks and tests defined in the module.
Note, however, that if a disabled module is referenced as a build dependency of another module, the module will still be built when needed, to ensure the dependant module can be built as expected.

## Further Reading

- [Module type reference docs](../reference/module-types/README.md).
- [A guide on the container module type](../guides/container-modules.md).

## Next Steps

[Continue reading](./services.md) for an introduction to adding services that Garden can deploy for you.

