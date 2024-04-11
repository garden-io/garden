---
order: 3
title: Actions
---

# Actions

## Deploy Action

You can define `terraform` actions as part of your project, much like any other actions. A `terraform` action maps to a single `Deploy` that you can define as a runtime dependency for any of your other `Deploy`, `Run` and `Test` actions. You can also reference the stack outputs of a `terraform` action using [runtime output template strings](../using-garden/variables-and-templating.md#runtime-outputs). For example:

```yaml
kind: Deploy
type: terraform
name: tf
autoApply: true

---
kind: Deploy
type: container
name: my-container
# Important! You must declare the terraform service as a dependency, for the runtime template string to work.
dependencies: [deploy.tf]
spec:
  env:
    DATABASE_URI: ${runtime.services.tf.outputs.my-database-uri}
```

Here we imagine a Terraform stack that has a `my-database-uri` output, that we then supply to `my-service` via the `DATABASE_URI` environment variable.

Much like other Deploy actions, you can also reference Terraform definitions in other repositories using the `repositoryUrl` key. See the [Remote Sources](../advanced/using-remote-sources.md) guide for details.
