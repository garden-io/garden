# 2. Initialize a Project

With the Garden CLI [installed](./1-installation.md), we'll kick off by configuring a simple example project for use with Garden.

Start by cloning our repo and finding the example project:

```sh
git clone https://github.com/garden-io/garden.git
cd garden/examples/demo-project-start
```

This directory contains two directories, with one container service each, `backend` and `frontend`. We'll first define a boilerplate Garden project, and then a Garden module for each of the services.

To initialize the project, we can use a helper command:

```sh
garden create project
```

This will create a basic boilerplate project configuration in the current directory, making it our project root. With the comments stripped out, it should look something like this:

```yaml
kind: Project
name: demo-project
environments:
  - name: default
providers:
  - name: local-kubernetes
```

We have one environment (`default`) and a single provider. We'll get back to this later.

Next, let's create module configs for each of our two modules, starting with `backend`:

```sh
cd backend
garden create module
cd ..
```

You'll get a suggestion to make it a `container` module. Pick that, and give it the default name as well. Then do the same for the `frontend` module:

```sh
cd frontend
garden create module
cd ..
```

This is now enough configuration to build the project. Before we can deploy, we need to configure `services` in each module configuration, as well as set up a local cluster or connect to a remote cluster.

Starting with the former, go ahead and open the newly created `backend/garden.yml` file. You'll find a number of commented-out fields, which reveal all the options available for the `container` module type. One of the is the `services` field. Just to keep things simple for now, go ahead and replace that block (or append to the file) the following:

```yaml
services:
  - name: backend
    ports:
      - name: http
        containerPort: 8080
        servicePort: 80
    ingresses:
      - path: /hello-backend
        port: http
```

This is enough information for Garden to be able to deploy and expose the `backend` service. Now do the same for the `frontend` service, with the following block:

```yaml
services:
  - name: frontend
    ports:
      - name: http
        containerPort: 8080
    ingresses:
      - path: /hello-frontend
        port: http
      - path: /call-backend
        port: http
    dependencies:
      - backend
```

This does the same for the `frontend` service, with the addition of declaring a runtime dependency on the `backend` service.

Now, let's move on to our next section, and [connect to a Kubernetes cluster](./3-connect-to-a-cluster.md).
