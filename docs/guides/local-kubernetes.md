---
title: Local Kubernetes
---
# Local Kubernetes clusters

Garden works great with local Kubernetes "clusters". Below you'll find requirements, installation and usage instructions for some
common flavors of local Kubernetes setups, such as Minikube, Docker for Desktop and MicroK8s.

## Requirements

Garden is committed to supporting the _latest six_ stable versions of Kubernetes (i.e. if the latest stable version is v1.17.x, Garden supports v1.12.x and newer).

The officially supported variants of local Kubernetes are the latest stable versions of

- [Docker Desktop](https://docs.docker.com/engine)
- [Minikube](https://github.com/kubernetes/minikube)
- [MicroK8s](https://microk8s.io)
- [KinD](https://github.com/kubernetes-sigs/kind)

Other distributions may also work, but are not routinely tested or explicitly supported. Please don't hesitate to file issues, PRs or requests for your distribution of choice!

For any variant that runs in a VM on your machine (such as Docker Desktop and Minikube), we recommend tuning the size of the VM (in terms of CPU and RAM) to your needs, which will vary by the weight of the project(s) you're running.

## Installation

### Docker Desktop

[Docker Desktop](https://docs.docker.com/engine) is our recommended option for local Kubernetes on Mac and Windows.

Please refer to their [installation guide](https://docs.docker.com/engine/installation/) for how to download and install it (which is a pretty simple process).

_Note: If you have an older version installed, you may need to update it in order to enable Kubernetes support._

Once installed, open Docker Desktop's preferences, go to the Kubernetes section, tick `Enable Kubernetes` and save.

### MicroK8s

Garden can be used with [MicroK8s](https://microk8s.io) on supported Linux platforms.

To install it, please follow [their instructions](https://microk8s.io/docs/).

Once installed, you need to add the `microk8s` configuration to your `~/.kube/config` so that Garden knows how to access your cluster. We recommend exporting the config like this:

```sh
microk8s.kubectl config view --raw > $HOME/.kube/microk8s.config
```

And then adding this to your `.bashrc`/`.zshrc`:

```sh
export KUBECONFIG=${KUBECONFIG:-$HOME/.kube/config}:$HOME/.kube/microk8s.config
```

### Minikube

For Minikube installation instructions, please see the [official guide](https://github.com/kubernetes/minikube#installation).

You may also want to install a driver to run the Minikube VM. Please follow the
[instructions here](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md)
and note the name of the driver you use. The driver you choose will likely vary depending on your
OS/platform. We recommend [hyperkit](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md#hyperkit-driver)
for macOS and [kvm2](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md#kvm2-driver) on most Linux
distributions.

Once Minikube and the appropriate driver for your OS are installed, you can start Minikube by running:

```sh
minikube start --vm-driver=<your vm driver>  # e.g. hyperkit on macOS
```

## Usage

The `local-kubernetes` plugin attempts to automatically detect which flavor of local Kubernetes is installed, and set the appropriate context for connecting to the local Kubernetes instance. In most cases you should not have to update your `garden.yml`, since it uses the `local-kubernetes` plugin by default, but you can configure it explicitly in your project-level`garden.yml` as follows:

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
[Configuration files](../using-garden/configuration-overview.md))
