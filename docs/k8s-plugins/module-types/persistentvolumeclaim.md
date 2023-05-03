---
title: PersistentVolumeClaim
order: 5
---

## PersistentVolumeClaim

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

You can do the same for tests and tasks using the [`tests.volumes`](../../reference/module-types/container.md#testsvolumes) and [`tasks.volumes`](../../reference/module-types/container.md#tasksvolumes) fields. `persistentvolumeclaim` volumes can of course also be referenced in `kubernetes` and
`helm` modules, since they are deployed as standard PersistentVolumeClaim resources.

Take a look at the [`persistentvolumeclaim`](../../reference/module-types/persistentvolumeclaim.md) and [`container` module](../../reference/module-types/container.md#servicesvolumes) reference docs for more details.

### Shared volumes

For a volume to be shared between multiple replicas, or multiple services, tasks and/or tests, it needs to be configured with a storage class (using the `storageClassName` field) that supports the `ReadWriteMany` (RWX) access mode. The available storage classes that support RWX vary by cloud providers and cluster setups, and in many cases you need to define a `StorageClass` or deploy a _storage class provisioner_ to your cluster.

You can find a list of storage options and their supported access modes [here](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes). Here are a few commonly used RWX provisioners and storage classes:

* [NFS Server Provisioner](https://github.com/helm/charts/tree/master/stable/nfs-server-provisioner)
* [Azure File](https://docs.microsoft.com/en-us/azure/aks/azure-files-dynamic-pv)
* [AWS EFS Provisioner](https://github.com/helm/charts/tree/master/stable/efs-provisioner)
* [Ceph (via Rook)](https://rook.io/docs/rook/v1.2/ceph-filesystem.html)

Once any of those is set up you can create a `persistentvolumeclaim` module that uses the configured storage class. Here, for example, is how you might use a shared volume with a configured `azurefile` storage class:

```yaml
kind: Module
name: shared-volume
type: persistentvolumeclaim
spec:
  accessModes: [ReadWriteMany]
  resources:
    requests:
      storage: 1Gi
  storageClassName: azurefile
---
kind: Module
name: my-module
type: container
services:
  - name: my-service
    volumes:
      - &volume   # <- using a YAML anchor to re-use the volume spec in tasks and tests
        name: shared-volume
        module: shared-volume
        containerPath: /volume
    ...
tasks:
  - name: my-task
    volumes:
      - *volume
    ...
tests:
  - name: my-test
    volumes:
      - *volume
    ...
```

Here the same volume is used across a service, task and a test in the same module. You could similarly use the same volume across multiple container modules.
