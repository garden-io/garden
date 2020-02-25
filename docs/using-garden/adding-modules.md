---
order: 3
title: Adding Modules
---

# Adding Modules

Modules are the basic **unit of building** in Garden. They are usually the first thing you add after creating the project level configuration.

A module can correspond to a Dockerfile and its associated code, a remote Docker image, a Helm chart, an OpenFaaS function, and more, all depending on the module type.

Below is a simple example of a module's `garden.yml` (from the [`demo-project`](https://github.com/garden-io/garden/tree/v0.11.5/examples/demo-project) example project):

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

A Garden project is usually split up into the project level `garden.yml` file and several module level configuration files:

```console
.
├── garden.yml
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

> It's also possible to [include several modules in the same `garden.yml` file](../guides/configuration-files.md#multiple-modules-in-the-same-file) and/or with the project level configuration.

Modules must have a type. Different module _types_ behave in different ways. For example, the `container` module type corresponds to a Docker image, either built from a local Dockerfile or pulled from a remote repository.

Furthermore, modules can have [`services`](./adding-services.md), [`tests`](./running-tests.md) and [`tasks`](./running-tasks.md).

You use the `garden build` command to build your modules.

## Modules in the Stack Graph

Modules correspond to a **build** action in the Stack Graph.

- **Modules** can depend on other **modules** (via build dependencies).
- **Tasks**, **tests**, and **services** can depend on **modules** (via build dependencies).
- **Services** implicitly depend on the build step of their **parent module**

## Examples

You can learn more about different module types in the [module type reference docs](../module-types/README.md).

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
  - ./backend
---
kind: Module
name: frontend
description: Frontend service container
type: container
include:
  - ./frontend
```

### Container Module with a Remote Image

In this example we use the `image` directive to include an external Docker image with the project. This module has no source code of its own.

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
Note however, that if a disabled module is referenced as a build dependency of another module, the module will still be built when needed, to ensure the dependant module can be built as expected.

## Further Reading

* [Module type reference docs](../module-types/README.md).
* [Multiple modules in the same configuration file](../guides/configuration-files.md#multiple-modules-in-the-same-file).
* [A guide on the container module type](../guides/container-modules.md).

## Next Steps

[Continue reading](./adding-services.md) for an introduction to adding services that Garden can deploy for you.

