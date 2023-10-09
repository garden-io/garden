---
title: PersistentVolumeClaim
order: 5
---

## PersistentVolumeClaim

Creates a [PersistentVolumeClaim](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims) in your namespace
that can be referenced and mounted by other resources and [`container` actions](./container.md).

`container` Deploys, Runs and Tests can all mount volumes using this action type. To mount a volume, you need to define a volume Deploy
and reference it using the `volumes` key on your Deploys, Runs or Tests.

Example:

```yaml
kind: Deploy
name: volume
type: persistentvolumeclaim
spec:
  # this spec below is the same the underlying kubernetes resource
  # https://kubernetes.io/docs/concepts/storage/persistent-volumes/#persistentvolumeclaims
  spec:
    accessModes: [ReadWriteMany]
    resources:
      requests:
        storage: 1Gi
---
kind: Deploy
name: my-deploy
type: container

...

spec:
  replicas: 1  # <- Important! Unless your volume supports ReadWriteMany, you can't run multiple replicas with it
  volumes:
    - name: my-volume
      action: deploy.my-volume
      containerPath: /volume

```

This will mount the `my-volume` PVC at `/volume` in the `my-deploy` deploy when it is run. The `my-volume` deploy creates a `PersistentVolumeClaim` kubernetes resource in your project namespace, and the `spec.spec` field is passed directly to the same field on the PVC resource.

{% hint style="warning" %}
Notice the `accessModes` field in the volume Deploy above. The default storage classes in Kubernetes generally don't support being mounted by multiple Pods at the same time. If your volume Deploy doesn't support the `ReadWriteMany` access mode, you must take care not to use the same volume in multiple Deploys, Runs or Tests, or multiple replicas. See [Shared volumes](#shared-volumes) below for how to share a single volume with multiple Pods.
{% endhint %}

You can do the same for Tests and Runs using the same `spec.volumes` field for both [Tests](../../../reference/action-types/Test/container.md#specvolumes) and [Runs](../../../reference/action-types/Run/container.md#specvolumes) fields. `persistentvolumeclaim` volumes can of course also be referenced in `kubernetes` and
`helm` actions, since they are deployed as standard PersistentVolumeClaim resources.

Take a look at the [`persistentvolumeclaim`](../../../reference/action-types/Deploy/persistentvolumeclaim.md) and [`container` Deploy](../../../reference/action-types/Deploy/container.md#servicesvolumes) reference docs for more details.

### Shared volumes

For a volume to be shared between multiple replicas, or multiple Deploys, Tasks and/or Runs, it needs to be configured with a storage class (using the `spec.spec.storageClassName` field) that supports the `ReadWriteMany` (RWX) access mode. The available storage classes that support RWX vary by cloud providers and cluster setups, and in many cases you need to define a `StorageClass` or deploy a _storage class provisioner_ to your cluster.

You can find a list of storage options and their supported access modes [here](https://kubernetes.io/docs/concepts/storage/persistent-volumes/#access-modes). Here are a few commonly used RWX provisioners and storage classes:

* [NFS Server Provisioner](https://github.com/helm/charts/tree/master/stable/nfs-server-provisioner)
* [Azure File](https://docs.microsoft.com/en-us/azure/aks/azure-files-dynamic-pv)
* [AWS EFS Provisioner](https://github.com/helm/charts/tree/master/stable/efs-provisioner)
* [Ceph (via Rook)](https://rook.io/docs/rook/v1.2/ceph-filesystem.html)

Once any of those is set up you can create a `persistentvolumeclaim` Deploy action that uses the configured storage class.
A shared volume with a configured `azurefile` storage class can be used like this:

```yaml
kind: Deploy
name: shared-volume
type: persistentvolumeclaim
spec:
  spec:
    accessModes: [ReadWriteMany]
    resources:
      requests:
        storage: 1Gi
    storageClassName: azurefile
---
kind: Deploy
name: my-deploy
type: container
spec:
  volumes:
    - name: shared-volume
      module: shared-volume
      containerPath: /volume
  ...
---
kind: Test
name: my-deploy
type: container
spec:
  volumes:
    - name: shared-volume
      module: shared-volume
      containerPath: /volume
  ...
```

Here the same volume is used across a service, task and a test in the same module. You could similarly use the same volume across multiple container modules.
