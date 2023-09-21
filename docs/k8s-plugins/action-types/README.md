---
title: Action Configuration
order: 5
---

# Action Configuration

Each Garden plugins defines different "action types" that you can use with it. For example, the Kubernetes plugin supports `kubernetes` and `helm` action types (among others) that you can pick, depending on your use case.

Garden projects can utilize multiple action types and you can mix and match as needed.

Below is a quick overview of the action types for the Kubernetes plugin with links to in-depth usage guides.

### The `kubernetes` action type

Choose this action type if you already have Kubernetes manifests for some of the workloads you want to deploy.

[See here](./kubernetes.md) for how to configure it.

### The `helm` action type

Choose this action type if you're using Helm and have the corresponding Helm charts.

[See here](./helm.md) for an in-depth guide on using Garden with Helm.

### The `container` action type

{% hint style="info" %}
Note that the container action type can be used with other plugins as well.
{% endhint %}

Use this action type if you want to deploy to Kubernetes but don't have the required Kubernetes manifests or Helm charts. 

In this case, Garden will generate the Kubernetes manifests for you based on the action config.

This is a good choice when getting started.

[See here](./container.md) for how to use the `container` action type
type with the Kubernetes plugin.

There's also a [separate in-depth guide](../../other-plugins/container.md) on the action type itself.

### The `persistentvolumeclaim` and `configmap` action types

[The PersistentVolumeClaim](./persistentvolumeclaim.md) and
[ConfigMap](./configmap.md) action types can be used to mount
volumes and Kubernetes ConfigMaps in `container` actions.

