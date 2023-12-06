---
title: Next Steps
order: 4
---

# Next Steps

If you've kicked the tires with the [Quickstart guide](./quickstart.md) or in the [interactive playgrounds](./interactive-playgrounds.md) you've seen how Garden lets you **spin up production-like environments for development, testing, and CI—with blazing fast caching**.

Now is the time to set up Garden for your own project to get these benefits and more.

This guide describes the main steps involved. It's meant as a roadmap for the configuration process with links to more in-depth resources. The configuration snippets are mostly for demonstration purposes to help you understand how your config evolves.

For a more high level guide of adopting Garden in your organization, check out our [Adopting Garden guide](../overview/adopting-garden.md).

For those that prefer something more visual, we recommend checking out this video which goes step-by-step through the process of adding Garden to a project. Otherwise, continue reading below.

{% embed url="https://youtu.be/0y5E8K-8kr4" %}

## Step 1 — Create a project

The first thing you need to do is to create a project level Garden config file at the root of your project, typically called `garden.yml` or `project.garden.yml`.

Here's a simple example:

```yaml
# At the root of your project
apiVersion: garden.io/v1
kind: Project
name: my-project

environments: # <--- Every Garden project has one more environments
  - name: dev
```

See our [in-depth Projects configuration guide](../using-garden/projects.md) for more details, for example on how to include and exclude certain files from your project.

## Step 2 — Pick your plugins

Next, you pick your plugins.

Each plugin has a dedicated section in our documentation that explains how it works and how you can get started using it.

We recommend starting simple with a single plugin and adding more as needed. In most cases you'll want to start with [one of the Kubernetes plugins](../k8s-plugins/about.md) and build from there.

At that point, your configuration will look something like this:

```yaml
# At the root of your project
apiVersion: garden.io/v1
kind: Project
name: my-project

environments:
  - name: dev

providers:
 - name: kubernetes
   context: <my-cluster-context>
   environments: [dev]
   # ...
```

{% hint style="info" %}
Plugins have a **provider** part that's configured at the project level and defines how the plugin works. For the Kubernetes plugins you'd
e.g. set the cluster context here. For the Terraform plugin you'd set the path to your Terraform stack. Plugins also define **actions** that we get to below.
{% endhint %}

Below you'll find a brief overview of our main plugins. Once you know what you need, we suggest heading to the "Configure Plugin" guide for your plugin of choice.

### Ephemeral Kubernetes

The [ephemeral Kubernetes plugin](../k8s-plugins/ephemeral-k8s/README.md) is the easiest way to get started. Garden will
spin-up a zero-config, managed Kubernetes cluster in a matter of seconds. Each cluster is available for 4 hours.

Our [Quickstart Guide](../getting-started/quickstart.md) uses this plugin.

This plugin is great for testing things out without needing to actually setup a Kubernetes cluster.

### Local Kubernetes

The [local Kubernetes plugin](../k8s-plugins/local-k8s/README.md) is a good choice if you already have Kubernetes installed locally on your machine (e.g. K3s, Minikube or Docker for Desktop).

This plugin is great for developing smaller projects that you can comfortably run on your laptop but we definitely recommend using the remote Kubernetes plugin for team work so that you can share preview environments and benefit from caching.

### (Remote) Kubernetes

To use the [Kubernetes plugin](../k8s-plugins/remote-k8s/README.md) you'll need access to a Kubernetes cluster so it may require a bit of up-front work.

This is a great pick for _teams_ building apps that run on Kubernetes because:

- It allows you develop in remote, production-like environments that scale with your stack.
- You don't need any dependencies on your laptop, even the builds can be performed remotely.
- It allows you to share build and test caches with your entire team and across environments. This can dramatically speed up pipelines and development.
- It allows you to easily create preview environments that you can share with others, e.g. for pull requests.

### Terraform

The [Terraform plugin](../terraform-plugin/README.md) is usually used in conjunction with the Kubernetes plugin to provision infrastructure and/or cloud managed services such as databases.

It allows you to:

- Reference outputs from your Terraform stack in your other services. You can e.g. pass a database hostname to a given service without "hard coding" any values.
- Provision infrastructure ahead of deploying your project in a single command.

Pick this plugin if you're already using Terraform and want to codify the relationship between your runtime services and Terraform stack.

### Pulumi

The [Pulumi plugin](../pulumi-plugin/README.md) is very similar to the Terraform plugin (see above) except for use with Pulumi.

### Local scripts (`exec`)

The [Exec plugin](../other-plugins/exec.md) allows you to execute arbitrary scripts on the host (e.g. your laptop or CI runner).

It's great for executing auth scripts, running services locally, and as a general purpose escape hatch.

It's built in, which means you don't need to specify it in the project level configuration, and you can simply add `exec` actions right away.

## Step 3 — Add actions

Once you've configured your plugin(s), it's time to add actions.

Actions are the basic building blocks that make up your Garden project. The four actions kinds are `Build`, `Deploy`, `Test`, and `Run` and how they're configured depends on the action _kind_ and _type_.

For example, if you're using one of the Kubernetes plugins you can use a Build action of type `container` and a Deploy action of type `kubernetes` to deploy a give service. You could e.g. also use the `helm` action type to deploy your own Helm charts.

Importantly, actions can define dependencies between one another. This is what makes up the nodes and edges of the [Stack Graph](../overview/how-garden-works.md#the-stack-graph).

We recommend putting each action in its own `garden.yml` file and locating it next to any source files.

{% hint style="info" %}
Garden actions and their configuration can be spread across different files and even [across multiple git repos](../advanced/using-remote-sources.md).
{% endhint %}

Here's a simple example with actions for deploying an ephemeral database and an API server alongside a Test action for running integration tests:

```yaml
# In db/garden.yml
kind: Deploy
name: db
type: helm
description: A Deploy action for deploying a Postgres container via Helm
spec:
  chart:
    name: postgresql
    repo: https://charts.bitnami.com/bitnami
    version: "11.6.12"
---
kind: Run
name: db-init
type: container
description: A Run action for seeding the DB after it's been deployed
dependencies: [deploy.db]
spec:
  image: postgres:11.6-alpine
  command: ["/bin/sh", "db-init-script.sh"]

# In api/garden.yml
kind: Build
name: api
type: container
description: A Build action for building the api image
---
kind: Deploy
name: api
type: kubernetes
description: A Deploy action for deploying the api after its been built and the DB seeded
dependencies: [build.api, run.db-init]
spec:
  files: [ api-manifests.yml ]
---
kind: Test
name: api-integ
type: container
description: A Test action for integration testing the api after its been deployed
build: api # <--- Use the api image to run the test
dependencies: [deploy.api]
```

Depending on the size of your project, you may want to add a handful of actions to get started and then gradually add more as needed.

At the end of this step you'll be able to deploy your project to a production-like environment with:

```console
garden deploy
```

Similarly, you can run your integration or end-to-end tests in a production-like environment with:

```console
garden test
```

For detailed guides on configuring actions for different plugins, checkout the Action Configuration pages under each plugins section.

## Step 4 — Add more environments and plugins

At this point, you should be able to deploy and test your project from your laptop in a single command with the Garden CLI.

Next step is to add more environments so you can e.g. create preview environments in your CI pipeline for every pull request.

You may also want to add our Terraform or Pulumi plugins if you're using those tools, following the same process as in step 2 and step 3 above.

Garden also lets you define variables and use templating to ensure the environments are configured correctly. Below is a simple example:

```yaml
# At the root of your project
apiVersion: garden.io/v1
kind: Project
name: my-project

environments:
  - name: dev
    variables:
      hostname: ${local.username}.my-company.com # <--- Ensure dev environments are isolated by templating in the user name
  - name: ci
    variables:
      hostname: ${local.BRANCH_NAME}.my-company.com # <--- Ensure CI preview environments are isolated by templating in the branch name

providers:
 - name: kubernetes
   environments: [dev, staging]
   hostname: ${var.hostname}
 - name: terraform # <--- Use the Terraform plugin for the staging environment to provision a DB
   environments: [staging]

# In db/garden.yml
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

# In api/garden.yml
kind: Deploy
name: api
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

{% hint style="info" %}
[Garden Enterprise](https://garden.io/plans), our commercial offering, includes secrets management and RBAC to ensure you don’t need to add any secrets to your CI provider or setup secrets for development. This ensures 100% portability across all your environments.
{% endhint %}

Checkout our guide [in-depth guide on configuring environments](../guides/namespaces.md) for more details.

## Summary

And that's the gist of it!

We encourage you to try adding Garden to your own project. You won't need to change any of your existing code or configuration, only sprinkle in some Garden config files to codify your workflows and you'll be going **from zero to a running system in a single command**.

And if you have any questions, don't hesitate to reach out to our [our Discord community](https://discord.gg/FrmhuUjFs6).
