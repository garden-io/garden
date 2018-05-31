# Getting Started

This guide will walk you through setting up the Garden framework. 

## Install dependencies  

You need the following dependencies on your local machine to use Garden:
* Node.js >= 8.x
* [Docker](https://docs.docker.com/)
* Git
* rsync
* [Watchman](https://facebook.github.io/watchman/docs/install.html)
* Local installation of Kubernetes

### OSX

#### Step 1: Docker and local Kubernetes
To install Docker and Kubernetes, we recommend [Docker for Mac (edge version)](https://docs.docker.com/engine/installation/).

_Note: you need to install the _edge version_ of Docker for Mac in 
order to enable Kubernetes support._

Once installed, open the 
Docker preferences, go to the Kubernetes section, tick `Enable Kubernetes` and 
save.

Alternatively, you can use [Minikube](../guides/minikube.md) on any supported platform.

#### Step 2: Other dependencies
For installing the other dependencies, we recommend using Homebrew.

### Linux

#### Step 1: Docker
To install Docker, please follow the instructions in the [official documentation](https://docs.docker.com/install/linux/docker-ce/ubuntu/).

#### Step 2: Local Kubernetes
For local Kubernetes, you can use Minikube. Please see the 
[official installation guide](https://github.com/kubernetes/minikube#installation) for instructions.

You'll likely also need to install a driver to run the Minikube VM. Please follow the 
[instructions here](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md#hyperkit-driver),
and note the name of the driver.
 
Once Minikube and the appropriate driver for your OS is installed, you can start it by running:

    minikube start --vm-driver=<your vm driver>  # e.g. hyperkit on macOS
    
Finally, you will need to configure a [kubectl context](https://kubernetes.io/docs/reference/kubectl/cheatsheet/#kubectl-context-and-configuration)
to point to your local instance.

<!-- More detailed docs for configuring kubectl context -->

Check out our [Minikube guide](../guides/minikube.md) for further information on using Garden with Minikube.

#### Step 3: Other dependencies
Other dependencies can be installed with the package manager of your choice

## Install the Garden CLI

Once you have the dependencies set up, simply run:

    npm install -g garden-cli

## Using the CLI

With the CLI installed, we can now try out a few commands using the [hello-world](https://github.com/garden-io/garden/tree/master/examples/hello-world) example from this repository. The example consists of a container service that runs an [Express](http://expressjs.com/) app, a serverless function, and an npm library package.

_Note: check if Kubernetes is running with `kubectl version`. You should see both a `Client Version` and a `Server Version` in the response. If not, please start it up before proceeding._

Clone the repo and change into the `examples/hello-world`  directory:

    git clone https://github.com/garden-io/garden.git &&
    cd garden/examples/hello-world

First, let's check the environment status by running the following from the project root:

    garden status

The response tells us how the environment is configured and the status of the providers. Next, we'll deploy the services with:

    garden deploy

And that's it! The services are now running on the Garden framework. You can see for yourself by querying the `/hello` endpoint of the container with:

    garden call hello-container/hello

Check out our [Commands](../guides/commands.md) guide for other features like auto-reload, streaming service logs, running tests, and lots more. 

## What's next

Kick the tires of our [examples](https://github.com/garden-io/garden/tree/master/examples/hello-world) to get a feel for how projects are configured, or head to the [Guides](../guides/README.md) section for a deep dive into the Garden framework.
