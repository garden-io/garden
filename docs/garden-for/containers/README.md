---
title: Containers
order: 1
---

Garden can build your container images and the built image can then be referenced in your [Kubernetes manifests](../kubernetes/deploy-k8s-resource.md), [Helm charts](../kubernetes/install-helm-chart.md), and [tests runs](../kubernetes/run-tests-and-tasks.md).

By default, Garden will use local Docker to build images but we highly recommend using our [Remote Container Builder](./using-remote-container-builder.md) which can significantly speed up your container builds (see link for how to set up).

You can then [add `container` Build actions](./building-containers.md) to your project that will be built via the appropriate build mode.
