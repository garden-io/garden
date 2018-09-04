## Configuration

Garden is configured via `garden.yml` configuration files.

The [project-wide](#project-configuration) `garden.yml` file should be located in the top-level directory of the
project's Git
repository.

In addition, each of the project's [modules](../guides/glossary.md#module)' `garden.yml` should be located in that module's
top-level
directory.

Currently, Garden projects assume that all their modules are rooted in subdirectories of the same Git repository.
In a future release, this mono-repo structure will be made optional.

To get started, create a `garden.yml` file in the top-level directory of your repository, and a `garden.yml` file
in the top-level directory of each of the modules you'd like do define for your project.

To decide how to split your project up into modules, it's useful to consider what parts of it are built as a single
step, and what the dependency relationships are between your build steps. For example, each container and each
serverless function should be represented by its own module

Then, you can configure each module's endpoints via the [`services` directive](#services) in its `garden.yml`.

Below, we'll be using examples from the
[hello-world example project](https://github.com/garden-io/garden/tree/528b141717f718ebe304d2ebde87b85d0c6c5e50/examples/hello-world).

### Project Configuration
[Github link](https://github.com/garden-io/garden/blob/528b141717f718ebe304d2ebde87b85d0c6c5e50/examples/hello-world/garden.yml)
```yaml
# examples/hello-world/garden.yml
project:
  name: hello-world
  global:
    providers:
      - name: container
      - name: npm-package
    variables:
      my-variable: hello-variable
  environments:
    - name: local
      providers:
        - name: local-kubernetes
        - name: local-google-cloud-functions
    - name: dev
      providers:
        - name: google-app-engine
        - name: google-cloud-functions
          default-project: garden-hello-world
```
The project-wide `garden.yml` defines the project's name, the default providers used for each
[plugin](../guides/glossary.md#plugin) the project requires (via the `global` directive), and
[environment](../guides/glossary.md#environment)-specific provider overrides as is appropriate for each of the project's
configured environments (`local` and `dev` under the `environments` directive above).

Here, project-wide configuration variables can also be specified (global, and/or environment-specific). These are
then available for interpolation in any string scalar value in any module's `garden.yml`.

 For example, assuming the above project configuration, `"foo-${variables.my-variable}-bar"` would evaluate to
 `"foo-hello-variable-bar"` when used as a scalar string value in a module's `garden.yml`.

### Module Configuration
Below, we'll use the module configurations of `hello-function` and `hello-container` from the
[hello-world example project](https://github.com/garden-io/garden/tree/528b141717f718ebe304d2ebde87b85d0c6c5e50/examples/hello-world)
as examples to illustrate some of the primary module-level configuration options.

The following is a snippet from [`hello-function`'s module config](#hello-function-module-configuration):
```yaml
module:
  description: Hello world serverless function
  type: google-cloud-function
  name: hello-function
  ...
  build:
    dependencies:
      - name: hello-npm-package
        copy:
          - source: "./"
            target: libraries/hello-npm-package/
```

#### name
The module's name, used e.g. when referring to it from another module's configuration as a
[build dependency](#build-configuration), or when building specific modules with `garden build`.

Note that module names must be unique within a given project. An error will be thrown in any Garden CLI command if two
modules use the same name.

#### type
A [module](../guides/glossary.md#module)'s `type` specifies its plugin type. Garden interprets this according to the
active environment's configured provider for the specified plugin type.

For example,
[`hello-container`](#hello-container-module-configuration)'s `type` is set to `container`, which the
[project configuration](#project-configuration) above interprets as `local-kubernetes` (a Docker container managed
via a local Kubernetes installation), assuming that the `local` environment is being used.

#### build
A module's build configuration is specified via the `build` directive.

Under `build`, the `command` subdirective sets the CLI command run during builds. A module's build command is executed
with its working directory set to a copy of the module's top-level directory, located at
`[project-root]/.garden/build/[module-name]`. This internal directory is referred to as the module's
[build directory](../guides/glossary.md#build-directory).

The `.garden` directory should not be modified by users, since this may lead to unexpected errors when the Garden CLI
tools are used in the project.

##### Build Dependencies
The `dependencies` subdirective lists the module's build dependencies. `name` is the required module's name, and
`copy` indicates what files/folders, if any, should be copied from the required module's build directory to the
module in question after the required module is built (`source`), and where they should be copied (`target).

#### Services
The following is a snippet from [`hello-container's`'s module config](#hello-container-module-configuration):
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
      endpoints:
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
The `services` directive defines the services exposed by the module.

##### name
The service's name, used e.g. when referring to it as a dependency of another service, or when deploying
specific services with `garden deploy`. Service names must be unique across all modules within a given project. An
error will be thrown in any Garden CLI command if two services use the same name.

##### command
The CLI command to be executed (after the module is built) to make the service's endpoints available.

##### ports
Names each port exposed by the service.

##### endpoints
Enumerates the functional endpoints exposed by the service, defining the relative path and port to associate with
each of them.

##### healthcheck
Defines the endpoint used to query the service's availability.

##### dependencies
Lists the names of the services that must be deployed before the service in question (the `hello-container` service, in
this case) is deployed.

##### tests
A list of named test configurations for the module.

Following is another snippet from [`hello-container`'s module config](#hello-container-module-configuration):
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
Test groups can be run by `name` via `garden test`. `command` is the CLI command to run the specified tests, and
`dependencies` lists (by name) the services (if any) that must be deployed before the test group in question is run.

#### Functions (experimental)
For modules defining serverless functions, the `functions` directive specifies the names and entry points of the
functions the module exposes. Note that serverless functionality is still experimental and under active development.

This section is currently only included to clarify the `functions` directive in
[`hello-function`'s module config](#hello-function-module-configuration), since it's used as an example here.

### Examples

#### hello-function Module Configuration
[Github link](https://github.com/garden-io/garden/blob/528b141717f718ebe304d2ebde87b85d0c6c5e50/examples/hello-world/services/hello-function/garden.yml)
````yaml
# examples/hello-world/services/hello-function/garden.yml
module:
  description: Hello world serverless function
  name: hello-function
  type: google-cloud-function
  functions:
    - name: hello-function
      entrypoint: helloFunction
  tests:
    - name: unit
      command: [npm, test]
  build:
    dependencies:
      - name: hello-npm-package
        copy:
          - source: "./"
            target: libraries/hello-npm-package/
````

#### hello-container Module Configuration
[Github link](https://github.com/garden-io/garden/blob/528b141717f718ebe304d2ebde87b85d0c6c5e50/examples/hello-world/services/hello-container/garden.yml)
```yaml
# examples/hello-world/services/hello-container/garden.yml
module:
  description: Hello world container service
  type: container
  services:
    - name: hello-container
      command: [npm, start]
      ports:
        - name: http
          containerPort: 8080
      endpoints:
        - path: /hello
          port: http
      healthCheck:
        httpGet:
          path: /_ah/health
          port: http
      dependencies:
        - hello-function
  build:
    dependencies:
      - hello-npm-package
  tests:
    - name: unit
      command: [npm, test]
    - name: integ
      command: [npm, run, integ]
      dependencies:
        - hello-function
```
