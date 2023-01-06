---
order: 3
title: Module Configuration
---

# Module Configuration

You can define `terraform` modules as part of your project, which act much like other Garden modules. A `terraform` module maps to a single _service_, that you can define as a runtime dependency for any of your other services and tasks. You can also reference the stack outputs of a `terraform` module using [runtime output template strings](../using-garden/variables-and-templating.md#runtime-outputs). For example:

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

Much like other modules, you can also reference Terraform definitions in other repositories using the `repositoryUrl` key. See the [Remote Sources](../advanced/using-remote-sources.md) guide for details.

