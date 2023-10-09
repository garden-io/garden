---
title: Portable CI Pipelines that Run Anywhere
order: 2
---

## Why portable pipelines?

No one dislikes the git commit, push, wait loop more than your developers waiting for CI/CD to finish a run. With average run times of 15 minutes, per run, that's significant hours, days and years of productivity lost waiting. Compounding these problems, available CI runners may be limited, so now fresh code needs to queue behind other commits.

With Garden you:

- Use the same tool and the same set of commands for the entire development cycle, from source to finish: on a developer's workstation, your CI runner, wherever!
- Because Garden knows your entire dependency graph, there's no need to change your CI configuration on updates to your architecture.
- A minimum of dependencies: it's just the Garden CLI. In CI, you can use our [Garden Action](https://github.com/marketplace/actions/garden-action) or [ready-to-run container images](../reference/dockerhub-containers.md).
- When using [in-cluster building](../k8s-plugins/advanced/in-cluster-building.md) your CI also uses the same build and test result cache as you and your team, which makes for a much faster pipeline.

## Key features

- **Encode once, run anywhere**: [Garden's Workflows](../using-garden/workflows.md) can be run from any environment, including local machines, CI servers, and cloud environments.
- **Visualize your CI/CD flow**: Use the [Garden Web Dashboard](https://app.garden.io) to visualize your CI/CD pipeline, view logs, and track command history.
- **Accelerate build times**: With [remote image builds](../k8s-plugins/advanced/in-cluster-building.md), spend less time waiting on your CI runners to build your images.
- **Test in ephemeral environments**: Use [ephemeral clusters](../guides/ephemeral-clusters.md) to test changes or run services in CI.

If you're already familiar with Garden and just want to get going, click any of the links above to set up your features.

We also have a [ready-to-deploy example using our ephemeral clusters](https://github.com/garden-io/garden/tree/main/examples/ephemeral-cluster-demo) if you just want to see the code.

Otherwise, join us for a step-by-step how-to below the break.

## Prerequisites

This environment creates a developer namespace and functions just as if it was a local cluster. This means you can develop and test your applications in an environment that closely mimics your production environment, leading to fewer surprises when you deploy your application.

Before you proceed, make sure you have gone through the following steps:

- [Installing Garden](../getting-started/installation.md)
- You [Bring-Your-Own-Cluster](../k8s-plugins/remote-k8s/configure-provider.md) _or_ use our [Ephemeral Clusters](../guides/ephemeral-clusters.md)
- If you're coming from Docker Compose, visit our [Migrating From Docker Compose](../guides/migrating-from-docker-compose.md) guide

Setting up a remote Kubernetes environment for local development creates a developer namespace in a remote cluster. This namespace acts as a sandbox for your application, allowing you to test and develop without affecting other applications or services in the cluster.

## Next steps

Now that you've installed Garden and have a cluster configured, you'll progressively add features to make Garden the right fit for you.

- [In-Cluster Building](../k8s-plugins/advanced/in-cluster-building.md)
- [Code Synchronization](../guides/code-synchronization.md)
- [Running Services in Local Mode](../guides/running-service-in-local-mode.md)

## Troubleshooting

## Additional resources

- [Configuration Overview](../using-garden/configuration-overview.md)
- [Using the CLI](../using-garden/using-the-cli.md)
- [Variables and Templating](../using-garden/variables-and-templating.md)
