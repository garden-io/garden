# Using Garden with Minikube

Garden can be used with [Minikube](https://github.com/kubernetes/minikube) on supported platforms.

_NOTE: We highly recommend using Docker for Mac and Docker for Windows, for macOS and Windows respectively._

## Installation

For Minikube installation instructions, please see the
[official guide](https://github.com/kubernetes/minikube#installation).

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

_Note: If you happen to have installed both Minikube and the Docker for Mac version with Kubernetes enabled,
`garden` will choose whichever one is configured as the current context in your `kubectl` configuration, and if neither
is set as the current context, Docker for Mac is preferred by default._

## Hostname

Garden needs the Kubernetes instance to have a hostname. By default Garden will use `<minikube-ip>.nip.io`. If you'd
like to use a custom hostname, you can specify it via the `ingressHostname` in the `local-kubernetes` provider config
(see above).

## Anything else?

Once the above is set up, the `local-kubernetes` plugin will automatically configure everything else Garden needs to
work. The built-in nginx ingress controller will be automatically enabled and used to route requests to services.
