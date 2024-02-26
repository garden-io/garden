# `kubernetes` Deploy action type example with config templates

This example project demonstrates how to use config templates to create re-usable Kubernetes Deploy actions.

The config template defines a Build and Deploy action "pair" for building a container with the `container` Build action and deploying it to Kubernetes with the `kubernetes` Deploy action.

In the example we use the `patchResources` field of the `kubernetes` Deploy action to patch some fields in the
K8s manifests without modifying the manifests themselves.

This is the same pattern that's used in [this Kubernetes Deploy action example](../k8s-deploy-patch-resources). We recommend checking that out for more details on patching K8s manifests.

The example is a three tier web app with web, API, and database components.

## How it's set up

### Overview

At the root of the project there's a directory called `manifests` which contains manifests for the API and web
components.

In the `templates/garden.yml` file we define a `ConfigTemplate` kind that includes a `container` Build action and a corresponding `kubernetes` Deploy action that references these manifests like so:

```yaml
# In templates.garden.yml
kind: ConfigTemplate
name: k8s-deploy
inputsSchemaPath: ./k8s-schema.json # <--- Defines the "inputs" for the template

configs:
  - kind: Build
    type: container
    name: ${parent.name} # <--- This is the name of the 'parent' action that uses the template, in this case api or web
    # ...

  - kind: Deploy
    type: kubernetes
    name: ${parent.name}

    spec:
      files: ${inputs.manifests} # <--- The "inputs" are defined in the JSON schema referenced in the 'inputsSchemaPath' field
# ...
```

Note the `inputsSchemaPath` field. This allows users to define "inputs" for the `ConfigTemplate` via a JSON schema. Inputs can be required or optional and can have default values. Garden validates the config to ensure all required values are set.

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
# ...

# In web/garden.yml
kind: RenderTemplate
template: k8s-deploy
name: web
inputs:
  relativeProjectRoot: ../
  relativeSourcePath: .
  containerPath: /app
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

We then enable the `sync` field in the `ConfigTemplate` conditionally like so:

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

