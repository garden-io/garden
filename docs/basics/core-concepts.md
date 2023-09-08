---
order: 4
title: Core Concepts
---

Below you'll find a definition of all the core Garden concepts.

### Garden CLI
An open-source standalone binary that's responsible for parsing **Garden config** and executing the **actions** defined there.

### Web dashboard
A [free web app](https://app.garden.io) that's a part of our community tier that adds functionality to the Garden CLI such as storing command results, displaying logs, and more.

### Garden config
A YAML config file with the ending `garden.yml` that includes some Garden configuration.

### Project
The top-level unit of organization in Garden. A project consists of a project-level **Garden config** file and zero or more **actions**.

The project's actions can belong to the same git repository or they can span multiple repos.

Garden CLI commands are run in the context of a project.

### Environment
The second level of organization in Garden after **project**.

Each environment includes zero or more **providers** and can be used to set variables for the **actions** that belong to it.

Environments can also be used to toggle what actions are used. For example, a Deploy action of type `helm` could be used to deploy an ephemeral database for a dev environment while a Deploy action of type `terraform` could be used to spin up a cloud managed database for a staging environment.

### Plugin
Plugins are responsible for executing a given **action**.

Garden has built-in plugins for Kubernetes, Helm, Pulumi, local scripts, and more, and we plan on releasing a PluginSDK that allows users to add their own.

### Provider
The part of a Garden **plugin** that holds the main configuration and knows how to handle a given **action** type.

For example, Garden has a `kubernetes` provider for remote environments and a `local-kubernetes` provider for local environments. Both can deploy an action of type `helm` but will handle them differently.

Providers are listed in the project-level Garden config and are scoped to **environments**.

### Action
Actions are a core concept of Garden and the most basic unit of organization. They are the "atoms" of a Garden project and form the nodes of **the Stack Graph**.

There are four actions _kinds_:
- **Build**: A build action describes something you build.
- **Deploy**: A deploy is something you deploy and expect to stay up and running.
- **Run**: A run is something you run and wait for to finish.
- **Test**: A test is also something you run and wait for to finish, similar to tasks, but with slightly different semantics and separate commands for execution.

Running `garden build` will e.g. execute all the Build actions for that project (i.e., it will build the project).

Similarly, actions have _types_ (e.g. `container`, `helm`, `exec`) that dictate how they're executed.

Actions may define dependencies on other actions. For example, if a given Deploy action depends on a given Build, Garden will first execute the Build action and then the Deploy. Actions can also reference output from other actions.

This is a powerful concept that allows you to model a system of almost any complexity by just focusing on a single part at a time.

### Stack Graph
A DAG (_directed acyclic graph_) that the **actions** and their dependencies make up for a given **project** and **environment**.

You can think of it as a blueprint of how to go from zero to a running system in a single command.

### Caching
Garden tracks the version of every file that belongs to a given **action** (and its upstream dependencies).

Thanks to this and the graph structure, Garden can be very smart about what actions are actually need to be executed when running tests or deploying to existing environments.

For example, when running the `garden test` command, Garden will figure out exactly what parts of the graph have changed and only execute the required actions but skip the others.
