---
order: 2
title: The Stack Graph (Terminology)
---

# The Stack Graph (Terminology)

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

Additionally, Garden supports [Workflows](../using-garden/workflows.md), which allow you to define a CI-like sequence of Garden commands and scripts to perform.

For more detail on all of the above, see the [Using Garden](../using-garden/README.md) section.

## Pluggability

Importantly, what happens within each of the actions that the graph describes—building, deploying, running etc.—is completely pluggable via the providers. The Stack Graph is only opinionated in terms of flows and dependencies—_what_ should happen _when_—but the _how_ is pluggable.

All the Garden plugins are currently built-in; we will soon release a plugin SDK to allow any user to easily make their
own plugins.

## Next Steps

Head over to the [Getting Started](../getting-started/README.md) section to learn the basics on how to get up and running with Garden.

If you or your team has already set up a Garden project, you can also skip over to the [Using Garden](../using-garden/README.md) section, to learn more about the concepts and how to interact with Garden.
