---
order: 2
title: Creating a Project
---

# Creating a Project

The first step to using Garden is to create a project. You can use the `garden create project` helper command, or manually create a `garden.yml` file in the root directory of your project:

```yaml
# garden.yml - located in the top-level directory of your project
kind: Project
name: my-project
environments:
  - name: local
providers:
  - name: local-kubernetes
    environments: ["local"]
```

The helper command has the benefit of including all the possible fields you can configure, and their documentation, so you can quickly scan through the available options and uncomment as needed.

## How it Works

The top-level `garden.yml` file is where project-wide configuration takes place. This includes environment configurations and project variables. Most importantly, it's where you declare and configure the *providers* you want to use for your project ([see below](#providers)).

Garden treats the directory containing the project configuration as the project's top-level directory. Garden commands that run in subdirectories of the project root are assumed to apply to that project, and commands above/outside a project root will fail—similarly to how Git uses the location of the repo's `.git` directory as the repo's root directory.

Every Garden command is run against one of the environments defined in the project level `garden.yml` file. You can specify the environment with the `--env` flag or by setting a `defaultEnvironment`. Alternatively, Garden defaults to the first environment in the `garden.yml` file.

### Providers

A project consists of one or more **modules** that each has a specific `type`, for example `container` or `kubernetes`. (We talk about adding modules in the [next guide](./adding-modules.md).) **Providers** implement some of the behaviour of these module types.

Consider a project with the following three environments:

```yaml
kind: Project
name: my-project
environments:
  - name: empty
  - name: local
  - name: remote
providers:
  - name: local-kubernetes
    environments: ["local"]
  - name: kubernetes
    environments: ["remote"]
    context: my-context
    ...
---
kind: Module
name: my-module
type: container
...
```

Our choice of providers and their configuration dictates how the module in the example above is handled:

1. If we run `garden build my-module --env empty`, the `build` handler for the `container` module type will do the build, essentially calling `docker build` behind the scenes. Running `garden deploy` will fail because no provider is configured to handle the deployment.
2. If we run `garden build my-module --env local`, the `local-kubernetes` provider will "step in". It will still build the module via Docker but it will also push the image to the local Kubernetes cluster. Running `garden deploy` will deploy the project to a local Kubernetes cluster such as Minikube or Docker Desktop.
3. If we run `garden build my-module --env remote`, the `kubernetes` provider will take over. It basically does the same thing as the `build` handler for the `local-kubernetes` provider, but requires some extra configuration. Running `garden deploy` will deploy the project to the remote cluster.

Some of the most commonly used providers are the [local Kubernetes provider](../guides/local-kubernetes.md) and the [remote Kubernetes provider](../guides/remote-kubernetes.md).

Here's the [full list of supported providers](../reference/providers/README.md).

## Examples

### Variables

Variables defined in the project config are accessible in [template strings](../reference/template-strings.md) for all the project's module configurations. To illustrate, here's the project configuration from the `project-variables` example project:

```yaml
# examples/project-variables/garden.yml
kind: Project
name: my-project
variables:
  # This variable is referenced in the module configs, and overridden in the local project below
  service-replicas: 3
environments:
  - name: local
    variables:
      # We only want one replica of each service when developing locally
      service-replicas: 1
  - name: staging
providers:
  - name: local-kubernetes
    environments: ["local"]
  - name: kubernetes
    environments: ["staging"]
    ...
```

... and the configuration for a module in the same project:

```yaml
# examples/project-variables/backend/garden.yml
kind: Module
name: backend
description: Backend service container
type: container
services:
  - name: backend
    replicas: ${var.service-replicas}   # <- Refers to the variable set in the project config
    ...
```

## Further Reading

* [Full project config reference](../reference/config.md).
* [A guide on template strings and setting project wide variables](../guides/variables-and-templating.md).
* [Template string reference](../reference/template-strings.md).

## Next Steps

Continue on to the next guide for an introduction to [adding modules](./adding-modules.md), the building blocks of any Garden project.