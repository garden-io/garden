---
title: Container
order: 1
---

# Container

{% hint style="info" %}
The `container` action type is an abstraction that can be used with multiple plugins. [See here](../../../other-plugins/container.md) for an in-depth guide on the action type itself. Continue reading for more information on the container deploy action type that can be used with the Kubernetes plugin.
{% endhint %}

You can define a `container` Build action with the following config:

```yaml
kind: Build
name: api
type: container
```

Most commonly you'll then want to deploy this image or use it in Test or Run actions. You can do that by
referencing the output from the build in your Deploy actions via the `${actions.build.outputs.api.<output-name>}` template string.

For example, to deploy this image with Helm you can use the following config:

```yaml
kind: Deploy
name: api
type: helm
dependencies: [build.api] # <--- We need to specify the dependency here
spec:
  values:
    repository: ${actions.build.api.outputs.deploymentImageName}
    tag: ${actions.build.api.version}
```

Or you can set it in your Kubernetes manifests with the `patchResources` field:

```yaml

kind: Deploy
type: kubernetes
name: api
dependencies: [build.api] # <--- We need to specify the dependency here
spec:
  files: [my-manifests.yml]
  patchResources:
    - name: api # <--- The name of the resource to patch, should match the name in the K8s manifest
      kind: Deployment # <--- The kind of the resource to patch
      patch:
        spec:
          template:
            spec:
              containers:
                - name: api # <--- Should match the container name from the K8s manifest
                  image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action
```

You can learn more in the individual guides for the Kubernetes [Deploy](../deploy/README.md) and [Run and Test](../run-test/README.md) actions.
