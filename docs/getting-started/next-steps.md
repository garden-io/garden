---
title: Next Steps
order: 4
---

# Next Steps

If you've kicked the tires with the [Quickstart guide](./quickstart.md) you've seen how Garden lets you **spin up production-like environments for development, testing, and CI—with blazing fast caching**.

Now is the time to set up Garden for your own project to get these benefits and more.

This guide describes the main steps involved. It's meant as a roadmap for the configuration process with links to more in-depth resources. The configuration snippets are mostly for demonstration purposes to help you understand how your config evolves.

For a more high level guide of adopting Garden in your organization, check out our [Adopting Garden guide](../misc/adopting-garden.md).

## Step 1 — Create a project

The first thing you need to do is to create a project level Garden config file at the root of your project, typically called `garden.yml` or `project.garden.yml`.

Here's a simple example:

```yaml
# At the root of your project
apiVersion: garden.io/v2
kind: Project
name: my-project

environments: # <--- Every Garden project has one more environments
  - name: local
  - name: ci
```

## Step 2 — Configure Kubernetes provider

{% hint style="info" %}
Here we're assuming you're using Garden for Kubernetes workflows which is the most common use case. But you can also start with the [Terraform](../garden-for/terraform/configure-provider.md) or [Pulumi](../garden-for/pulumi/configure-provider.md) providers.
{% endhint %}

Next you need to tell Garden how to connect to your Kubernetes cluster by adding the relevant `provider` configuration to your project-level config file.

You can use [the local Kubernetes provider](../garden-for/kubernetes/local-kubernetes.md) if you have Kubernetes installed locally and [the Kubernetes provider](../garden-for/kubernetes/remote-kubernetes.md) for remote clusters (see config details in links).

At that point, your configuration will look something like this:

```yaml
# At the root of your project
apiVersion: garden.io/v2
kind: Project
name: my-project

environments:
  - name: local
  - name: ci

providers:
 - name: local-kubernetes
   environments: [local]
 - name: kubernetes
   environments: [ci]
   context: my-k8s-ctx
   # ...
```

## Step 3 — Add actions

Once you've configured your provider, it's time to add actions.

Actions are the basic building blocks that make up your Garden project. The different action types determine how they're executed.

For example, you can use the `container` Build action and the `kubernetes` or `helm` Deploy actions to build and the deploy a given service.


We recommend putting each action in its own `garden.yml` file and locating it next to any source files.

{% hint style="info" %}
Garden actions and their configuration can be spread across different files and even [across multiple git repos](../features/remote-sources.md).
{% endhint %}

Here's a simple example with actions for deploying an ephemeral database and an API server, and a Test action for running integration tests:

```yaml
# In db/garden.yml
kind: Deploy
name: db
type: helm
description: Install Postgres via Helm
spec:
  chart:
    name: postgresql
    repo: https://charts.bitnami.com/bitnami
    version: "11.6.12"
---
kind: Run
name: db-init
type: container
description: Seed the DB after it's been deployed
dependencies: [deploy.db]
spec:
  image: postgres:11.6-alpine
  command: ["/bin/sh", "db-init-script.sh"]

# In api/garden.yml
kind: Build
name: api
type: container
description: Build the api image
---
kind: Deploy
name: api
type: kubernetes
description: Deploy the api after its been built and the DB seeded
dependencies: [build.api, run.db-init]
spec:
  manifestFiles: [ api-manifests.yml ]
---
kind: Test
name: api-integ
type: container
description: Integration testing the api after its been deployed
dependencies: [build.api, deploy.api]
spec:
  image: ${actions.build.api.outputs.deploymentImageId}
  command: [./integ-tests.sh]
```

Depending on the size of your project, you may want to add a handful of actions to get started and then gradually add more as needed.

Once that's done, you can deploy your project to a production-like environment with:

```console
garden deploy
```

Similarly, you can run your integration or end-to-end tests in a production-like environment with:

```console
garden test
```

## Step 4 — Add more environments and providers

At this point, you should be able to deploy and test your project from your laptop in a single command with the Garden CLI.

Next step is to add more environments so you can e.g. create preview environments in your CI pipeline for every pull request.

You may also want to add our Terraform or Pulumi plugins if you're using those tools, following the same process as in step 2 and step 3 above.

Garden also lets you define variables and use templating to ensure the environments are configured correctly. Below is how you commonly configure environments with dynamic templating:

```yaml
# At the root of your project
apiVersion: garden.io/v2
kind: Project
name: my-project

environments:
  - name: local
  - name: dev
    defaultNamespace: my-project-dev-${kebabCase(local.username)} # <--- Ensure each developer has a unique namespace
  - name: ci
    defaultNamespace: my-project-ci-${git.commitHash} # <--- Ensure each CI run is in a unique namespace
    variables:
      hostname: ${git.commitHash}.my-company.com # <--- Ensure CI test environments are isolated by templating in the commit hash
  - name: staging
    variables:
      hostname: staging.my-company.com

providers:
  - name: local-kubernetes
    environments: [local]
  - name: kubernetes
    environments: [dev, ci]
    namespace: ${enironment.namespace} # <--- This is the defaultNamespace we configured above
    context: my-ci-cluster
    # ...
  - name: kubernetes
    environments: [staging]
    namespace: staging
    context: my-staging-cluster
    # ...
  - name: terraform # <--- Use the Terraform plugin for the staging environment to provision cloud managed services
    environments: [staging]

# In api/garden.yml
kind: Deploy
name: api
type: kubernetes
spec:
  manifestFiles: "[path/to/your/${environment.name}/k8s/manifests]" # <--- Pick manifests based on env
```

Now, you can create preview environments on demand from your laptop with:

```console
garden deploy --env dev
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

And if you have any questions, don't hesitate to reach out on [Garden Discussions](https://github.com/garden-io/garden/discussions).
