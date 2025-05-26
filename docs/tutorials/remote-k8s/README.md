---
title: Setting up a Kubernetes cluster
order: 2
---

# Remote K8s Plugin Configuration

## Requirements

To use the (remote) `kubernetes` plugin, you'll need the following:

- A Kubernetes cluster.
- Permissions to create namespaces and to create deployments, daemonsets, services and ingresses within the namespaces created.
- A container registry that Garden can push images to and
  that your cluster can pull images from.
- Ingress and DNS set up.

The following pages walk you through setting these up step-by-step, but feel free to skip over the steps you don't need.

Also note that there are a lot of ways to create these resources so feel free to use whatever approach you find most useful.

At the end of these steps, you should have the following values at hand:

- The context for your Kubernetes cluster ([see step1](./create-cluster/README.md)).
- The name(s) and namespace(s) of the ImagePullSecret(s) used by your cluster ([see step 2](./configure-registry/README.md)).
- The hostname for your services ([see step 3](./ingress-and-dns.md)).
-  A TLS secret (optional) ([see step 3](./ingress-and-dns.md)).

You will use these when configuring the `kubernetes` plugin. The configuration will
look something like this:

```yaml
apiVersion: garden.io/v2
kind: Project

environments:
  - name: remote
    variables:
      hostname: <THE HOSTNAME FROM STEP 3>

providers:
  - name: kubernetes
    environments: [remote]
    imagePullSecrets:
      - name: <THE IMAGE PULL SECRET FROM STEP 2>
        namespace: <THE IMAGE PULL SECRET NAMESPACE FROM STEP 2>
    deploymentRegistry:
      hostname: <THE REGISTRY HOSTNAME CONFIGURED IN STEP 2>
      namespace: <THE REGISTRY NAMESPACE CONFIGURED IN STEP 2>
    context: <THE KUBE CONTEXT FROM STEP 1>
    buildMode: cluster-buildkit
    defaultHostname: <THE HOSTNAME FROM STEP 3>
```

