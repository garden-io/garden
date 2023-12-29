# `kubernetes` Deploy action type example using `patchResources`

This example project demonstrates how to patch Kubernetes manifests. This can be used to e.g. overwrite the container image in a Kubernetes Pod spec without modifying the manifest itself.

The example is a three tier web app with web, API, and database components.

The web and API components have corresponding Garden `kubernetes` Deploy actions that import manifests from the `manifests` directory.

## How it's set up

At the root of the project there's a directory called `manifests` which contains Kubernetes manifests for the API and web components.

The API and web components use these manifests by referencing them in their Garden config like so:

```yaml
# In api/garden.yml
kind: Deploy
type: kubernetes
name: api
source:
  path: ../ # <--- We set the source path of the action to the root so that we can reference the manifest files
spec:
  files: [manifests/api.yaml]

# In web/garden.yml
kind: Deploy
type: kubernetes
name: web
source:
  path: ../ # <--- We set the source path of the action to the root so that we can reference the manifest files
spec:
  files: [manifests/web.yaml]
```

> [!IMPORTANT]
> By default, Garden actions can only include files that are in the same directory as the action source path (typically the config path) or below.
> In this example, the action config for e.g. the API component is in the `./api` directory but the manifests are in the top-level `./manifests` directory.
> Because we can't reference files in parent directories (i.e. `[files: ../manifests/deployment.yaml]`) we use the `source.path` field to
> overwrite the path and tell Garden it should use a different source path when resolving files for the respective action.

The manifests hardcode certain values like the number of replicas and the image to deploy. By using the `patchResources` field, we can overwrite them in the Garden config
without having to modify the manifests themselves at all. This ensures they continue to work with other tools.

For example, here we patch the image, environment variables, and replica number for the API component:

```yaml
# In api/garden.yml
kind: Build
type: container
name: api
---
kind: Deploy
type: kubernetes
name: api
spec:
  files:
    - manifests/api.yaml
  # Patch the K8s manifests for the api service so that we can set the correct image
  # and other variables.
  patchResources:
    - name: api
      kind: Deployment
      patch:
        spec:
          replicas: 1
          template:
            spec:
              containers:
                - name: api
                  image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action above
                  env:
                  - name: PGDATABASE
                    value: ${var.postgresDatabase} # <-- Here we overwrite some values with Garden template strings
                  - name: PGUSER
                    value: ${var.postgresUsername}
                  - name: PGPASSWORD
                    value: ${var.postgresPassword}
              imagePullSecrets:
                - name: ${var.imagePullSecretName}
# ...
```

Garden applies the patch using the `kubectl patch` command. You can read more about how patching works and
different patch strategies in the [official Kubernetes docs](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/update-api-object-kubectl-patch/).

> [!NOTE]
> By default Garden uses the "strategic" merge strategy but you can overwrite this via the `patchResources[].strategy` field.
> When doing a "strategic" merge, Kubernetes updates container specs and other array fields in place instead of overwriting the entire array. This makes it
> a good choice when patching container images.

After applying the patch, the rendered manifest that gets applied to the cluster looks something like this:

```yaml
kind: Deployment
spec:
  replicas: 1 # <--- Here we've updated the number of replicas
  template:
    spec:
      containers:
        - name: api
          args: [python, app.py]
          image: api:v-2494a6e8de # <--- The correct image is set here
          env: # <--- The env variables are also set via the patch
            - name: PGDATABASE
              value: postgres
            - name: PGUSER
              value: postgres
            - name: PGPASSWORD
              value: postgres
# ...
```

## Things to keep in mind

- To view the rendered manifests, run Garden with the `debug` log level, e.g. `garden deploy -l4`.
- Actions cannot reference files in parent directories by default. That is, we can't do: `files: [../manifests/]`. We can work around this by "manually" setting the action source path via the `source.path` field. In this example, we set `source.path: ../` so that we can include the manifest files that are in the parent directory via `files: [./manifests/deployment.yaml]`. For more, see [this issue](https://github.com/garden-io/garden/issues/5004).
