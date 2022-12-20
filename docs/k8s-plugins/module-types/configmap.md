---
title: ConfigMap
order: 6
---

## Mounting Kubernetes ConfigMaps

Very similarly to the [PeristentVolumeClaim module](./persistentvolumeclaim.md), you can also mount Kubernetes ConfigMaps on `container` modules using the `confingmap` module type ([see here for the full reference](../../../reference/module-types/configmap.md)).

Example:

```yaml
kind: Module
name: my-configmap
type: configmap
data:
  config.properties: |
    some: data
    or: something
---
kind: Module
name: my-module
type: container
services:
  - name: my-service
    volumes:
      - name: my-configmap
        module: my-configmap
        containerPath: /config
    ...
```

This mounts all the keys in the `data` field on the `my-configmap` module under the `/config` directory in the container. In this case, you'll find the file `/config/config.properties` there, with the value above (`some: data ...`) as the file contents.

You can do the same for tests and tasks using the [`tests.volumes`](../../../reference/module-types/container.md#testsvolumes) and [`tasks.volumes`](../../../reference/module-types/container.md#tasksvolumes) fields. `configmap` volumes can of course also be referenced in `kubernetes` and `helm` modules, since they are deployed as standard ConfigMap resources.

Take a look at the [`configmap` module type](../../../reference/module-types/configmap.md) and [`container` module](../../../reference/module-types/container.md#servicesvolumes) docs for more details.

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
