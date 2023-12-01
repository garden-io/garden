---
title: ConfigMap
order: 6
---

## Mounting Kubernetes ConfigMaps

Very similarly to the [PeristentVolumeClaim action type](./persistentvolumeclaim.md), you can also mount Kubernetes ConfigMaps on `container` deploy actions using the `configmap` action type. ([see here for the full reference](../../../reference/action-types/Deploy/configmap.md)). 

Example:

```yaml
kind: Deploy
type: configmap
name: my-configmap
spec:
  data:
    config.properties: |
      some: data
      or: something
...
---

kind: Deploy
name: my-app
type: container
spec:
  volumes:
    - name: configuration
      containerPath: /config

      # The reference to the configmap Deploy
      action: deploy.my-configmap
...
```

This mounts all the keys in the `data` field on the `my-configmap` action under the `/config` directory in the container. In this case, you'll find the file `/config/config.properties` there, with the value above (`some: data ...`) as the file contents.

You can do the same for tests and tasks using the relative [test `spec.volumes`](../../../reference/action-types/Test/container.md#specvolumes) and [task `spec.volumes`](../../../reference/action-types/Run/container.md#specvolumes) fields. `configmap` volumes can of course also be referenced in `kubernetes` and `helm` actions, since they are deployed as standard ConfigMap resources.

Take a look at the [action reference](../../../reference/action-types/README.md) for more details.
