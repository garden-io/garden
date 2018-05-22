## Using Garden with Minikube

Garden can be used with [Minikube](https://github.com/kubernetes/minikube) on supported platforms.

### Installation

For installation instructions, please see the [official guide](https://github.com/kubernetes/minikube#installation).
You'll likely also need to install a driver to run the Minikube VM, please follow the 
[instructions here](https://github.com/kubernetes/minikube/blob/master/docs/drivers.md#hyperkit-driver)
and note the name of the driver.
 
Once Minikube and the appropriate driver for your OS is installed, you can start it by running:

    minikube start --vm-driver=<your vm driver>  # e.g. hyperkit on macOS
    
You'll also need to have Docker (for macOS, we recommend [Docker for Mac](https://docs.docker.com/engine/installation/))
and [kubectl](https://kubernetes.io/docs/tasks/tools/install-kubectl/) installed.

_NOTE: Garden is not yet officially supported on Windows, but we have every intention to support it. 
Please file any issues and we will try and respond promptly._

### Usage

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

Once configured, the `local-kubernetes` plugin will automatically configure everything Garden needs to work.
