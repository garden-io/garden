---
title: Jumpstart your Internal Developer Platform
order: 5
---

## Why use Garden to build your Internal Developer Platform (IDP)?

When developing microservices, the cognitive load for a new developer to a team or project is very high. Not only does a developer need to set up their developer environment with the tools and scripts they'll need to contribute, they also need to coordinate with other teams to pull in any remote microservices they may call when testing a new feature or API.

The stack might contain a pre-configured Helm chart for a database, Terraform modules for infrastructure, Kubernetes manifests for services, and more, that teams can compose together to suit their needs. With Garden, you define any number of resources as infrastructure-as-code and services, then deploy them as one group, with one command: `garden deploy`.

## Key features

- **Visualize your microservice stack**, centralize logs, and view command history with the [Garden dashboard](https://app.garden.io)
- **Pluggable repositories** with [remote sources](../../features/remote-sources.md)
- **Create re-usable templates** with [Config Templates](../../features/config-templates.md)

If you're already familiar with Garden and just want to get going, click any of the links above to set up your features.

Navigate to [Examples](#examples) for a selection of pre-configured stacks you can use to quickly explore relevant features.

## Resources

- Pull in any number of remote repositories to collaborate across teams by setting up [Remote Sources](../../features/remote-sources.md)
- Use [Config Templates](../../features/config-templates.md) to vend development environments to all your developers
- If you're coming from Docker Compose, visit our [Migrating From Docker Compose](../../guides/migrating-from-docker-compose.md) guide

## Further Reading

- [What is Garden](../../overview/what-is-garden.md)
- [Using the CLI](../../guides/using-the-cli.md)
- [Variables and Templating](../../features/variables-and-templating.md)
- [Adopting Garden](../../misc/adopting-garden.md)

## Examples

- [Remote sources example project](https://github.com/garden-io/garden/tree/0.14.14/examples/remote-sources)

- [kubernetes Deploy action type example with config templates](https://github.com/garden-io/garden/tree/0.14.14/examples/k8s-deploy-config-templates)
