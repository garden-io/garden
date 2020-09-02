---
order: 20
title: Projects
---

# Projects

The first step to using Garden is to create a project. You can use the `garden create project` helper command, or manually create a `project.garden.yml` file in the root directory of your project:

```yaml
# project.garden.yml - located in the top-level directory of your project
kind: Project
name: my-project
environments:
  - name: local
providers:
  - name: local-kubernetes
    environments: ["local"]
```

We suggest naming it `project.garden.yml` for clarity, but you can also use `garden.yml` or any filename ending with `.garden.yml`.

The helper command has the benefit of including all the possible fields you can configure, and their documentation, so you can quickly scan through the available options and uncomment as needed.

## How it Works

The top-level `project.garden.yml` file is where project-wide configuration takes place. This includes environment configurations and project variables. Most importantly, it's where you declare and configure the *providers* you want to use for your project ([see below](#providers)).

Garden treats the directory containing the project configuration as the project's top-level directory. Garden commands that run in subdirectories of the project root are assumed to apply to that project, and commands above/outside a project root will fail—similarly to how Git uses the location of the repo's `.git` directory as the repo's root directory.

### Environments and namespaces

Every Garden command is run against one of the environments defined in the project-level configuration file. You can specify the environment with the `--env` flag or by setting a `defaultEnvironment`. Alternatively, Garden defaults to the first environment defined in your configuration.

An environment can be partitioned using _namespaces_. A common use-case is to split a shared development or testing environment by namespace, between e.g. users or different branches of code.

{% hint style="warning" %}
Namespaces are similar in nature to Kubernetes but **do not directly map to Kubernetes namespaces unless you explicitly configure them to do so**. By default, the `kubernetes` and `local-kubernetes` providers set the Kubernetes namespace to `<project name>-<Garden namespace>`. You can override this by setting the `namespace` field in the respective provider configuration (more on that below), for example `namespace: ${environment.namespace}`.
{% endhint %}

Here's a fairly typical list of environments:

```yaml
kind: Project
name: my-project
defaultEnvironment: dev
environments:
  - name: local   # local development environment
  - name: dev     # remote/shared development environment
    defaultNamespace: user-${local.username}
  - name: staging
    production: true
  - name: prod
    production: true
```

A few things to notice here. Starting with the two development environments, we have a local one for those preferring to e.g. use a local Kubernetes cluster, and a shared `dev` environment. For the latter we set the `defaultNamespace` to the current username (plus a prefix), to implicitly split it up by different users.

Another option there would be to set `defaultNamespace: null` and require users to explicitly set a namespace at runtime. You do this by specifying `--env=<namespace>.<env>` at the command line, e.g. `--env=hellothisisme.dev`.

For the other environments we leave `defaultNamespace` set to the default, which is simply `default`. So when you run Garden with `--env=staging`, that automatically expands to `--env=default.staging`.

The `staging` and `prod` environments have an additional flag set, the `production` flag. This flag changes some default behavior and turns on protection for certain Garden commands that might be destructive, e.g. `garden deploy`, requiring you to explicitly confirm that you want to execute them. See more details on that in [the reference](../reference/config.md#environmentsproduction).

The current environment and namespace are frequently used in template strings. `${environment.name}` resolves to the environment name (in the above example, `local`, `dev`, `staging` or `prod`), `${environment.namespace}` resolves to the namespace, and `${environment.fullName}` resolves to the two combined with a DNS-style notation, e.g. `my-namespace.dev`.

### Providers

A project consists of one or more **modules** that each has a specific `type`, for example `container` or `kubernetes`. (We talk about adding modules in the [next guide](./modules.md).) **Providers** implement some of the behaviour of these module types.

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

1. If we run `garden build my-module --env empty`, the `build` handler for the `container` module type (which is configured automatically) will do the build, essentially calling `docker build` behind the scenes. Running `garden deploy` will fail because no provider is configured to handle the deployment.
2. If we run `garden build my-module --env local`, the `local-kubernetes` provider will "step in". It will still build the module via Docker but it will also push the image to the local Kubernetes cluster. Running `garden deploy` will deploy the project to a local Kubernetes cluster such as Minikube or Docker Desktop.
3. If we run `garden build my-module --env remote`, the `kubernetes` provider will take over. It basically does the same thing as the `build` handler for the `local-kubernetes` provider, but requires some extra configuration. Running `garden deploy` will deploy the project to the remote cluster.

Some of the most commonly used providers are the [local Kubernetes provider](../guides/local-kubernetes.md) and the [remote Kubernetes provider](../guides/remote-kubernetes.md).

Here's the [full list of supported providers](../reference/providers/README.md).

### Project outputs

You can define _project outputs_ using the `outputs` key in your project configuration that you can resolve and retrieve using the `garden get outputs` command. This is handy when you need to extract some values generated by Garden for further scripting, either in a custom script or within [workflows](./workflows.md).

For example, here's how you can output the image name and tag created from a `container` module build:

```yaml
kind: Project
name: my-project
...
outputs:
  my-module-image: ${modules.my-module.outputs.deployment-image-id}
```

You can then retrieve this value by running e.g. `garden get outputs -o json` and parsing the output with `jq`.

## Examples

### Variables

Variables defined in the project config are accessible in [template strings](../reference/template-strings.md) for all the project's module configurations. To illustrate, here's the project configuration from the `project-variables` example project:

```yaml
# examples/project-variables/garden.yml
kind: Project
name: my-project
variables:
  # This variable is referenced in the module configs, and overridden in the local environment below
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
* [A guide on template strings and setting project wide variables](../using-garden/variables-and-templating.md).
* [Template string reference](../reference/template-strings.md).

## Next Steps

Continue on to the next guide for an introduction to [adding modules](./modules.md), the building blocks of any Garden project.