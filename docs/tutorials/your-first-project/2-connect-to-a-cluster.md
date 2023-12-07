---
title: 2. Pick a Kubernetes Plugin
order: 2
---

# 2. Pick a Kubernetes Plugin

In order to deploy our project, we (perhaps obviously) need somewhere to deploy it to.

Here we hit a bit of a fork in the road since we have a choice between:

1. Using Garden managed ephemeral clusters
2. Setting up a local Kubernetes cluster on our dev machine
3. Using our own remote cluster.

## Option 1 (easiest) — Garden managed ephemeral cluster

This is the easiest way to get started and you don't need to do anything. Instead you can head directly to the next page and start [adding Garden actions to the project](./3-add-actions.md).

To learn more about Garden managed ephemeral clusters, [see here](../../k8s-plugins/ephemeral-k8s/README.md).

## Option 2 (simplest) — Local Kubernetes

You can also use a local installation of Kubernetes (e.g. K3s, Minikube or Docker for Desktop). It's great for getting started quickly but you'll miss out on all the collaboration and team features you get with a remote Kubernetes environment.

To use this option follow the steps below.

### Step 1 — Install Kuberneters locally

Follow our [local Kubernetes guide](../../k8s-plugins/local-k8s/README.md) to set up this plugin.

### Step 2 — Update the default environment

Open the `project.garden.yml` file we created earlier and update the `defaultEnvironment` field like so:

```yaml
defaultEnvironment: local
```

## Option 3 (most powerful) — Your own remote Kubernetes cluster

This option requires more upfront work but is highly recommended for _teams_ using Garden. It allows you to build, test, and develop in a remote production-like environment that scales with your stack, caches your results, and allows you to easily share work with your team.

If you want to get started quickly we recommend first going for **Option 1** above and then coming back to this one once you've kicked the tires.

Otherwise follow the steps below.

### Step 1 — Setup remote Kubernetes

Follow our [remote Kubernetes guide](../../k8s-plugins/remote-k8s/README.md) to set up this plugin.

In particular you'll need to update the values under the `kubernetes` provider in the `project.garden.yml` file we created earlier.

### Step 2 — Update the default environment

Open the `project.garden.yml` file we created earlier and update the `defaultEnvironment` field like so:

```yaml
defaultEnvironment: remote-dev
```

### Step 3 — Set the remote hostname

The example application expects a hostname to be set for remote environments. Update the `hostname` under the `variables` field of the `remote-dev` environment with the hostname to your Kubernetes cluster:

```yaml
environments:
  # ...
  - name: remote-dev
    defaultNamespace: ${var.userNamespace}
    hostname: <add-your-hostname-here> # <--- Update this value
```

If you don't have a hostname configured you can set some pseudo value and use port forwards instead. Garden will create those for you when you run the `deploy --sync` or `deploy --forward` commands.

## Next Step

Once you've set up your Kubernetes plugin and updated your project configuration accordingly, you can move on to [adding Garden actions to the project](./3-add-actions.md).
