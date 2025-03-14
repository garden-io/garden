---
title: Basics
order: 1
---

Garden is a powerful tool but the basic concepts are quite simple. We highly recommend that you spend a few minutes reading through this guide to grasp them. If you do that, everything else that follows should feel quite intuitive.

## Anatomy of a Garden project

Every Garden project has the same structure: A project configuration and one or more actions.

As a convention, the project configuration is in a file called `project.garden.yml`, typically at the root of a given repo. A simple project configuration looks like this:

```yaml
# In project.garden.yml
kind: Project
name: my-project
environments:
  - name: dev
  - name: ci
```

This is also where you configure your _providers_. Providers are basically what enables you to use different action types. You e.g. need the `kubernetes` provider to use Helm actions.

So if you're using Garden to deploy to a Kubernetes cluster, you'd add the `kubernetes` or `local-kubernetes` provider configuration here. For example:


```yaml
# In project.garden.yml
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

Similarly you can add your Terraform and Pulumi configuration here.

Garden projects also have one or more actions. These actions can be spread across the repo in their own config files, often located next to the thing they describe. A common way to structure a project is like this:

```
.
├── api
│   ├── garden.yml
│   └── src
├── frontend
│   ├── garden.yml
│   └── src
├── package.json
└── project.garden.yml
```

Actions can also be pulled in from other git repos. So a single Garden project can essentially tie together all the repos in your organisation.

## Anatomy of a Garden action

Every Garden action has the same common fields like `kind`, `name` and `type`—and a `spec` field that is specific to the action type:

<figure>
  <picture>
    <source
      srcset="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/anatomy-of-action-dark.png"
      media="(prefers-color-scheme: dark)"
    />
    <img
      src="https://public-assets-for-docs-site.s3.eu-central-1.amazonaws.com/anatomy-of-action.png"
      alt="GitHub logo"
    />
  </picture>
  <figcaption>The anatomy of an action</figcaption>
</figure>

The true power of Garden lies in the fact that actions can depend on one another and reference outputs from other actions. A simple but complete Garden project demonstrating this looks like this:

```yaml
apiVersion: garden.io/v2
kind: Project
name: my-project
environments:
  - name: dev
---
kind: Run
name: say-hello
type: exec
spec:
  command: ["echo", "Hello from A"]
---
kind: Run
name: repeat-say-hello
type: exec
dependencies: [run.run-a]
spec:
  command: ["echo", "Action run-a says: '${actions.run.run-a.outputs.log}'"]
```

If you run `garden run repeat-say-hello` in this project it'll first run action `say-hello` (because `repeat-say-hello` depends on it) and then action `repeat-say-hello` which prints the output from `say-hello`.

**And that is essentially the core concept: Actions run in dependency order and can reference the output from each other.**

This is obviously a contrived example where we're using the `exec` action which just runs scripts on the host. For real world projects these actions could be containers, Helm charts and even entire Terraform stacks. So these simple concepts can be used to build very complex automations.

## But why?

The example above that just runs simple scripts is pretty trivial but this same pattern allows you to build, deploy and test a system of any complexity in a single command. With a single Garden command you could for example:

- provision an ephemeral K8s cluster via Terraform and pass the output to other actions;
- then build and deploy all your services into an isolated environment in that cluster;
- then run your integration and end-to-end tests.

And Garden will take care of dealing with Terraform and Kubernetes.

You can add this command to a CI job, and just as easily run it from your laptop. You can also create re-usable action configs that you can share with your team.

Garden does more than just run the actions and interfacing with providers. It builds your containers faster thanks to our Remote Container Builder and caches the results of actions so that they don't run unless they have to, dramatically speeding up the execution time.

The gif below shows the test caching in action:

![Run a test that passes then run it again. Note that the second time it's cached.](https://github.com/garden-io/garden/assets/5373776/978db934-6728-430d-aa24-56b1b5b6fd4a)

## Wrapping up

For now, don't worry too much about the different action kinds and types. Just know that you can model a system of any complexity with this pattern, even if it's components are spread across multiple repos.

Now that you understand the basic concept, check out our Recipes section which contains a lot of examples you can pull directly into your project.

And if you don't find you're looking for, feel free to open an issue on Github or ping us on [Discord](https://go.garden.io/discord).
