---
title: 4. Configure the Provider
order: 4
---

# 4. Configure the Provider

Once you've completed steps 1-3 on the previous pages you should have all the values at hand to configure Garden's Kubernetes plugin.

In particular, you should have:

- The context for your Kubernetes cluster ([see step
  1](./create-cluster/README.md)).
- The name(s) and namespace(s) of the ImagePullSecret(s) used by your cluster ([see step 2](./configure-registry/README.md)).
- The hostname for your services ([see step 3](./ingress-and-dns.md)).
-  A TLS secret (optional) ([see step 3](./ingress-and-dns.md)).

Now we can finally add them to our Garden config.

## 1. Add initial config

First, add your values to the project level Garden configuration file at the root of your project:

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
    imagePullSecrets: # You can set multiple secrets here
      - name: <THE IMAGE PULL SECRET FROM STEP 2>
        namespace: <THE IMAGE PULL SECRET NAMESPACE FROM STEP 2>
    deploymentRegistry:
      hostname: <THE REGISTRY HOSTNAME CONFIGURED IN STEP 2>
      namespace: <THE REGISTRY NAMESPACE CONFIGURED IN STEP 2>
    context: <THE KUBE CONTEXT FROM STEP 1>
    defaultHostname: <THE HOSTNAME FROM STEP 3>
```

{% hint style="warning" %}
Garden does NOT inject the image pull secret into the Deployment (unless you're using the `container` Deploy type). So if you're using e.g. the `kubernetes` or `helm` action types you need to make sure the `imagePullSecret` field is set in the corresponding manifest / Helm chart. See also the [official Kubernetes docs for setting image pull secrets](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/#create-a-pod-that-uses-your-secret).
{% endhint %}

### 2. Select build mode

Next, select a "build mode".

You can choose between building your images locally with Docker using the `local-docker` build mode or remotely, in the cluster itself.

Note that even if you choose the `local-docker` build mode, you still need to configure a container registry that Garden can push to and set an ImagePullSecret so that Kubernetes can pull your images.

In general, we recommend doing remote building with the `cluster-buildkit` build mode.

This means you don't need Docker running on your laptop and you're able to share build caches with your team and across environments.

To use the `cluster-buildkit` build mode, add the following to your configuration:

```yaml
providers:
  - name: kubernetes
    buildMode: "cluster-buildkit" # <--- Add this
    # ...
```

### 3. Initialize the plugin

Finally, initialize the plugin by running:

```
garden plugins kubernetes cluster-init
```

And that's it! Your Kubernetes plugin is now configured
and you can proceed to deploying your project to
Kubernetes with Garden.

Next, we recommend learning more about configuring [Kubernetes actions](../../garden-for/kubernetes/README.md).
