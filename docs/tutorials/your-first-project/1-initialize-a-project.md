---
title: 1. Initialize a Project
order: 1
---

# 1. Initialize a Project

With the Garden CLI [installed](../../basics/quickstart.md#step-1-install-garden), we'll kick off by configuring a
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
kind: Project
name: demo-project
environments:
  - name: default
providers:
  - name: local-kubernetes
```

We have one environment (`default`) and a single provider. We'll get back to this later.

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

# This defines an image to be used and refers the 'frontend' Build action defined above
build: frontend
# Dependency section is used to ensure the deployment order. The frontend will be deployed after the backend.
dependencies:
  - deploy.backend

# This block is necessary to deploy and expose the frontend application
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

Before deploying the application, you need to set up a local kubernetes cluster or connect to a remote cluster.
First you can try to deploy the project with the local kubernetes cluster.

Now, let's move on to our next section, and [connect to a Kubernetes cluster](./2-connect-to-a-cluster.md).
