---
title: 1. Create a Cluster
order: 1
---

# 1. Create a Cluster

First things first, you'll need a Kubernetes cluster you can deploy to.

At the end of this step you should have the context of your Kubernetes cluster at hand.

You should also have permissions to create namespaces in your cluster, and to create Deployments, Daemonsets, Services, and Ingresses within the namespaces.

Below you'll find basic guides for some common cloud providers:

* [AWS](./aws.md)
* [GCP](./gcp.md)
* [Azure](./azure.md)

Let us know on [our Discord community](https://discord.gg/FrmhuUjFs6) if you'd like guides for more providers.

Note that there are multiple ways to create Kubernetes clusters (e.g. point-and-click, Terraform, Pulumi, etc) and feel free to pick whatever approach you're most comfortable with.

As long as you have a cluster and are able to perform basic operations on it with kubectl, you should be good to go.
