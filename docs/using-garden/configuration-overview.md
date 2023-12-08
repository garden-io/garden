---
order: 1
title: Configuration Overview
---

# Configuration Overview

Garden is configured via `garden.yml` (or `*.garden.yml`) configuration files, which Garden collects and compiles into a
[Stack Graph](../overview/how-garden-works.md#the-stack-graph) of your project.

The [project configuration](./projects.md) file should be located in the top-level directory of the project's Git repository. We suggest naming it `project.garden.yml` for clarity, but you can also use `garden.yml` or any filename ending with `.garden.yml`.

In addition, each of the project's [actions](./actions.md) should be located in that action's top-level directory. Actions define all the individual components of your project.

You can define [config templates](./config-templates.md) to create your own abstractions, both within a project and across multiple projects.

Lastly, you can define [workflows](./workflows.md), to codify sequences of Garden commands and custom scripts. We suggest placing those in a `workflows.garden.yml` file in your project root.

The other docs under the _Using Garden_ go into more details, and we highly recommend reading through all of them.

Below, you'll also find some general information on how to configure a project.

## Including/excluding files and directories

By default, all directories under the project root are scanned for Garden actions. Depending on the action kind and type, files in the same directory as the action configuration file might be included as source files for that action. Often, you need more granular control over the context, not least if you have multiple actions in the same directory.

Garden provides three different ways to achieve this:

1. The `scan.include` and `scan.exclude` fields in _project_ configuration files.
2. The [".ignore" file](#ignore-file), e.g. `.gitignore` or `.gardenignore`.
3. The `include` and `exclude` fields in [_action_ configuration files](./actions.md#including-and-excluding-files).

The first two are described below.
The action-specific includes/excludes are described in the [section on actions](./actions.md#including-and-excluding-files).

### Including and excluding files across the project

By default, all directories under the project root are scanned for Garden actions, except those matching your ignore files. You may want to limit the scope, for example if you only want certain actions as part of a project, or if all your actions are contained in a single directory (in which case it is more efficient to scan only that directory).

The `scan.include` and `scan.exclude` fields are a simple way to explicitly specify which directories should be scanned for actions. They both accept a list of POSIX-style paths or globs. For example:

```yaml
apiVersion: garden.io/v1
kind: Project
name: my-project
scan:
  include:
    - actions/**/*
  exclude:
    - actions/tmp/**/*
...
```

Here we only scan the `actions` directory, but exclude the `actions/tmp` directory.

If you specify a list with `include`, only those patterns are included. If you then specify one or more `exclude` patterns, those are filtered out of the ones matched by `include`. If you _only_ specify `exclude`, those patterns will be filtered out of all paths in the project directory.

The `scan.exclude` field is also used to limit the number of files and directories Garden watches for changes while running. Use that if you have a large number of files/directories in your project that you do not need to watch, or if you are seeing excessive CPU/RAM usage. The `scan.include` field has no effect on which paths Garden watches for changes.

### .ignore file

{% hint style="info" %}
Generally, using .gardenignore files is far more performant than exclude config statements and will decrease
graph resolution time.
{% endhint %}

By default, Garden respects `.gardenignore` files and excludes any patterns matched in those files. You can place the ignore files anywhere in your repository, much like `.gitignore` files, and they will follow the same semantics.

You can use those to exclude files and directories across the project, _both from being scanned for Garden modules and when selecting source files for individual modules_. For example, you might put this `.gardenignore` file in your project root directory:

```gitignore
node_modules
public
*.log
```

This would cause Garden to ignore `node_modules` and `public` directories across your project/repo, and all `.log` files.

Note that _these take precedence over both `scan.include` fields in your project config, and `include` fields in your module configs_. If a path is matched by one of the ignore files, the path will not be included in your project or modules.

{% hint style="warning" %}
Prior to Garden `0.13`, it was possible to specify _multiple_ ".ignore" files
using the [`dotIgnoreFiles`](../reference/project-config.md#dotIgnoreFiles) field in a project configuration:

```yaml
apiVersion: garden.io/v1
kind: Project
name: my-project
dotIgnoreFiles: [.gardenignore, .gitignore]
```

This behaviour was changed in Garden `0.13`.
{% endhint %}

You can override which filename to use as a _single_ ".ignore" file
using the [`dotIgnoreFile`](../reference/project-config.md#dotIgnoreFile) field in your project configuration:

```yaml
apiVersion: garden.io/v1
kind: Project
name: my-project
dotIgnoreFile: .gardenignore
```

The default value of `dotIgnoreFile` is `.gardenignore`.

## Git submodules

If you're using Git submodules in your project, please note the following:

1. You may ignore submodules using .ignore files and include/exclude filters. If a submodule path _itself_ (that is, the path to the submodule directory, not its contents), matches one that is ignored by your .ignore files or exclude filters, or if you specify include filters and the submodule path does not match one of them, the module will not be scanned.
2. Include/exclude filters (both at the project and module-level) are applied the same way, whether a directory is a submodule or a normal directory.
3. _.ignore files are considered in the context of each git root_. This means that a .ignore file that's outside of a submodule will be completely ignored when scanning that submodule. This is by design, to be consistent with normal Git behavior.

## Next steps

We highly recommend reading all the other docs in this section to learn about the different configuration options and entities.

The [Variables and Templating guide](./variables-and-templating.md) explains how you can reference across different providers and modules, as well as how to supply secret values to your configuration.

Also, be sure to look at the [Reference section](../reference/README.md) for more details on each of the available configuration fields, and the [Template Strings Reference](../reference/template-strings/README.md) for the keys available in template strings.
