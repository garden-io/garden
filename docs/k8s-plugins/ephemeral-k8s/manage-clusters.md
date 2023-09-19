---
title: 3. Manage ephemeral clusters
order: 3
---

## Accessing a cluster via kubeconfig

Once your ephemeral cluster is created, the kubeconfig file for that cluster is stored on your local machine. The path to the kubeconfig file is shown in the logs when you deploy your project using Garden and looks like the following:
```
kubeconfig for ephemeral cluster saved at path: /garden/examples/ephemeral-cluster-demo/.garden/ephemeral-kubernetes/<cluster-id>-kubeconfig.yaml
```

This kubeconfig file allows you to interact with the cluster using `kubectl` or other Kubernetes tools.

## Usage quota and managing clusters

Each user is granted a maximum of **20 hours per month** of ephemeral cluster usage where each cluster has a maximum lifetime of **4 hours**. After this period, the cluster is automatically destroyed.

If you need to destroy the cluster before its maximum lifetime of 4 hours expires, you can do so by visiting your [web dashboard](https://app.garden.io) and selecting the option to destroy the ephemeral cluster from there. This allows you to release resources and terminate the cluster when it's no longer needed.

## Security

Your ephemeral cluster is not shared with other Garden users, but due to its ephemeral nature, it is not suitable for production workloads. Ingress is secured by TLS and needs authentication via GitHub. That means your application will not be publicly available in the internet.

## Limitations

As of today, the `ephemeral-kubernetes` provider has the following limitations:

- Local docker builds are currently not supported. In-cluster building with Kaniko is the only supported building method and it is configured by default at the provider level.