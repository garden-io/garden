# `kubernetes` Deploy action type example with config templates

This example project demonstrates how to use config templates to create re-usable Kubernetes Deploy actions.

The config template defines a Build and Deploy action "pair" for building a container with the `container` Build action and deploying it to Kubernetes with the `kubernetes` Deploy action.

The Kubernetes manifests themselves include template strings so that common values can be overwritten, similar to the pattern used in [this Kubernetes Deploy action example](../k8s-deploy-shared-manifests). We recommend checking that out for more details on using Garden template strings in K8s manifests.

The example is a three tier web app with web, API, and database components.

## How it's set up

### The basics

At the root of the project there's a directory called `manifests` which contains manifests for K8s Deployment, Ingress, and Service objects respectively.

In the `templates.garden.yml` file we define a `ConfigTemplate` kind that includes a `container` Build action and a corresponding `kubernetes` Deploy action that references these manifests like so:

```yaml
# In templates.garden.yml
kind: ConfigTemplate
name: k8s-deploy
inputsSchemaPath: template-schemas/k8s-schema.json # <--- Defines the "inputs" for the template

configs:
  - kind: Build
    type: container
    name: ${parent.name} # <--- This is the name of the 'parent' action that uses the template, in this case api or web
    # ...

  - kind: Deploy
    type: kubernetes
    name: ${parent.name}

    spec:
      files:
        - manifests/deployment.yaml
        - manifests/service.yaml
        - "${inputs.enableIngress ? 'manifests/ingress.yaml' : null }" # <--- The "inputs" are defined in the JSON schema referenced in the 'inputsSchemaPath' field
# ...
```

Note the `inputsSchemaPath` field. This allows users to define "inputs" for the `ConfigTemplate` via a JSON schema. Inputs can be required or optional and can have default values. Garden validates the config to ensure all required values are set.

> [!NOTE]
> Pro tip: Use your generative AI tool of choice to create the schema. For this example, we used Open AI's ChatGPT 4 to generate the schema based on the Garden config from
[this Kubernetes Deploy action example](../k8s-deploy-shared-manifests).

We then re-use this template in the Garden config for the API and web components like so:

```yaml
# In api/garden.yml
kind: RenderTemplate
template: k8s-deploy
name: api
inputs: # <--- The inputs defined in the JSON schema
  relativeProjectRoot: ../
  relativeSourcePath: .
  containerPath: /app
  containerArgs: [python, app.py]
# ...

# In web/garden.yml
kind: RenderTemplate
template: k8s-deploy
name: web
inputs:
  relativeProjectRoot: ../
  relativeSourcePath: .
  containerPath: /app
  containerArgs: [npm, run, serve]
# ...
```

Inputs can be primitive or more complex objects and can have default values.

### Setting paths

The `ConfigTemplate` itself is at the project root but the consumers can be placed in any directory.

Because the `ConfigTemplate` needs to specify what source code to build and what manifests to use, it needs to know where the consumer config is.

We address by adding `relativeProjectRoot` and `relativeSourcePath` fields to the JSON schema and use those to set the source path for the actions the template
defines like so:

```yaml
# In templates.garden.yml
kind: ConfigTemplate
name: k8s-deploy
configs:
  - kind: Build
    source:
      path: ${inputs.relativeSourcePath} # <--- Path to the source code, relative to the consumer config path
# ...

  - kind: Deploy
    type: kubernetes
    source:
      path: ${inputs.relativeProjectRoot} # <--- We set the source path of the Deploy action to the root so it can include the manifests
# ...
```

In the consumer, we set these values as follows:

```yaml
# In api/garden.yml
kind: RenderTemplate
template: k8s-deploy
name: api
inputs:
  relativeSourcePath: . # <--- This config file is in the same directory as its source code
  relativeProjectRoot: ../ # <--- The project root is one level up
```

### Configuring ports with default values

The `ConfigTemplate` defines sensible default values for container ports which users can overwrite as needed.

The `containerPorts` input is defined in the JSON schema like so:

```json
{
  "containerPorts": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string",
          "default": "http"
        },
        "containerPort": {
          "type": "integer",
          "default": 8080
        },
        "protocol": {
          "type": "string",
          "enum": [
            "TCP",
            "UDP"
          ],
          "default": "TCP"
        }
      }
    },
    "default": [
      {
        "name": "http",
        "containerPort": 8080,
        "protocol": "TCP"
      }
    ]
  },
}
```

And then referenced it in the manifest for the K8s Deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
# ...
spec:
  template:
    spec:
      containers:
        - name: ${parent.name}
          ports: ${jsonEncode(inputs.containerPorts)}
```

If the consumer of the template doesn't define any container ports, the default values will be used and the rendered K8s manifest will looks something like this:

```yaml
apiVersion: apps/v1
kind: Deployment
# ...
spec:
  template:
    spec:
      containers:
        - name: api
          ports:
            - name: http
              containerPort: 8080
              protocol: TCP
# ...
```

If the user needs to set a different port, they can override the default like so in the template consumer:

```yaml
# api/garden.yml
kind: RenderTemplate
template: k8s-deploy
name: api
inputs:
  containerPorts:
    - containerPort: 8090 # <--- Set custom port
# ...
```

The rendered K8s manifest will then look like this:

```yaml
apiVersion: apps/v1
kind: Deployment
# ...
spec:
  template:
    spec:
      containers:
        - name: api
          ports:
            - name: http
              containerPort: 8090 # <--- Default port has been overwritten
              protocol: TCP # <--- Other defaults are still used
# ...
```

A similar pattern is used for service ports.

### Optional sync spec

Not all Deploy actions will have syncing enabled. To account for that, we add a boolean field called `enableSync` to the JSON schema which defaults to `false`:

```json
{
  "enableSync": {
    "type": "boolean",
    "default": false
  }
}
```

We then enable the `sync` field in the `ConfigTemplate` conditionally like
so:

```yaml
# In templates.garden.yml
sync:
  $if: ${inputs.enableSync}
  $then:
    paths:
      - sourcePath: ${inputs.sourcePath}
        containerPath: ${inputs.containerPath}
        mode: "one-way-replica"
        # ...
    overrides:
      - command: ${inputs.syncCommand}
```

In e.g. the web component we can now enable syncing like so:

```yaml
# In web/garden.yml
kind: RenderTemplate
template: k8s-deploy
name: web
inputs:
  enableSync: true
  sourcePath: ./web
  containerPath: /app
  syncCommand: [npm, run, dev]
# ...
```

### Optional ingress

We also allow consumers of the template to optionally enable ingress, similar to how we allow them to enable syncing above.

First we add a boolean field called `enableIngress` to the JSON schema. Now, if it's set to `true`, we include the K8s Ingress manifest in the `files` field in the `ConfigTemplate` like so:

```yaml
# In templates.garden.yml
- kind: Deploy
  type: kubernetes
  name: ${parent.name}
  spec:
    files:
      - manifests/deployment.yaml
      - manifests/service.yaml
      - "${inputs.enableIngress ? 'manifests/ingress.yaml' : null }" # <--- Only include the Ingress manifest if enableIngress=true
# ...
```

