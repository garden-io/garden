# Terraform

Garden includes a Terraform provider that you can use to automatically validate and provision infrastructure as part of your project. This guide walks through how to configure and use the provider.

It's strongly recommended that you [learn about Terraform](https://www.terraform.io/docs/index.html) (if you haven't already) before using it with Garden.

## How it works

Under the hood, Garden simply wraps Terraform, so there's no magic involved. Garden just automates its execution and makes stack outputs available to your Garden providers and modules.

The `terraform` provider can both provision a Terraform stack when initializing Garden, or through `terraform` modules that are deployed like other services in your stack.

The former, having a single Terraform stack for your whole project, is most helpful if other provider configurations need to reference the outputs from your Terraform stack, or if most/all of your services depend on the infrastructure provisioned in your Terraform stack. A good example of this is the [terraform-gke example](https://github.com/garden-io/garden/tree/v0.11.5/examples/terraform-gke) project, which provisions a GKE cluster that the `kubernetes` provider then runs on, along with the services in the project. The drawback is that Garden doesn't currently watch for changes in those Terraform files, and you need to restart to apply new changes, or apply them manually.

The latter method, using one or more `terraform` _modules_, can be better if your other providers don't need to reference the stack outputs but your _services, tasks and tests_ do. In this style, you can basically create small Terraform stacks that are part of your Stack Graph much like other services. A good example would be deploying a database instance, that other services in your project can then connect to.

You can also use a combination of the two if you'd like. Below we'll walk through how each of these work.

## Configuring the provider

First off, you need to enable the provider in your project configuration. This is as simple as placing it in your list of providers:

```yaml
kind: Project
name: my-project
providers:
  - name: terraform
  - name: kubernetes
  ...
```

If you'd like to apply the stack when starting Garden, and then reference the stack outputs in other providers (or modules), you need to add a couple of more flags. Here's the project config from the aforementioned [terraform-gke example](https://github.com/garden-io/garden/tree/v0.11.5/examples/terraform-gke):

```yaml
kind: Project
name: terraform-gke
providers:
  - name: terraform
    # These two keys must be set if we want to apply a stack as part of the provider initialization.
    autoApply: true
    initRoot: "."
    # You can either replace these with your own values, or delete these and provide your own in a
    # terraform.tfvars file in the project root.
    variables:
      gcp_project_id: garden-gke-tf-1
      gcp_region: europe-west1
  - name: kubernetes
    kubeconfig: ${providers.terraform.outputs.kubeconfig_path}
    context: gke
    defaultHostname: terraform-gke-${local.username}.dev-2.sys.garden
    buildMode: cluster-docker
```

Notice the `autoApply` flag and the `initRoot` flag. The former indicates that you'd like Garden to _automatically_ apply the stack when necessary. In some scenarios you may want to leave that disabled, e.g. for production deployments, databases etc. If you leave `autoApply` set to `false`, Garden will warn you if the stack is out of date, or error if the stack has not been provisioned at all.

The `initRoot` parameter tells Garden that there is a Terraform working directory at the specified path. If you don't specify this, Garden doesn't attempt to apply a stack when initializing the provider.

Notice also that we're providing an output value from the stack to the `kubernetes` provider. This can be very powerful, and allows you to fully codify your full project setup, not just the services running in your environment. Any Garden module can also reference the provider outputs in the exact same way, so you can easily provide your services with any information they need to operate.

## Terraform modules

You can also define `terraform` modules as part of your project, which act much like other Garden modules. A `terraform` module maps to a single _service_, that you can define as a runtime dependency for any of your other services and tasks. You can also reference the stack outputs of a `terraform` module using [runtime output template strings](./variables-and-templating.md#runtime-outputs). For example:

```yaml
kind: Module
type: terraform
name: tf
autoApply: true
---
kind: Module
type: container
name: my-container
services:
  - name: my-service
    # Important! You must declare the terraform service as a dependency, for the runtime template string to work.
    dependencies: [tf]
    env:
      DATABASE_URI: ${runtime.services.tf.outputs.my-database-uri}
```

Here we imagine a Terraform stack that has a `my-database-uri` output, that we then supply to `my-service` via the `DATABASE_URI` environment variable.

Much like other modules, you can also reference Terraform definitions in other repositories using the `repositoryUrl` key. See the [Remote Sources](./using-remote-sources.md) guide for details.

## Next steps

Check out the [terraform-gke example](https://github.com/garden-io/garden/tree/v0.11.5/examples/terraform-gke) project. Also take a look at the [Terraform provider reference](../providers/terraform.md) and the [Terraform module type reference](../module-types/terraform.md) for details on all the configuration parameters.

If you're having issues with Terraform itself, please refer to the [official docs](https://www.terraform.io/docs/index.html).
