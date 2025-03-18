---
title: Configure local Kubernetes
order: 4
---

## Requirements

To use Garden to deploy to and test in a local Kubernetes cluster like Minikube or k3s you'll need one installed. If you don't have one check out our [guide on installing local Kubernetes](../../guides/install-local-kubernetes.md).

## Provider configuration

The `local-kubernetes` provider attempts to automatically detect which flavor of local Kubernetes is installed, and set the appropriate context for connecting to the local Kubernetes instance. So the only configuration you need is this:

```yaml
# In project.garden.yml
apiVersion: garden.io/v2
kind: Project
environments:
  - name: local
providers:
  - name: local-kubernetes
    environments: [local]
```

If you happen to have installed both Minikube and a version of Docker for Mac with Kubernetes support enabled, `garden` will choose whichever one is configured as the current context in your `kubectl` configuration. If neither is set as the current context, the first available context is used.

You can always override this by configuring it explicitly in your project-level config as follows:

```yaml
providers:
  - name: local-kubernetes
    environments: [local]
    context: minikube # <--- Explicitly set the context
```

Now you can start adding actions for deploying K8s resources, installing Helm charts, running tests, and more in your local cluster.
