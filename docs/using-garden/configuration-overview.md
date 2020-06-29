---
order: 15
title: Configuration Overview
---

# Configuration Overview

Garden is configured via `garden.yml` configuration files, which Garden collects and compiles into a
[Stack Graph](../basics/stack-graph.md) of your project.

The [project configuration](./projects.md) `garden.yml` file should be located in the top-level directory of the
project's Git repository.

In addition, each of the project's [modules](../reference/glossary.md#module)' `garden.yml` should be located in that
module's top-level directory. Modules define all the individual components of your project, including [services](./services.md), [tasks](./tasks.md) and [tests](./tests.md).

Lastly, you can define [workflows](./workflows.md), to codify sequences of Garden commands and custom scripts.

The other docs under the _Using Garden_ go into more details, and we highly recommend reading through all of them.

Below, you'll also find some general information on how to configure a project.

## Including/excluding files and directories

By default, all directories under the project root are scanned for Garden modules, and all files in the same directory as a module configuration file are included as source files for that module. Sometimes, you need more granular control over the context, not least if you have multiple modules in the same directory.

Garden provides three different ways to achieve this:

1. The `modules.include` and `modules.exclude` fields in _project_ configuration files.
2. ".ignore" files, e.g. `.gitignore` and `.gardenignore`.
3. The `include` and `exclude` fields in [_module_ configuration files](./modules.md#including-and-excluding-files).

The first two are described below, and the module-specific includes/excludes are described in the [section on modules](./modules.md#including-and-excluding-files).

### Including and excluding files across the project

By default, all directories under the project root are scanned for Garden modules, except those matching your ignore files. You may want to limit the scope, for example if you only want certain modules as part of a project, or if all your modules are contained in a single directory (in which case it is more efficient to scan only that directory).

The `modules.include` and `modules.exclude` fields are a simple way to explicitly specify which directories should be scanned for modules. They both accept a list of POSIX-style paths or globs. For example:

```yaml
kind: Project
name: my-project
modules:
  include:
    - modules/**/*
  exclude:
    - modules/tmp/**/*
...
```

Here we only scan the `modules` directory, but exclude the `modules/tmp` directory.

If you specify a list with `include`, only those patterns are included. If you then specify one or more `exclude` patterns, those are filtered out of the ones matched by `include`. If you _only_ specify `exclude`, those patterns will be filtered out of all paths in the project directory.

The `modules.exclude` field is also used to limit the number of files and directories Garden watches for changes while running. Use that if you have a large number of files/directories in your project that you do not need to watch, or if you are seeing excessive CPU/RAM usage. The `modules.include` field has no effect on which paths Garden watches for changes.

### .ignore files

{% hint style="warning" %}
Prior to Garden 0.12.0, `.gitignore` files were also respected by default. The default is now to only respect `.gardenignore` files. See below how you can revert to the previous behavior.
{% endhint %}

By default, Garden respects `.gardenignore` files and excludes any patterns matched in those files. You can place the ignore files anywhere in your repository, much like `.gitignore` files, and they will follow the same semantics.

You can use those to exclude files and directories across the project, _both from being scanned for Garden modules and when selecting source files for individual modules_. For example, you might put this `.gardenignore` file in your project root directory:

```gitignore
node_modules
public
*.log
```

This would cause Garden to ignore `node_modules` and `public` directories across your project/repo, and all `.log` files.

Note that _these take precedence over both `modules.include` fields in your project config, and `include` fields in your module configs_. If a path is matched by one of the ignore files, the path will not be included in your project or modules.

You can override which filenames to use as ".ignore" files using the `dotIgnoreFiles` field in your project configuration. For example, you might choose to also respect `.gitignore` files (this was the default behavior prior to Garden 0.12.0):

```yaml
kind: Project
name: my-project
dotIgnoreFiles: [.gardenignore, .gitignore]
```

## Git submodules

If you're using Git submodules in your project, please note the following:

1. You may ignore submodules using .ignore files and include/exclude filters. If a submodule path _itself_ (that is, the path to the submodule directory, not its contents), matches one that is ignored by your .ignore files or exclude filters, or if you specify include filters and the submodule path does not match one of them, the module will not be scanned.
2. Include/exclude filters (both at the project and module-level) are applied the same way, whether a directory is a submodule or a normal directory.
3. _.ignore files are considered in the context of each git root_. This means that a .ignore file that's outside of a submodule will be completely ignored when scanning that submodule. This is by design, to be consistent with normal Git behavior.

## Next steps

We highly recommend reading all the other docs in this section to learn about the different configuration options and entities.

The [Variables and Templating guide](./variables-and-templating.md) explains how you can reference across different providers and modules, as well as how to supply secret values to your configuration.

Also, be sure to look at the [Config Files Reference](../reference/config.md) for more details on each of the available configuration fields, and the [Template Strings Reference](../reference/template-strings.md) for the keys available in template strings.
