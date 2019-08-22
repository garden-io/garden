# Quick Start

This guide will walk you through setting up the Garden framework. It assumes you already have Garden installed. If you don't, please check out our [installation guide](./installation.md).

## Using the CLI

With the CLI installed, we can now try out a few commands using the [Demo Project](../examples/demo-project.md) from our [example projects](../examples/README.md). The example project consists of a couple of basic modules, each defining one service.

_Note: Check whether Kubernetes is running with `kubectl version`. You should see both a `Client Version` and a `Server Version` in the response. If not, please start it up before proceeding._

Clone the repo and change into the `demo-project`  directory:

```sh
git clone https://github.com/garden-io/garden.git
cd garden/examples/demo-project
```

First, let's check the environment status by running the following from the project root:

```sh
garden get status
```

The response tells us how the environment is configured and the status of the providers. Next, we'll build our modules with:

```sh
garden build
```

This builds Docker images for `backend` and `frontend` respectively. Next, we'll deploy the services with:

```sh
garden deploy
```

And that's it! The `garden build` step above is actually unnecessary (only included here for clarity), since `garden deploy` will also build and rebuild modules as needed. The services are now running in your Kubernetes cluster. You can see for yourself by querying the `/hello` endpoint of `backend`'s running container:

```sh
garden call backend/hello-backend
```

To run tests for all modules:

```sh
garden test
```

And if you prefer an all-in-one command that watches your project for changes and re-builds, re-deploys, and re-tests automatically, try:

```sh
garden dev
```

Go ahead, leave it running and change one of the files in the project, then watch it re-build.

That's it for now. Check out our [Using Garden](../using-garden/README.md) section for other features like hot reload, remote clusters, integration tests, and lots more.

## Next steps

To see how a Garden project is configured from scratch check, out the [Demo Project](../examples/demo-project.md) guide for a more in-depth presentation.
