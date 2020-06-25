---
order: 4
title: Using Garden
---

# Using Garden

This section contains short guides on the main Garden constructs and how to configure Garden projects. These guides are very useful for those getting started with Garden but also for those that need to brush up on these concepts or that haven't started using them.

Each guide serves as a standalone introduction to the concept but it's still recommended that you go through them in order.

There's no need to finish them all at once though. By adding a [project configuration](./projects.md), [modules](./modules.md), and [services](./services.md), you can already deploy your project with Garden. You can then come back when you're ready to add [tests](./tests.md), [tasks](./tasks.md) and [workflows](./workflows.md).

The [Using the CLI guide](./using-the-cli.md) offers helpful information on how to use the CLI in your day-to-day. In fact, if you're starting with Garden but your team has already configured the project, you might want to skip directly to that.

## [Configuration Overview](./configuration-overview.md)

This guide introduces the very basics of Garden configuration.

## [Projects](./projects.md)

The first step to using Garden is to create a project level `garden.yml` configuration file. You'll learn how in this guide.

## [Modules](./modules.md)

Modules are the basic unit of building in Garden. In this guide you'll learn how to split your project into modules that Garden can build.

## [Services](./services.md)

Services are the basic unit of deployment in Garden. In this guide you'll learn how to add services to your modules so that you can deploy them.

## [Tests](./tests.md)

This guide shows you how Garden can run your tests for you.

## [Tasks](./tasks.md)

This guide shows you how Garden can run tasks for you, for example database migrations.

## [Workflows](./workflows.md)

This guide introduces _workflows_, which are simple sequences of Garden commands and/or custom scripts, that you can use for CI as well development.

## [Using the CLI](./using-the-cli.md)

This guide covers the basic usage of the CLI, with usage examples, and some common day-to-day usage tips.

## [Variables and Templating](./variables-and-templating.md)

Garden features powerful templating capabilities. This guide shows in detail how you can use templating across your project and module configuration.
