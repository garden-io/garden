---
title: Image Pull Secrets
order: 4
---

# Image Pull Secrets

In this guide you'll learn what image pull secrets are, how they work in Garden, and find step-by-step instructions for configuring them.

{% hint style="info" %}
You'll not need to create image pull secrets if using local Kubernetes (e.g. Minikube or Orbstack) unless you're deploying pre-built images from a private registry.
{% endhint %}

## About image pull secrets

When Kubernetes creates a resource (e.g. a Pod or a Job) that has a container (or containers) it needs to pull the container image from a container registry. In many cases these images aren't public and you need to be authenticated against your container registry to be able to pull the image.

This is done by creating an image pull secret in the _same namespace_ as your Kubernetes resource and referencing it in the resource manifest (e.g. the corresponding Kubernetes Deployment).

If the secret is missing or invalid, you'll get the dreaded `ImagePullBackOff` status and the Garden command will fail.

## Image pull secrets in Garden

Because users typically use Garden to create environments on-demand in new namespaces, you can specify your image pull secrets in one place and Garden will make sure to copy them to the relevant namespace before Kubernetes attempts to pull the image. This same mechanism is also used when pushing images if using in-cluster building.

The image pull secrets are set via the `imagePullSecrets` field on the respective Kubernetes provider configuration in your project level Garden configuration.

## Step-by-step instructions

### Step 1 — Create the secret

Start by creating an image pull secret for your container registry of choice by following one of the guides below:

- [AWS](../remote-k8s/configure-registry/aws.md)
- [GCP](../remote-k8s/configure-registry/gcp.md)
- [Azure](../remote-k8s/configure-registry/azure.md)
- [Docker Hub](../remote-k8s/configure-registry/docker-hub.md)

If your registry is not the list we suggest consulting their documentation, it's a bit out of scope for us to have specific docs for every possible registry.

### Step 2 — Add a reference to the secret(s) in your provider config

Add the secrets to your provider config in your project level Garden configuration like so:

```yaml
# In your project level Garden configuration
kind: Project
name: my-project
# ...
providers:
  kubernetes:
    imagePullSecrets:
      - name: <my-image-pull-secret>
        namespace: default
```

This tells Garden to copy a secret called `regcred` in the `default` Kubernetes namespace to the Kuberntes namespace Garden is deploying to (or building in).

Note that you can define multiple Kubernetes providers for different environments and set different secrets for each.

### Step 3 — Ensure the secret is set in your Kubernetes manifest

{% hint style="info" %}
You do not need to set image pull secrets if using the `container` Deploy action. In that case Garden generates the manifest. You do however need it for `kubernetes` and `helm` actions.
{% endhint %}

In many cases you'll want to just hard code the secret name in the relevant manifest since image pull secrets typically have the same name. A common convention is to name the secret `regcred`.

If you're adding it to, say, a Kubernetes Deployment it would look like this:

```yaml
apiVersion: apps/v1
kind: Deployment
# ...
spec:
  # ...
  template:
    spec:
      imagePullSecrets:
        - name: regcred # <--- Set the secret here
```

If you need to dynamically set it in the manifest at "runtime" you can also do that. You can e.g. [create a variable](../../using-garden/variables-and-templating.md) for the image pull secret and reference it in the provider config and set it on the manifest via the `patchResources` field if using `kubernetes` action or the `values` field if using a `helm` action.

