---
title: ConfigMap
order: 6
---

## Mounting Kubernetes ConfigMaps

Very similarly to the [PeristentVolumeClaim module](./persistentvolumeclaim.md), you can also mount Kubernetes ConfigMaps on `container` modules using the `configmap` module type ([see here for the full reference](../../reference/module-types/configmap.md)).

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

You can do the same for tests and tasks using the [`tests.volumes`](../../reference/module-types/container.md#testsvolumes) and [`tasks.volumes`](../../reference/module-types/container.md#tasksvolumes) fields. `configmap` volumes can of course also be referenced in `kubernetes` and `helm` modules, since they are deployed as standard ConfigMap resources.

Take a look at the [`configmap` module type](../../reference/module-types/configmap.md) and [`container` module](../../reference/module-types/container.md#servicesvolumes) docs for more details.
