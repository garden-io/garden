---
title: Kubernetes-pod
order: 7
---

# `kubernetes-pod`

For Run and Test actions, either the `kubernetes-pod` or [`kubernetes-exec`](./kubernetes-exec.md) action types can be used.

[`kubernetes-pod` Run](../../reference/action-types/Run/kubernetes-pod.md)
and [`kubernetes-pod` test](../../reference/action-types/Test/kubernetes-pod.md) will create a fresh Kubernetes workload and run your command in it.
These actions are cached. This means that Garden will not rerun them if the version of the action hasn't changed. If a remote Kubernetes
cluster is used, test results are stored there which allows to share test results between the team or CI runs to decrease the number or re-runs.

`kubernetes-pod` actions don't have to depend on the deploy actions. The manifests are gathered from the kubernetes manifests and deployed to the cluster.

```yaml
kind: Test
name: vote-integ-pod
type: kubernetes-pod
dependencies:
  - deploy.api
variables:
  hostname: vote.${var.baseHostname}
timeout: 60
spec:
  resource:
    kind: Deployment
    name: vote-integ-pod
  command: [/bin/sh, -c, "npm run test:integ"]
  values:
...
```
