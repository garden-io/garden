---
title: Module Configuration
order: 4
---

# Module Configuration

Each Garden plugins defines different "module types" that you can use with it. For example, the Kubernetes plugin supports a `kubernetes` and a `helm` module type (among others) that you can pick, depending on your use case.

Garden projects can have multiple modules and you can mix and match as needed.

Below is a quick overview of the modules types for the Kubernetes plugin with links to in-depth usage guides.

### The `kubernetes` module type

Choose this module type if you already have Kubernetes manifests for some of the workloads you want to deploy.

[See here](./kubernetes.md) for how to configure it.

### The `helm` module type

Choose this module type if you're using Helm and have the corresponding Helm charts.

[See here](./helm.md) for an in-depth guide on using Garden with Helm.

### The `container` module type

{% hint style="info" %}
Note that the container module type can be used with other plugins as well.
{% endhint %}

Use this module type if you want to deploy a given service to Kubernetes but don't have the required Kubernetes manifests or Helm charts. 

In this case, Garden will generate the Kubernetes manifests for you, based on the module config.

This is a good choice when getting started.

[See here](./container.md) for how to use the `container` module
type with the Kubernetes plugin.

There's also a [separate in-depth guide](../../other-plugins/container.md) on the module type itself.

### The `persistentvolumeclaim` and `configmap` module types

[The PersistentVolumeClaim](./persistentvolumeclaim.md) and
[ConfigMap](./configmap.md) modules types can be used to mount
volumes and Kubernetes ConfigMaps in `container` modules.

