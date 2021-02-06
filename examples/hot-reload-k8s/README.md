# Kubernetes Module Hot-Reload Example Project

This examples demonstrates how to configure the `kubernetes` module type for hot reloading.

The same pattern applies for `helm` modules.

## Configuration

The project contains two modules, a `node-image` module of type `container` that contains the source code and a `node-service` module of type `kubernetes`. The `node-image` is the source module to the `node-service`.

To enable hot reloading, we first set the hot reloading spec on the `container` module like so:

```yaml
kind: Module
type: container
# ...
hotReload:
  sync:
    - target: /app/
```

In the `kubernetes` module, we then reference the image module in the `serviceResource.imageModule` field and reference the image ID in the container spec of the Pod template:

```yaml
kind: Module
name: node-service
type: kubernetes
serviceResource:
  kind: Deployment # <--- The kind of the K8s resource that should be considered the service resource
  name: node-service # <--- The name of the K8s resource that should be considered the service resource
  imageModule: node-image # <--- The container module that contains the source code that should be hot reloaded
  containerName: node-service # <--- The name of the container in the K8s spec that we're syncing to
  hotReloadArgs: [npm, run, dev] # <--- This is optional and allows you to override the hot reload args of the container module
manifests:
  - apiVersion: apps/v1
    kind: Deployment
    # ..
    spec:
      template:
        # ...
        spec:
          containers:
            - image: ${modules.node-image.outputs.deployment-image-id} # <--- Here we reference the container module image id
            # ...
```

## Usage

Run `garden deploy --hot node-service` to hot reload the `node-service` module.
