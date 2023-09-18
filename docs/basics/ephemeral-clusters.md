---
title: Start a Free Kubernetes Cluster
order: 4
---

# Garden Managed Kubernetes Clusters

{% hint style="warning" %}
This feature is still experimental and only available in Garden `>=0.13.14`. Please let us know if you have any questions or if any issues come up!
{% endhint %}

At Garden, we're committed to reducing the friction with getting started and trialing our tooling with your projects. To make Garden adoption more accessible and convenient, we've introduced **Ephemeral Kubernetes Clusters**. We designed this feature to provide you with a hassle-free way to explore Garden's capabilities on Kubernetes without needing to configure or provision a local or remote cluster.

The Ephemeral Kubernetes Clusters are provided for free to all users in our **Community Tier**. These clusters are meant for short-term use and to allow you to run and test your applications with Garden on a remote Kubernetes cluster.

You can add or remove Garden managed clusters easily via the `garden-kubernetes` provider.

## Getting started

There are a lot of example garden projects that are already configured and ready to go with Garden managed clusters. Checkout our [quickstart guide](quickstart.md) or the [ephemeral-cluster-demo](https://github.com/garden-io/garden/tree/main/examples/ephemeral-cluster-demo) example on GitHub.
In the following steps you'll learn how to configure your own Garden projects to use the `garden-kubernetes` provider.

### Step 1 - Configure the provider
 Add the `garden-kubernetes` provider to your project configuration file and associate it with an environment. If you are starting a new project copy this file:

```
apiVersion: garden.io/v1
kind: Project
name: my-project
environments:
  - name: remote
providers:
  - name: garden-kubernetes
    environments: [remote]
```

### Step 2 -  Login to the Garden web dashboard

From your project root run:

```
garden login
```

### Step 3 - Deploy your project

To deploy your project run:
```
garden deploy --env remote
```
Garden will automatically provision a temporary Kubernetes Cluster for your project and deploy your application to it. For information about usage quotas check [here](#usage-quota-and-managing-clusters).

### Step 4 - Expose ingress (optional)

To access your application you need to expose it with an ingress. Each cluster is assigned its own unique hostname when created, to reference it in your ingress definition consider this container action:

```
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
      hostname: frontend.${providers.garden-kubernetes.outputs.default-hostname}
```

The `garden-kubernetes` provider outputs the dynamically created hostname for your cluster. You can reference this output in your Garden actions and Garden will print out your ingress links on deploy.
To apply the changes deploy again and visit your application in the browser via the provided link.

## On ingress and networking

Ephemeral Kubernetes Clusters fully support ingresses and each cluster is assigned its own unique default hostname dynamically when created. This hostname and its direct subdomains are secured by TLS and require authentication.

### Configuring ingress

If you want to refer to the hostname that is assigned dynamically when the cluster is created, you can refer to that using the output `${providers.garden-kubernetes.outputs.default-hostname}`. This can be useful if, for example, you want to expose an ingress on a subdomain of the default hostname.

For example, if you wish to expose `api` on `api.<default-hostname>`, you can use the following configuration for ingresses:

```yaml
....
ingresses:
    - path: /
      port: http
      hostname: api.${providers.garden-kubernetes.outputs.default-hostname}
```

### Authentication for ingress

The ingress URLs are not publicly accessible and require authentication via GitHub. To preview an ingress URL, you need to authenticate with GitHub and authorize the "Garden Ephemeral Environment Previews" app.

The first time you attempt to preview an ingress URL, you will be automatically redirected to GitHub for authorization of the "Garden Ephemeral Environment Previews" app. This is a one-time step, and subsequent ingress previews won't require re-authorization, ensuring a seamless experience as long as you remain logged in to the GitHub.

{% hint style="info" %}
Ingress URLs are not shareable at the moment however it is planned to be supported in future releases. Stay tuned for further updates on this.
{% endhint %}

## Accessing a cluster via kubeconfig

Once your cluster is created, the kubeconfig file for that cluster is stored on your local machine. The path to the kubeconfig file is shown in the logs when you deploy your project using Garden and looks like following:
```
kubeconfig for ephemeral cluster saved at path: /garden/examples/ephemeral-cluster-demo/.garden/garden-kubernetes/<cluster-id>-kubeconfig.yaml
```

This kubeconfig file allows you to interact with the cluster using `kubectl` or other Kubernetes tools.

## Security

Your managed Garden cluster is not shared with other Garden users, but due to it's ephemeral character not suitable for production workloads. Ingress is secured by TLS and needs authentication via GitHub. That means your application will not be publicly available in the internet.

## Limitations

As of today, the `garden-kubernetes` provider has the following limitations:

- Local docker builds are currently not supported. In-cluster building with Kaniko is the only supported building method and it is configured by default at the provider level.

## Usage quota and managing clusters

Each user is granted a maximum of **20 hours per month** of managed cluster usage where each cluster has a maximum lifetime of **4 hours**. After this period, the cluster is automatically destroyed.

If you need to destroy the cluster before its maximum lifetime of 4 hours expires, you can do so by visiting [Garden Cloud](https://app.garden.io) and selecting the option to destroy the cluster from there. This allows you to release resources and terminate the cluster when it's no longer needed.

