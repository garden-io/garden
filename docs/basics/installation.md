## Installation

This guide will walk you through setting up the Garden framework.

Please follow the guide for your operating system:

* [macOS](#macos)
* [Windows](#windows)
* [Linux (Manual Installation)](#linux-manual-installation)

And if you decide to use Minikube, please see our [Minikube Instructions](#minikube-instructions) further down in this
document.

### macOS

For Mac, we recommend the following steps to install Garden. You can also follow the manual installation
steps below if you prefer.

#### Step 1: Install Homebrew

If you haven't already set up homebrew, please follow [their instructions](https://brew.sh/) to set it up.

#### Step 2: Docker and local Kubernetes

To install Docker, Kubernetes and kubectl, we strongly recommend Docker for Mac.

_Note: If you have an older version installed, you may need to update it in
order to enable Kubernetes support._

Once installed, open Docker for Mac's preferences, go to the Kubernetes section,
tick `Enable Kubernetes` and save. Please refer to their
[installation guide](https://docs.docker.com/engine/installation/) for details.

Alternatively, you can use Minikube. We generally find it less stable and more hassle to
configure and use, but we do fully support it on Mac. Please look at the
[Minikube Instructions](#minikube-instructions) section for details.

#### Step 3: Install `garden-cli`

We have a Homebrew tap and package that you can use to easily install `garden-cli` and all dependencies:

```sh
brew tap garden-io/garden
brew install garden-cli
```

To later upgrade to the newest version, simply run `brew update` and then `brew upgrade garden-cli`.

### Windows

You can run Garden on Windows 10 Pro or Enterprise editions (the Home edition unfortunately does not work because it does not include support for virtualization).

To install the Garden CLI, please use our automated installation script, which will
check for dependencies, install missing dependencies if needed, and finally install the Garden CLI.

To run the script, open PowerShell as an Administrator and run:

```PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/garden-io/garden/master/support/install.ps1'))
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
[Minikube Instructions](#minikube-instructions).

#### Step 3: Install other dependencies

Use your preferred method or package manager to install `git` and `rsync`.

#### Step 4: Install `garden-cli`

Once you have the dependencies set up, install the Garden CLI via `npm`:

```sh
npm install -g garden-cli
```

To later upgrade to the newest version, run `npm install -g -U garden-cli`.

# Minikube Instructions

Garden can be used with [Minikube](https://github.com/kubernetes/minikube) on supported platforms.

_NOTE: We highly recommend using Docker for Mac and Docker for Windows, on macOS and Windows respectively._

## Installation

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

## Usage

The `local-kubernetes` plugin attempts to automatically detect if it is installed and set the appropriate context
for connecting to the local Kubernetes instance. In most cases you should not have to update your `garden.yml`,
since it uses the `local-kubernetes` plugin by default, but you can configure it explicitly in your project-level
`garden.yml` as follows:

```yaml
project:
  environments:
    - name: local
      providers:
        - name: local-kubernetes
          context: minikube
```

If you happen to have installed both Minikube and a version of Docker for Mac with Kubernetes support enabled,
`garden` will choose whichever one is configured as the current context in your `kubectl` configuration, and if neither
is set as the current context, Docker for Mac is preferred by default.

(If you're not yet familiar with Garden configuration files, see: [Configuration files](../using-garden/configuration-files.md))

## Hostname

Garden needs the Kubernetes instance to have a hostname. By default Garden will use `<minikube-ip>.nip.io`. If you'd
like to use a custom hostname, you can specify it via the `ingressHostname` in the `local-kubernetes` provider config
(see above).

## Anything else?

Once the above is set up, the `local-kubernetes` plugin will automatically configure everything else Garden needs to
work. The built-in nginx ingress controller will be automatically enabled and used to route requests to services.
