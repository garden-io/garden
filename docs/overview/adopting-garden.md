---
title: Adopting Garden
order: 5
---

# Adopting Garden

This page outlines the steps involved in adopting Garden. This is not meant as a how-to guide but rather a high-level overview. The configuration snippets are mostly for demonstration purposes to help you understand how your config evolves as you adopt Garden for more use cases.

The intended audience is a DevOps Engineer, Platform Engineer or a team lead looking to adopt Garden to speed up pipelines and improve developer experience for their team.

In what what follows we assume you have a basic understanding of Garden and its core concepts. If not, checkout the [How Garden Works](./how-garden-works.md) or [Core Concepts](./core-concepts.md) guides.

## Stage 1 — On-demand environments

First thing you do is add some Garden config to your project so that you can use Garden to build and deploy it.

At the end of this stage you'll be able to spin up on-demand preview environments in a single command from anywhere—e.g. from your laptop as you code, or your CI pipelines during code review.

Below we'll outline the high-level steps of that initial set-up.

### Step 1 — Pick your plugins

The first thing you do when adopting Garden is to pick the plugins you want to use. Plugins are configured via the `providers` field in the project level configuration. Plugins also define action types that we'll get to below.

The provider configuration will look something like this, depending on the plugins you're using (we're omitting some details here):

```yaml
# At the root of your project
kind: Project
name: my-project

environments:
  - name: dev

providers:
 - name: kubernetes
   environments: [dev]
```

Each plugin has a dedicated section in our documentation that explains how it works and how you can get started using it.

We recommend starting simple with a single plugin and adding more as needed. In most cases you'll want to start with one of the Kubernetes plugins and build from there.

Below you'll find a brief overview of our main plugins. Once you know what you need, we suggest heading to the "Configure Plugin" guide for your plugin of choice.

#### Ephemeral Kubernetes

The [ephemeral Kubernetes plugin](../k8s-plugins/ephemeral-k8s/README.md) is the easiest way to get started. Garden will
spin-up a zero-config, managed Kubernetes cluster in a matter of seconds. Each cluster is available for 4 hours.

Our [Quickstart Guide](../getting-started/quickstart.md) uses this plugin.

This plugin is great for testing things out without needing to actually setup a Kubernetes cluster.

#### Local Kubernetes

The [local Kubernetes plugin](../k8s-plugins/local-k8s/README.md) is a good choice if you already have Kubernetes installed locally on your machine (e.g. K3s, Minikube or Docker for Desktop).

This plugin is great for developing smaller projects that you can comfortably run on your laptop but we definitely recommend using the remote Kubernetes plugin for team work so that you can share preview environments and benefit from caching.

#### (Remote) Kubernetes

To use the [Kubernetes plugin](../k8s-plugins/remote-k8s/README.md) you'll need access to a Kubernetes cluster so it may require a bit of up-front work.

This is a great pick for _teams_ building apps that run on Kubernetes because:

- It allows you develop in remote, production-like environments that scale with your stack.
- You don't need any dependencies on your laptop, even the builds can be performed remotely.
- It allows you to share build and test caches with your entire team and across environments. This can dramatically speed up pipelines and development.
- It allows you to easily create preview environments that you can share with others, e.g. for pull requests.

#### Terraform

The [Terraform plugin](../terraform-plugin/README.md) is usually used in conjunction with the Kubernetes plugin to provision infrastructure and/or cloud managed services such as databases.

It allows you to:

- Reference outputs from your Terraform stack in your other services. You can e.g. pass a database hostname to a given service without "hard coding" any values.
- Provision infrastructure ahead of deploying your project in a single command.

Pick this plugin if you're already using Terraform and want to codify the relationship between your runtime services and Terraform stack.

#### Pulumi

The [Pulumi plugin](../pulumi-plugin/README.md) is very similar to the Terraform plugin (see above) except for use with Pulumi.

#### Local scripts (`exec`)

The [Exec plugin](../other-plugins/exec.md) allows you to execute arbitrary scripts on the host (e.g. your laptop or CI runner).

It's great for executing auth scripts, running services locally, and as a general purpose escape hatch.

It's built in, which means you don't need to specify it in the project level configuration, and you can simply add `exec` actions right away.

### Step 2 — Add actions

{% hint style="info" %}
Garden actions and their configuration can be spread across different files and even across git repos.
{% endhint %}

Once you've configured your plugin(s), it's time to add actions.

Actions are the basic building blocks that make up your Garden project. The four kinds of actions are `Build`, `Deploy`, `Test`, and `Run` and how they're configured depends on the action _kind_ and _type_.

We recommend putting each action in its own `garden.yml` file and locating it next to any source files but for demonstration purposes, here's what a (slightly simplified) Garden project could look like in a _single file_:

```yaml
# At the root of your project.
apiVersion: garden.io/v1
kind: Project
name: my-project

environments:
  - name: dev

providers:
 - name: kubernetes
   environments: ["dev"]

---

kind: Deploy
type: helm
name: db
spec:
  chart:
    name: postgresql
    repo: https://charts.bitnami.com/bitnami
    version: "11.6.12"

---

kind: Run
name: db-init
type: container
dependencies: [deploy.db]
spec:
  image: postgres:11.6-alpine
  command: ["/bin/sh", "db-init-script.sh"]

---

kind: Build
name: api
type: container

---

kind: Deploy
name: api
type: kubernetes
dependencies: [build.api, run.db-init]
spec:
  files: [ manifest.yml ]
```

Depending on the size of your project, you may want to add a handful of actions to get started and then gradually add more as needed.

The goal at the end of this step should be to be able to deploy your project by running:

```console
garden deploy
```


### Step 3 — Add more environments

At this point, you should be able to deploy your project from your laptop in a single command with the Garden CLI.

Next step is to add more environments so you can e.g. create preview environments in your CI pipeline for every pull request:

```yaml
# At the root of your project
apiVersion: garden.io/v1
kind: Project
name: my-project

environments:
  - name: dev
    variables:
      hostname: ${local.username}.my-company.com # <--- Ensure dev environments are isolated
  - name: ci
    variables:
      hostname: ${local.BRANCH_NAME}.my-company.com # <--- Ensure CI preview environments are isolated

providers:
 - name: kubernetes
   environments: ["dev, staging"]
   hostname: ${var.hostname}
 - name: terraform # <--- Use the Terraform plugin for the staging environment to provision a DB
   environments: ["staging"]
---
kind: Deploy
name: db
type: helm
disabled: "${environment.name != 'dev'}" # <--- Toggle based on env
---
kind: Deploy
name: db
type: terraform
disabled: "${environment.name != 'ci'}" # <--- Toggle based on env
---
kind: Deploy
name: web
type: kubernetes
files: "[path/to/your/${environment.name}/k8s/manifests]" # <--- Pick manifests based on env
```

Now, you can create preview environments on demand from your laptop with:

```console
garden deploy
```

...or from your CI pipelines with:

```console
garden deploy --env ci
```

The template strings in the config above ensure that each environment is isolated.


{% hint style="info" %}
[Garden Enterprise](https://garden.io/plans), our commercial offering, includes secrets management and RBAC to ensure you don’t need to add any secrets to your CI provider or setup secrets for development. This ensures 100% portability across all your environments.
{% endhint %}

## Stage 2 — Use Garden to test in CI and “as you code”

One of the main benefits of being able spin up production-like environments on demand is that it vastly simplifies writing and maintaining end-to-end tests. No more waiting for a full CI pipeline to run tests, you
can do that from your laptop, _as you code!_

This is why teams typically start adding Test actions to their Garden project after setting up on-demand environments. Here's a simple example:

```yaml
kind: Build
name: api
type: container
---
kind: Deploy
name: api
type: kubernetes
dependencies: [build.api]
spec:
  files: [api/manifests]
---
kind: Build
name: web
type: container
---
kind: Deploy
name: web
type: kubernetes
dependencies: [build.web, deploy.api]
spec:
  files: [web/manifests]
---
kind: Test
name: e2e
type: kubernetes-exec
dependencies: [deploy.web]
spec:
  args: [npm, run, test:e2e]
```

At the end of this stage, you can run end-to-end tests from your CI pipelines with:

```console
garden test --env ci
```

And importantly, developers can run and debug these same tests from their laptops _as they code_, using the same command.

## Stage 3 — Roll out production-like dev envs to your team

At this stage, your entire team should be able to spin up preview environments and run end-to-end tests on demand, across all stages of software delivery.

Next step is typically to roll out production-like development environments to your team so they can do day-to-day development in the cloud.

This means that each developer will have their own isolated namespace in a remote Kubernetes cluster where they're able to run their entire project without setting their laptops on fire.

This also means that new developers can get up and running in a matter of minutes. Since the project runs remotely and Garden automates all the workflows, setting up a development environment from scratch is as
simple as cloning the project repo and running `garden dev`.

Thanks to Garden's [live reloading functionality](../guides/code-synchronization.md), code changes stream directly to the running container in the remote cluster, ensuring blazing fast feedback. No need to wait for builds or deploys. This allows your team to develop in production-like environments that _feel_ just like local.

## Stage 4 — Roll Garden out to more teams

At this stage, you'll have codified all your workflows with Garden and simplified your entire delivery pipeline by re-using the same config and commands across all stages of delivery.

Your team may also be developing in production-like environments and is able to run the entire test suite without needing to wait for CI.

At this point, you can start using Garden to consolidate workflows and tooling across the entire organisation. You can e.g. create [templates](../using-garden/config-templates.md) that allow you to author re-useable config that can be shared across teams to ensure consistency and compliance.

Similarly you can add [custom commands](../advanced/custom-commands.md) to standarize workflows and add our [Pulumi](../pulumi-plugin/about.md) or [Terraform](../terraform-plugin/about.md) to truly codify your
entire delivery process—including infrastructure provisioning.

## Next Steps

Now that you have a feel for how our users typically adopt Garden, we recommend heading to the documentation for your plugin of choice, and to start "Gardenifying" your project.

And if you have any questions, don't hesitate to reach out to our [our Discord community](https://discord.gg/FrmhuUjFs6).
