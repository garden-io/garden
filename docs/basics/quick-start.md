# Getting Started

This guide will walk you through setting up the Garden framework. It assumes you already have Garden installed. If you don't, please check out our [installation guide](./basics/installation.md).

## Using the CLI

With the CLI installed, we can now try out a few commands using the [Simple Project](./using-garden/example-projects/simple-project.md) from our [example projects](./using-garden/example-projects/README.md). The example consists of a couple of simple services.

_Note: check if Kubernetes is running with `kubectl version`. You should see both a `Client Version` and a `Server Version` in the response. If not, please start it up before proceeding._

Clone the repo and change into the `simple-project`  directory:

```sh
$ git clone https://github.com/garden-io/garden-examples.git
$ cd garden-examples/simple-project
```

First, let's check the environment status by running the following from the project root:

```sh
$ garden get status
```

The response tells us how the environment is configured and the status of the providers. Next, we'll build our services with:

```sh
$ garden build
```

Then we'll deploy the services with:

```sh
$ garden deploy
```

And that's it! The services are now running on the Garden framework. You can see for yourself by querying the `/hello` endpoint of the container with:

```sh
$ garden call go-service/hello-go
```

To run tests you can use:

```sh
$ garden test
```

And if you prefer an interactive terminal that watches your project for changes and re-builds, re-deploys, and re-tests automatically, try:

```sh
$ garden dev
```

Go ahead, leave it running and change one of the files in the project, then watch it re-build.

That's it for now. Check out our [Using Garden](./using-garden/README.md) section for other features like hot reload, remote clusters, integration tests, and lots more. 

To see how a Garden project is configured from scratch check out the [Simple Project](../guides/simple-project.md) guide for a more in-depth presentation.