# Features and Usage

Now that you've had a glimpse of the basic Garden commands in the [Quick Start](../basics/quick-start.md) guide, and learned about the [Stack Graph](../basics/stack-graph.md), let's go through what some typical Garden workflows look like.

## Starting a new project

To start a new project, you create a `garden.yml` file in the project's root directory. At it's simplest, the project level `garden.yml` file looks something like this:

```yaml
# examples/simple-project/garden.yml
project:
  name: simple-project
  environments:
    - name: local
      providers:
        - name: local-kubernetes
```

You then add a `garden.yml` file at the root directory of every module in your project. Normally, a module is a single container or a single serverless function. A module level `garden.yml` file looks something like this:

```yaml
# examples/simple-project/services/go-service/garden.yml
module:
  name: go-service
  description: Go service container
  type: container
  services:
    - name: go-service
      ports:
        - name: http
          containerPort: 8080
          servicePort: 80
      ingresses:
        - path: /hello-go
          port: http
```

To learn more about how to configure a Garden project, please take a look at our [Configuration files](./configuration-files.md) document.

For a practical example of "gardenifying" an existing project, check out the [Simple project](../examples/simple-project.md) example.

## The development workflow

Most of the time, the development workflow when using Garden after the configuration files are set is extremely simple: you leave `garden dev` running, and Garden will automatically re-build, re-deploy, and re-test your project as you work on it.

Sometimes though, you might prefer to skip the testing step, in which case you can simply use `garden deploy --watch`. This will watch for changes, then build and deploy them, but it'll skip testing.

Lastly, when things go wrong you should refer to the error logs. These consist of an `error.log` file in the project root, along with the service logs that you can retrieve from the individual pods in your cluster.

For the latter, you can use the `garden logs` command, followed by the name of the service you'd like to query. For example `garden logs go-service` would fetch the logs for the `go-service` service, while `garden logs go-service,node-service` would fetch the logs for both the `go-service` and the `node-service` services.

The `garden logs` command is functionally equivalent to `kubectl logs`, but simpler to execute.

## Providers

Whenever "a module's type" is mentioned in the documentation, what's meant is "which provider will handle this module?" Providers, as [previously discussed](../basics/stack-graph.md), are responsible for implementing different behaviors for say containers and functions, and they need to be specified in a module's configuration files.

For a comprehensive list of providers available in Garden, check out the [References](../reference/README.md)

## Testing and dependencies

Both tests and dependencies are specified in Garden's `garden.yml` configuration files.

Service dependencies are a field within the services declaration. Here's a snippet, from our [TLS project](../examples/tls-project.md) example:

```yaml
module:
  name: node-service
  description: Node service container
  type: container
  services:
    - name: node-service
      ...
      dependencies:
        - go-service
```

Tests should be specified the same way, and in the case of integration tests their dependencies should be present as well. Another snippet from the same file:

```yaml
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ]
    dependencies:
      - go-service
```

Above we're using `npm test` and `npm run integ` for our tests, but they can be anything you'd like. The only constraint is that Garden follows the typical Unix exit codes convention: `0` means success, and any non-zero exit codes represent failure.

## Advanced features

For Garden's more advanced features, see the following docs:

- [Hot Reload](./hot-reload.md), for how to automatically update files in a running container without having to restart it and lose state.
- [TLS project](../examples/tls-project.md), for—drumroll!—how to set up TLS with Garden.
- [Remote sources project](../examples/remote-sources.md), for how to integrate multiple remote and local repositories within the same project.
