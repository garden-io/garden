# `kubernetes` Deploy action type simple example

This simple example project demonstrates how to use the `kubernetes` Deploy action type to create a PersistentVolumeClaim and deploy a Postgres database.

The action for creating the PersistentVolumeClaim specifies the manifests inline like so:

```yaml
# In garden.yml
kind: Deploy
name: my-volume
type: kubernetes
spec:
  manifests: # <--- Here we specify the manifests inline
    - apiVersion: v1
      kind: PersistentVolumeClaim
  # ...
```

The action for deploying the Postgres manifest reads the manifest from the `postgres-manifest` directory like so:

```yaml
# In garden.yml
kind: Deploy
name: db
type: kubernetes
spec:
  manifestFiles: [./postgres-manifests/**/*] # <--- Here we read the manifests from a file
```

The same pattern could also be used for e.g. creating secrets.

Note that in this example we define the volume name as a Garden variable and reference it in the inline manifest like so: `name: ${var.volumeName}`. For the `postgres` action we use the `patchResources` field to set the volume name. (You could also skip this and just hard code the values.)

Note also that here we have all the Garden actions in a single `garden.yml` config file at the root of the project. You can also split your Garden config into multiple files which tends to be better for larger projects (e.g. `project.garden.yml`, `api/garden.yml`, `web/garden.yml`).

## Further reading

* For a more complete example using `patchResources`, check out our [`k8s-deploy-patch-resources` example](../k8s-deploy-patch-resources/).
* Checkout our docs for a general overview of [deploying Kubernetes resources](https://docs.garden.io/cedar-0.14/using-garden-with/kubernetes/deploy-k8s-resource).
* If you'd rather use Helm to install Postgres, check out our docs on [installing Helm charts](https://docs.garden.io/cedar-0.14/using-garden-with/kubernetes/install-helm-chart).

