---
title: Ephemeral Kubernetes Clusters
order: 8
---

# Garden Ephemeral Kubernetes Clusters

{% hint style="warning" %}
This feature is still experimental and only available in Garden `>=0.13.14`. Please let us know if you have any questions or if any issues come up!
{% endhint %}

At Garden, we're committed to reducing the friction with getting started and trialing our tooling with your projects. To make Garden adoption more accessible and convenient, we've introduced **Ephemeral Kubernetes Clusters**. We designed this feature to provide you with a hassle-free way to explore Garden's capabilities on Kubernetes without needing to configure or provision a local or remote cluster.

The Ephemeral Kubernetes Clusters are provided for free to all users in our **Community Tier**. These clusters are meant for short-term use and to allow you to run and test your applications with Garden on a remote Kubernetes cluster.

You can add or remove ephemeral Kubernetes cluster easily via the `ephemeral-kubernetes` provider.

## Getting started

There are multiple example garden projects that are already configured and ready to go with Garden ephemeral clusters. Checkout our [quickstart guide](../getting-started/quickstart.md) or the [ephemeral-cluster-demo](https://github.com/garden-io/garden/tree/0.13.14/examples/ephemeral-cluster-demo) example on GitHub.
In the following steps you'll learn how to configure your own Garden projects to use the `ephemeral-kubernetes` provider.

### Step 1 - Configure the provider

 Add the `ephemeral-kubernetes` provider to your project configuration file and associate it with an environment. If you are starting a new project copy this file:

```yaml
apiVersion: garden.io/v1
kind: Project
name: my-project
environments:
  - name: ephemeral
providers:
  - name: ephemeral-kubernetes
    environments: [ephemeral]
```

### Step 2 -  Login to the Garden web dashboard

From your project root run:

```
garden login
```

### Step 3 - Deploy your project

To deploy your project run:
```
garden deploy --env ephemeral
```
Garden will automatically provision a temporary Kubernetes Cluster for your project and deploy your application to it. For information about usage quotas check [here](../k8s-plugins/ephemeral-k8s/manage-clusters.md#usage-quota-and-managing-clusters).

### Step 4 - Expose ingress (optional)

To access your application you need to expose it with an ingress. Each cluster is assigned its own unique hostname when created. To reference it in your ingress definition, consider this container action:

```yaml
kind: Deploy
name: frontend
description: Frontend service container
type: container
build: frontend
spec:
  ports:
    - name: http
      containerPort: 8080
  ingresses:
    - path: /
      port: http
      hostname: frontend.${providers.ephemeral-kubernetes.outputs.default-hostname}
```

The `ephemeral-kubernetes` provider outputs the dynamically created hostname for your cluster. You can reference this output in your Garden actions and Garden will print out your ingress links on deploy.
To apply the changes deploy again and visit your application in the browser via the provided link.

## Next Steps

To learn more about the `ephemeral-kubernetes` provider and its configuration options checkout the [full provider documentation](../k8s-plugins/ephemeral-k8s/README.md).
