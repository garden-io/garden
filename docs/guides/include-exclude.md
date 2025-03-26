---
order: 40
title: Including/Excluding files
---

By default, all directories under the project root are scanned for Garden actions. Depending on the action kind and type, files in the same directory as the action configuration file might be included as source files for that action. Often, you need more granular control over the context, not least if you have multiple actions in the same directory.

Garden provides three different ways to achieve this:

1. The `scan.include` and `scan.exclude` fields in _project_ configuration files.
2. The [".ignore" file](#ignore-file), e.g. `.gitignore` or `.gardenignore`.
3. The `include` and `exclude` fields on [individual actions](#including-and-excluding-files-in-individual-actions).

## Including and excluding files across the project

By default, all directories under the project root are scanned for Garden actions, except those matching your ignore files. You may want to limit the scope, for example if you only want certain actions as part of a project, or if all your actions are contained in a single directory (in which case it is more efficient to scan only that directory).

The `scan.include` and `scan.exclude` fields are a simple way to explicitly specify which directories should be scanned for actions. They both accept a list of POSIX-style paths or globs. For example:

```yaml
apiVersion: garden.io/v2
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

## .ignore file

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
apiVersion: garden.io/v2
kind: Project
name: my-project
dotIgnoreFiles: [.gardenignore, .gitignore]
```

This behaviour was changed in Garden `0.13`.
{% endhint %}

You can override which filename to use as a _single_ ".ignore" file
using the [`dotIgnoreFile`](../reference/project-config.md#dotIgnoreFile) field in your project configuration:

```yaml
apiVersion: garden.io/v2
kind: Project
name: my-project
dotIgnoreFile: .gardenignore
```

The default value of `dotIgnoreFile` is `.gardenignore`.

## Including and excluding files in individual actions

By default, all files in the same directory as an action configuration file are included as source files for that
action.
Sometimes you need more granular control over the context, not least if you have multiple actions in the same directory.

The `include` and `exclude` fields are used to explicitly specify which sources should belong to a particular
action. Both of them accept a list of POSIX-style paths or globs. For example:

```yaml
kind: Build
description: My container
type: container
include:
  - Dockerfile
  - my-sources/**/*.py
exclude:
  - my-sources/tmp/**/*
```

{% hint style="info" %}
Generally, using `.gardenignore` files is far more performant than exclude config statements and will decrease
graph resolution time.
{% endhint %}

Here we only include the `Dockerfile` and all the `.py` files under `my-sources/`, but exclude the `my-sources/tmp`
directory.

If you specify a list with `include`, only those files/patterns are included. If you then specify one or more `exclude`
files or patterns, those are filtered out of the files matched by `include`. If you _only_ specify `exclude`, those
patterns will be filtered out of all files in the action directory.

Note that the action `include` and `exclude` fields have no effect on which paths Garden watches for changes. Use
the [project `scan.exclude` field](../reference/project-config.md) for that purpose.

You can also use .gardenignore file, much like `.gitignore` files, to exclude files across your project. You can place them in your project root, in action roots, and even in individual sub-directories of actions.

{% hint style="warning" %}
Note that you **must** use the `include` and/or `exclude` directives (described above) when action paths overlap. This is to help users steer away from subtle bugs that can occur when actions unintentionally consume source files from other actions. See the next section for details on including and excluding files.
{% endhint %}

## Git submodules

If you're using Git submodules in your project, please note the following:

1. You may ignore submodules using .ignore files and include/exclude filters. If a submodule path _itself_ (that is, the path to the submodule directory, not its contents), matches one that is ignored by your .ignore files or exclude filters, or if you specify include filters and the submodule path does not match one of them, the module will not be scanned.
2. Include/exclude filters (both at the project and module-level) are applied the same way, whether a directory is a submodule or a normal directory.
3. _.ignore files are considered in the context of each git root_. This means that a .ignore file that's outside of a submodule will be completely ignored when scanning that submodule. This is by design, to be consistent with normal Git behavior.
