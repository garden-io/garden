---
title: Kubernetes
order: 2
---

You can use Garden with a local or a remote Kubernetes cluster. First you need to tell Garden how to connect to your cluster by following either of these guides:

- [Using remote Kubernetes](./remote-kubernetes.md)
- [Using local Kubernetes](./local-kubernetes.md)

You can then add actions for deploying K8s resources, installing Helm charts, running tests and more. Below is a overview of the actions with links to more resources:

- [The `kubernetes` Deploy action](./deploy-k8s-resource.md) – Use this action if you already have Kubernetes manifests for some of the workloads you want to deploy and/or if you're using Kustomize.
- [The `helm` Deploy action](./install-helm-chart.md)—Use this action if you're using Helm and have the corresponding Helm charts.
- [The `kubernetes-pod` Test/Run action](./run-tests-and-tasks.md) – Use this if you already have the corresponding Kubernetes manifests and want to run the test/run command in a dedicated Pod that gets cleaned up after the run.
- [The `kubernetes-pod` Test/Run action](./run-tests-and-tasks.md) – Use this action for running tests/tasks if you already have Kubernetes manifests and want to run the test/run command in an already deployed Kubernetes Pod. This is faster than (potentially) waiting for an image build and for a new Pod being created and is a good choice for e.g. running tests while iterating during development.
- [The `kubernetes-pod` Test/Run action](./run-tests-and-tasks.md) – Use this action for running test/tasks if you have the corresponding Helm charts.

## How it works

Under the hood, Garden uses the Kubernetes API and kubectl to interact with your Kubernetes cluster.

Typically, each developer will have their own isolated Kubernetes Namespace. Similarly, CI tests and preview environments are isolated via Namespaces, although this is all configurable.

For tests and tasks, Garden spins up Pods from the respective image that execute the task.

For live code synchronization, Garden uses a tool called Mutagen to sync changes to the running container.

There's a lot more to the Kubernetes plugins and if you're interested in the "nitty-gritty", we're more than happy to answer questions us on [Garden Discussions](https://github.com/garden-io/garden/discussions).
