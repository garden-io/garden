---
title: Using Terraform
order: 1
---

First off, you need to enable the provider in your project configuration. This is as simple as placing it in your list of providers:

```yaml
apiVersion: garden.io/v2
kind: Project
name: my-project
providers:
  - name: terraform
  - name: kubernetes
  ...
```

If you'd like to apply the stack when starting Garden, and then reference the stack outputs in other providers (or actions), you need to add a couple of more flags. Here's the project config from the aforementioned [terraform-gke example](https://github.com/garden-io/garden/tree/0.14.15/examples/terraform-gke):

```yaml
apiVersion: garden.io/v2
kind: Project
name: terraform-gke
providers:
  - name: terraform
    # This must be set if we want to resolve a stack as part of the provider initialization.
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
    buildMode: kaniko
```

The `initRoot` parameter tells Garden that there is a Terraform working directory at the specified path. If you don't specify this, Garden doesn't attempt to apply a stack when initializing the provider.

Notice also that we're providing an output value from the stack to the `kubernetes` provider. This can be very powerful, and allows you to fully codify your full project setup, not just the services running in your environment. Any Garden action can also reference the provider outputs in the exact same way, so you can easily provide your services with any information they need to operate.

## Setting the backend dynamically


[Terraform does not interpolate named values in backend manifests](https://developer.hashicorp.com/terraform/language/backend) but with Garden you can achieve this via the `backendConfig` field on the Terraform provider. This enables you to dynamically set the backend when applying your Terraform stack in different environments.

### Example - Provision a K8s cluster per environment

In the example below we can imagine a Terraform stack that provisions a Kubernetes cluster when Garden starts and passes the output to other providers (similar to the example above) and picks a backend dynamically depending on the environment.

We achieve this via the `backendConfig` field on the `terraform` provider spec which can make use of Garden's powerful templating system.

This means you can run `garden deploy` (for the dev env) and it will use the corresponding backend. From the same host you could then run `garden deploy --env` without needing to update your config and manually re-intialize Terraform, and it will again pick the correct backend.

```yaml
# In project.garden.yml file
apiVersion: "garden.io/v2"
kind: Project
name: terraform-lambda-example
defaultEnvironment: dev

environments:
  - dev
  - ci

providers:
  - name: terraform
    initRoot: "."
    # Pick the right S3 bucket and key for the environment
    backendConfig:
      bucket: my-${environment.name}-bucket
      key: tf-state/${environment.name}/terraform.tfstate
  - name: kubernetes
    kubeconfig: ${providers.terraform.outputs.kubeconfig_path}
# ...
```

A corresponding Terraform `main.tf` file would look like this:

```hcl
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
