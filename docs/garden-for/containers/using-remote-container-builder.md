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

### Step 2 — Configure the `container` provider

To enable the Remote Container Builder, add the following to your project level configuration under the `provider` field:

```yaml
  - name: container
    gardenContainerBuilder:
      enabled: true
```

Afterwards your project config should look something like this:

```yaml
kind: Project
name: my-project
environments:
  - name: dev
  - name: ci

providers:
  - name: container
    gardenContainerBuilder:
      enabled: true
  - name: kubernetes
    # ...
```

You can also enable the Remote Container Builder in specific environments like so:

```yaml
kind: Project
name: my-project
environments:
  - name: local
  - name: remote-dev
  - name: ci

providers:
  - name: container
    environments: [remote-dev, ci] # <-- Specify the environment
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

If you haven't already, check out our docs on [building containers](./building-containers.md) to learn how to add `container` Build actions to your project that can be built by the Remote Container Builder and used by other actions, e.g. to:

- [Deploy K8s resources](../kubernetes/deploy-k8s-resource.md)
- [Install Helm charts](../kubernetes/install-helm-chart.md)
- [Run tests](../kubernetes/run-tests-and-tasks.md)

