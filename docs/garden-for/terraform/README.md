---
title: Terraform
order: 3
---

Garden includes a Terraform provider that you can use to automatically validate and provision infrastructure as part of your project. This guide walks through how to configure and use the provider.

It's strongly recommended that you [learn about Terraform](https://developer.hashicorp.com/terraform/docs) (if you haven't already) before using it with Garden.

## How it works

Under the hood, Garden simply wraps Terraform, so there's no magic involved. Garden just automates its execution and makes stack outputs available to your Garden providers and actions.

Terraform resources can be provisioned through the `terraform` provider when initializing Garden, or via `terraform` actions that are utilized like other actions in your stack.

The former, having a single Terraform stack for your whole project, is most helpful if other provider configurations need to reference the outputs from your Terraform stack, or if most/all of your services depend on the infrastructure provisioned in your Terraform stack. A good example of this is the [terraform-gke example](https://github.com/garden-io/garden/tree/0.14.3/examples/terraform-gke) project, which provisions a GKE cluster that the `kubernetes` provider then runs on, along with the services in the project. The drawback is that Garden doesn't currently watch for changes in those Terraform files, and you need to restart to apply new changes, or apply them manually.

Using `terraform` _Deploy actions_, can be better if your other providers don't need to reference the stack outputs but other Deploy, Run and Test actions do. In this style, you can basically create small Terraform stacks that are part of your Stack Graph much like other services. A good example would be deploying a database instance, that other services in your project can then connect to.

You can also use a combination of the two if you'd like. Below we'll walk through how each of these work.

## Planning and applying

Garden will not automatically apply the Terraform stack, unless you explicitly set the `autoApply` flag on the config for the stack. Instead, Garden will warn you if the stack is out of date.

{% hint style="warning" %}
We only recommend using `autoApply` for private development environments, since otherwise you may accidentally apply hazardous changes, or conflict with other users of an environment.
{% endhint %}

To manually plan and apply stacks, we provide the following commands:

```console
garden --env=<env-name> plugins terraform apply-root                     # Runs `terraform apply` for the provider root stack.
garden --env=<env-name> plugins terraform apply-action -- <action-name>  # Runs `terraform apply` for the specified terraform Deploy action.
garden --env=<env-name> plugins terraform plan-root                      # Runs `terraform plan` for the provider root stack.
garden --env=<env-name> plugins terraform plan-action -- <action-name>   # Runs `terraform plan` for the specified terraform Deploy action.
```

Each command automatically applies any variables configured on the provider or action in question. Any additional arguments you specify for the command are passed directly to the `terraform` CLI command, but you need to place them after a `--` so that they aren't parsed as Garden options. For example, to apply the root stack with `-auto-approve`:

```console
garden --env=<env-name> plugins terraform apply-root -- -auto-approve
```

## Setting the backend dynamically

[Terraform does not interpolate named values in backend manifests](https://developer.hashicorp.com/terraform/language/backend) but with Garden you can achieve this via the `backendConfig` field on either the `terraform` provider or action configuration. This enables you to dynamically set the backend when applying your Terraform stack in different environments.

For example, running `garden deploy --env dev` and `garden deploy --env ci` will pick the appropriate backend for the environment.

If you'd like to apply the stack when starting Garden (e.g. because you're provisioning a Kubernetes cluster and need to pass the outputs to other Garden providers), check out [the Terraform provider docs for configuring dynamic backends](./configure-provider.md#setting-the-backend-dynamically).

If instead you configure your Terraform stack via actions (e.g. because you have
multiple AWS labmdas that should each have their own stack), check out [the Terraform action docs for configuring dynamic backends](./actions.md#setting-the-backend-dynamically).

## Next steps

Check out how to configure the Terraform provider and/or actions in the following pages.
You'll find some [Terraform examples here](https://github.com/garden-io/garden/tree/0.14.3/examples).

