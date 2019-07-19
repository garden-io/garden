# Using Garden

## [Development Workflows](./development-workflows.md)

In this article we discuss how to set up a new Garden project, the basic development workflow, how Garden's providers work, and the basics of testing and dependencies.

## [Configuration Files](./configuration-files.md)

This one is all about Garden's configuration files—an overview of project and module configs, setting up services, and a primer on tests.

## [Container Modules](./container-modules.md)

One of the most commonly used module types for Garden is the `container` module type. This guide walks through its usage and configuration.

## [Local Kubernetes](./local-kubernetes.md)

Garden works great with local Kubernetes setups. Here you'll find installation and usage instructions for some
common flavors of local Kubernetes setups, such as Minikube, Docker for Desktop and MicroK8s.

## [Remote Kubernetes](./remote-kubernetes.md)

Garden can also work smoothly with remote Kubernetes clusters. If you'd like to use a remote cluster, you may have some
additional considerations and requirements. Take a look at this guide for details.

## [In-cluster Building](./in-cluster-building.md)

One of Garden's most powerful features is the ability to build images in your Kubernetes development cluster, thus
avoiding the need for local Kubernetes clusters. This guide covers the requirements for in-cluster building and how
to set it up.

## [Cloud Provider Set-up](./using-helm-charts.md)

Instructions for creating and configuring Kubernetes clusters with GKE (Google), AKS (Azure), EKS and kops (AWS), and how to connect to them with Garden.

## [Using Helm charts](./using-helm-charts.md)

The [Helm](https://helm.sh/) package manager is one of the most commonly used tools for managing Kubernetes manifests. Garden supports using your own Helm charts, alongside your container modules. This guide shows you how to use 3rd-party (or otherwise external) Helm charts, as well as your own charts, in your Garden project. We also go through how to configure tests, tasks and hot-reloading for your charts.

## [Hot Reload](./hot-reload.md)

This article discusses how to use hot reloading, so that you can update running services on the fly as you make changes to their code, without losing state and without having to destroy and re-create containers.
