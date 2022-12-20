---
title: Kubernetes
order: 1
---

# Kubernetes

Garden has two Kubernetes plugins:

- The `local-kubernetes` plugin is for local installations of Kubernetes such as Minikube or Docker for Desktop.
- The `kubernetes` plugin works with any Kubernetes cluster.

The following pages detail step-by-step how to get started using either plugin. You can skip any steps you may have already performed.

## How it works

Under the hood, Garden uses the Kubernetes API and kubectl to interact with your Kubernetes cluster.

Typically, each developer will have their own isolated Kubernetes Namespace. Similarly, CI tests and preview environments are isolated via Namespaces, although this is all configurable.

For tests and tasks, Garden spins up Pods from the respective image that execute the task.

For hot reloading, Garden uses a tool called Mutagen to sync changes to the running container.

There's a lot more to the Kubernetes plugin and if you're interested in the "nitty-gritty", we're more than happy to answer questions us on our [Discord channel](https://discord.gg/gxeuDgp6Xt).
