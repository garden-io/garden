---
title: Using Remote Container Builder
order: 1
---

The [Remote Container Builder](../../features/remote-container-builder.md) enables you to build container images using **blazing-fast, remote build compute instances** managed by Garden and to share build caches with your team.

Our free-tier includes a certain amount of build minutes and layer caching per month and you get more by switching to our team or enterprise tiers. You can learn more about the [different tiers here](https://garden.io/plans).

If you run out of build minutes, Garden will simply fallback to local builds without any disruption.

## Enabling Remote Container Builder

### Step 1 — Log in to Garden Cloud

You need to be logged into Garden Cloud to use the remote container builder:

```sh
garden login
```

If this is your first time logging in, you'll be asked to sign up.

### Step 2 — Configure the `container` provider (optional)

The Remote Container Builder is enabled by default once you've logged in, so no further configuration is required.

If you want more granular control and e.g. only enable the container builder in certain environments you can do that via `container` provider in your project level configuration.

For example:

```yaml
kind: Project
name: my-project
environments:
  - name: local
  - name: remote-dev
  - name: ci

providers:
  - name: container # <--- We configure the container builder under the `container` provider
    environments: [remote-dev, ci] # <-- Here we specify what environments in should be enabled in
    gardenContainerBuilder:
      enabled: true
  - name: kubernetes
    # ...
```

### Step 3 — Give it a spin (optional)

If you a already have a Garden project with `container` Build actions, simply run:

```
garden build
```

...or any other command that triggers a build.

If you're using the `kubernetes` provider, the image will be pushed to the configured `deploymentRegistry`.

You can then check out the results in the [new Builds UI](https://app.garden.io).

## Next steps

If you haven't already, check out our docs on [building containers](./building-containers.md) to learn how to add `container` Build actions to your project. Note that the Remote Container Builder also supports [multi-platform builds](./building-containers.md#doing-multi-platform-builds)!

Your `container` actions will be built by the container builder and can be used by other actions, e.g. to:

- [Deploy K8s resources](../kubernetes/deploy-k8s-resource.md)
- [Install Helm charts](../kubernetes/install-helm-chart.md)
- [Run tests](../kubernetes/run-tests-and-tasks.md)

