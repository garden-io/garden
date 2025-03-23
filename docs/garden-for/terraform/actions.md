---
title: Applying Terrform Stacks
order: 2
---

{% hint style="info" %}
To apply Terraform stacks before actions (e.g. to provision a K8s cluster), refer to the [Terraform provider docs](./configure-provider.md).
{% endhint %}

You can define `terraform` actions as part of your project, much like any other actions. A `terraform` action maps to a single `Deploy` that you can define as a runtime dependency for any of your other `Deploy`, `Run` and `Test` actions. You can also reference the stack outputs of a `terraform` action using [runtime output template strings](../../config-guides/variables-and-templating.md#runtime-outputs). For example:

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

Much like other Deploy actions, you can also reference Terraform definitions in other repositories using the `repositoryUrl` key. See the [Remote Sources](../config-guides/custom-commands.md

## Setting the backend dynamically

[Terraform does not interpolate named values in backend manifests](https://developer.hashicorp.com/terraform/language/backend) but with Garden you can achieve this via the `backendConfig` field on the `terraform` Deploy action. This enables you to dynamically set the backend when applying your Terraform stack in different environments.

### Example - Isolated namespaces for Labmda functions

In the example below we can imagine a project with multiple AWS Lambda functions and a Terraform stack per function. Splitting the functions into individual stacks is useful for leveraging Garden's graph and cache capabilities. For example, you can granularly deploy or test individual lambdas instead of having everything bundled together in big stack.

Here we namespace the Lambdas such that each developer and CI run gets its own isolated namespace which can be cleaned up after the run.

We achieve this via the `backendConfig` field on the `terraform` Deploy action spec which can make use of Garden's powerful templating system.

```yaml
# In project.garden.yml file
apiVersion: "garden.io/v1"
kind: Project
name: terraform-lambda-example
defaultEnvironment: dev

environments:
  - name: dev
    variables:
      tfNamespace: ${kebabCase(local.username)} # <--- Each user has their own set of lambdas
  - name: ci
    variables:
      tfNamespace: ${slice(git.commitHash, 0, 7) || '<detached>'} # <--- Each CI run has its own set of lambdas

---
kind: Deploy
name: function-a
type: terraform
spec:
  root: ./tf/function-a
  variables:
    function_name_prefix: ${var.tfNamespace} # <--- This would get passed to Terraform to ensure the function names are unique
  backendConfig:
    bucket: my-${environment.name}-bucket
    key: tf-state/${var.tfNamespace}/terraform.tfstate
---
kind: Deploy
name: function-b
type: terraform
spec:
  root: ./tf/function-b
  variables:
    function_name_prefix: ${var.tfNamespace}
  backendConfig:
    bucket: my-${environment.name}-bucket
    key: tf-state/${var.tfNamespace}/terraform.tfstate
```

The corresponding Terraform `main.tf` files would look something like this:

```hcl
# For example in ./tf/function-a/main.tf
terraform {
  required_version = ">= 0.12"
  backend "s3" {
    bucket = ""
    key    = ""
    region = "<my-aws-region>"
  }
}
# ...
```

Note that this same pattern of course applies to other cloud providers and/or resources as well.

You can use the `garden cleanup` function to cleanup namespaces. It's also useful to have a lifecycle policy for cleaning up S3 buckets in non-prod environments.
