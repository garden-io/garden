# 1. Installation

This guide will walk you through setting up the Garden framework.

Please follow the guide for your operating system:

* [macOS](#macos)
* [Windows](#windows)
* [Linux](#linux)

If you'd like to run Kubernetes locally, please see our [local Kubernetes guide](../guides/local-kubernetes.md)
for installation and usage information.

If you want to install Garden from source, see the instructions in our [contributor guide](https://github.com/garden-io/garden/tree/master/CONTRIBUTING.md).

## Requirements

You need the following dependencies on your local machine to use Garden:

* Git (v2.14 or newer)
* rsync (v3.1.0 or newer)

And if you'd like to build and run services locally, you need a local installation of Kubernetes. Garden is committed to supporting the _latest six_ stable versions (i.e. if the latest stable version is v1.17.x, Garden supports v1.12.x and newer).

## macOS

For Mac, we recommend the following steps to install Garden. You can also follow the manual installation
steps below if you prefer.

### Step 1: Install Homebrew

If you haven't already set up Homebrew, please follow [their installation instructions](https://brew.sh/).

### Step 2: Install Garden (macOS)

You can easily install Garden using [Homebrew](https://brew.sh) or using our installation script. You may also
manually download Garden from the [releases page](https://github.com/garden-io/garden/releases) on GitHub.

#### Homebrew

```sh
brew tap garden-io/garden
brew install garden-cli
```

To later upgrade to the newest version, simply run `brew update` and then `brew upgrade garden-cli`.

#### Installation script (macOS)

First make sure the [requirements](#requirements) listed above are installed. Then run our automated installation script:

```sh
curl -sL https://get.garden.io/install.sh | bash
```

To later upgrade to the latest version, simply run the script again.

#### Manual download and install (macOS)

If you prefer, you can perform the installation manually, as follows:

1. Make sure the [requirements](#requirements) listed above are installed.
2. Visit the Garden [releases page](https://github.com/garden-io/garden/releases) on GitHub and download the macOS archive (under _Assets_).
3. Next create a `~/.garden/bin` directory, and extract the archive to that directory. _Make sure to include the whole contents of the archive._
4. Lastly, either add the `~/.garden/bin` directory to your PATH, or add a symlink from your `/usr/local/bin/garden` to the binary at `~/.garden/bin/garden`.

### Step 3 (optional): Docker and local Kubernetes

To install Docker, Kubernetes and kubectl, we recommend Docker for Mac.

Please refer to their [installation guide](https://docs.docker.com/engine/installation/) for how to download and install it (which is a pretty simple process).

If you'd like to use a local Kubernetes cluster, please refer to the [Local Kubernetes guide](../guides/local-kubernetes.md)
for further information. For remote clusters, take a look at the [Remote Kubernetes guide](../guides/remote-kubernetes.md).

## Windows

You can run Garden on Windows 10 Home, Pro or Enterprise editions.

_Note: The Home edition doesn't support virtualization, but you can still use Garden if you're working with [remote Kubernetes](../guides/remote-kubernetes.md) and [in-cluster building](../guides/in-cluster-building.md)._

To install the Garden CLI and its dependencies, please use our installation script. To run the script, open PowerShell as an administrator and run:

```PowerShell
Set-ExecutionPolicy Bypass -Scope Process -Force; iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/garden-io/garden/master/support/install.ps1'))
```

The things the script will check for are the following:

* The [Chocolatey](https://chocolatey.org) package manager. The script installs it automatically if necessary.
* _git_ and _rsync_ . The script will install or upgrade those via Chocolatey.
* Whether you have Hyper-V available and enabled. This is required for _Docker for Windows_. If it's available, the
  installer will also ask if you'd like to install _Docker for Windows_. If you do not already have Hyper-V enabled,
  the script will enable it, but you will need to restart your computer before starting Docker.
* If applicable, whether Kubernetes is enabled in your _Docker for Windows_ installation.

To later upgrade to the newest version, simply re-run the above script.

## Linux

### Step 1: Install core dependencies

Use your preferred method or package manager to install `git` and `rsync`. On Ubuntu, that's `sudo apt install git rsync`, on Alpine `apk add --no-cache git rsync`

The Alpine linux distribution also requires `gcc` to be installed: `apk add --no-cache gcc`.

### Step 2: Install Garden

#### Installation script (Linux)

You can use our installation script to install Garden automatically:

```sh
curl -sL https://get.garden.io/install.sh | bash
```

To later upgrade to the latest version, simply run the script again.

#### Manual download and install (Linux)

If you prefer, you can perform the installation manually, as follows:

1. Visit the Garden [releases page](https://github.com/garden-io/garden/releases) on GitHub and download the linux archive (under _Assets_).
2. Next create a `~/.garden/bin` directory, and extract the archive to that directory. _Make sure to include the whole contents of the archive._
3. Lastly, either add the `~/.garden/bin` directory to your PATH, or add a symlink from your `/usr/local/bin/garden` to the binary at `~/.garden/bin/garden`.

### Step 3 (optional): Local Kubernetes

If you'd like to use a local Kubernetes cluster, please refer to the [local Kubernetes guide](../guides/local-kubernetes.md)
for installation and usage information.

## Using Garden with proxies

If you're running Garden behind a firewall, you may need to use a proxy to route external requests. To do this,
you need to set the `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` environment variables. For example:

 ```sh
export HTTP_PROXY=http://localhost:9999               # <- Replace with your proxy address.
export HTTPS_PROXY=$HTTP_PROXY                        # <- Replace if you use a separate proxy for HTTPS.
export NO_PROXY=local.app.garden,localhost,127.0.0.1  # <- This is important! See below.
```

The `NO_PROXY` variable should include any other hostnames you might use for local development, since you likely
don't want to route local traffic through the proxy.
