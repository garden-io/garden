---
title: Adopting Garden
order: 2
---

# Adopting Garden

This page contains a high-level overview of the steps required to adopt Garden. The configuration snippets are just for demonstration purposes to help you understand how Garden grows with your stack.

## Step 1 — Pick your plugins

The first thing you do when adopting Garden is to pick the plugins you want to use and list them in your project configuration.

The configuration will look something like this, depending on the plugins you're using (we're omitting some details here):

```yaml
# At the root of your project
kind: Project
name: my-project

environments:
  - name: dev

providers:
 - name: kubernetes
   environments: ["dev"]
```

Each plugin has a dedicated section in our documentation that explains how it works and how you can get started using it.

We recommend starting simple with a single plugin and adding more as needed. In most cases you'll want to start with either the `kubernetes` or `local-kubernetes` plugins and build from there.

Below you'll find a brief overview of our main plugins. Once you know what you need, we suggest heading to the "Configure Plugin" guide for your plugin of choice.

### Local Kubernetes

The [local Kubernetes](../k8s-plugins/local-k8s/README.md) is usually the easiest way to get started. All you need is a local Kubernetes installation (e.g. Minikube or Docker for Desktop) and a project to deploy.

Our [Quickstart Guide](../basics/quickstart.md) uses this plugin.

This plugin is great for kicking the tires and for solo projects that you can comfortably run on your laptop.

### (Remote) Kubernetes

To use the [Kubernetes plugin](../k8s-plugins/remote-k8s/README.md) you'll need access to a Kubernetes cluster so it may require a bit of upfront work.

This is a great pick for _teams_ building apps that run on Kubernetes because:

- It allows you develop in remote production like environments that scale with your stack.
- You don't need any dependencies on your laptop, even the builds happen remotely.
- It allows you to share build and test caches with your entire team and across environments. This can dramatically speed up pipelines and development.
- It allows you to easily create preview environments that you can share with others,
  e.g. for pull requests.

### Terraform

The [Terraform plugin](../terraform-plugin/README.md) is usually used in conjunction with the Kubernetes plugin to provision infrastructure and/or cloud managed services such as databases.

It allows you to:

- Reference outputs from your Terraform stack in your other services. You can e.g. pass a database hostname to a given service without "hard coding" any values.
- Provision infrastructure ahead of deploying your project in a single command.

Pick this plugin if you're already using Terraform and want to codify the relationship between your runtime services and Terraform stack.

### Pulumi

The [Pulumi plugin](../pulumi-plugin/README.md) is very similar to the Terraform plugin (see above) except for use with Pulumi.

### Exec

The [Exec plugin](../plugins/exec.md) allows you to execute arbitrary scripts on the host (e.g. your laptop or CI runner).

It's great for executing auth scripts, running services locally, and as a general purpose escape hatch.

It's built-in which means you don't need to specify it in the project level configuration and you can simply add `exec` modules right away.

## Step 2 — Add your modules

{% hint style="info" %}
Garden modules and their configuration can be spread across different files and even across git repos.
{% endhint %}

Once you've configured your plugin(s), it's time to add modules.

Modules are the components that make up your stack and can contain services, tests, and tasks.

How they're configured depends on the module types and plugins you're using.

We recommend putting each module in their own `garden.yml` file and locate it next to the module files. For demonstration purposes, here's what a (slightly simplified) Garden project could look like in a _single file_:

```yaml
# At the root of your project.
kind: Project
name: my-project

environments:
  - name: dev

providers:
 - name: kubernetes
   environments: ["dev"]

---

kind: Module
name: db
repo: https://charts.bitnami.com/bitnami
chart: postgresql
version: 12.1.2
tasks:
  - name: db-seed
    command: ["/bin/sh", "-c", "psql -U postgres <...>"]

---

kind: Module
name: api
type: kubernetes
files: [path/to/your/k8s/manifests]
dependencies: [db-seed]

---

kind: Module
name: web
type: container
dependencies: [api]
tests:
  - name: e2e
services:
  - name: web-service
    # ...
```

Depending on the size of your project, you may want to add a handful of modules to get started and then gradually add more as needed.

## Step 3 — Add more plugins and environments

Garden works great for development and for running tests and creating preview environments in CI. 

We recommend adopting Garden in one part of your software delivery cycle to begin and then gradually introducing more. 

A common path looks something like this:

1. Start by using Garden in CI to create preview environments.
2. Roll Garden out to developers and add production-like dev environments.
3. Use Garden for running end-to-end tests, as you code, and in CI
   pipelines.
4. Use Garden for production deployments or integrate it with your
   existing tools.

At this point, a simplified configuration could look something like this:

```yaml
# At the root of your project
kind: Project
name: my-project

environments:
  - name: dev
    variables:
      hostname: dev.my-company.com
  - name: staging
    variables:
      hostname: staging.my-company.com

providers:
 - name: kubernetes
   environments: ["dev, staging"]
   hostname: ${var.hostname}
 - name: terraform # <--- Use the Terraform plugin for the staging environment to provision a DB
   environments: ["staging"]
---
kind: Module
name: db
type: helm
disabled: "${environment.name != 'dev'}" # <--- Toggle based on env
---
kind: Module
name: db
type: terraform
disabled: "${environment.name != 'staging'}" # <--- Toggle based on env
---
kind: Module
name: web
type: kubernetes
files: "[path/to/your/${environment.name}/k8s/manifests]" # <--- Pick manifests based on env
```

At this point you'll have codified all your workflows such that they are portable across environments and you can go from zero to a running system in a single command.

Now that you have a feel for how our users typically adopt Garden, we recommend heading to the documentation for your plugin of choice, and to start Gardenifying your project.

And if you have any questions, don't hesitate to reach out to our [our Discord community](https://discord.gg/gxeuDgp6Xt).
