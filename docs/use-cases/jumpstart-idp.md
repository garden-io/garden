---
title: Jumpstart your Internal Developer Platform
order: 3
---

## Why use Garden to build your Internal Developer Platform (IDP)?

When developing microservices, the cognitive load for a new developer to a team or project is very high. Not only does a developer need to set up their developer environment with the tools and scripts they'll need to contribute, they also need to coordinate with other teams to pull in any remote microservices they may call when testing a new feature or API.

Imagine vending self-contained, standardized stacks to your developers that help get them off the ground in seconds not days. This stack might contain a database, Kubernetes manifests defining an API, and a Helm chart containing the frontend. With Garden, you define any number of resources as infrastructure-as-code and services, then deploy them as one group, with one command: `garden deploy`.

## Key features

- **Visualize your microservice stack**, centralize logs, and view command history with the [Garden Web Dashboard](https://app.garden.io)
- **Pluggable repositories** with [remote sources](../advanced/using-remote-sources.md)
- **Create re-usable templates** with [Config Templates](../using-garden/config-templates.md)

If you're already familiar with Garden and just want to get going, click any of the links above to set up your features.

Navigate to [Examples](#examples) for a selection of pre-configured stacks you can use to quickly explore relevant features.

## Prerequisites

Before you proceed, make sure you have gone through the following steps:

- [Installing Garden](../getting-started/installation.md)
- [Set up a local Kubernetes cluster](../k8s-plugins/local-k8s/configure-provider.md) _or_ use our [Ephemeral Clusters](../guides/ephemeral-clusters.md)
- If you're coming from Docker Compose, visit our [Migrating From Docker Compose](../guides/migrating-from-docker-compose.md) guide

Setting up a remote Kubernetes environment for local development creates a developer namespace in a remote cluster. This namespace acts as a sandbox for your application, allowing you to test and develop without affecting other applications or services in the cluster.

## Next steps

Now that you've installed Garden and have a cluster configured, you'll progressively add features to make Garden the right fit for you.

- Pull in any number of remote repositories to collaborate across teams by setting up [Remote Sources](../advanced/using-remote-sources.md)
- Use [Config Templates](../using-garden/config-templates.md) to vend development environments to all your developers

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

- [Remote sources example project](https://github.com/garden-io/garden/tree/main/examples/remote-sources)

- [kubernetes Deploy action type example with config templates](https://github.com/garden-io/garden/tree/main/examples/k8s-deploy-config-templates)
