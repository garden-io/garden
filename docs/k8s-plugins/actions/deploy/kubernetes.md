---
title: Kubernetes
order: 1
---

# Kubernetes

You can use the `kubernetes` Deploy action type to deploy the parts of your stack that already have Kubernetes manifests.

In the sections below we'll explain how to:

- Point Garden to your manifests
- Deploy a container image that's been built by Garden
- Overwrite values in your manifests to suit your environment
- Set the deployment target so Garden can stream logs and sync code changes
- Configure code syncing for rapid development

The `kubernetes` Deploy action type works very similarly to the [`helm`](./helm.md) Deploy action, and you'll find a lot common between the two guides.

See the full spec for the `kubernetes` deploy action in our [reference docs](../../../reference/action-types/Deploy/kubernetes.md).

## Referencing manifests

When configuring a `kubernetes` Deploy action, you point Garden to the manifest files via the `spec.files` directive.

You can also specify them inline in your Garden config via the `spec.manifests` field but we recommend the former approach since that allows you to re-use them with other tools.

### Option 1: Manifest files (recommended)

If your project structure looks something like this:

```console
.
├── api
│   ├── garden.yml
│   ├── manifests
│   │   ├── prod
│   │   ├── Deployment.yaml
│   │   ├── Ingress.yaml
│   │   └── Service.yaml
│   │   ├── dev
│   │   ├── Deployment.yaml
│   │   ├── Ingress.yaml
│   │   └── Service.yaml
│   └── src
└── project.garden.yml
```

You can reference the manifests like so:

```yaml
kind: Deploy
type: kubernetes
name: api
spec:
  files:
    - ./manifests/Deployment.yaml
    - ./manifests/Ingress.yaml
    - ./manifests/Service.yaml
```

You can also use glob patterns like so:

```yaml
kind: Deploy
type: kubernetes
name: api
spec:
  files:
    - ./manifests/*
```

You can also use templating to reference different manifests based on environment.

For example, if your project structure looks like this:

```console
.
├── api
│   ├── garden.yml
│   ├── manifests
│   │   ├── dev
│   │   │   ├── Deployment.yaml
│   │   │   ├── Ingress.yaml
│   │   │   └── Service.yaml
│   │   └── prod
│   │       ├── Deployment.yaml
│   │       ├── Ingress.yaml
│   │       └── Service.yaml
│   └── src
└── project.garden.yml
```

You can reference the manifests like so:

```yaml
kind: Deploy
type: kubernetes
name: api
spec:
  files:
    - ./manifests/${environment.name}/Deployment.yaml
    - ./manifests/${environment.name}/Ingress.yaml
    - ./manifests/${environment.name}/Service.yaml
```

If your manifests are in a parent directory relative to the action config file, you need to set the `source.path` field for your action since Garden cannot include files from parent directories.

For example, if your project has the following structure:

```console
.
├── api
│   ├── src
│   ├── garden.yml
├── manifests
│   ├── Deploment.yaml
│   ├── Ingress.yaml
│   └── Service.yaml
└── project.garden.yml
```

You can reference manifests like so:

```yaml
kind: Deploy
type: kubernetes
name: api
source:
  path: ../ # <--- Garden will now treat the parent directory as the action source path
spec:
  files:
    - ./manifests/Deployment.yaml # <--- Reference the manifests relative to the source path
    - ./manifests/Ingress.yaml
    - ./manifests/Service.yaml
```

### Option 2: Inline

You can also include the manifests inline with your Garden configuration although we generally recommend having dedicated manifest files since those are easier to re-use and will work with other tools.

You define manifests inline like so:

```yaml
kind: Deploy
type: kubernetes
name: api
spec:
  manifests:
    - apiVersion: apps/v1
      kind: Deployment
      metadata:
        name: api
        labels:
          app: api
      spec:
        # ...

    - apiVersion: v1
      kind: Service
      metadata:
      labels:
        app: api
        name: api
      spec:
        # ...
    - apiVersion: networking.k8s.io/v1
      kind: Ingress
      metadata:
        name: api
        labels:
          app: api
      spec:
        # ...
```

## Deploying a container image built by Garden

Most commonly you'll use the `kubernetes` Deploy action together with a `container` Build action. That is, you build your source code with one action and deploy it with another.

Simplified, it looks like this:

```yaml
kind: Build
type: container
name: api
---
kind: Deploy
type: kubernetes
name: api
dependencies: [build.api] # <--- This ensures the image is built before its deployed
spec:
  files: [my-manifests.yml]
```

The problem here is that your manifests will likely contain a "hard coded" container image whereas the image built by Garden will have a different version.

There's a few ways to handle that but the recommend approach is to use the `patchResources` field.

### Option 1: Patching resources (recommended)

The `patchResources` directive allows you to overwrite any field in your manifests using [Kubernetes' built-in patch functionality](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/) without modifying the underlying manifest.

The config will look like this:

```yaml
kind: Build
type: container
name: api
---
kind: Deploy
type: kubernetes
name: api
dependencies: [build.api]
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
                  image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action above
```

With this approach, you can add the Garden action to your project without making any changes to existing config.

Here's a [complete example project](https://github.com/garden-io/garden/tree/0.13.37/examples/k8s-deploy-patch-resources) using this approach.

### Option 2: Using Garden template strings

You can use Garden template strings in your Kubernetes manifests, both in manifests from files and in inline manifests.

For example, if you're using manifest files you can set the image like so:

```yaml
# In the corresponding manifest file
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
spec:
  replicas: 1
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: ${actions.build.api.outputs.deployment-image-id} # <--- Garden will resolve this to the correct image before applying the manifest
```

Here's a [complete example](https://github.com/garden-io/garden/tree/0.13.37/examples/k8s-deploy-shared-manifests) using this approach. The downside though is that this is no longer a valid Kubernetes manifest.

Similarly, if you define your manifest inline you can set the image like so:

````yaml
kind: Build
type: container
name: api
---
kind: Deploy
type: kubernetes
name: api
dependencies: [build.api]
spec:
  files: [my-manifests.yml]
  manifests:
    - apiVersion: apps/v1
      kind: Deployment
      spec:
        template:
          spec:
            containers:
              - name: api
                image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action above
````

## Overwriting values

You can use the exact same pattern as above where we set the container image to overwrite other values from your manifests.

If you for example need to change the number or replicas depending on environment and/or set some env variables, you can do so via the `patchResources` field like we did above. For example:

```yaml
kind: Build
type: container
name: api
---
kind: Deploy
type: kubernetes
name: api
spec:
  files: [my-manifests.yml]
  patchResources:
    - name: api # <--- The name of the resource to patch, should match the name in the K8s manifest
      kind: Deployment # <--- The kind of the resource to patch
      patch:
        spec:
          replicas: "${environment.name == 'dev' ? 1 : 3}" # <-- Set replicas depending on environment
          template:
            spec:
              containers:
                - name: api # <--- Should match the container name from the K8s manifest
                  env:
                    LOG_LEVEL: "${environment.name == 'dev' ? 'verbose' : 'info' }"
```

The benefit of this approach is that you don't need to make any changes to your existing manifests.

If you'd rather use template strings in the manifests, you can do that as well as described in the [referencing container images](#option-2-using-garden-template-strings) section above.

## Setting a default target resource

{% hint style="info" %}
This is only relevant for Deploy actions that deploy resources that contain a Pod spec. If you're using the action to e.g. deploy a ConfigMap or a Secret you can skip this.
{% endhint %}

Some Garden commands like the `logs` and `exec` commands depend on Garden knowing what the target Kubernetes resource is. Same applies to code synchronization, Garden needs to know into what
container in which Pod to sync code changes.

To enable this, users can configure a default target for Garden to use for these commands like so:

````yaml
kind: Deploy
type: kubernetes
name: api
spec:
  files: [my-manifests.yml]
  defaultTarget: # <--- The values below should match one of the K8s resources from the manifests
    kind: Deployment
    name: api
    containerName: api # <--- If not set, Garden picks the first container from the Pod spec
````

Instead of specifying the target kind and name, you can also set a pod selector directly like so:

````yaml
kind: Deploy
type: kubernetes
name: api
spec:
  files: [my-manifests.yml]
  defaultTarget:
    podSelector: # <--- This should match the labels in the desired Pod spec. A random Pod with matching labels will be picked as the target.
      app: api
      environment: dev
````

## Code Synchronization

Code synchronization (i.e. hot reloading) can be configured for the Kubernetes Deploy action. In the example below, code synchronization is set up from the `api` Build action's directory.

```yaml
kind: Deploy
type: kubernetes
name: api
---
spec:
  defaultTarget:
    kind: Deployment
    name: api
  sync:
    paths:
      - containerPath: /app/src
        sourcePath: ${actions.build.api.sourcePath}/src
        mode: two-way
```

For more information on synchronization, check out the full [Code Synchronization Guide](../../../guides/code-synchronization.md).

## Production environments

You can define a remote environment as a `production` environment by setting the [production flag](../../../reference/project-config.md#environmentsproduction) to `true`. This affects some default behavior when working with `kubernetes` actions. See the [Deploying to production](../../guides/deploying-to-production.md) guide for details.

## Next steps

Add Test and Run actions via the [`kubernetes-pod`](../run-test/kubernetes-pod.md) and [`kubernetes-exec`](../run-test/kubernetes-exec.md) action types.

You'll also find the [full Kubernetes Deploy action reference here](../../../reference/action-types/README.md).


