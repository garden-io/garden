---
title: PersistentVolumeClaim
order: 5
---

## PersitentVolumeClaim

`container` services, tasks and tests can all mount volumes using this module type. To mount a volume, you need to define a volume module, and reference it using the `volumes` key on your services, tasks and/or tests.

Example:

```yaml
kind: Module
name: my-volume
type: persistentvolumeclaim
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
---
kind: Module
name: my-module
type: container
services:
  - name: my-service
    replicas: 1  # <- Important! Unless your volume supports ReadWriteMany, you can't run multiple replicas with it
    volumes:
      - name: my-volume
        module: my-volume
        containerPath: /volume
    ...
```

This will mount the `my-volume` PVC at `/volume` in the `my-service` service when it is run. The `my-volume` module creates a `PersistentVolumeClaim` resource in your project namespace, and the `spec` field is passed directly to the same field on the PVC resource.

{% hint style="warning" %}
Notice the `accessModes` field in the volume module above. The default storage classes in Kubernetes generally don't support being mounted by multiple Pods at the same time. If your volume module doesn't support the `ReadWriteMany` access mode, you must take care not to use the same volume in multiple services, tasks or tests, or multiple replicas. See [Shared volumes](#shared-volumes) below for how to share a single volume with multiple Pods.
{% endhint %}

You can do the same for tests and tasks using the [`tests.volumes`](../../../reference/module-types/container.md#testsvolumes) and [`tasks.volumes`](../../../reference/module-types/container.md#tasksvolumes) fields. `persistentvolumeclaim` volumes can of course also be referenced in `kubernetes` and
`helm` modules, since they are deployed as standard PersistentVolumeClaim resources.

Take a look at the [`persistentvolumeclaim`](../../../reference/module-types/persistentvolumeclaim.md) and [`container` module](../../../reference/module-types/container.md#servicesvolumes) reference docs for more details.

