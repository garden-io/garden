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

[//]: # (TODO: `garden create action` is still under construction, update this section when the command is ready)
Next, let's create action configs for each of our two applications, starting with `backend`.

```sh
cd backend
garden create action
cd ..
```

You'll get a multiple-choice suggestion to select action [kind](../../using-garden/actions.md#action-kinds)
and [type](../../using-garden/actions.md#action-types). Let's start with a `Build` action configuration by specifying
kind `Build` and type `container`. You can also give it a name if necessary. By default, the name is the current
directory name, i.e. `backend`.

The helper command will also suggest you to create more actions. Create a `Deploy` action for the `backend` application
by specifying kind `Deploy` and type `container`, see more about types in
the [reference guide](../../reference/action-types/Deploy). It will suggest you the list of available `Build` names to
be deployed. Pick a build name from the `Build` action configured above.

Next, let's do the same for the `frontend` application:

```sh
cd frontend
garden create action
cd ..
```

Before deploying the application, you need to configure `spec` in each `Deploy` action configuration, and set up a local
kubernetes cluster or connect to a remote cluster.

For simplicity, let's consider the local cluster configuration. Open the newly
created `backend/garden.yml` file, locate the `kind: Deploy` configuration and append the following:

```yaml
spec:
  ports:
    - name: http
      containerPort: 8080
      servicePort: 80
  ingresses:
    - path: /hello-backend
      port: http
```

This is enough information for Garden to be able to deploy and expose the `backend` application. Now do the same for
the `frontend` application, with the following block:

```yaml
spec:
  ports:
    - name: http
      containerPort: 8080
  ingresses:
    - path: /hello-frontend
      port: http
    - path: /call-backend
      port: http
  dependencies:
    - deploy.backend # the dependencies must be specified in the `{kind}.{name}` format
```

This does the same for the `Deploy` configuration of the `frontend` application, with the addition of declaring a
runtime dependency on the `backend` `Deploy` action.

Now, let's move on to our next section, and [connect to a Kubernetes cluster](./2-connect-to-a-cluster.md).
