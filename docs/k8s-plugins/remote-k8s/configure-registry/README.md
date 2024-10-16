---
title: 2. Configure Container Registry
order: 2
---

# 2. Configure Container Registry

You'll need a container registry to be able to push and pull your container images. We typically refer to this as a **deployment registry**.

Garden needs access to the registry so that it can _push_ the images that it builds and your Kubernetes cluster needs access so that it can pull the images. This access is provided via an "image pull secret". It can be a single secret used by both or two (or more) secrets.

At the end of this step you should have a container registry set up, created an image pull secret (or secrets), and have the following values at hand:

* The name of the image pull secret (or secrets).
* The name of the namespace were you created the image pull secret (or secrets).
* The hostname of your container registry.
* The "namespace" name for your container registry.

{% hint style="info" %}
The registry hostname and namespace name part of the fully qualified container image name. For example, the fully qualified name for the busybox image is `registry.hub.docker.com/library/busybox` where `registry.hub.docker.com` is the hostname and `library` is the namespace.
{% endhint %}

Below you'll find guides for specific cloud providers:

* [AWS](./aws.md)
* [GCP](./gcp.md)
* [Azure](./azure.md)
* [Docker Hub](./docker-hub.md)

As always, feel free to pick a different approach. The end goal having a container registry that Garden can push to and that your cluster can pull from.

