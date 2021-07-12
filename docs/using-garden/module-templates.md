---
order: 90
title: Module Templates
---

# Module Templates

You can create customized templates for modules or sets of modules, and render them using `templated` modules. These templates allow you to define your own schemas and abstractions, that are then translated at runtime to one or more modules, even including any supporting files (such as Kubernetes manifests, common configuration files, Dockerfiles etc.).

This provides a powerful yet easy-to-use mechanism to tailor Garden's functionality to your needs, improve governance, reduce boilerplate, and to provide higher-level abstractions to application developers.

These templates can be defined within a project, or in a separate repository that can be shared across multiple projects (using remote sources).

{% hint style="info" %}
This feature was introduced in Garden 0.12.7. Please make sure you have an up-to-date version installed.
{% endhint %}

## How it works

We'll use the [`templated-k8s-container example`](https://github.com/garden-io/garden/tree/0.12.24/examples/templated-k8s-container) to illustrate how module templates work. This example has a `k8s-container` template, that generates one `container` module for building an image, and one `kubernetes` module for deploying that image. A template like this is useful to customize the Kubernetes manifests for your services, but of course it's just one simple example of what you could do.

The template is defined like this:

```yaml
kind: ModuleTemplate
name: k8s-container
inputsSchemaPath: module-templates.json
modules:
  - type: container
    name: ${parent.name}-image
    description: ${parent.name} image
  - type: kubernetes
    name: ${parent.name}-manifests
    build:
      dependencies: ["${parent.name}-image"]
    files: [.manifests.yml]
    generateFiles:
      - sourcePath: manifests.yml
        targetPath: .manifests.yml
```

And it's used like this:

```yaml
kind: Module
type:
template: k8s-container
name: my-service
inputs:
  containerPort: 8080
  servicePort: 80
```

First off, notice that we have a `kind: ModuleTemplate`, which defines the template, and then a module with `type: templated` which references and uses the `ModuleTemplate` via the `template` field. You can have any number of modules referencing the same template.

The sections below describe the example in more detail.

### Defining modules

Each template should include one or more modules under the `modules` key. The schema for each module is exactly the same as for normal [Modules](./modules.md) with just a couple of differences:

- In addition to any other template strings available when defining modules, you additionally have `${parent.name}`, `${template.name}` and `${inputs.*}` (more on inputs in the next section). **It's important that you use one of these for the names of the modules, so that every generated module has a unique name.**.
- You can set a `path` field on the module to any subdirectory relative to the templated module directory. The module directory will be created if necessary.

### Defining and referencing inputs

On the `ModuleTemplate`, the `inputsSchemaPath` field points to a standard [JSON Schema](https://json-schema.org/) file, which describes the schema for the `inputs` field on every module that references the template. In our example, it looks like this:

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

This simple schema says the `containerPort` and `servicePort` inputs are required, and that you can optionally set a `replicas` value as well. Any JSON Schema with `"type": "object"` is supported, and users can add any parameters that templated modules should specify. These could be ingress hostnames, paths, or really any flags that need to be customizable per module.

These values can then be referenced using `${inputs.*}` template strings, anywhere under the `modules` field, as well as in any files specified under `modules[].generateFiles[].sourcePath`.

### Generating files

You can specify files that should be generated as modules are resolved, using the `modules[].generateFiles` field. These files can include any of the same template strings as when [defining modules](#defining-modules).

_Note: It's usually advisable to add the generated files to your `.gitignore`, since they'll be dynamically generated._

In our example, we render a set of Kubernetes manifests. Here's the relevant section in the template:

```yaml
...
    generateFiles:
      - sourcePath: manifests.yml
        targetPath: .manifests.yml
```

This reads a source file from `template/manifests.yml` (the `sourcePath` is relative to the location of the _template_), and writes it to `module/.manifests.yml` (`targetPath` is relative to the _templated module_).

Instead of specifying `sourcePath`, you can also specify `value` to provide the file contents directly as a string.

#### Escaping template strings

Sometimes you may want to pass template strings through when generating files, instead of having Garden resolve them. This could for example be handy when templating a Terraform configuration file which uses a similar templating syntax.

To do this, simply add an additional `$` in front of the template string, e.g. `$${var.dont-resolve-me}`.

### Module references within a templated module

In many cases, it's important for the different modules in a single template to depend on one another, and to reference outputs from one another. You do this basically the same way as in normal modules, but because module names in a template are generally templated themselves, it's helpful to look at how to use templates in module references.

Here's a section from the manifests file in our example:

```yaml
...
      containers:
        - name: main
          image: ${modules["${parent.name}-image"].outputs.deployment-image-id}
          imagePullPolicy: "Always"
          ports:
            - name: http
              containerPort: ${inputs.containerPort}
```

Notice the `image` field above. We use bracket notation to template the module name, whose outputs we want to reference: `${modules["${parent.name}-image"].outputs.deployment-image-id}`. Here we're using that to get the built image ID of the `${parent.name}-image` module in the same template.

_Note that for a reference like this to work, that module also needs to be specified as a build dependency._

### Sharing templates

If you have multiple projects it can be useful to have a central repository containing module templates, that can then be used in all your projects.

To do that, simply place your `ModuleTemplate` configs in a repository (called something like `garden-templates`) and reference it as a remote source in your projects:

```yaml
kind: Project
...
sources:
  - name: templates
    repositoryUrl: https://github.com/my-org/garden-templates:stable
```

Garden will then scan that repo when starting up, and you can reference the templates from it across your project.

## Further reading

- [ModuleTemplate reference docs](../reference/module-template-config.md).
- [`templated` module type reference docs](../reference/module-types/templated.md).
- [`templated-k8s-container example`](https://github.com/garden-io/garden/tree/0.12.24/examples/templated-k8s-container).

## Next steps

Take a look at our [Guides section](../guides/README.md) for more of an in-depth discussion on Garden concepts and capabilities.
