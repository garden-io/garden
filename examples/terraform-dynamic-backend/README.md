# Dynamic Terraform backend example project

This example project demonstrates how to use dynamic Terraform backends with Garden.

Terraform itself doesn't allow variables in the backend configuration but with Garden you can enable this behaviour and create unique, on-demand environments for your Terraform stack.

> [!TIP]
> If using S3 or similar as your Terraform backend, set a lifecycle policy on your bucket so that old folders get cleaned up in non-production environments. They'll anyway get re-created if needed.

## Using this project

This project is for demonstrating how to configure dynamic backends and won't run without access to an S3 bucket (with the corresponding values in the `project.garden.yml` file correctly set).

Assuming everything's wired up, running Garden in different environments will dynamically set the backend and re-initialize Terraform if needed.

E.g. running `garden deploy` would use the default `dev` environment and store the state in the `dev-bucket` under a folder named `tf-state/<your-username>` .

Similarly, running `garden deploy --env ci` would store the state in the `ci-bucket` under a folder named `tf-state/<short-git-commit-hash>`

## How it's set up

The `main.tf` file includes the `backend` configuration:

```terraform
terraform {
  required_version = ">= 0.12"
  backend "s3" {
    # Set in Garden config
    bucket = ""
    key = ""
    region = ""
  }
}
```

You'll notice that the actual values are empty because they're set dynamically by Garden (you could also have default values here).

In the Garden config in the `project.garden.yml` file we dynmically set the backend values based on the environment:

```yaml
apiVersion: "garden.io/v1"
kind: Project
# ...

environments:
  - name: dev
    variables:
      bucket: dev-bucket
      keyNamespace:
      ${kebabCase(local.username)}
# ...

---
kind: Deploy
name: tf-hello

spec:
  root: .
  backendConfig:
    bucket: ${var.bucket} # <--- Resolves to dev-bucket in dev env
    key: tf-state/${var.keyNamespace}/terraform.tfstate # <--- Resolves to tf-state/<your-username>/terraform.tfstate in dev env
    region: eu-central-1
```

