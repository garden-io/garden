---
title: Using Remote Kubernetes
order: 2
---

## Requirements

To use Garden to deploy to and test in a remote Kubernetes cluster you'll need to configure the `kubernetes` provider. This requires:

- A Kubernetes cluster (obviously).
- Permissions to create Namespaces and to create Deployments, Daemonsets, Services and Ingresses within the Namespaces created.
- A container registry that Garden can push images to and that your cluster can pull images from.
- Ingress and DNS set up.

You can follow our [step-by-step Kubernetes tutorial](../../tutorials/remote-k8s/) for setting these up if you haven't done so already. In general there are a lot of ways to create these resources so feel free to use whatever approach you find most useful.

In any case, you'll need the following values at hand to configure the provider:

- The context for your Kubernetes cluster ([see tutorial step 1](../../tutorials/remote-k8s/create-cluster/README.md)).
- The name(s) and namespace(s) of the ImagePullSecret(s) used by your cluster ([see tutorial step 2](../../tutorials/remote-k8s/configure-registry/README.md)).
- The hostname for your services ([see tutorial step 3](../../tutorials/remote-k8s/ingress-and-dns.md)).
- A TLS secret (optional) ([see tutorial step 3](../../tutorials/remote-k8s/ingress-and-dns.md)).

## Provider configuration

When you have these values you can configure the `kubernetes` provider like so:

```yaml
apiVersion: garden.io/v1
kind: Project

environments:
  - name: remote

providers:
  - name: kubernetes
    environments: [remote]
    imagePullSecrets:
      - name: <THE IMAGE PULL SECRET FROM TUTORIAL STEP 2>
        namespace: <THE IMAGE PULL SECRET NAMESPACE FROM TUTORIAL STEP 2>
    deploymentRegistry:
      hostname: <THE REGISTRY HOSTNAME CONFIGURED IN TUTORIAL STEP 2>
      namespace: <THE REGISTRY NAMESPACE CONFIGURED INTUTORIAL  STEP 2>
    context: <THE KUBE CONTEXT FROM TUTORIAL  STEP 1>
    buildMode: cluster-buildkit
    defaultHostname: <THE HOSTNAME FROM TUTORIAL STEP 3>
```

Once you have this configured you can start adding actions for deploying K8s resources, installing Helm charts, running tests, and more in your remote cluster.
