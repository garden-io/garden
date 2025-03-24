---
order: 40
title: Config Templates
---

Config templates are a way to define reusable abstractions for actions or workflows. This provides a powerful yet easy-to-use mechanism to tailor Garden's functionality to your needs, improve governance, reduce boilerplate, and provide higher-level abstractions to application developers.

You can create customized templates for actions and workflows, and render them using `kind: RenderTemplate` resources. These templates allow you to define your own schemas and abstractions, which are then translated at runtime to one or more resources.

Config templates can be defined within a project, or in a separate repository that can be shared across multiple projects (using remote sources).

## How it works

We'll use the [`templated-k8s-container example`](../../examples/templated-k8s-container) to illustrate how templates work. This example has a `k8s-container` template, that generates one `Build` action of type `container` for building an image, and one `Deploy` action of type `kubernetes` for deploying that image. A template like this is useful to customize the Kubernetes manifests for your services, but of course it's just one simple example of what you could do.

The template is defined like this:

```yaml
kind: ConfigTemplate
name: k8s-container
inputsSchemaPath: schema.json

configs:
  - kind: Build
    type: container
    name: ${parent.name}
    description: ${parent.name} image

  - kind: Deploy
    type: kubernetes
    name: ${parent.name}
    description: ${parent.name} manifests

    dependencies:
      - build.${parent.name}

    manifests:
      ...
```

And it's used like this:

```yaml
kind: RenderTemplate
template: k8s-container
name: my-service
inputs:
  containerPort: 8080
  servicePort: 80
```

First off, notice that we have a `kind: ConfigTemplate`, which defines the template, and then a `kind: RenderTemplate` which references and uses the `ConfigTemplate` via the `template` field. You can have any number of instances referencing the same template.

The sections below describe the example in more detail.

### Defining actions and workflows

Each template can include one or more actions (`Build`, `Deploy`, `Test` or `Run`) or workflows (`kind: Workflow`) under the `configs` key. The schema for each action or workflow is exactly the same as for normal actions or workflows with just a couple of differences:

- In addition to any other template strings available when defining modules, you additionally have `${parent.name}`, `${template.name}` and `${inputs.*}` (more on inputs in the next section). **It's important that you use one of these for the names of the actions, so that every generated action has a unique name.**.
- You can set a `path` field on each config to any subdirectory relative to the directory where the `RenderTemplate` config is placed.

### Defining and referencing inputs

It's possible to define a schema to validate inputs given to a `ConfigTemplate`. If no schema is defined any inputs are allowed.

On the `ConfigTemplate`, the `inputsSchemaPath` field points to a standard [JSON Schema](https://json-schema.org/) file, which describes the schema for the `inputs` field on every action and module that references the template. In our example, it looks like this:

```json
{
  "type": "object",
  "properties": {
    "containerPort": {
      "type": "integer"
    },
    "servicePort": {
      "type": "integer"
    },
    "replicas": {
      "type": "integer",
      "default": 3
    }
  },
  "required": [
    "containerPort",
    "servicePort"
  ]
}
```

This schema says that the `containerPort` and `servicePort` inputs are required, and that you can optionally set a `replicas` value as well. Any JSON Schema with `"type": "object"` is supported, and users can add any parameters that templated actions and modules should specify. These could be ingress hostnames, paths, or really any flags that need to be customizable per action or module.

These values can then be referenced using `${inputs.*}` template strings, anywhere under the `configs` and `modules` fields.

_Note that special care needs to be taken when using template strings in the `inputs` field in a `RenderTemplate` config. Fields in the resulting configs from the template may need to be resolvable at different times, and using e.g. action references in input values may not work in all cases._

#### Escaping template strings

Sometimes you may want to pass template strings through when generating files, instead of having Garden resolve them. This could for example be handy when templating a Terraform configuration file which uses a similar templating syntax.

To do this, simply add an additional `$` in front of the template string, e.g. `$${var.dont-resolve-me}`.

### Action references within a templated action

In many cases, it's important for the different actions in a single template to depend on one another, and to reference outputs from one another. You do this basically the same way as in normal actions, but because action names in a template are generally templated themselves, it's helpful to look at how to use templates in action references.

Here's a section from the manifests in our example:

```yaml
...
      containers:
        - name: main
          image: ${actions.build["${parent.name}"].outputs.deployment-image-id}
          imagePullPolicy: "Always"
          ports:
            - name: http
              containerPort: ${inputs.containerPort}
```

Notice the `image` field above. We use bracket notation to template the action name, whose outputs we want to reference: `${actions.build["${parent.name}"].outputs.deployment-image-id}`. Here we're using that to get the built image ID of the `${parent.name}` Build in the same template.

_Note that for a reference like this to work, that action also needs to be specified as a dependency._

### Sharing templates

If you have multiple projects it can be useful to have a central repository containing action and module templates, that can then be used in all your projects.

To do that, simply place your `ConfigTemplate` configs in a repository (called something like `garden-templates`) and reference it as a remote source in your projects:

```yaml
apiVersion: garden.io/v2
kind: Project
...
sources:
  - name: templates
    repositoryUrl: https://github.com/my-org/garden-templates:stable
```

Garden will then scan that repo when starting up, and you can reference the templates from it across your project.

## Further reading

- [ConfigTemplate reference docs](../reference/config-template-config.md).
- [RenderTemplate reference docs](../reference/render-template-config.md).
- [`templated-k8s-container example`](../../examples/templated-k8s-container).

## Next steps

Take a look at our [Guides section](../guides/README.md) for more of an in-depth discussion on Garden concepts and capabilities.
