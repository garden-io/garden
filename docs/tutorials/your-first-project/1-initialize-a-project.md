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

Next, we'll create a project config file in the root of the example with:

```sh
garden create project --name web-app-example
```

This will create a basic boilerplate project configuration in the current directory, making it our project root. It will look something like this:

```yaml
apiVersion: garden.io/v2
kind: Project
name: web-app-example

defaultEnvironment: local

environments:
  - name: local
    defaultNamespace: web-app-example
    variable:
      hostname:
        "local.demo.garden"
  - name: remote-dev
    defaultNamespace: web-app-example-${kebabCase(local.username)}
  - name: ci
    defaultNamespace: web-app-example-${git.branch}-${git.commitHash}
  - name: preview
    defaultNamespace: web-app-example-${git.branch}

providers:
  - name: local-kubernetes
    environments: [local]
  - name: kubernetes
    environments: [remote-dev, ci, preview]
```

We have four environments (`local`, `remote-dev`, `ci`, and `preview`) and also two provider configurations (`local-kubernetes` and `kubernetes`).

## Step 3 – Enable Remote Container Builder (optional)

We highly recommend using our [Remote Container Builder](../../garden-for/containers/using-remote-container-builder.md) which can significantly speed up container builds for your Garden projects.

To enable it, update your provider configuration like so:

```yaml
# In project.garden.yml
providers:
  - name: container # <--- Add this!
    gardenContainerBuilder:
      enabled: true
  - name: local-kubernetes
    environments: [local]
  - name: kubernetes
    environments: [remote-dev, ci, testing]
```
