# Getting Started

This guide will walk you through setting up the Garden framework.

Please follow the guide for your operating system:

* [macOS](#macos)
* [Windows](#windows)
* [Linux (or manual installation on other platforms)](#linux-manual-installation)

## Installation

### macOS

For Mac, we recommend the following steps to install Garden. You can also follow the manual installation
steps below if you prefer.

#### Step 1: Install homebrew

If you haven't already set up homebrew, please follow [their instructions](https://brew.sh/) to set it up.

#### Step 2: Docker and local Kubernetes

To install Docker, Kubernetes and kubectl, we strongly recommend Docker for Mac.

_Note: If you have an older version installed, you may need to update it in
order to enable Kubernetes support._

Once installed, open the Docker for Mac preferences, go to the Kubernetes section,
tick `Enable Kubernetes` and save. Please refer to their
[installation guide](https://docs.docker.com/engine/installation/) for details.

Alternatively, you can use Minikube. We generally find it less stable and more hassle to
configure and use, but we do fully support it on Mac if you have it running. Please look at our
[Minikube guide](../guides/minikube.md) for details.

#### Step 3: Install `garden-cli`

We have a Homebrew tap and package that you can use to easily install `garden-cli` and all dependencies:

```sh
brew tap garden-io/garden
brew install garden-cli
```

To later upgrade to the newest version, simply run `brew update` and then `brew upgrade garden-cli`.

### Windows

You can run Garden on Windows 10 Pro or Enterprise editions (The Home edition unfortunately does not work because it
does not include support for virtualization).

To install the Garden CLI please use our automated installation script,
which will check for dependencies, install missing dependencies if needed, and finally install the Garden CLI.

To run the script, open PowerShell as an Administrator and run:

```PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/garden-io/garden/master/garden-service/support/install.ps1'))
```

The things the script will check for are the following:

* The [Chocolatey](https://chocolatey.org) package manager. The script installs it automatically if necessary.
* _git_, _rsync_ and _Docker for Windows_. The script will install or upgrade those via Chocolatey.
* Whether you have Hyper-V enabled. This is required for _Docker for Windows_. If you do not already have it enabled,
  the script will enable it but you will need to restart your computer before starting Docker for Windows.
* Whether you have Kubernetes enabled in your _Docker for Windows_ installation.

To later upgrade to the newest version, simply re-run the above script.

### Linux (manual installation)

You need the following dependencies on your local machine to use Garden:

* [Docker](https://docs.docker.com/)
* Git
* rsync
* Local installation of Kubernetes and kubectl

#### Step 1: Docker

To install Docker, please follow the instructions in the [official documentation](https://docs.docker.com/install/).

#### Step 2: Local Kubernetes

For local Kubernetes, you can use [Minikube](https://github.com/kubernetes/minikube). Please see our
[Minikube guide](../guides/minikube.md) for instructions.

#### Step 3: Install other dependencies

Use your preferred method or package manager to install `git` and `rsync`.

#### Step 4: Install `garden-cli`

Once you have the dependencies set up, install the Garden CLI via `npm`:

```sh
npm install -g garden-cli
```

To later upgrade to the newest version, run `npm install -g -U garden-cli`.

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
