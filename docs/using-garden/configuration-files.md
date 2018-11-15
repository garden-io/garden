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

Below, we'll be using examples from the
[Hello world](../examples/hello-world.md) example project, which touches
on many of the things you're likely to want to configure in a project.

## Project Configuration

We'll start by looking at the top-level [project configuration file](https://github.com/garden-io/garden/blob/master/examples/hello-world/garden.yml).

```yaml
# examples/hello-world/garden.yml
project:
  name: hello-world
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
environment-specific provider configuration. The above only configures a `local` environment, but you could add
further environments, such as a remote Kubernetes environment.

Here, project-wide configuration variables can also be specified (global, and/or environment-specific). These are
then available for substitution in any string value in any module's `garden.yml`.

For example, assuming the above project configuration, `"foo-${variables.my-variable}-bar"` would evaluate to
`"foo-hello-variable-bar"` when used as a string value in a module's `garden.yml`.

## Module Configuration

Below, we'll use the module configurations of `hello-function` and `hello-container` from the
[Hello world](../examples/hello-world.md) example project
as examples to illustrate some of the primary module-level configuration options.

The following is a snippet from `hello-container`'s module config:

```yaml
module:
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

A [module](../reference/glossary.md#module)'s `type` specifies what kind of module this is, which will control how the
module's code gets built, tested, deployed, etc. The module types are implemented by _providers_. The built-in module types
include `container` and `generic` (which basically provides a way to run commands locally).

The example above is a `container` module, and the `hello-function` module is an `openfaas` module
(which is one of many ways to run functions-as-a-service on Kubernetes).

In this particular project, the `container` module type is implemented by the `local-kubernetes` provider, and the
`openfaas` module is implemented by the corresponding `openfaas` provider.

### build

A module's build configuration is specified via the `build` field, and the implementation of what `build` does varies depending on which provider is responsible for that module.

Regardless of the implementation, a module's build command is executed
with its working directory set to a copy of the module's top-level directory, located at
`[project-root]/.garden/build/[module-name]`. This internal directory is referred to as the module's
[build directory](../reference/glossary.md#build-directory).

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

A module may contain zero or more _services_. Services are deployed when running `garden deploy` or `garden dev` as
part of your runtime stack.

How services are configured will depend on the module type. An `openfaas` module always contains a single service. A
`container` module can contain any number of services (or none at all, if it's just used as a base image, for example).

The following is a snippet from `hello-container`'s module config:

```yaml
module:
  description: Hello world container service
  type: container
  services:
    - name: hello-container
      command: [npm, start]
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
but you may add another service, for example a background worker, that is started using a different
`command`.

For more details on how to configure services in a `container` module, please refer to the
[Config Files Reference](../reference/config.md).

## Tests

Each module can define one or more test suites. How these tests are specified, much like services, depends on the
individual module type. However the concepts are most often the same; you specify one or more test suites, how to
execute them, and in some cases which services need to be running for the tests to run successfully.

For an example, here is another snippet from the `hello-container` module configuration:

```yaml
module:
  description: Hello world container service
  type: container
  ...
  tests:
    - name: unit
      command: [npm, test]
    - name: integ
      command: [npm, run, integ]
      dependencies:
        - hello-function
```

Here we define two types of tests. First are unit tests, which can be run on their own without any dependencies. The
framework only needs to know which command to run, and the rest is handled by the module's code itself.

The other test suite, `integ`, leverages the Garden framework's ability to manage runtime dependencies for tests. In
this case, the integ test suite needs the `hello-function` service to be running for the tests to execute.

This allows you write tests that actually call out to other services, rather than having to mock or stub those services
in your tests.

Tests can be run via `garden test`, as well as `garden dev`.

## Next steps

We highly recommend browsing through the [Example projects](../examples/README.md) to see different examples of how projects and modules can be configured.

Also be sure to look at the [Config Files Reference](../reference/config.md)
 for more details on each of the available
configuration fields.
