---
title: Garden Basics
order: 2
---

Garden is a powerful tool but the basic concepts are quite simple. We highly recommend that you spend a few minutes reading through this guide to grasp them. If you do that, everything else that follows should feel quite intuitive.

## Anatomy of a Garden project

Every Garden project has the same structure: A project configuration and one or more actions.

As a convention, the project configuration is in a file called `project.garden.yml`, typically at the root of a given repo. A simple project configuration looks like this:

```yaml
# In project.garden.yml
apiVersion: garden.io/v2
kind: Project
name: my-project
environments:
  - name: dev
  - name: ci
```

This is also where you configure your _providers_. Providers are what enables you to use different action types. You e.g. need the `kubernetes` provider to use Helm actions.

So if you're using Garden to deploy to a Kubernetes cluster, you'd add the `kubernetes` or `local-kubernetes` provider configuration here. For example:


```yaml
# In project.garden.yml
apiVersion: garden.io/v2
kind: Project
name: my-project
environments:
  - name: dev
  - name: ci

providers:
  - name: local-kubernetes
    environments: [dev]
  - name: kubernetes # <--- Use a remote K8s cluster in CI
    environments: [ci]
    context: my-ctx
```

Garden projects also have one or more _actions_. These actions can be spread across the repo in their own config files, often located next to the thing they describe. A common way to structure a project is like this:

<figure>
  <picture>
    <source
      srcset="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/project-structure-file-tree-dark.png"
      media="(prefers-color-scheme: dark)"
    />
    <img
      src="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/project-structure-file-tree.png"
      alt="Garden project structure"
    />
  </picture>
  <figcaption>Garden project structure</figcaption>
</figure>

Note that Garden is very flexible and will work with whatever structure you currently have. It even works across git repositories! You can e.g. have your service source code in one repo and manifests in another. Or have your micro services split across multiple repos.

## Anatomy of a Garden action

Actions are the building blocks of a Garden project and describe how a given part of your system is built, deployed, or tested.

Every Garden action has the same common fields like `kind`, `name`,`type`, and a `spec` field that is specific to the action type.

**The type tells Garden how to execute it**. Garden will know to build `container` actions, install `helm` actions, apply `terraform` actions, and so on.

<figure>
  <picture>
    <source
      srcset="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/anatomy-of-action-dark.png"
      media="(prefers-color-scheme: dark)"
    />
    <img
      src="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/anatomy-of-action.png"
      alt="The anatomy of an action"
    />
  </picture>
  <figcaption>The anatomy of an action</figcaption>
</figure>


The true power of Garden lies in the fact that actions can depend on one another and reference outputs from other actions. Here's an example:

```yaml
apiVersion: garden.io/v2
kind: Project
name: my-project
environments: # <--- Specifying environments is required
  - name: dev
---
kind: Run
name: say-hello
type: exec
spec:
  command: ["echo", "Hello ${local.username}"]
---
kind: Run
name: say-what
type: exec
dependencies: [run.say-hello]
spec:
  command: ["echo", "Action say-hello says: '${actions.run.say-hello.outputs.log}'"]
```

If you now run:

```console
garden run say-what
```

...Garden will first run the `say-hello` action (because `say-what` depends on it) and then the `say-what` action which prints the output from `say-hello`:

```sh
Action say-hello says: 'Hello gardener'
```

**And that is essentially the core concept: Actions run in dependency order and can reference the output from each other.**

This is obviously a contrived example where we're using an action that just runs scripts. For real world projects these actions could be **containers, Helm charts and even entire Terraform stacks**. You tell Garden the "type", and it'll know how to execute it. That's how these simple concepts can be used to build very complex automations.

## Benefits

The example above that just runs simple scripts is pretty trivial but this same pattern allows you to build, deploy and test a system of any complexity in a single command. With a single Garden command you could for example:

- provision an ephemeral K8s cluster via Terraform and pass the output to other actions;
- then build and deploy all your services into an isolated environment in that cluster;
- then run your integration and end-to-end tests before tearing things down again.

You can add this command to a CI job, and just as easily run it from your laptop. You can also create re-usable config templates that you can share with your team.

Garden does more than just run the actions and interface with providers. It builds your containers faster thanks to our Remote Container Builder and caches the results of actions so that they don't run unless they have to, significantly speeding up the execution time.

The gif below shows the test caching in action:

![Run a test that passes then run it again. Note that the second time it's cached.](https://github.com/garden-io/garden/assets/5373776/978db934-6728-430d-aa24-56b1b5b6fd4a)

## Wrapping up

Don't worry too much about the different action kinds and types, we have plenty of examples to help you pick the right one. Just know that you can model a system of any complexity with this pattern, even if it's components are spread across multiple repos.

And if you have any questions, feel free to open an issue on Github or ping us on [Discord](https://go.garden.io/discord).
