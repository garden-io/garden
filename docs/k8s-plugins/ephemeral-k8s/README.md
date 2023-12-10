---
title: Ephemeral K8s Plugin Configuration
order: 4
---

# Ephemeral K8s Plugin Configuration

Garden Ephemeral Kubernetes clusters are meant for short-term use and to allow you to run and test your applications with Garden on a remote Kubernetes cluster. They are available for all users in our **Community Tier**.

Your ephemeral cluster is not shared with other Garden users, but due to its ephemeral nature, it is not suitable for production workloads. Ingress is secured by TLS and needs authentication via GitHub. That means your application will not be publicly available in the internet.

## Requirements

To use the ephemeral Kubernetes plugin, you'll need the following:

- Use Garden `>=0.13.14`
- Log in to the Garden dashboard at https://app.garden.io.
- Configure Ingress (optional)
- Retrieve Kubeconfig (optional). This is only relevant if you want to access the cluster with other tools than Garden e.g. kubectl.

## Usage quota

Each user is granted a maximum of **20 hours per month** of ephemeral cluster usage where each cluster has a maximum lifetime of **4 hours**. After this period, the cluster is automatically destroyed.

If you need to destroy the cluster before its maximum lifetime of 4 hours expires, you can do so by visiting your [dashboard](https://app.garden.io) and selecting the option to destroy the ephemeral cluster from there. This allows you to release resources and terminate the cluster when it's no longer needed.

## Limitations

As of today, the `ephemeral-kubernetes` provider has the following limitations:

- Local docker builds are currently not supported. In-cluster building with Kaniko is the only supported building method and it is configured by default at the provider level.
