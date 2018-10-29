# Features and Usage

Now that you've had a glimpse of the basic Garden commands in the [Quick Start](./basics/quick-start.md) guide, and a brief look at the main [Concepts](../basics/concepts.md) we'll be dealing with, let's go through what some typical Garden workflows look like.

## Starting a new project

There are two ways to start a new project with Garden:

- You can create all the configuration files by hand. For that that you should take a look at our [Configuration files](./configuration-files.md) document.
- Or you can use the `garden create` command—often a lot easier.

### `garden create`

The `garden create` command can be used to create either whole projects, or just modules. Essentially what it does is help you create configuration files so you don't have to do it by hand.

The command `garden create project` will create a new project in the current directory and prompt you to add modules to it, which should each have a name and a type. It will then create the appropriate folders and the configuration files within them.

If this is a pre-existing project and you want to "gardenify" code that's already there, you can try, for example, `garden create project --module-dirs=./services`. This will prompt you to create configuration files for every subfolder within the `./services` directory.

To add individual modules later on you can use `garden create module`.

```
➜  test-project g create project

Initializing new Garden project test-project
---------
? Would you like to add a module to your project? Yes
? Enter module name my-module
? Module type container
? Add another module? (current modules: my-module) Yes
? Enter module name my-module-2
? Module type container
? Add another module? (current modules: my-module, my-module-2) No
---------
✔ Setting up project
✔ Writing config for my-module
✔ Writing config for my-module-2
✔ Writing config for test-project
Project created! Be sure to check out our docs for how to get sarted!
```

For a practical example of "gardenifying" an existing project, check out the [Simple project](../examples/simple-project.md) example.

## The development workflow

Most of the time, the development workflow when using Garden after the configuration files are set is extremely simple: you leave `garden dev` running, and Garden will automatically re-build, re-deploy, and re-test your project as you work on it.

Sometimes though, you might prefer to skip the testing step, in which case you can simply use `garden deploy --watch`. This will watch for changes, then build and deploy them, but it'll skip testing.

Another important topic to keep in mind is [inter-service communication](../basics/concepts.md#how-inter-service-communication-works). As previously discussed, your project has multiple services, and they need to talk to each other at some point. That's pretty simple: a service's hostname is simply its name. So a the hostname for a service called `my-service` is simply `http://my-service/`.

For example, the following snippet calls a different service in the project called `go-service`.

```js
request.get('http://go-service/hello-go').then(message => {res.json({message})})
```

Lastly, when things go wrong you should refer to the error logs. These consist of an `error.log` file in the project root, along with the service logs that you can retrieve from the individual pods in your cluster.

For the latter, you can use the `garden logs` command, followed by the name of the service you'd like to query. For example `garden logs go-service` would fetch the logs for the `go-service` service, while `garden logs go-service,node-service` would fetch the logs for both the `go-service` and the `node-service` services.

The `garden logs` command is functionally equivalent to `kubectl logs`, but simpler to execute.

## Providers

Whenever "a module's type" is mentioned in the documentation, what's meant is "which provider will handle this module?" Providers, as [previously discussed](../basics/concepts.md), are responsible for implementing different behaviors for say containers and serverless functions, and they need to be specified in a module's configuration files.

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
    command: [npm, test]
  - name: integ
    command: [npm, run, integ]
    dependencies:
      - go-service
```

Above we're using `npm test` and `npm run integ` for our tests, but they can be anything you'd like. The only constraint is that Garden follows the typical Unix exit codes convention: `0` means success, and any non-zero exit codes represent failure.

## Advanced features

For Garden's more advanced features, see the following docs:

- [Hot Reload](./hot-reload.md), for how to automatically update files in a running container without having to restart it and lose state.
- [TLS project](../examples/tls-project.md), for—drumroll!—how to set up TLS with Garden.
- [Remote sources project](../examples/remote-sources.md), for how to integrate multiple remote and local repositories within the same project.
