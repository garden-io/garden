[![CircleCI](https://circleci.com/gh/garden-io/garden/tree/master.svg?style=svg&circle-token=ac1ec9984d093f91e594e5a0a03b34cec2c2a093)](https://circleci.com/gh/garden-io/garden/tree/master)

<p align="center">
  <img src="docs/logo.png" width="50%">
</p>

Garden is a _development orchestrator_ for Kubernetes, containers and functions, designed to make it easy to rapidly develop and test multi-service systems.

It is centered around the **[Stack Graph](https://docs.garden.io/basics/stack-graph)**, which allows you to fully codify how each part of your stack is built, deployed and tested—making your workflow reproducible and portable.

<p align="center">
  <img src="docs/stack-graph.png" width="60%">
</p>

With the Stack Graph, each part of your stack can _describe itself_ using simple, intuitive declarations, without changing any of your code. Garden collects all of your declarations—even across multiple repositories—into a full graph of your stack, and leverages that information to **dramatically improve your developer experience**.

> _If you’re using Garden or if you like the project, please ★ star this repository to show your support 💖_

## Key features

- Spin up your whole stack with a single command, and (optionally) watch for changes. Because of the Stack Graph, only what's needed gets re-built, re-deployed, and/or re-tested, so you get a **much faster feedback loop**.
- Easily write [integration test suites](https://docs.garden.io/using-garden/features-and-usage#testing-and-dependencies) that have runtime dependencies. Run tests before pushing your code to CI, and avoid having to mock or stub your own services.
- Define [tasks](https://github.com/garden-io/garden/tree/v0.9.11/examples/tasks) that run as part of your deployment process—e.g. database migrations or scaffolding.
- [Hot reload](https://docs.garden.io/using-garden/hot-reload) lets you near-instantaneously update code and static files in containers as they run, for services that support in-place reloading.
- [Remote sources](https://docs.garden.io/examples/remote-sources) support allows your project to automatically pull code from different repositories.
- The built-in web **dashboard** gives you a full overview of your stack (and many more UI features are planned to further aid with development).
- Build, test and deploy Docker containers, [Helm charts](https://docs.garden.io/using-garden/using-helm-charts), OpenFaaS functions and more.
- An extensible plug-in system ensures you'll later be able add anything that's not on this list, or create custom module types tailored to your needs (_due in April 2019_).
- _Enterprise version only_: In-cluster building and image caching for Kubernetes. Please [reach out](https://garden.io#request-demo) to learn more!

_Note: The project is in beta. APIs may still change slightly across  versions, and some features are still experimental._

![Dashboard](docs/dashboard.gif)

## Quick start

Head over to the [Basics](https://docs.garden.io/basics) section in our documentation for details
on how to set up and use Garden, or look through our [Simple Project](https://docs.garden.io/examples/simple-project)
guide for a brief introduction to how it works.

## Documentation

You can find Garden's full documentation at [https://docs.garden.io](https://docs.garden.io/).

Overview:

- [Basics](https://docs.garden.io/basics)—installation instructions, our quick start guide, and an overview of the main concepts around Garden.
- [Using Garden](https://docs.garden.io/using-garden)—features and usage, Garden configuration files, usage with remote clusters, and setting up hot reload.
- [Example Projects](https://docs.garden.io/examples)—guides based on some of the [examples](https://github.com/garden-io/garden/tree/v0.9.11/examples).
- [Reference](https://docs.garden.io/reference)—glossary, commands reference, configuration files reference, and template strings reference.
- [FAQs](https://docs.garden.io/faqs).

## Examples

The [examples](https://github.com/garden-io/garden/tree/v0.9.11/examples) folder of our repository shows a myriad of different ways to use Garden.

For written guides based on some of these examples, check out the [examples section](https://docs.garden.io/examples) of our documentation.

Here are a few simple examples of Garden configuration files:

```yaml
kind: Module
type: helm
name: redis
description: Redis service for message queueing
chart: stable/redis
version: 6.4.3
```

```yaml
kind: Module
type: openfaas
name: hello-function
description: My OpenFaaS function
lang: node
```

```yaml
kind: Module
type: container
name: go-service
description: Go service container
services:
  - name: go-service
    ports:
      - name: http
        containerPort: 80
    ingresses:
      - path: /hello-go
        port: http
tests:
  - name: integ
    command: [./test]
    dependencies: [my-other-service]
```

Please browse our [examples directory](https://github.com/garden-io/garden/tree/v0.9.11/examples) for full project configurations and further context.

## Support

Please join the Garden [Slack workspace](http://chat.garden.io) to ask questions, discuss how Garden might fit into your workflow, or just chat about all things DevOps.

## Acknowledgements

Garden would not be possible without an amazing ecosystem of open-source projects. Here are some of the projects that Garden uses, either directly or indirectly:

- [Kubernetes](https://kubernetes.io/)
- [OpenFaaS](https://www.openfaas.com/)
- [TypeScript](https://www.typescriptlang.org/)
- [Golang](https://golang.org/)
- [Moby](https://github.com/moby/moby)
- [Helm](https://helm.sh/)

Garden, as a company, is also a proud member of the [CNCF](https://www.cncf.io/).

## License

Garden is licensed according to [Mozilla Public License 2.0 (MPL-2.0)](LICENSE.md).
