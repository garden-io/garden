---
title: 1. Create a Garden Project
order: 1
---

# 1. Create a Garden Project

The first thing we'll do is create a Garden project. Remember that you need to have the [Garden CLI installed](../../getting-started/quickstart.md#step-1-install-garden) to follow along.

## Step 1 — Clone the example application

Start by cloning the example repo and checkout to the `tutorial-start` branch:

```sh
git clone https://github.com/garden-io/web-app-example.git
cd web-app-example
git checkout tutorial-start
```

The example is a three-tier web app with web, API, and database components. Garden is typically used in projects with multiple microservices but we're keeping things simple here to make it easy to follow along.

## Step 2 — Create a project

Next, we'll initialize a Garden project with:

```sh
garden create project
```

This will create a basic boilerplate project configuration in the current directory, making it our project root. It will look something like this:

```yaml
apiVersion: garden.io/v1
kind: Project
name: web-app-example

defaultEnvironment: local

variables:
  usernamespace: web-app-example-${kebabcase(local.username)}

environments:
  - name: local
    defaultNamespace: ${var.userNamespace}

  - name: remote-dev
    defaultNamespace: ${var.userNamespace}

  - name: staging
    production: true
    defaultNamespace: web-app-example-${git.branch}

providers:
  - name: local-kubernetes
    environments: [local]
  - name: kubernetes
    environments: [remote-dev]
  - name: kubernetes
    environments: [staging]
```

We have three environments (`local`, `remote-dev` and `staging`) and also three provider configurations, one for each environment.

