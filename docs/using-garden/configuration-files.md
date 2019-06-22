# Configuration

Garden is configured via `garden.yml` configuration files.

The [project-wide](#project-configuration) `garden.yml` file should be located in the top-level directory of the
project's Git repository.

In addition, each of the project's [modules](../reference/glossary.md#module)' `garden.yml` should be located in that
module's top-level directory.

To get started, create a `garden.yml` file in the top-level directory of your repository, and a `garden.yml` file
in the top-level directory of each of the modules you'd like to define for your project.

To decide how to split your project up into modules, it's useful to consider what parts of it are built as a single
step, and what the dependency relationships are between your build steps. For example, each container and each
serverless function should be represented by its own module.

Below, we'll be using examples from the [OpenFaaS](../examples/openfaas.md) example project.

## Project Configuration

We'll start by looking at the top-level [project configuration file](https://github.com/garden-io/garden/blob/master/examples/openfaas/garden.yml).

```yaml
# examples/openfaas/garden.yml
kind: Project
name: openfaas
environmentDefaults:
  variables:
    my-variable: hello-variable
environments:
  - name: local
    providers:
      - name: local-kubernetes
      - name: openfaas
```

The project-wide `garden.yml` defines the project's name, the default configuration used for each
[environment](../reference/glossary.md#environment) (via the `environmentDefaults` field), and
environment-specific [provider](../reference/glossary.md#provider) configuration. The above only configures a `local` environment, but you could add
further environments, such as a remote Kubernetes environment, where you'd use the `kubernetes` (i.e. remote)
provider instead of `local-kubernetes`.

Here, project-wide configuration variables can also be specified (global, and/or environment-specific). These are
then available for substitution in any string value in any module's `garden.yml`.

For example, assuming the above project configuration, `"foo-${var.my-variable}-bar"` would evaluate to
`"foo-hello-variable-bar"` when used as a string value in a module's `garden.yml`.

## Module Configuration

Below, we'll use the module configurations of `hello-function` and `hello-container` from the
[OpenFaaS](../examples/openfaas.md) example project
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
referred to as the module's [build directory](../reference/glossary.md#build-directory).

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

## Multiple Modules in the Same File

Sometimes, it's useful to define several modules in the same `garden.yml` file. One common situation is where more than
one Dockerfile is in use (e.g. one for a development build and one for a production build).

Another is when the dev configuration and the production configuration have different integration testing suites,
which may depend on different external services being available.

To do this, simply add a document separator (`---`) between the module definitions. Here's a simple example:

```yaml
kind: Module
description: Hello world container - dev configuration
type: container
dockerfile: Dockerfile-dev
...
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ-dev]
    dependencies:
      - hello-function
      - dev-integration-testing-backend

---

kind: Module
description: Hello world container - production configuration
type: container
dockerfile: Dockerfile-prod
...
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ-prod]
    dependencies:
      - hello-function
      - prod-integration-testing-backend
```

## Template strings

String configuration values in `garden.yml` can be templated to inject, among other things, variables,
information about the user's environment, references to other modules/services etc.

The syntax for templated strings is `${some.key}`. The key is looked up from the context available when
resolving the string. The context depends on which top-level key the configuration value belongs to (`project`
or `module`). See below for the full context that is available for each of those.

For example, for one service you might want to reference something from another module and expose it as an
environment variable:

```yaml
kind: Module
name: some-module
services:
  - name: some-service
    ...
    env:
      OTHER_MODULE_VERSION: ${modules.other-module.version}
```

You can also inject a template variable into a string. For instance, you might need to include a module's
version as part of a URI:

```yaml
    ...
    env:
      OTHER_MODULE_ENDPOINT: http://other-module/api/${modules.other-module.version}
```

Note that while the syntax looks similar to template strings in Javascript, you can currently only do simple
lookups of keys and not execute arbitrary JS expressions.

Another common use case is to define `variables` in the project/environment configuration, and use template strings
to propagate values to modules in the project:

```yaml
kind: Project
...
variables:
  log-level: "info"

---

kind: Module
...
services:
  - name: my-service
    ...
    env:
      LOG_LEVEL: ${var.log-level}
```

For a full reference of keys that are available in template strings, please look at the
[Template Strings Reference](../reference/template-strings.md).

### Conditionals

You can do conditional statements in template strings, using the `||` operator. For example:

```yaml
  # ...
  variables:
    log-level: ${local.env.LOG_LEVEL || "info"}
    namespace: ${local.env.CI_BRANCH || local.username || "default"}
```

This allows you to easily set default values when certain template keys are not available, and to configure your
project based on varying context.

### Numbers, booleans and null values

When a template string key resolves to a number, boolean or null, the output is handled in two different ways,
depending on whether the template string is part of surrounding string or not.

If the template string is the whole string being interpolated, we assign the number, boolean or null directly to the
key:

```yaml
kind: Project
...
variables:
  global-memory-limit: 100
---
kind: Module
...
services:
  - name: my-service
    ...
    limits:
      memory: ${var.global-memory-limit}   # <- resolves to a number, as opposed to "100" as a string
```

If however the template string is part of a surrounding string, the value is formatted into the string, as you would
expect:

```yaml
kind: Project
...
variables:
  project-id: 123
  some-key: null
---
kind: Module
...
services:
  - name: my-service
    ...
    env:
      CONTEXT: project-${project-id}   # <- resolves to "project-123"
      SOME_VAR: foo-${var.some-key}   # <- resolves to "foo-null"
```

## Next steps

We highly recommend browsing through the [Example projects](../examples/README.md) to see different examples of how projects and modules can be configured.

Also be sure to look at the [Config Files Reference](../reference/config.md) for more details on each of the available
configuration fields, and the [Template Strings Reference](../reference/template-strings.md) for available keys in
template strings.
