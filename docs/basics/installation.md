## Installation

This guide will walk you through setting up the Garden framework.

Please follow the guide for your operating system:

* [macOS](#macos)
* [Windows](#windows)
* [Linux (Manual Installation)](#linux-manual-installation)

And if you decide to use Minikube, please see our [Minikube Instructions](#minikube-instructions) further down this 
document.

### macOS

For Mac, we recommend the following steps to install Garden. You can also follow the manual installation
steps below if you prefer.

#### Step 1: Install homebrew

If you haven't already set up homebrew, please follow [their instructions](https://brew.sh/) to set it up.

#### Step 2: Docker and local Kubernetes

To install Docker, Kubernetes and kubectl, we strongly recommend Docker for Mac (edge version).

_Note: you need to install the **edge version** of Docker for Mac in
order to enable Kubernetes support._

Once installed, open the Docker for Mac preferences, go to the Kubernetes section,
tick `Enable Kubernetes` and save. Please refer to their
[installation guide](https://docs.docker.com/engine/installation/) for details.

Alternatively, you can use Minikube. We generally find it less stable and more hassle to
configure and use, but we do fully support it on Mac if you have it running. Please look at the 
[Minikube Instructions](#minikube-instructions) section for details.

#### Step 3: Install `garden-cli`

We have a Homebrew tap and package that you can use to easily install `garden-cli` and all dependencies:

```sh
brew tap garden-io/garden
brew install garden-cli
```

To later upgrade to the newest version, simply run `brew update` and then `brew upgrade garden-cli`
(or `brew upgrade` to upgrade all your Homebrew packages).

### Windows

You can run Garden on Windows 10 Pro or Enterprise editions (The Home edition unfortunately does not work because it
does support virtualization). To install the Garden CLI please use our _automated installation script_, which will
check for dependencies, install missing dependencies if needed, and finally install the `garden-cli` npm package.

The script will check for the following:

* The [Chocolatey](https://chocolatey.org) package manager.
* Whether you have Hyper-V enabled. This is required for _Docker for Windows_. If you do not already have it enabled,
  the script will enable it (you will then need to restart your computer before starting Docker for Windows).
* Docker - We strongly recommend using the _Edge version_ of
  [Docker for Windows](https://www.docker.com/docker-windows), which has built-in support for Kubernetes. It is also
  _possible_ to configure Docker and Kubernetes differently, using Minikube for example, but in most cases
  Docker for Windows is much easier to install and configure, and is well supported. The script will check if Docker is
  installed, and whether Kubernetes has been enabled as the default orchestrator.
* Node.js - The script will install it via Chocolatey if it is missing, but note that _if you already have Node.js
  installed, please make sure it is version 8.x or newer._
* Git and rsync. The script will install those if they are missing.

To run the script, open PowerShell as an Administrator and run:

```PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/garden-io/garden/master/garden-cli/support/install.ps1'))
```

To later upgrade to the newest version, run `npm install -g -U garden-cli`.

### Linux (manual installation)

You need the following dependencies on your local machine to use Garden:

* Node.js >= 8.x
* [Docker](https://docs.docker.com/)
* Git
* rsync
* Local installation of Kubernetes and kubectl

#### Step 1: Docker

To install Docker, please follow the instructions in the [official documentation](https://docs.docker.com/install/).

#### Step 2: Local Kubernetes

For local Kubernetes, you can use [Minikube](https://github.com/kubernetes/minikube). Please see our 
[Minikube Instructions](#minikube-instructions).

#### Step 3: Install other dependencies

Use your preferred method or package manager to install `node` (version 8.x or higher), `git`, and `rsync`.

On Ubuntu 18, you'd do `sudo apt install git rsync` for Git and rsync.

For Node, we recommend using nvm. You can install it with `curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.33.11/install.sh | bash`, then restart your terminal and install Node with `nvm install node`.

#### Step 4: Install `garden-cli`

Once you have the dependencies set up, install the Garden CLI via `npm`:

```sh
npm install -g garden-cli
```

To later upgrade to the newest version, run `npm install -g -U garden-cli`.


# Minikube Instructions

Garden can be used with [Minikube](https://github.com/kubernetes/minikube) on supported platforms.

_NOTE: We highly recommend using Docker for Mac and Docker for Windows, for macOS and Windows respectively._

## Installation

For Minikube installation instructions, please see the [official guide](https://github.com/kubernetes/minikube#installation).

You'll likely also need to install a driver to run the Minikube VM, please follow the
[instructions here](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md)
and note the name of the driver you use. The driver you choose will likely vary depending on your
OS/platform. We recommend [hyperkit](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md#hyperkit-driver)
for macOS and [kvm2](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md#kvm2-driver) on most Linux
platforms.

Once Minikube and the appropriate driver for your OS is installed, you can start it by running:

    minikube start --vm-driver=<your vm driver>  # e.g. hyperkit on macOS

You'll also need to have Docker (for macOS, we recommend [Docker for Mac](https://docs.docker.com/engine/installation/))
and [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) installed.

## Usage

The `local-kubernetes` plugin attempts to automatically detect if it is installed and set the appropriate context
for connecting to the local Kubernetes instance. In most cases you should not have to update your `garden.yml`
since it uses the `local-kubernetes` plugin by default, but you can configure it explicitly in your project
`garden.yml` like so:

```yaml
project:
  environments:
    - name: local
      providers:
        - name: local-kubernetes
          context: minikube
```

If you happen to have installed both Minikube and the Docker for Mac version with Kubernetes enabled,
`garden` will choose whichever one is configured as the current context in your `kubectl` configuration, and if neither
is set as the current context, Docker for Mac is preferred by default._

(If you're not yet familiar with Garden configuration files, see: [Configuration files](./using-garden/configuration-files.md))

## Hostname

Garden needs the Kubernetes instance to have a hostname. By default Garden will use `<minikube-ip>.nip.io`. If you'd
like to use a custom hostname, you can specify it via the `ingressHostname` in the `local-kubernetes` provider config
(see above).

## Anything else?

Once the above is set up, the `local-kubernetes` plugin will automatically configure everything else Garden needs to
work. The built-in nginx ingress controller will be automatically enabled and used to route requests to services.
