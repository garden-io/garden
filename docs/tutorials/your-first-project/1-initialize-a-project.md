---
title: 1. Initialize a Project
order: 1
---

# 1. Initialize a Project

With the Garden CLI [installed](../../getting-started/quickstart.md#step-1-install-garden), we'll kick off by configuring a
simple example project for use with Garden.

Start by cloning our repo and finding the [example project](../../../examples/demo-project-start):

```sh
git clone https://github.com/garden-io/garden.git
cd garden/examples/demo-project-start
```

The example directory has two directories: `backend` and `frontend`. Each contains simple application with
a `Dockerfile`. We'll first define a boilerplate Garden project, and then Garden action configurations for each
application.

To initialize the project use a helper command:

```sh
garden create project
```

This will create a basic boilerplate project configuration in the current directory, making it our project root.

```yaml
apiVersion: garden.io/v1
kind: Project
name: demo-project-start

defaultEnvironment: ephemeral

environments:
  - name: ephemeral

  - name: local
    defaultNamespace: garden-local

  - name: remote
    defaultNamespace: garden-remote-${local.username}

  - name: staging
    production: true
    defaultNamespace: staging

providers:
  - name: ephemeral-kubernetes
    environments:
      - ephemeral
  - name: local-kubernetes
    environments:
      - local
  - name: kubernetes
    environments:
      - remote
  - name: kubernetes
    environments:
      - staging
```

We have three environments (`local`, `remote` and `staging`) and also three provider configurations, one for each environment.

For this step, we'll focus on the `local` environment. You can ignore the others for now.

Next, let's create action configs for each of our two applications, starting with `backend`.

First we need to define `Build` and `Deploy` actions for the `backend` application. Let's use `container` action type.
Create an empty `backend.garden.yml` config file in the `backend` directory and add the following lines:

```yaml
kind: Build
name: backend
description: Backend service container image
type: container

---

kind: Deploy
name: backend
description: Backend service container
type: container

# Reference to the Build action that builds the image to be deployed (defined above)
build: backend

# Action type specific config goes under the `spec` block
spec:
  healthCheck:
    httpGet:
      path: /hello-backend
      port: http
  ports:
    - name: http
      containerPort: 8080
      servicePort: 80
  ingresses:
    - path: /hello-backend
      port: http
```

Next, let's do the same for the `frontend` application:
Create a `frontend.garden.yml` config file in the `frontend` directory and add the following lines:

```sh
kind: Build
name: frontend
description: Frontend service container image
type: container

---

kind: Deploy
name: frontend
description: Frontend service container
type: container

build: frontend
# Dependency section is used to specify action execution order. The frontend will be deployed after the backend is deployed.
# Dependency for the Build action is implicit.
dependencies:
  - deploy.backend

spec:
  ports:
    - name: http
      containerPort: 8080
  healthCheck:
    httpGet:
      path: /hello-frontend
      port: http
  ingresses:
    - path: /hello-frontend
      port: http
    - path: /call-backend
      port: http
```

Now, let's move on to our next section, and [connect to a Kubernetes cluster](./2-connect-to-a-cluster.md).
