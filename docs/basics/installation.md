# Installation

This guide will walk you through setting up the Garden framework.

Please follow the guide for your operating system:

* [macOS](#macos)
* [Windows](#windows)
* [Linux](#linux)

And if you decide to use Minikube, please see our [Minikube Instructions](#minikube-instructions) further down in this
document.

If you want to install Garden from source, see the instructions in our [contributor guide](https://github.com/garden-io/garden/tree/master/CONTRIBUTING.md).

## macOS

For Mac, we recommend the following steps to install Garden. You can also follow the manual installation
steps below if you prefer.

### Step 1: Install Homebrew

If you haven't already set up Homebrew, please follow [their installation instructions](https://brew.sh/).

### Step 2: Install Garden

You can easily install Garden using [Homebrew](https://brew.sh) or using our installation script.

#### Homebrew

```sh
brew tap garden-io/garden
brew install garden-cli
```

To later upgrade to the newest version, simply run `brew update` and then `brew upgrade garden-cli`.

#### Installation script

```sh
curl -sL https://get.garden.io/install.sh | bash
```

To later upgrade to the latest version, simply run the script again.

### Step 3 (optional): Docker and local Kubernetes

To install Docker, Kubernetes and kubectl, we strongly recommend Docker for Mac. Garden itself doesn't require a local
installation of Kubernetes, but it is in most cases the preferred way of using it.

_Note: If you have an older version installed, you may need to update it in
order to enable Kubernetes support._

Once installed, open Docker for Mac's preferences, go to the Kubernetes section,
tick `Enable Kubernetes` and save. Please refer to their
[installation guide](https://docs.docker.com/engine/installation/) for details.

Alternatively, you can use Minikube. We generally find it less stable and more hassle to
configure and use, but we do fully support it on Mac. Please look at the
[Minikube Instructions](#minikube-instructions) section for details.

## Windows

You can run Garden on Windows 10 Home, Pro or Enterprise editions.

_Note: The Home edition doesn't support virtualization, but you can still use Garden if you're working with
[remote clusters](../using-garden/remote-clusters.md) and
[in-cluster building](../using-garden/in-cluster-building.md)._

To install the Garden CLI and its dependencies, please use our installation script. To run the script, open PowerShell as an administrator and run:

```PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/garden-io/garden/master/support/install.ps1'))
```

The things the script will check for are the following:

* The [Chocolatey](https://chocolatey.org) package manager. The script installs it automatically if necessary.
* _git_ and _rsync_ . The script will install or upgrade those via Chocolatey.
* Whether you have Hyper-V available and enabled. This is required for _Docker for Windows_. If it's available, the
  installer will ask if you'd like to install _Docker for Windows_. If you do not already have it enabled,
  the script will enable it, but you will need to restart your computer before starting Docker.
* If applicable, whether Kubernetes is enabled in your _Docker for Windows_ installation.

To later upgrade to the newest version, simply re-run the above script.

## Linux

You need the following dependencies on your local machine to use Garden:

* Git
* rsync

And if you're building and running services locally, you need the following:

* [Docker](https://docs.docker.com/)
* A local installation of Kubernetes and [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/)

### Step 1: Install core dependencies

Use your preferred method or package manager to install `git` and `rsync`. On Ubuntu, that's `sudo apt install git rsync`.

### Step 2: Install Garden

Use our installation script to install automatically:

```sh
curl -sL https://get.garden.io/install.sh | bash
```

To later upgrade to the latest version, simply run the script again.

Or if you prefer to do it manually, download the Garden CLI for your platform from our
[latest release](https://github.com/garden-io/garden/releases/latest) page, extract and make sure it is on your PATH.
E.g. by extracting to `~/.garden/bin` and adding `export PATH=$PATH:~/.garden/bin` to your `.bashrc` or `.zshrc` file.
If you're installing manually, make sure you copy all files in the release package for your platform to the directory you're including in your PATH. For Windows and Linux, there's a `garden` binary and `static` directory, for macOS there's an additional `fse.node` binary.

### Step 3 (optional): Docker

To install Docker, please follow the instructions in the [official documentation](https://docs.docker.com/install/).

### Step 4 (optional): Local Kubernetes

For local Kubernetes, you can use [Minikube](https://github.com/kubernetes/minikube). Please see the
[Minikube](#minikube) section below for details.

## Local Kubernetes clusters

For Mac and Windows, we generally recommend using [Docker for Desktop](https://docs.docker.com/engine/installation/))
and enabling its built-in Kubernetes support. For Linux, there are many options (some of which also work on Mac).
Below are just a couple that we have tested. Contributions to this guide and our supported local Kubernetes variants
are most welcome :)

### MicroK8s

Garden can be used with [MicroK8s](https://microk8s.io) on supported Linux platforms.

To install it, please follow [their instructions](https://microk8s.io/docs/).

Once installed, note that you need to make sure Garden can access the cluster by either aliasing `microk8s.kubectl` to
`kubectl`:

```sh
alias kubectl='microk8s.kubectl'
```

_Or_ if you already have `kubectl` installed (or wish to install it separately), you need to add the `microk8s`
configuration to your `~/.kube/config` so that Garden knows how to access your cluster. We recommend exporting the
config like this:

```sh
microk8s.kubectl config view --raw > $HOME/.kube/microk8s.config
```

And then adding this to your `.bashrc`/`.zshrc`:

```sh
export KUBECONFIG=${KUBECONFIG:-$HOME/.kube/config}:$HOME/.kube/microk8s.config
```

### Minikube

Garden can be used with [Minikube](https://github.com/kubernetes/minikube) on supported platforms.

#### Installing Minikube

For Minikube installation instructions, please see the [official guide](https://github.com/kubernetes/minikube#installation).

You'll likely also need to install a driver to run the Minikube VM. Please follow the
[instructions here](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md)
and note the name of the driver you use. The driver you choose will likely vary depending on your
OS/platform. We recommend [hyperkit](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md#hyperkit-driver)
for macOS and [kvm2](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md#kvm2-driver) on most Linux
distributions.

Once Minikube and the appropriate driver for your OS are installed, you can start Minikube by running:

```sh
minikube start --vm-driver=<your vm driver>  # e.g. hyperkit on macOS
```

You'll also need to have Docker (for macOS, we recommend [Docker for Mac](https://docs.docker.com/engine/installation/))
and [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) installed.

#### Usage

The `local-kubernetes` plugin attempts to automatically detect if it is installed and set the appropriate context
for connecting to the local Kubernetes instance. In most cases you should not have to update your `garden.yml`,
since it uses the `local-kubernetes` plugin by default, but you can configure it explicitly in your project-level
`garden.yml` as follows:

```yaml
kind: Project
environments:
  - name: local
    providers:
      - name: local-kubernetes
        context: minikube
```

If you happen to have installed both Minikube and a version of Docker for Mac with Kubernetes support enabled,
`garden` will choose whichever one is configured as the current context in your `kubectl` configuration. If neither
is set as the current context, the first available context is used.

(If you're not yet familiar with Garden configuration files, see:
[Configuration files](../using-garden/configuration-files.md))
