---
title: Action Configuration
order: 5
---

# Action Configuration

Each Garden plugins defines different "action types" that you can use with it. For example, the Kubernetes plugins support `kubernetes` and `helm` action types (among others) that you can pick, depending on your use case.

Garden projects can utilize multiple action types and you can mix and match as needed.

Below is a quick overview of the action types for the Kubernetes plugin with links to in-depth usage guides.

## Build actions

### The `container` Build action type

Use this action for building source code you then deploy with one of the Deploy actions below.

[See here](./build/container.md) for how to configure it.

## Deploy actions

### The `kubernetes` Deploy action type

Choose this action type if you already have Kubernetes manifests for some of the workloads you want to deploy and/or if you're using Kustomize.

[See here](./deploy/kubernetes.md) for how to configure it.

### The `helm` Deploy action type

Choose this action type if you're using Helm and have the corresponding Helm charts.

[See here](./deploy/helm.md) for an in-depth guide on using Garden with Helm.

### The `container` Deploy action type

{% hint style="warning" %}
The `container` Deploy action type can be useful for getting started quickly but has several limitations and is not suitable for production. Instead we encourage users to use the `kubernetes` or `helm` types which are a lot more flexible.
{% endhint %}

Use this action type if you want to deploy to Kubernetes but don't have the required Kubernetes manifests or Helm charts.

In this case, Garden will generate the Kubernetes manifests for you based on the action config.

[See here](./deploy/container.md) for how to use the `container` action type
type with the Kubernetes plugin.

There are in fact multiple actions of type `container`  that you can learn more about in [this in-depth guide](../../other-plugins/container.md).

### The `persistentvolumeclaim` and `configmap` Deploy action types

[The PersistentVolumeClaim](./deploy/persistentvolumeclaim.md) and [ConfigMap](./deploy/configmap.md) action types can be used to mount volumes and Kubernetes ConfigMaps in `container` actions.

## Run and Test actions

### The `kubernetes-pod` Test and Run action types

Choose this action type for Test and Run actions if you already have the corresponding Kubernetes manifests and want to run the test/run command in a dedicated Pod that gets cleaned up after the run.

[See here](./run-test/kubernetes-pod.md) for how to configure it.

### The `kubernetes-exec` Test and Run action types

Choose this action type for Test and Run actions if you already have Kubernetes manifests and want to run the test/run command
in an already deployed Kubernetes Pod. This is faster than (potentially) waiting for an image build and for a new Pod being created
and is a good choice for e.g. running tests during inner loop development.

[See here](./run-test/kubernetes-exec.md) for how to configure it.

### The `helm-pod` Test and Run action types

Choose this action type for Test and Run actions if you have the corresponding Helm charts.

[See here](./run-test/helm-pod.md) for how to configure it.

