---
title: Using a Registry Mirror
order: 120
---

# Using a Registry Mirror

Garden uses a handful of utility container images that are hosted on [Docker Hub](https://hub.docker.com/) under the `gardendev` repository. These are used for various Kubernetes tasks such as managing syncs and are usually deployed into a given project namespace along with the rest of the project services.

If you have your own Docker Hub registry mirror you can configure Garden to use that instead of Docker Hub. Using your own registry mirror can improve performance because the mirror is typically in your VPC and prevents you from being rate limited by Docker Hub (see also [this FAQ entry](../misc/faq.md#how-do-i-avoid-being-rate-limited-by-docker-hub) on Docker Hub rate limiting).

To tell Garden to use your custom registry mirror instead of Docker Hub, set the `utilImageRegistryDomain` field on the Kubernetes provider, for example:

```yaml
kind: Project
name: my-project
#...
providers:
  - name: kubernetes
    utilImageRegistryDomain: https://<my-private-registry-domain>
```

This option is available on all the Kubernetes plugins (i.e. `local-kubernetes`, `ephemeral-kubernetes`, and `kubernetes`).

Now when you run a Garden command, the utility images will be pulled from the registry mirror.
