# Simple Project

In this guide, we'll walk you through configuring a simple project to run on the Garden framework. The project will consist of two Dockerized web services that communicate with one another, along with unit and integration tests.

In what follows you'll learn how to:

* [Configure the project](#project-wide-configuration)
* [Configure individual modules](#module-configuration)
* [Deploy the project locally](#deploying)
* [Have the services communicate with one another](#inter-service-communication)
* [Manage service dependencies](#dependencies)
* [Test services](#testing)

## Before you get started

This tutorial assumes that you have already have a running [installation of Garden](../introduction/getting-started.md).

## Clone the example repo

The code for this tutorial can be found on Github in our [examples repo](https://github.com/garden-io/garden-examples). We'll use the [simple-project-start](https://github.com/garden-io/garden-examples/simple-project-start) example and work our way from there. The complete version is under [simple-project](https://github.com/garden-io/garden-examples/simple-project).

First, let's clone the examples repo, change into the directory, and take a look inside:
```sh
$ git clone https://github.com/garden-io/garden-examples.git
$ cd garden-examples/simple-project-start
$ tree .
.
└── services
    ├── go-service
    │   ├── Dockerfile
    │   └── webserver
    │       └── main.go
    └── node-service
        ├── Dockerfile
        ├── app.js
        ├── main.js
        ├── package.json
        └── test
            └── integ.js

5 directories, 7 files
 ```

As you can see the project consists of two super simple services and their accompanying Dockerfiles. One of the core tenets of multi-service backends is being able to pick the right tool for the job, and therefore we have a Node.js service and a Golang service, that we can pretend have different responsibilities.

The task at hand is to configure these services so that they can run on the Garden framework.

## Project-wide configuration

To begin with, every project needs a project-wide `garden.yml` [configuration file](../guides/configuration.md#Config) at the root level. There we define, among other things, the name of the project, and the [providers](../guides/glossary.md#Provider) used for each [plugin](../guides/glossary.md#Plugin) the project requires.

Let's go ahead and create one:

```sh
$ touch garden.yml
```

and add the following configuration:

```yaml
project:
  name: simple-project
  environments:
    - name: local
      providers:
        - name: local-kubernetes
```

Above, we've specified the name of our project and configured it to use the local-kubernetes plugin for local development. Note, that this file must be located in the project root directory.

## Module configuration

Now, let's turn to our services. Services live inside [modules](../guides/glossary.md#Module), and each module has it's own `garden.yml` configuration file.

We'll start with the module for the `node-service`:

```sh
$ touch services/node-service/garden.yml
```

and add the following:

```yaml
module:
  description: Node service container
  type: container
```

By running the `scan` command we can see that Garden detects our module config:

```sh
$ garden scan
- name: node-service
  type: container
  path: /Users/eysi/code/simple-project/services/node-service
  description: Node service container
  version:
    versionString: 2c8818986d-1528373640
    latestCommit: 2c8818986d
    dirtyTimestamp: 1528373640
```

Under the `module` directive of our `services/node-service/garden.yml` file we can now specify how to run our service:

```yaml
module:
  description: Node service container
  type: container
  services:
    - name: node-service
      command: [npm, start]
      ports:
        - name: http
          containerPort: 8080
      endpoints:
        - path: /
          port: http
```
The [services](../guides/configuration.md#Services) directive is specific to container modules, and defines the services exposed by the module. In this case, our containerized Node.js server. The sub-directives tell Garden how to start the service and which endpoints to expose.

## Deploying

With this configuration we're almost ready to deploy. First, we'll need to create a user namespace for our environment with the login command:

```sh
$ garden login
```

Garden can now deploy our service to a local Kubernetes cluster:

```sh
$ garden deploy
```

To verify that everything is working, we can call the service at the `/hello` endpoint defined in `/services/node-service/app.js`:

```sh
$ garden call node-service/hello
✔ Sending HTTP GET request to http://simple-project.local.app.garden/hello

200 OK

Hello from Node server!
```

In a similar manner, we create a config file for our `go-service`:

```sh
$ touch services/go-service/garden.yml
```

and add the following:

```yaml
module:
  description: Go service container
  type: container
  services:
    - name: go-service
      ports:
        - name: http
          containerPort: 80
      endpoints:
        - path: /
          port: http
```

Run the deploy command again, this time only for the `go-service`:

```sh
$ garden deploy go-service
```

Another way to verify that our services are up and running is to have a look at the service logs. We can either get an aggregate from all our services, by running `garden logs`, or we can specify a list of services. This time we're only interested in our `go-service`:

```sh
$ garden logs go-service
go-service         → 2018-06-07T12:52:41.075Z → Server running...
```

Looks good! Let's take stock:

* We started out with a project consisting of multiple containerized services (really just two, but hey, it's a _simple_ project).
* We added a project wide configuration at the root level, and a module configuration for each service.
* We deployed our entire project with the `garden deploy` command
* We saw how we could call our services and read their logs with the `garden call` and `garden logs` commands.

## Inter-service communication

Calling our `go-service` from our `node-service` is straightforward from within the application code. Crack open `services/node-service/app.js` with your favorite editor and add the following:

```javascript
const request = require('request-promise')

// Unless configured otherwise, the hostname is simply the service name
const goServiceEndpoint = `http://go-service/`;

app.get('/call-go-service', (req, res) => {
  // Query the go-service and return the response
  request.get(goServiceEndpoint)
    .then(message => {
      res.json({
        message,
      })
    })
    .catch((err) => {
      res.statusCode = 500
      res.json({
        error: err,
        message: "Unable to reach service at " + goServiceEndpoint,
      })
    })
})
```

Now let's re-deploy the `node-service` and try out our new endpoint:

```sh
$ garden deploy node-service
$ garden call node-service/call-go-service
✔ Sending HTTP GET request to http://simple-project.local.app.garden/call-go-service

200 OK

{
    "message": "Hello  from Go!"
}
```

Nice!

So far, we've seen how to configure a simple project and it's modules, how to deploy our services, and how these services can communicate. Next, let's take a look at how we can define dependencies and set up testing.

## Dependencies

An attentive reader will no doubt have noticed that our `node-service` depends on the `go-service` for it's `call-go-service` endpoint. We can express this in the `node-service` module configuration by adding `dependencies` under the `services` directive:

```yaml
module:
  description: Node service container
  ...
  services:
    - name: node-service
      command: [npm, start]
      ...
      dependencies:
        - go-service
```

This will ensure that our `go-service` will be deployed before the `node-service`.

## Testing

Finally, we'll update our `node-service` module configuration to tell Garden how to run our tests. Add the following test config under the `module` directive in `services/node-service/garden.yml`:

```yaml
module:
  description: Node service container
  ...
  services:
    - name: node-service
      command: [npm, start]
    ...
  tests:
    - name: unit
      command: [npm, test]
    - name: integ
      command: [npm, run, integ]
      dependencies:
        - go-service
```

This allows us to run individual test groups by name or all of them at once with the test command:

```sh
$ garden test
```

Notice also that the integration test depends on the `go-service` being deployed.

The entire module config should now look like this:

```yaml
module:
  description: Node service container
  type: container
  services:
    - name: node-service
      command: [npm, start]
      ports:
        - name: http
          containerPort: 8080
      endpoints:
        - path: /
          port: http
      dependencies:
        - go-service
  tests:
    - name: unit
      command: [npm, test]
    - name: integ
      command: [npm, run, integ]
      dependencies:
        - go-service
```

And that's it! Our services are up and running locally, dependencies are resolved, and tests are ready to run.

Check out some of our other [Guides](../guides/README.md) for more of an in-depth look at the Garden framework.