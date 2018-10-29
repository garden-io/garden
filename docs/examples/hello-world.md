# Hello World

In this example, we'll have a practical look at the main characteristics of a Garden project:

- Dependencies
- Ports, endpoints, and health check settings
- Tests

This project contains four configuration files. [This one](https://github.com/garden-io/garden/tree/master/examples/hello-world/garden.yml) for project-wide settings, and three separate ones for each of the modules: [`hello-container`](https://github.com/garden-io/garden/tree/master/examples/hello-world/services/hello-container/garden.yml), [`hello-function`](https://github.com/garden-io/garden/tree/master/examples/hello-world/services/hello-function/garden.yml), and [`hello-npm-package`](https://github.com/garden-io/garden/tree/master/examples/hello-world/libraries/hello-npm-package/garden.yml).

_Note: The source code for this project can be found at: [https://github.com/garden-io/garden/tree/master/examples/hello-world](https://github.com/garden-io/garden/tree/master/examples/hello-world)._

# Configuring dependencies

There are three main types of dependencies we'll be dealing with: build dependencies, runtime dependencies, and test dependencies.

You can think of build dependencies as libraries—or anything that produces artifacts needed to build the module in question. For example, our `hello-world/services/hello-container/app.js` file in the `hello-container` module requires the `hello-npm-package` to be imported:

```js
const hello = require("./libraries/hello-npm-package")
```

For `hello-npm-package` to be imported by `hello-container`, of course, it needs to be built first. Thus, we specify it as a build dependency. Take a look at its `config.yml`:

```yml
  build:
    dependencies:
      - name: hello-npm-package
        copy:
          - source: "./"
            target: libraries/hello-npm-package/
```

_Note: `source` refers to the path within the dependency module being specified, and `target` refers to where it will be copied to in the dependant module (picture it as a mount directory)._

Runtime dependencies, on the other hand, are irrelevant at build time, but required for execution. For example, as we can see in the `app.js` file, the `hello-container` module depends on `hello-function` being up and running:

```js
const functionEndpoint = process.env.GARDEN_SERVICES_HELLO_FUNCTION_ENDPOINT
```

So let's see how to make sure `hello-function` is running before `hello-container`:

```yaml
module:
  description: Hello world container service
  type: container
  name: hello-container
  services:
    ...
      dependencies:
        - hello-function
```

Test dependencies will be covered further ahead.

# Defining ports, endpoints, and health checks

Before we can define our endpoints and health checks, we'll have to define the ports we'll be working with. For example, below we'll assign the name `http` to port number `8080`:

```yml
module:
  description: Hello world container service
  ...
  services:
    ...
      ports:
        - name: http
          containerPort: 8080
```

Now let's use that port and a path to define an ingress endpoint for the service to expose:

```yml
module:
  description: Hello world container service
  ...
  services:
    ...
      ports:
        - name: http
          containerPort: 8080
      endpoints:
        - path: /hello
          port: http
```

Lastly, health checks currently have three possible types: `httpGet`, `command`, and `tcpPort`. They're specified in the [Config Files Reference](../reference/config-files-reference.md). 

For the Hello World project, we'll use the first one. This `healthCheck` endpoint will be pinged periodically to ensure that the service is still healthy. Here's what it looks like:

```yml
module:
  description: Hello world container service
  ...
  services:
    ...
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
```

# Setting up tests

Since Garden is language-agnostic, there aren't any low level requirements about how tests should be arranged. The only requirements are:

- You must be able to execute a command to run your tests.
- Any non-zero exit codes returned by the command mean your tests have failed, and zero indicates the tests are passing.

The only difference between unit tests and integration tests, then, is that to run the latter you might need other services to be up and running as well. You can specify them as test dependencies.

Here's what it looks like in practice:

```yml
  tests:
    - name: unit
      command: [npm, test]
    - name: integ
      command: [npm, run, integ]
      dependencies:
        - hello-function
```