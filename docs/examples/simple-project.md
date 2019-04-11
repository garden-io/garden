# Simple Project

In this guide, we'll walk you through configuring a simple project to run on Garden. The project will consist of two Dockerized web services that communicate with one another, along with unit and integration tests.

In what follows you'll learn how to:

* [Configure the project](#project-wide-configuration)
* [Configure individual modules](#module-configuration)
* [Deploy the project locally](#deploying)
* [Have the services communicate with one another](#inter-service-communication)
* [Manage service dependencies](#dependencies)
* [Test services](#testing)

## Before you get started

This tutorial assumes that you already have a running [installation of Garden](../basics/installation.md).

## Clone the example repo

The code for this tutorial can be found in our Github repository under the [examples directory](https://github.com/garden-io/garden/tree/v0.9.9/examples). We'll use the [simple-project-start](https://github.com/garden-io/garden/tree/v0.9.9/examples/simple-project-start/) example and work our way from there. The final version is under [simple-project](https://github.com/garden-io/garden/tree/v0.9.9/examples/simple-project).

First, let's clone the examples repo, change into the directory, and take a look inside:

```sh
git clone https://github.com/garden-io/garden.git
cd garden/examples/simple-project-start
tree .
```

The project structure should look like this:

```sh
.
└── services
    ├── go-service
    │   ├── Dockerfile
    │   └── webserver
    │       └── main.go
    └── node-service
        ├── Dockerfile
        ├── app.js
        ├── main.js
        ├── package.json
        └── test
            └── integ.js

5 directories, 7 files
 ```

As you can see, the project consists of two super simple services and their accompanying Dockerfiles. One of the core tenets of multi-service backends is being able to pick the right tool for the job, and therefore we have a Node.js service and a Go service, that we can pretend have different responsibilities.

The task at hand is to configure these services so that they can run on the Garden framework.

## Project-wide configuration

To begin with, every project needs a project-wide `garden.yml` [configuration file](../using-garden/configuration-files.md) at the root level. There we define, among other things, the name of the project, and the [providers](../reference/glossary.md#Provider) the project requires.

Let's go ahead and create one:

```sh
touch garden.yml
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

Above, we've specified the name of our project and configured it to use the `local-kubernetes` provider for local development. Note that this file must be located in the project root directory.

## Module configuration

Now, let's turn to our services. Services live inside [modules](../reference/glossary.md#Module), and each module has its own `garden.yml` configuration file. You can read more about the difference between services and modules [here](../basics/stack-graph.md#structure).

We'll start with the module for the `node-service`:

```sh
touch services/node-service/garden.yml
```

and add the following:

```yaml
module:
  description: Node service container
  name: node-service
  type: container
```

By running the `scan` command

```sh
garden scan
```

we can see that Garden detects our module config:

```sh
modules:
  - allowPublish: true
    build:
      command: []
      dependencies: []
    description: Node service container
    name: node-service
    outputs: {}
    path: /Users/eysi/code/garden-io/simple-project-start/services/node-service
    serviceConfigs: []
    taskConfigs: []
    testConfigs: []
    type: container
```

Under the `module` directive of our `services/node-service/garden.yml` file we can now specify how to run our service:

```yaml
module:
  description: Node service container
  name: node-service
  type: container
  services:
    - name: node-service
      ports:
        - name: http
          containerPort: 8080
      ingresses:
        - path: /hello-node
          port: http
```

The [services](../using-garden/configuration-files.md#Services) field is specific to container modules, and defines the services exposed by the module. In this case, our containerized Node.js server. The other keys tell Garden how to expose our `/hello-node` endpoint.

## Deploying

With this configuration, Garden can now deploy our service to a local Kubernetes cluster. If this is your first time deploying this project, Garden will start by initializing the environment.

To deploy, run:

```sh
garden deploy
```

Once the service has been deployed, we can verify that everything works by calling the service with:

```sh
garden call node-service
```

Since we called the service without a specific endpoint, Garden will pick the first ingress it finds, in this case the ingress to our `/hello-node` endpoint:

```sh
✔ Sending HTTP GET request to http://simple-project.local.app.garden/hello-node

200 OK

Hello from Node server!
```

In a similar manner, we create a config file for our `go-service` with

```sh
touch services/go-service/garden.yml
```

and add the following:

```yaml
module:
  description: Go service container
  name: go-service
  type: container
  services:
    - name: go-service
      ports:
        - name: http
          containerPort: 80
      ingresses:
        - path: /hello-go
          port: http
```

Run the deploy command again, this time only for the `go-service`:

```sh
garden deploy go-service
```

Another way to verify that our services are up and running is to have a look at the service logs. We can either get an aggregate from all our services, by running `garden logs`, or we can specify a list of services. This time we're only interested in our `go-service`:

```sh
garden logs go-service
```

This should return something like:

```sh
go-service         → 2018-06-07T12:52:41.075Z → Server running...
```

Looks good! Let's take stock:

* We started out with a project consisting of multiple containerized services (really just two, but hey, it's a _simple_ project).
* We added a project wide configuration at the root level, and a module configuration for each service.
* We deployed our entire project with the `garden deploy` command
* We saw how we could call our services and read their logs with the `garden call` and `garden logs` commands.

## Communication between services

Calling the `go-service` from the `node-service` is straightforward from within the application code. Open `services/node-service/app.js` with your favorite editor and add the following:

```javascript
const request = require('request-promise')

// Unless configured otherwise, the hostname is simply the service name
const goServiceEndpoint = `http://go-service/hello-go`;

app.get('/call-go-service', (req, res) => {
  // Query the go-service and return the response
  request.get(goServiceEndpoint)
    .then(message => {
      message = `Go says: '${message}'`
      res.json({
        message,
      })
    })
    .catch(err => {
      res.statusCode = 500
      res.json({
        error: err,
        message: "Unable to reach service at " + goServiceEndpoint,
      })
    })
})
```

We'll also add an ingress for our new endpoint to the `services/node-service/garden.yml` config, so that we can call it with Garden:

```yaml
module:
  description: Node service container
  ...
  services:
    - name: node-service
      ...
      ingresses:
        - path: /hello-node
          port: http
        - path: /call-go-service
          port: http
```

Now, let's re-deploy `node-service`:

```sh
garden deploy node-service
```

and try out our new endpoint:

```sh
garden call node-service/call-go-service
```

We should get:

```sh
✔ Sending HTTP GET request to http://simple-project.local.app.garden/call-go-service

200 OK

{
  "message": "Go says: 'Hello from Go!'"
}
```

So far, we've seen how to configure a simple project and it's modules, how to deploy our services, and how these services can communicate. Next, let's take a look at how we can define dependencies and set up testing.

## Dependencies

An attentive reader will no doubt have noticed that our `node-service` depends on the `go-service` for it's `call-go-service` endpoint. We can express this in the `node-service` module configuration by adding `dependencies` under the `services` directive:

```yaml
module:
  description: Node service container
  ...
  services:
    - name: node-service
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
    ...
  tests:
    - name: unit
      args: [npm, test]
    - name: integ
      args: [npm, run, integ]
      dependencies:
        - go-service
```

This allows us to run individual test groups by name or all of them at once with the test command:

```sh
garden test
```

Notice also that the integration test depends on the `go-service` being deployed.

The entire module config should now look like this:

```yaml
module:
  description: Node service container
  name: node-service
  type: container
  services:
    - name: node-service
      ports:
        - name: http
          containerPort: 8080
      ingresses:
        - path: /hello-node
          port: http
      dependencies:
        - go-service
  tests:
    - name: unit
      args: [npm, test]
    - name: integ
      args: [npm, run, integ]
      dependencies:
        - go-service
```

And that's it! Our services are up and running locally, dependencies are resolved, and tests are ready to run.

Check out some of our other [Example projects](./README.md) for more of an in-depth look at Garden.
