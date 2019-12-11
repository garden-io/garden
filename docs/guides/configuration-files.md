# Configuration Files

Garden is configured via `garden.yml` configuration files, which Garden collects and compiles into a
[Stack Graph](../stack-graph.md) of your project.

The [project-wide](#project-configuration) `garden.yml` file should be located in the top-level directory of the
project's Git repository.

In addition, each of the project's [modules](../reference/glossary.md#module)' `garden.yml` should be located in that
module's top-level directory.

To get started, create a `garden.yml` file in the top-level directory of your repository, and a `garden.yml` file
in the top-level directory of each of the modules you'd like to define for your project.

To decide how to split your project up into modules, it's useful to consider what parts of it are built as a single
step, and what the dependency relationships are between your build steps. For example, each container and each
serverless function should be represented by its own module.

Below, we'll be using examples from the
[OpenFaaS](https://github.com/garden-io/garden/blob/master/examples/openfaas/garden.yml) example project.

## Project Configuration

We'll start by looking at the top-level [project configuration file](https://github.com/garden-io/garden/blob/master/examples/openfaas/garden.yml).

```yaml
# examples/openfaas/garden.yml
kind: Project
name: openfaas
environments:
  - name: local
    providers:
      - name: local-kubernetes
      - name: openfaas
variables:
  my-variable: hello-variable
```

The project-wide `garden.yml` defines the project's name and
environment-specific [provider](../reference/glossary.md#provider) configuration. The above only configures a `local` environment, but you could add
further environments, such as a [remote Kubernetes](./remote-kubernetes.md) environment, where you'd use the `kubernetes`
provider instead of `local-kubernetes`.

Here, project-wide configuration variables can also be specified (global, and/or environment-specific). These are
then available for substitution in any string value in any module's `garden.yml`.

For example, assuming the above project configuration, `"foo-${var.my-variable}-bar"` would evaluate to
`"foo-hello-variable-bar"` when used as a string value in a module's `garden.yml`. See
[Template strings](./variables-and-templating.md#template-string-basics) below for more on templating your configuration files.

## Module Configuration

Below, we'll use the module configurations of `hello-function` and `hello-container` from the
[OpenFaaS](https://github.com/garden-io/garden/blob/master/examples/openfaas/garden.yml) example project
as examples to illustrate some of the primary module-level configuration options.

The following is a snippet from `hello-container`'s module config:

```yaml
kind: Module
name: hello-container
type: container
description: Hello world container service
...
build:
  dependencies:
    - name: hello-npm-package
      copy:
        - source: "./"
          target: libraries/hello-npm-package/
```

The first lines you'll find in all module configurations, and describe the module at a high level.

The second part, the `build` key, demonstrates how Garden can serve as a build framework, managing build dependencies
and even copying files between modules as they are built.

Below is a run-down of the individual configuration keys, and what they represent:

### name

The module's name, used e.g. when referring to it from another module's configuration as a
build dependency, or when building specific modules with `garden build`.

Note that module names must be unique within a given project. An error will be thrown in any Garden CLI command if two
modules use the same name.

### type

A [module](../reference/glossary.md#module)'s `type` determines its schema, and which [provider](../reference/glossary.md#provider) is
used to build, test and deploy (etc.) it. The built-in module types include `container`, `helm` and `exec`
(which basically provides a way to run commands locally).

The example above is a `container` module, and the `hello-function` module is an `openfaas` module
(which is one of many ways to run functions-as-a-service on Kubernetes).

In this particular project, the `container` module type is implemented by the `local-kubernetes` provider, and the
`openfaas` module is implemented by the corresponding `openfaas` provider.

### build

A module's build configuration is specified via the `build` field, and the implementation of what `build` does varies
depending on which provider is responsible for that module.

Regardless of the implementation, a module's build process is executed with its working directory set to a copy of the
module's top-level directory, located at `[project-root]/.garden/build/[module-name]`. This internal directory is
referred to as the module's build directory.

The `.garden` directory should not be modified by users, since this may lead to unexpected errors when the Garden CLI
tools are used in the project.

The `build.dependencies` subfield lists the module's build dependencies, which need to be built ahead of this module.
`name` is the required module's name. In many cases you only need to declare the build dependency name. For example,
you simply need to build one container before another because it's used as a base image.

In other cases, you may actually need files to be copied from one built module to another.
The `copy` key indicates what files/folders, if any, should be copied from the required module's build directory to the
module in question after the required module is built (`source`), and where they should be copied to (`target`).

In the above example, we copy the entire contents of `hello-npm-package`'s build directory, after it has been built,
into `libraries/hello-npm-package/` in the `hello-container` build directory, _before `hello-container` is built_.

## Services

A module may define zero or more _services_. Services are deployed when running `garden deploy` or `garden dev` as
part of your runtime stack.

How services are configured will depend on the module type. An `openfaas` module always contains a single service. A
`container` module can contain any number of services (or none at all, if it's just used as a base image, for example).

The following is a snippet from `hello-container`'s module config:

```yaml
kind: Module
description: Hello world container service
type: container
services:
  - name: hello-container
    args: [npm, start]
    ports:
      - name: http
        containerPort: 8080
    ingresses:
      - path: /hello
        port: http
    healthCheck:
      httpGet:
        path: /_ah/health
        port: http
    dependencies:
      - hello-function
...
```

Here the `services` field defines the services exposed by the module. We only have one service in this example,
but you may add another service, for example a background worker, that is started using different
`args`.

For more details on how to configure services in a `container` module, please refer to the
[Config Files Reference](../reference/config.md).

## Tests

Each module can define one or more test suites. How these tests are specified, much like services, depends on the
individual module type. However the concepts are most often the same; you specify one or more test suites, how to
execute them, and in some cases which services need to be running for the tests to run successfully.

For an example, here is another snippet from the `hello-container` module configuration:

```yaml
kind: Module
description: Hello world container service
type: container
...
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ]
    dependencies:
      - hello-function
```

Here we define two types of tests. First are unit tests, which can be run on their own without any dependencies. The
framework only needs to know which args to run the container with, and the rest is handled by the module's code itself.

The other test suite, `integ`, leverages the Garden framework's ability to manage runtime dependencies for tests. In
this case, the integ test suite needs the `hello-function` service to be running for the tests to execute.

This allows you write tests that actually call out to other services, rather than having to mock or stub those services
in your tests.

Tests can be run via `garden test`, as well as `garden dev`.

## Tasks, Services and Dependencies - Tying it All Together

Tasks are a wrapper for scripts or commands to be run in the context of the module—inside an instance of the container for `container` modules, inside the module's folder for `exec`  modules etc.

Since tasks and services can depend on other tasks and services, adding dependencies to your task and service definitions gives you the building blocks to spin up your stack with one command.

To illustrate all of this, let's look at the module configurations in the `tasks` example project:

```yaml
# user/garden.yml
kind: Module
name: user
description: User-listing service written in Ruby
type: container
services:
  - name: user
    ...
    dependencies:
      - ruby-migration
tasks:
  - name: ruby-migration
    args: [rake, db:migrate]
    description: Populates the users table with a few records.
    dependencies:
      # node-migration creates the users table, which has to exist before we use
      # ruby-migration to insert records into it.
      - node-migration
  - name: db-clear
    args: [rake, db:rollback]
    description: Deletes all records from the users table.
    dependencies:
      - node-migration
```

```yaml
# hello/garden.yml
kind: Module
name: hello
description: Greeting service
type: container
services:
  - name: hello
    ...
    dependencies:
      - node-migration
...
tasks:
  - name: node-migration
    args: [knex, migrate:latest]
    description: Creates the users table.
    dependencies:
      - postgres
```

```yaml
# postgres/garden.yml
kind: Module
description: postgres container
type: container
name: postgres
image: postgres:9.4
services:
  - name: postgres
    ...
```

To spin up this project, three services have to be deployed and two database migrations have to be run, and all this
has to happen in the right dependency order.

To deploy the `user` service, first the `postgres` service has to be deployed, then `node-migration` has to be run (to
create the `users` table), and finally, `ruby-migration` has to be run (to populate the `users` table).

Garden takes care of this automatically when you run e.g. `garden deploy` or `garden dev`.

You can also run tasks in an ad-hoc manner using `garden run task [task name]`. This is useful e.g. when migrating the
DB schema for one of your services after you've already deployed your stack.

Note that tasks that are not depended on by any services are not run by `garden deploy`, `garden dev` or
`garden test`, since the goal of those commands is to deploy services and/or run tests.

An example of this is the `db-clear` task in the `user` module above. This task will only be run when
directly requested via `garden run task db-clear`.

## Advanced configuration

### Multiple Modules in the Same File

Sometimes, it's useful to define several modules in the same `garden.yml` file. One common situation is where more than
one Dockerfile is in use (e.g. one for a development build and one for a production build).

Another is when the dev configuration and the production configuration have different integration testing suites,
which may depend on different external services being available.

To do this, add a document separator (`---`) between the module definitions. Here's a simple (if a bit contrived)
example:

```yaml
kind: Module
description: My container - configuration A
type: container
dockerfile: Dockerfile-a
exclude: ["Dockerfile-b"]
...
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ-a]
    dependencies:
      - a-integration-testing-backend

---

kind: Module
description: My container - configuration B
type: container
dockerfile: Dockerfile-b
exclude: ["Dockerfile-a"]
...
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ-b]
    dependencies:
      - b-integration-testing-backend
```

Note that you must use the `include` and/or `exclude` directives when module paths overlap. This is to help users steer away from subtle bugs that can occur when modules unintentionally consume source files from other modules. See the next section for details on including and excluding files.

### Including/excluding files and directories

By default, all directories under the project root are scanned for Garden modules, and all files in the same directory as a module configuration file are included as source files for that module. Sometimes you need more granular control over the context, not least if you have multiple modules in the same directory.

Garden provides three different ways to achieve this:

1. The `modules.include` and `modules.exclude` fields in _project_ configuration files.
2. The `include` and `exclude` fields in _module_ configuration files.
3. ".ignore" files, e.g. `.gitignore` and `.gardenignore`.

#### Project include/exclude

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

#### Module include/exclude

By default, all files in the same directory as a module configuration file are included as source files for that module. Sometimes you need more granular control over the context, not least if you have multiple modules in the same directory.

The `include` and `exclude` fields are a simple way to explicitly specify which sources should belong to a particular module. They both accept a list of POSIX-style paths or globs. For example:

```yaml
kind: Module
description: My container
type: container
include:
  - Dockerfile
  - my-sources/**/*.py
exclude:
  - my-sources/tmp/**/*
...
```

Here we only include the `Dockerfile` and all the `.py` files under `my-sources/`, but exclude the `my-sources/tmp` directory.

If you specify a list with `include`, only those files/patterns are included. If you then specify one or more `exclude` files or patterns, those are filtered out of the files matched by `include`. If you _only_ specify `exclude`, those patterns will be filtered out of all files in the module directory.

Note that the module `include` and `exclude` fields have no effect on which paths Garden watches for changes. Use the project `modules.exclude` field (described above) for that purpose.

#### .ignore files

By default, Garden respects `.gitignore` and `.gardenignore` files and excludes any patterns matched in those files.

You can use those to exclude files and directories across the project, _both from being scanned for Garden modules and when selecting source files for individual module_. For example, you might put this `.gardenignore` file in your project root directory:

```gitignore
node_modules
public
*.log
```

This would cause Garden to ignore `node_modules` and `public` directories across your project/repo, and all `.log` files. You can place the ignore files anywhere in your repository, much like `.gitignore` files, and they will follow the same semantics.

Note that _these take precedence over both `module.include` fields in your project config, and `include` fields in your module configs_. If a path is matched by one of the ignore files, the path will not be included in your project or modules.

You can override which filenames to use as ".ignore" files using the `dotIgnoreFiles` field in your project configuration. For example, you might choose to only use `.gardenignore` files and not exclude paths based on your `.gitignore` files:

```yaml
kind: Project
name: my-project
dotIgnoreFiles: [.gardenignore]
```

#### Git submodules

If you're using Git submodules in your project, please note the following:

1. You may ignore submodules using .ignore files and include/exclude filters. If a submodule path _itself_ (that is, the path to the submodule directory, not its contents), matches one that is ignored by your .ignore files or exclude filters, or if you specify include filters and the submodule path does not match one of them, the module will not be scanned.
2. Include/exclude filters (both at the project and module level) are applied the same, whether a directory is a submodule or a normal directory.
3. _.ignore files are considered in the context of each git root_. This means that a .ignore file that's outside of a submodule will be completely ignored when scanning that submodule. This is by design, to be consistent with normal Git behavior.

## Next steps

We highly recommend reading the [Variables and Templating guide](./variables-and-templating.md) to understand how you can reference across different providers and modules, as well as to understand how to supply secret values to your configuration.

We suggest browsing through the [Example projects](../examples/README.md) as well, to see different examples of how projects and modules can be configured.

Also, be sure to look at the [Config Files Reference](../reference/config.md) for more details on each of the available configuration fields, and the [Template Strings Reference](../reference/template-strings.md) for the keys available in template strings.

For deep-dives into specific use cases, you may want to look at the [Hot reload](./hot-reload.md) and [Using Helm charts](./using-helm-charts.md) guides.
