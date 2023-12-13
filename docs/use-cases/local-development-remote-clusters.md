---
title: Local Development With Remote Clusters
order: 1
---

## Why develop with remote clusters?

With other tools the complexity of replicating a production-like environment on your local machine is a developer experience that suffers from compromise. Setting up a remote Kubernetes cluster has meant a tangle of scripts, tools, and proxies that mock out the pains of running a remote cluster to make it feel like home.

Garden's first-class support for remote clusters eliminates the setup cost of manually setting up remote image builders, developer namespaces, and hot reload with short stanzas of YAML you can reuse and share among teammates. Garden supports complex topologies across any number of local or remote Kubernetes clusters or environments. With Garden for local development you can:

Garden creates a developer namespace inside a remote Kubernetes cluster that looks and feels just as if it was a local cluster. This means you can develop and test your applications in an environment that closely mimics your production environment, leading to fewer surprises when you deploy your application.

## Key features

- **Visualize your dependency graph**, centralize logs, and view command history with the [Garden dashboard](https://app.garden.io)
- **Proxy local services** with [Local Mode](../guides/running-service-in-local-mode.md)
- **Hot reload** your code to containers running in your local and remote Kubernetes clusters for a smooth inner loop with [Code Synchronization](https://docs.garden.io/guides/code-synchronization).
- **Run tests as you develop**. Stop waiting for CI/CD to tell you what's broken: run your integration and end-to-end tests as you develop, at any time, with `garden test` or, if you're inside the Garden dashboard, with `test`.
- **Accelerate build times** with [remote image builds](../k8s-plugins/guides/in-cluster-building.md) to accelerate your image build times
- **Spin up powerful [ephemeral clusters](../k8s-plugins/ephemeral-k8s/configure-provider.md)** in seconds

If you're already familiar with Garden and just want to get going, click any of the links above to set up your features.

Navigate to [Examples](#examples) for a selection of pre-configured stacks you can use to quickly explore relevant features.

## Prerequisites

Before you proceed, make sure you have gone through the following steps:

- [Installing Garden](../getting-started/installation.md)
- [Set up a local Kubernetes cluster](../k8s-plugins/local-k8s/configure-provider.md) _or_ use our [Ephemeral Clusters](../k8s-plugins/ephemeral-k8s/configure-provider.md)
- If you're coming from Docker Compose, visit our [Migrating From Docker Compose](../guides/migrating-from-docker-compose.md) guide

Setting up a remote Kubernetes environment for local development creates a developer namespace in a remote cluster. This namespace acts as a sandbox for your application, allowing you to test and develop without affecting other applications or services in the cluster.

## Next steps

Now that you've installed Garden and have a cluster configured, you'll progressively add features to make Garden the right fit for you.

- Build inside a powerful Kubernetes cluster with [In-Cluster Building](../k8s-plugins/guides/in-cluster-building.md)
- Set up hot reloading for a frustration-free inner loop with [Code Synchronization](../guides/code-synchronization.md)

## Troubleshooting

- Visit [Troubleshooting](../misc/troubleshooting.md)

{% hint style="info" %}
If you encounter any issues or bugs 🐛 in this seed, don't hesitate to join our [Discord community](https://go.garden.io/discord) 🌸 for access to Garden's dedicated Community Engineers and our AI chatbot 🤖  trained on our docs.
{% endhint %}

## Additional resources

- [How Garden Works](../overview/how-garden-works.md)
- [Configuration Overview](../using-garden/configuration-overview.md)
- [Using the CLI](../using-garden/using-the-cli.md)
- [Variables and Templating](../using-garden/variables-and-templating.md)
- [Adopting Garden](../overview/adopting-garden.md)

## Examples

- [Code Synchronization example project](https://github.com/garden-io/garden/tree/0.13.22/examples/code-synchronization)
- [Simple demo project using Ephemeral Cluster](https://github.com/garden-io/garden/tree/0.13.22/examples/ephemeral-cluster-demo)
- [Local mode for kubernetes action type](https://github.com/garden-io/garden/tree/0.13.22/examples/local-mode-k8s)
