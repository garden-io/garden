# `kubernetes` Deploy action type example with shared manifests

This example project demonstrates how to share Kubernetes manifests between Garden actions.

The example itself is a three tier web app with web, API, and database components.

The web and API components have corresponding Garden `kubernetes` Deploy actions that share Kubernetes manifests and use Garden's templating functionality to override values as needed.

## How it's set up

At the root of the project there's a directory called `manifests` which contains manifests for K8s Deployment, Ingress, and Service objects respectively.

The API and web components use these manifests by referencing them in their Garden config like so:

```yaml
# In api/garden.yml
kind: Deploy
type: kubernetes
name: api
source:
  path: ../ # <--- We set the source path of the action to the root so that we can reference the manifest files
spec:
  files:
    - manifests/deployment.yaml
    - manifests/service.yaml

# In web/garden.yml
kind: Deploy
type: kubernetes
name: web
source:
  path: ../ # <--- We set the source path of the action to the root so that we can reference the manifest files
spec:
  files:
    - manifests/deployment.yaml
    - manifests/service.yaml
    - manifests/ingress.yaml
```

> [!IMPORTANT]
> By default, Garden actions can only include files that are in the same directory as the action source path (typically the config path) or below.
> In this example, the action config for e.g. the API component is in the `./api` directory but the manifests are in the top-level `./manifests` directory.
> Because we can't reference files in parent directories (i.e. `[files: ../manifests/deployment.yaml]`) we use the `source.path` field to
> overwrite the path and tell Garden it should use a different source path when resolving files for the respective action.

The manifests are shared between these components to keep the config DRY but values like names, ports, and resources that are unique to each component are set via Garden template strings.

For example, here we set the name and replica number in the Garden config and reference it in the Kubernetes config:

```yaml
# In api/garden.yml
variables:
  appName: api
  replicas: 1

# In manifests/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${var.appName}
  labels:
    app: ${var.appName}
spec:
  replicas: ${var.replicas}
# ...
```

You can also set non primitive values like maps and arrays by using the `jsonEncode` templating function. Here's how we set the environment and the arguments to run the container for the API component:

```yaml
# In api/garden.yml
variables:
  containerArgs: # <--- Non-primitive variables so we need the jsonEncode helper when we reference them below
    - python
    - app.py

  env:
    - name: PGDATABASE
      value: ${var.postgresDatabase}
    - name: PGUSER
      value: ${var.postgresUsername}
# ...

# In manifests/deployment.yaml
kind: Deployment
spec:
  replicas: ${var.replicas}
  template:
    spec:
      containers:
        - name: ${var.appName}
          args: ${jsonEncode(var.containerArgs)} # <--- We need to use the jsonEncode helper function when templating non-primitive values
          env: ${jsonEncode(var.env)}
# ...
```

The rendered manifest will then looks like this:

```yaml
kind: Deployment
spec:
  replicas: 1
  template:
    spec:
      containers:
        - name: api
          args: [python, app.py]
          env:
            - name: PGDATABASE
              value: postgres
            - name: PGUSER
              value: postgres
# ...
```

## Things to keep in mind

- To view the rendered manifests, run Garden with the `debug` log level, e.g. `garden deploy -l4`.
- Actions cannot reference files in parent directories by default. That is, we can't do: `files: [../manifests/]`. We can work around this by "manually" setting the action source path via the `source.path` field. In this example, we set `source.path: ../` so that we can include the manifest files that are in the parent directory via `files: [./manifests/deployment.yaml]`. For more, see [this issue](https://github.com/garden-io/garden/issues/5004).
- When referencing non-primitive values in K8s manifests (e.g. objects and arrays) you need to use the `jsonEncode` template function. This issue is [tracked here](https://github.com/garden-io/garden/issues/3899) but it's a breaking change and will need to be part of our next breaking release.
- The K8s manifest for the Deployment object needs to specify what container image to pull. The image is built by the respective Build action which exposes the image ID as an "output". You can reference the action output in the manifest like so: `image:
${actions.build.<action-name>}.outputs.deploy-image-id`. In this specific example we also template the action name to make the manifest re-usable so the final field becomes: `image: "${actions.build[var.appName].outputs.deployment-image-id}"`
- Manifests with Garden template strings are not valid Kubernetes manifests and you e.g. can't use them with `kubectl apply`. If you need valid manifests which work with other tools but still want to share them we recommend using either the [Helm Deploy action](https://docs.garden.io/kubernetes-plugins/actions/deploy/helm) or [Kustomize overlays](https://github.com/garden-io/garden/tree/main/examples/kustomize)) which Garden also supports.
