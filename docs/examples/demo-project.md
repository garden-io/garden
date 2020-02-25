# Demo Project

In this guide, we'll walk you through configuring a demo project to run on Garden. The project will consist of two Dockerized web services that communicate with one another, along with unit and integration tests.

In what follows you'll learn how to:

* [Configure the project](#project-wide-configuration)
* [Configure individual modules](#module-configuration)
* [Deploy the project locally](#deploying)
* [Have the services communicate with one another](#communication-between-services)
* [Manage service dependencies](#dependencies)
* [Test services](#testing)

## Before you get started

This tutorial assumes that you already have a running [installation of Garden](../installation.md).

## Clone the example repo

The code for this tutorial can be found in our Github repository under the [examples directory](https://github.com/garden-io/garden/tree/v0.11.5/examples). We'll use the [demo-project-start](https://github.com/garden-io/garden/tree/v0.11.5/examples/demo-project-start/) example and work our way from there. The final version is under [demo-project](https://github.com/garden-io/garden/tree/v0.11.5/examples/demo-project).

First, let's clone the examples repo, change into the directory, and take a look inside:

```sh
git clone https://github.com/garden-io/garden.git
cd garden/examples/demo-project-start
tree .
```

The project structure should look like this:

```sh
.
└── services
    ├── backend
    │   ├── Dockerfile
    │   └── webserver
    │       └── main.go
    └── frontend
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

To begin with, every project needs a project-wide `garden.yml` [configuration file](../guides/configuration-files.md) at the root level. There we define, among other things, the name of the project, and the [providers](../reference/glossary.md#Provider) the project requires.

Let's go ahead and create one:

```sh
touch garden.yml
```

and add the following configuration:

```yaml
kind: Project
name: demo-project
environments:
  - name: local
providers:
  - name: local-kubernetes
```

Above, we've specified the name of our project and configured it to use the `local-kubernetes` provider for local development. Note that this file must be located in the project root directory.

## Module configuration

Now, let's turn to our services. Services live inside [modules](../reference/glossary.md#Module), and each module has its own `garden.yml` configuration file. You can read more about the difference between services and modules [here](../stack-graph.md#structure-and-terminology).

We'll start with the module for the `frontend`:

```sh
touch frontend/garden.yml
```

and add the following:

```yaml
kind: Module
description: Frontend service container
name: frontend
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
    description: Frontend service container
    name: frontend
    outputs: {}
    path: /Users/eysi/code/garden-io/demo-project-start/frontend
    serviceConfigs: []
    taskConfigs: []
    testConfigs: []
    type: container
```

Under the `module` directive of our `frontend/garden.yml` file we can now specify how to run our service:

```yaml
kind: Module
description: Frontend service container
name: frontend
type: container
services:
  - name: frontend
    ports:
      - name: http
        containerPort: 8080
    ingresses:
      - path: /hello-frontend
        port: http
```

The [services](../guides/configuration-files.md#Services) field is specific to container modules, and defines the services exposed by the module. In this case, our containerized Node.js server. The other keys tell Garden how to expose our `/hello-frontend` endpoint.

## Deploying

With this configuration, Garden can now deploy our service to a local Kubernetes cluster.

If you'd like to use a remote Kubernetes cluster, include the option `--env=remote` when invoking the `garden` commands below, or uncomment the line

```sh
defaultEnvironment: remote
```

in the project `garden.yml`.

Also, if your remote cluster hasn't previously been set up for Garden, start by running the following from the project root:

``` sh
garden plugins kubernetes cluster-init --env=remote
```

The first time you deploy this project, Garden will start by initializing the environment. To deploy, run:

```sh
garden deploy
```

Once the service has been deployed, we can verify that everything works by calling the service with:

```sh
garden call frontend
```

Since we called the service without a specific endpoint, Garden will pick the first ingress it finds, in this case the ingress to our `/hello-frontend` endpoint:

```sh
✔ Sending HTTP GET request to http://demo-project.local.app.garden/hello-frontend

200 OK

Hello from Node server!
```

In a similar manner, we create a config file for our `backend` with

```sh
touch backend/garden.yml
```

and add the following:

```yaml
kind: Module
description: Backend service container
name: backend
type: container
services:
  - name: backend
    ports:
      - name: http
        containerPort: 80
    ingresses:
      - path: /hello-backend
        port: http
```

Run the deploy command again, this time only for the `backend`:

```sh
garden deploy backend
```

Another way to verify that our services are up and running is to have a look at the service logs. We can either get an aggregate from all our services, by running `garden logs`, or we can specify a list of services. This time we're only interested in our `backend`:

```sh
garden logs backend
```

This should return something like:

```sh
backend         → 2018-06-07T12:52:41.075Z → Server running...
```

Looks good! Let's take stock:

* We started out with a project consisting of multiple containerized services (really just two, but hey, it's a _simple_ project).
* We added a project wide configuration at the root level, and a module configuration for each service.
* We deployed our entire project with the `garden deploy` command
* We saw how we could call our services and read their logs with the `garden call` and `garden logs` commands.

## Communication between services

Calling the `backend` from the `frontend` is straightforward from within the application code. Open `frontend/app.js` with your favorite editor and add the following:

```javascript
const request = require('request-promise')

const backendServiceEndpoint = `http://backend/hello-backend`;

app.get('/call-backend', (req, res) => {
  // Query the backend and return the response
  request.get(backendServiceEndpoint)
    .then(message => {
      message = `Backend says: '${message}'`
      res.json({
        message,
      })
    })
    .catch(err => {
      res.statusCode = 500
      res.json({
        error: err,
        message: "Unable to reach service at " + backendServiceEndpoint,
      })
    })
})
```

We'll also add an ingress for our new endpoint to the `frontend/garden.yml` config, so that we can call it with Garden:

```yaml
kind: Module
description: Frontend service container
...
services:
  - name: frontend
    ...
    ingresses:
      - path: /hello-frontend
        port: http
      - path: /call-backend
        port: http
```

Now, let's re-deploy `frontend`:

```sh
garden deploy frontend
```

and try out our new endpoint:

```sh
garden call frontend/call-backend
```

We should get:

```sh
✔ Sending HTTP GET request to http://demo-project.local.app.garden/call-backend

200 OK

{
  "message": "Go says: 'Hello from Go!'"
}
```

So far, we've seen how to configure a demo project and its modules, how to deploy our services, and how these services can communicate. Next, let's take a look at how we can define dependencies and set up testing.

## Dependencies

An attentive reader will no doubt have noticed that our `frontend` depends on the `backend` for it's `call-backend` endpoint. We can express this in the `frontend` module configuration by adding `dependencies` under the `services` directive:

```yaml
kind: Module
description: Frontend service container
...
services:
  - name: frontend
    ...
    dependencies:
      - backend
```

This will ensure that our `backend` will be deployed before the `frontend`.

## Testing

Finally, we'll update our `frontend` module configuration to tell Garden how to run our tests. Add the following test config under the `module` directive in `frontend/garden.yml`:

```yaml
kind: Module
description: Frontend service container
...
services:
  - name: frontend
  ...
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ]
    dependencies:
      - frontend
```

This allows us to run individual test groups by name or all of them at once with the test command:

```sh
garden test
```

Notice also that the integration test depends on both the updated `frontend` and `backend` being deployed.
The `backend` is a transitive depedency of the integration test because it is a dependency of the `frontend` service.

The entire module config should now look like this:

```yaml
kind: Module
description: Frontend service container
name: frontend
type: container
services:
  - name: frontend
    ports:
      - name: http
        containerPort: 8080
    ingresses:
      - path: /hello-frontend
        port: http
    dependencies:
      - backend
tests:
  - name: unit
    args: [npm, test]
  - name: integ
    args: [npm, run, integ]
    dependencies:
      - frontend
```

And that's it! Our services are up and running locally, dependencies are resolved, and tests are ready to run.

Check out some of our other [Example projects](./README.md) for more of an in-depth look at Garden.
