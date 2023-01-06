---
title: 2. Configure the Provider
order: 2
---

# 2. Configure the Provider

The `local-kubernetes` plugin attempts to automatically detect which flavor of local Kubernetes is installed, and set the appropriate context for connecting to the local Kubernetes instance. In most cases you should not have to update your `garden.yml`, since it uses the `local-kubernetes` plugin by default, but you can configure it explicitly in your project-level`garden.yml` as follows:

```yaml
kind: Project
environments:
  - name: local
providers:
  - name: local-kubernetes
    environments: [local]
    context: minikube
```

If you happen to have installed both Minikube and a version of Docker for Mac with Kubernetes support enabled,
`garden` will choose whichever one is configured as the current context in your `kubectl` configuration. If neither
is set as the current context, the first available context is used.

(If you're not yet familiar with Garden configuration files, see:
[Configuration files](../../../using-garden/configuration-overview.md))

