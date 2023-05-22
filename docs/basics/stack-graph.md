---
order: 2
title: The Stack Graph (Terminology)
---

# The Stack Graph (Terminology)

Garden centers around the _Stack Graph_, which allows you to describe your whole stack in a consistent, structured way,
without creating massive scripts or monolithic configuration files.

We believe your configuration should be distributed, like your stack, so your configuration files are located next to
each item described (such as container image, Helm chart, manifests and function). Garden scans for these configuration files,
even across multiple repositories, validates them and compiles them into a graph that describes all the steps involved
in building, deploying and testing your application.

Garden uses the graph to detect when actions need to be re-run by comparing your current code with previously built, deployed and tested versions.

## Structure and terminology

The Stack Graph is essentially an opinionated graph structure, with a handful of pre-defined entity types and verbs:

* **Project**: The root of the graph. Contains one or more _actions_ and configures _providers_.
* **Provider**: Providers are configured at the project level. They take care of initializing deployment environments, and control what happens within each node of the graph, e.g. how actions are built, deployed or tests run etc. They also specify _action types_ and how they are configured.
* Actions are divided into four different kinds. Each specifies a type (e.g. `container` or `helm`) which dictates how it is executed.
  * **Build**: A build action describes something you _build_.
  * **Deploy**: A deploy is something you _deploy_ and expect to stay up and running. 
  * **Run**: A run is something you _run_ and wait for to finish.
  * **Test**: A test is also something you run and wait for to finish, similar to tasks, but with slightly different semantics and separate commands for execution.

Each part of your stack _describes itself_ using a simple configuration file. Garden collects all those declarations, validates, and compiles them into a DAG (a _directed acyclic graph_, meaning it must have no circular dependencies).

Additionally, Garden supports [Workflows](../using-garden/workflows.md), which allow you to define a CI-like sequence of Garden commands and scripts to perform.

For more detail on all of the above, see the [Using Garden](../using-garden/README.md) section.

## Pluggability

Importantly, what happens (building, deploying, running, etc) within each of the actions that the graph describes is completely pluggable via the providers. The Stack Graph is only opinionated in terms of flows and dependencies—_what_ should happen _when_—but the _how_ is pluggable.

All the Garden plugins are currently built-in; we will soon release a plugin SDK to allow any user to easily make their
own plugins.

## Versions

Garden generates a _Garden version_ for each action, based on a hash of the source files and configuration involved, as well as any build and runtime dependencies. When using Garden, you'll see various instances of `v-<some hash>` strings scattered around logs, e.g. when building, deploying, running tests etc.

These versions are used by Garden and the Stack Graph to work out which actions need to be performed whenever you want to build, deploy, run a workflow, test your project etc. Specifically, Garden uses these generated versions to see which builds need to be performed, whether a deploy is up-to-date or a test has already been run, and so on.

Each version also factors in the versions of every dependency (both build and runtime dependencies, as is applicable for each case). This means that anytime a version of something that is _depended upon_ changes, every dependant's version also changes.

For example if the source code of a `container` build action is changed it's version will change. The deploy action
referencing the build will also have a new version due it being dependant on the build. Any tests referencing the
deploy will also have new versions.

## Next Steps

Head over to the [Quickstart guide](./quickstart.md) section to learn the basics on how to get up and running with Garden.

If you or your team has already set up a Garden project, you can also skip over to the **Using Garden** section, to learn more about the concepts and how to interact with Garden.
