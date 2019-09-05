---
title: Stack Graph
---
# The Stack Graph

Garden centers around the _Stack Graph_, which allows you to describe your whole stack in a consistent, structured way,
without creating massive scripts or monolithic configuration files.

We believe your configuration should be distributed, like your stack, so your configuration files are located next to
each module (such as container image, Helm chart, manifests and function). Garden scans for these configuration files,
even across multiple repositories, validates them and compiles them into a graph that describes all the steps involved
in building, deploying and testing your application.

Garden uses the graph to detect when modules need to be re-built or re-tested, services re-deployed etc. by comparing your current code with previously built, deployed and tested versions.

## Structure and terminology

The Stack Graph is essentially an opinionated graph structure, with a handful of pre-defined entity types and verbs:

* **Project**: The root of the graph. Contains one or more _modules_ and configures _providers_.
* **Provider**: Providers are configured at the project level. They take care of initializing deployment environments, and control what happens within each node of the graph, e.g. how modules are built, services are deployed etc. They also specify _module types_ and how they are configured.
* **Module**: A module is something you _build_. Each module specifies a type (e.g. `container` or `helm`) which dictates how it is configured, built, deployed etc. It can contain zero or more _services_, _tasks_ and _tests_. It can also have build dependencies.
* **Service**: A service is something you _deploy_. It can depend on other services, as well as tasks.
* **Task**: A task is something you _run_ and wait for to finish. It can depend on other services and tasks.
* **Test**: A test is also something you run and wait for to finish, similar to tasks, but with slightly different semantics and separate commands for execution. It can depend on services and tasks (but notably services and tasks cannot depend on tests).

Each part of your stack _describes itself_ using a simple configuration file. Garden collects all those declarations, validates, and compiles them into a DAG (a _directed acyclic graph_, meaning it must have no circular dependencies).

Importantly, what happens within each of the actions that the graph describes—building, deploying, running etc.—is completely pluggable via the providers. The Stack Graph is only opinionated in terms of flows and dependencies—_what_ should happen _when_—but the _how_ is pluggable.

All the Garden plugins are currently built-in; we will soon release a plugin SDK to allow any user to easily make their
own plugins.

## Configuration

As mentioned above, each part of your stack should describe itself. This avoids massive project configuration files or scripts, and makes each part of your stack easy to understand, and even re-usable across projects in some cases.

This is done through simple configuration files, which are version controlled in your project, next to each of your code modules (if applicable). For example:

```yaml
kind: Module
type: helm
name: redis
description: Redis service for message queueing
chart: stable/redis
version: 6.4.3
```

```yaml
kind: Module
type: container
name: my-service
description: My HTTP service container
services:
- name: my-service
  ports:
    - name: http
      containerPort: 80
  ingresses:
    - path: /hello
      port: http
tests:
- name: integ
  command: [./test]
  dependencies: [my-other-service]
```

Note here the first four fields, which are common across all module types—`kind`, `type`, `name` and `description`. Other fields are specified by the corresponding _module type_, which are defined by _providers_.

Also notice that the `container` module explicitly declares a service, whereas the `helm` module does not. This is dictated by the module
type. Containers often only need to be built (e.g. base images for other containers), or may contain multiple services. A Helm chart, however, is generally a single deployable so the provider makes the service implicit when configuring it.

For more details on how to configure your project, take a look at the [configuration guide](../using-garden/configuration-files.md).
