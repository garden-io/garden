# Getting Started

This guide will walk you through setting up the Garden framework.

Please follow the guide for your operating system:

* [macOS](#macos)
* [Windows](#windows)
* [Linux (or manual installation on other platforms)](#linux-manual-installation)

## Using the CLI

With the CLI installed, we can now try out a few commands using the [hello-world](https://github.com/garden-io/garden/examples/tree/master/simple-project) project from our Github [examples repository](https://github.com/garden-io/garden/examples). The example consists of a a couple of simple services.

_Note: check if Kubernetes is running with `kubectl version`. You should see both a `Client Version` and a `Server Version` in the response. If not, please start it up before proceeding._

Clone the repo and change into the `hello-world`  directory:

```sh
$ git clone https://github.com/garden-io/garden/examples.git
$ cd garden/examples/hello-world
```

First, let's check the environment status by running the following from the project root:

```sh
$ garden status
```

The response tells us how the environment is configured and the status of the providers. Next, we'll deploy the services with:

```sh
$ garden deploy
```

And that's it! The services are now running on the Garden framework. You can see for yourself by querying the `/hello` endpoint of the container with:

```sh
$ garden call hello-container/hello
```

Check out our [Commands guide](../guides/commands.md) for other features like auto-reload, streaming service logs, running tests and lots more, or see how a Garden project is configured from scratch in our [Simple Project](../guides/simple-project.md) guide.