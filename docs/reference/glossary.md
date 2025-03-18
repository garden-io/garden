---
order: 70
title: Glossary
---

Below you'll find a glossary of the main Garden concepts.

### Garden CLI
An open-source standalone binary that's responsible for parsing **Garden config** and executing the **actions** defined there.

### Dashboard
A [free web app](https://app.garden.io) that's a part of Garden's community tier that adds functionality to the Garden CLI such as storing command results, displaying logs, and more.

### Garden config
A YAML config file with the ending `garden.yml` that includes some Garden configuration.

### Project
The top-level unit of organization in Garden. A project consists of a project-level **Garden config** file and zero or more **actions**.

A project can be a monorepo or span multiple repositories.

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
Actions are core to how Garden works and the most basic unit of organization. They are the "atoms" of a Garden project and form the nodes of **the action graph**.

There are four actions _kinds_:
- **Build**: describes something you build.
- **Deploy**: something you deploy and expect to stay up and running.
- **Run**: something you run and wait for to finish.
- **Test**: also something you run and wait for to finish, similar to tasks, but with slightly different semantics and separate commands for execution.

Running `garden build` will e.g. execute all the Build actions for that project (i.e., it will build the project).

Similarly, actions have _types_ (e.g. `container`, `helm`, `exec`) that dictate how they're executed.

Actions may define dependencies on other actions. For example, if a given Deploy action depends on a given Build, Garden will first execute the Build action and then the Deploy. Actions can also reference output from other actions.

This is a powerful concept that allows you to model a system of almost any complexity by just focusing on a single part at a time.

### Action graph
A DAG (_directed acyclic graph_) that the **actions** and their dependencies make up for a given **project** and **environment**.

You can think of it as a blueprint of how to go from zero to a running system in a single command.

### Versions
Garden generates a Garden version for each action, based on the source files and configuration involved, as well as any upstream dependencies. When using Garden, you'll see various instances of `v-<some hash>` strings scattered around logs, e.g. when building, deploying, running tests etc.

These versions are used by Garden and the action graph to work out which actions need to be performed whenever you want to build, deploy, or test your project.

Each version also factors in the versions of every dependency. This means that anytime a version of something that is depended upon changes, every dependant's version also changes.

For example if the source code of a Build action is changed it's version will change. The Deploy action referencing the build will also have a new version due it being dependant on the build and any Test actions referencing the Deploy will also have new versions.

