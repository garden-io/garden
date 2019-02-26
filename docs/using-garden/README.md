# Using Garden

## [Features and usage](./features-and-usage.md)

In this article we discuss how to start a new project with `garden create`, the basic development workflow, how Garden's providers work, and the basics of testing and dependencies.

## [Configuration files](./configuration-files.md)

This one is all about Garden's configuration files. The difference between project and module configs, some significant specific fields, setting up services, and a primer on tests.

## [Remote Clusters](./remote-clusters.md)

Most of the time we want to develop locally, with our project running in Minikube or Docker. If you'd like to use a remote cluster though, check out this guide.

## [Hot Reload](./hot-reload.md)

This article discusses how to use hot reloading, so that you can update running services on the fly as you make changes to their code, without losing state and without having to destroy and re-create your container.

## [Using Helm charts](./using-helm-charts.md)

The [Helm](https://helm.sh/) package manager is one of the most commonly used tools for managing Kubernetes manifests. Garden supports using your own Helm charts, alongside your container modules. This guide shows you how to use 3rd-party (or otherwise external) Helm charts, as well as your own charts in your Garden project. We also go through how to configure tests, tasks and hot-reloading for your charts.

## [Using a custom ingress controller](./custom-ingress-controller.md)

Via the [Helm module type](https://docs.garden.io/reference/module-types/helm), Garden supports arbitrary Kubernetes objects. One application of this functionality is the ability to set up a custom ingress controller. In this guide, we show you how to use the [Ambassador API Gateway](https://www.getambassador.io/) instead of the default Nginx ingress controller.