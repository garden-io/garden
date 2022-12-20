---
title: Kubernetes 
order: 2
---

# Kubernetes

Garden can apply Kubernetes manifests via the `kubernetes` module type. In
many cases you'll want to use a `kubernetes` module to deploy a `container` module. You can do this by referencing the image ID of the `container` module in your Kubernetes manifests.

The `kubernetes` module works very similar to the [`helm`](./helm.md) module and
you'll find a lot of similarities between the two guides.

You'll find the full spec for the `kubernetes` module in our [reference docs](../../../reference/module-types/kubernetes.md).

## Basics

First off, a couple of things to note on how Kubernetes support is implemented, with respect to Garden primitives:

1) One `kubernetes` _module_ maps to a single Garden _service_ (not to be confused with the Kubernetes Service resources), with the same name as the module.
2) Because a Kubernetes manifest does not contain actual code (i.e. your containers/images), you'll often need to make two Garden modules for a single deployed service, e.g. one `container` module for your image, and then the `kubernetes` module that references it.

## Referencing manifests

When configuring a `kubernetes` module, you have a choice between pointing Garden
to the actual manifest files via the `files` directive or simply adding the
manifests inline in your Garden config under the `manifests` directive.

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
kind: module
type: kubernetes
name: api
files: 
  - ./manifests/Deployment.yaml
  - ./manifests/Ingress.yaml
  - ./manifests/Service.yaml
```

{% hint style="warning" %}
Due to a current limitation you need to list all the manifests. There's an [open
issue](https://github.com/garden-io/garden/issues/3465) for addressing this.
{% endhint %}

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
kind: module
type: kubernetes
name: api
files: 
  - ./manifests/${environment.name}/Deployment.yaml
  - ./manifests/${environment.name}/Ingress.yaml
  - ./manifests/${environment.name}/Service.yaml
```

### Inline

You can also include the manifests inline with your Garden configuration. For
example:

```yaml
kind: module
type: kubernetes
name: api
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

## Tasks and tests

You may also want to define _tests_ and/or _tasks_ that execute in one of the containers defined in the manifest. For example:

```yaml
kind: Module
type: kubernetes
name: postgres
manifests: [./manifests/postgres.yaml]
serviceResource:
  kind: StatefulSet
  name: postgres
tasks:
  - name: db-init
    args: [ psql, -w, -U, postgres, ..., -c, "'CREATE TABLE IF NOT EXISTS my-table ..." ]
    env:
      PGPASSWORD: postgres
    dependencies:
      - postgres
  - name: db-clear
    args: [ psql, -w, -U, postgres, ..., -c, "'TRUNCATE my-table'" ]
    env:
      PGPASSWORD: postgres
    dependencies:
      - postgres
```

Note first the `serviceResource` field. This tells Garden which Kubernetes _Deployment_, _DaemonSet_ or _StatefulSet_ to regard as the primary resource of the manifest. In this case, it is simply the `postgres` application itself. When running the `db-init` and `db-clear` tasks, Garden will find the appropriate container spec in the manifest based on the `serviceResource` spec, and then execute that container with the task's `args` and (optionally) the specified `env` variables.

The same applies to any _tests_ that you specify. For example:

```yaml
kind: Module
type: postgres
name: vote
serviceResource:
  kind: Deployment
...
tests:
  - name: integ
    args: [npm, run, test:integ]
    dependencies:
      - api
```

Instead of the top-level `serviceResource` you can also add a `resource` field with the same schema to any individual task or test specification. This can be useful if you have different containers in the chart that you want to use for different scenarios.

## Linking container modules and Kuberneretes modules

When your project also contains one or more `container` modules that build the images used by a `kubernetes` module, you want to make sure the `container`s are built ahead of applying the Kubernetes manifests, and that the correct image tag is used when deploying. For example:

```yaml
kind: Module
type: postgres
name: api
...
build:
  dependencies: [api-image]
manifests:
- apiVersion: apps/v1
  kind: Deployment
  metadata:
    name: api
    labels:
      app: api
    spec:
      containers:
      - name: api
        image: ${modules.api-image.outputs.deployment-image-id} # <--- Here we're referencing the output from the api-image module. This will also work in manifest files.
        # ...
```

```yaml
kind: Module
type: container
name: api-image
```

Here the `api` module specifies the image as a build dependency, and additionally injects the `api-image` version into the Kubernetes manifest.

## Code Synchronization (Dev Mode)

When your project contains the `container` module referenced by a `kubernetes` module, you can even use Garden's [live code synchronization (dev mode)](../../../guides/code-synchronization-dev-mode.md) feature for a Kubernetes manifest. For example:

```yaml
kind: Module
type: kubernetes
name: api
devMode:
  command: [npm, run, dev]
  sync:
    - target: /app
    - source: /tmp/somedir
      target: /somedir
serviceResource:
  kind: Deployment
  name: api 
  containerModule: api-image # <--- The name of container module
  containerName: api 
```

For dev mode to work you must specify `serviceResource.containerModule`, so that Garden knows which module contains the sources to use for code syncing. You can also use the `devMode.command` directive to, for example, start the container with automatic reloading or in development mode.

For the above example, you could then run `garden deploy -w --dev=api` to start the `api` service in hot-reloading mode. When you then change the sources in the _api-image_ module, Garden syncs the changes to the running container from the Helm chart.

## Production environments

You can define a remote environment as a `production` environment by setting the [production flag](../../../reference/project-config.md#environmentsproduction) to `true`. This affects some default behavior when deploying `kubernetes`  modules. See the [Deploying to production](../advanced/deploying-to-production.md) guide for details.

## Next steps

Check out the full [Kubernetes module reference](../../../reference/module-types/kubernetes.md).

Also check out the [Helm module](./helm.md) for a more flexible alternative.

