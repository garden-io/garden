---
order: 2
title: Provider Configuration
---

# Provider Configuration

First off, you need to enable the provider in your project configuration. This is as simple as placing it in your list of providers:

```yaml
kind: Project
name: my-project
providers:
  - name: terraform
  - name: kubernetes
  ...
```

If you'd like to apply the stack when starting Garden, and then reference the stack outputs in other providers (or modules), you need to add a couple of more flags. Here's the project config from the aforementioned [terraform-gke example](https://github.com/garden-io/garden/tree/0.12.46/examples/terraform-gke):

```yaml
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

Notice also that we're providing an output value from the stack to the `kubernetes` provider. This can be very powerful, and allows you to fully codify your full project setup, not just the services running in your environment. Any Garden module can also reference the provider outputs in the exact same way, so you can easily provide your services with any information they need to operate.

