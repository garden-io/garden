---
title: Start a Free Kubernetes Cluster
order: 4
---

# Ephemeral Kubernetes Clusters

{% hint style="warning" %}
This feature is still experimental. Please let us know if you have any questions or if any issues come up!
{% endhint %}

At Garden, we're committed to reducing the friction with getting started and trialing our tooling with your projects. To make Garden adoption more accessible and convenient, we've introduced **Ephemeral Kubernetes Clusters**. We designed this feature to provide you with a hassle-free way to explore Garden's capabilities on Kubernetes without needing to configure or provision a local or remote cluster.

The Ephemeral Kubernetes Clusters are provided for free to all users in our **Community Tier**. These clusters are meant for short-term use and to allow you to run and test your applications with Garden on a Kubernetes remote cluster.

## Usage quota and managing clusters

Each user is granted a maximum of **20 hours per month** of ephemeral cluster usage where each cluster has a maximum lifetime of **4 hours**. After this period, the cluster is automatically destroyed.

If you need to destroy the cluster before its maximum lifetime of 4 hours expires, you can do so by visiting [Garden Cloud](https://app.garden.io) and selecting the option to destroy the ephemeral cluster from there. This allows you to release resources and terminate the cluster when it's no longer needed.

## Configuring your projects to use ephemeral Kubernetes cluster

To get started with Ephemeral Kubernetes Clusters, follow these steps:

1. Login to Garden Cloud by running `garden login` from your project root.
2. Configure the `ephemeral-kubernetes` provider in your project's configuration file. Here's an example configuration:

```yaml
providers:
  - name: ephemeral-kubernetes
    environments: [remote]

```
In the above configuration, we configure `ephemeral-kubernetes` for the `remote` environment.

## Deploy your project on ephemeral cluster

Once the provider is configured, you can deploy your project using the Garden CLI by running the following command:

```
garden deploy --env remote
```

Garden will automatically provision an Ephemeral Kubernetes Cluster for your project and deploy your application to it.

## Ingresses

Ephemeral Kubernetes Clusters fully support ingresses and each cluster is assigned its own unique default hostname dynamically when created.

The ingress URLs are not publicly accessible and require authentication via GitHub. To preview an ingress URL, you need to authenticate with GitHub and authorize the "Garden Ephemeral Environment Previews" app.

The first time you attempt to preview an ingress URL, you will be automatically redirected to GitHub for authorization of the "Garden Ephemeral Environment Previews" app. This is a one-time step, and subsequent ingress previews won't require reauthorization, ensuring a seamless experience as long as you remain logged into GitHub.

{% hint style="info" %}
Ingress URLs can only be previewed by the user who was logged in to Garden Cloud when a deployment was done using the ephemeral-kubernetes provider.
{% endhint %}

## Referring to the dynamic hostname in your Garden configs

If you want to refer to the hostname that is assigned dynamically when the cluster is created, you can refer to that using the output `${providers.ephemeral-kubernetes.outputs.default-hostname}`. This can be useful if, for example, you want to expose an ingress on a subdomain of the default hostname.

For example, if you wish to expose `api` on `api.<default-hostname>`, you can use the following configuration for ingresses:

```yaml
....
ingresses:
    - path: /
      port: http
      hostname: api.${providers.ephemeral-kubernetes.outputs.default-hostname}
```

## Accessing the ephemeral cluster via kubeconfig

Once your ephemeral cluster is created, the kubeconfig file for that cluster is stored on your local machine. The path to the kubeconfig file is shown in the logs when you deploy your project using Garden and looks like following:
```
kubeconfig for ephemeral cluster saved at path: /garden/examples/ephemeral-cluster-demo/.garden/ephemeral-kubernetes/<cluster-id>-kubeconfig.yaml
```

This kubeconfig file allows you to interact with the cluster using `kubectl` or other Kubernetes tools.

## Limitations

As of today, the ephemeral-kubernetes provider has the following limitations:

- Local docker builds are currently not supported. In-cluster building with Kaniko is the only supported building method and it is configured by default at the provider level.

## Example projects using the `ephemeral-kubernetes` provider

To demonstrate the use of the `ephemeral-kubernetes` provider, we have added an example project: [ephemeral-cluster-demo](https://github.com/garden-io/garden/tree/main/examples) under our examples collection. Check out the `ephemeral-cluster-demo` example and README at:
<!-- todo add example link once example is merged: https://github.com/garden-io/garden/tree/main/examples/ephemeral-cluster-demo -->


