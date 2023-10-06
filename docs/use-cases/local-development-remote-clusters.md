---
title: Local Development With Remote Clusters
order: 1
---

With other tools the complexity of replicating a production-like environment on your local machine is a developer experience that suffers from compromise. Setting up a remote Kubernetes cluster has meant a tangle of scripts, tools, and proxies that mock out the pains of running a remote cluster to make it feel like home.

Garden's first-class support for remote clusters eliminates the setup cost of manually setting up remote image builders, developer namespaces, and hot reload with short stanzas of YAML you can reuse and share among teammates. Garden supports complex topologies across any number of local or remote Kubernetes clusters or environments. With Garden for local development you can:

- Visualize your dependency graph, centralize logs, and view command history with the [Garden Web Dashboard](https://app.garden.io)
- Bridge any number of local and remote microservices with [Local Mode](../guides/running-service-in-local-mode.md)
- Take advantage of [remote image builds](../k8s-plugins/advanced/in-cluster-building.md) to accelerate your image build times
- Spawn [ephemeral clusters](../guides/ephemeral-clusters.md) in seconds to test a change or run a service in CI

If you're already familiar with Garden and just want to get going, click any of the links above to set up your features. Otherwise join us for a step-by-step how-to below the break.

## Getting started

This environment creates a developer namespace and functions just as if it was a local cluster. This means you can develop and test your applications in an environment that closely mimics your production environment, leading to fewer surprises when you deploy your application.

Before you proceed, make sure you have gone through the following steps:

- [Installing Garden](../getting-started/installation.md)
- You [Bring-Your-Own-Cluster](../k8s-plugins/remote-k8s/configure-provider.md) OR use our [Ephemeral Clusters](../guides/ephemeral-clusters.md)

Setting up a remote Kubernetes environment for local development involves creating a developer namespace in a remote cluster. This namespace acts as a sandbox for your application, allowing you to test and develop without affecting other applications or services in the cluster.
