---
title: Kubernetes
order: 2
---

# Kubernetes

Garden can apply Kubernetes manifests via the `kubernetes` deploy action type.
In many cases you'll want to use a `kubernetes` deploy action with a `container` build.
You can do this by referencing the image ID of the `container` build in your Kubernetes manifests.

The `kubernetes` deploy action type works very similar to the [`helm`](./helm.md) deploy and
you'll find a lot common between the two guides.

See the full spec for the `kubernetes` deploy action in our [reference docs](../../reference/action-types/Deploy/kubernetes.md).

[`kubernetes-pod` run](../../reference/action-types/Run/kubernetes-pod.md), [`kubernetes-pod` test](../../reference/action-types/Test/kubernetes-pod.md) and `kubernetes-exec`
actions can be used for testing and task porposes.

## Referencing manifests

When configuring a `kubernetes` deploy action, you have a choice between pointing Garden
to the actual manifest files via the `spec.files` directive or simply adding the
manifests inline in your Garden config under the `spec.manifests` directive.

### Manifest files

If your project structure looks something like this:

```sh
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
    - ./manifests/*.yaml
```

You can also use templating to reference different manifests based on environment.
For example, if your project structure looks like this:

```yaml
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

### Inline

You can also include the manifests inline with your Garden configuration. For
example:

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

## Using variables

Whether you have your manifests inline or reference them as files, you can use
Garden template strings. For example:

```yaml
# This will work inside api/garden.yml and manifests/garden.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  labels:
    app: api
spec:
  replicas: ${var.numberOfReplicas}
  # ...
```

### `kubernetes-pod` runs and tests

For tasks and tests either the `kubernetes-pod` or [`kubernetes-exec`](./kubernetes-exec.md) action types can be used.

[`kubernetes-pod` run](../../reference/action-types/Run/kubernetes-pod.md)
and [`kubernetes-pod` test](../../reference/action-types/Test/kubernetes-pod.md) will create a fresh kubernetes workload and run your command in it.
These actions are cached. This means that if garden will not rerun them if the version of the action hasn't changed. If a remote kubernetes
cluster is used, test results are stored there which allows to share test results between the team or ci runs to decrease the number or re-runs.

`kubernetes-pod` actions don't have to depend on the deploy actions. The manifests are gathered from the kubernetes manifests and deployed to the cluster.

```yaml
kind: Test
name: vote-integ-pod
type: kubernetes-pod
dependencies:
  - deploy.api
variables:
  hostname: vote.${var.baseHostname}
timeout: 60
spec:
  resource:
    kind: Deployment
    name: vote-integ-pod
  command: [/bin/sh, -c, "npm run test:integ"]
  values:
...
```
## Linking container builds and kubernetes deploy actions

When your project also contains one or more `container` build actions that build the images used by a `kubernetes` deploy,
you want to make sure the containers are built ahead of deploying the Helm chart, and that the correct image tag is used when deploying.

```yaml
kind: Build
type: container
name: worker-image

```

```yaml
kind: Deploy
description: Kubernetes deploy for the worker container
type: helm
name: worker-deploy
dependencies: [build.worker-image]
spec:
  manifests:
  - apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: worker
      labels:
        app: worker
      spec:
        containers:
        - name: worker
          image: ${actions.build.worker-image.outputs.deployment-image-id} # <--- Here we're referencing the output from the api-image Build. This will also work in manifest files.
          # ...
```

Here the `worker-deploy` injects the `worker-image` version into the kubernetes manifest with string templating.

This can also work if you use multiple containers in a deploy. You just add them all as dependencies.

## Code Synchronization

Synchronization can be configured with kubernetes deploys. In the example below code synchronization is set up from the `vote-image` build action's directory.

```yaml
kind: Deploy
type: kubernetes
name: myapp
...
spec:
  defaultTarget:
    kind: Deployment
    name: myapp
  sync:
    paths:
      - containerPath: /app/src
        sourcePath: ${actions.build.vote-image.sourcePath}/src
        mode: two-way

```

For more information on synchronization check out the [Code Synchronization Guide](../../guides/code-synchronization.md).

## Production environments

You can define a remote environment as a `production` environment by setting the [production flag](../../reference/project-config.md#environmentsproduction) to `true`. This affects some default behavior when working with `kubernetes` actions. See the [Deploying to production](../advanced/deploying-to-production.md) guide for details.

## Next steps

Check out the full [action reference](../../reference/action-types/README.md) for more details.
Also check out the [Helm action type](./helm.md) for a more flexible alternative.

