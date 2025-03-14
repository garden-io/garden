---
title: Apply stacks
order: 2
---

# Actions

## Deploy Action

You need to write Garden Deploy action configs next to the pulumi stacks you'd like to include in your project. These should be located in the same directory as the stack config, or in an enclosing directory.

For example:
```yaml
kind: Deploy
type: pulumi
name: my-pulumi-deploy-action
spec:
  # If the pulumi stack doesn't exist already when deploying, create it
  createStack: true
  # Cache deploys based on the Garden service version (see the section below)
  # Setting `cacheStatus = true` works only with Pulumi service managed state backends.
  cacheStatus: true
  # These variables will be merged into the stack config before deploying or previewing
  pulumiVariables:
    my-variable: pineapple
  # Variables defined in varfiles will also be merged into the stack config in declaration
  # order (and take precedence over variables defined in this Deploy action's pulumiVariables).
  pulumiVarfiles: [my-default-varfile.yaml, dev.yaml]
```

In case you want to use different backends for different Garden environments and you want to use deploy action specific pulumi managed state backend organizations, you can configure your deploy actions as follows. This example uses two different pulumi backends. For the `prod` environment it uses the pulumi managed state backend and for the `dev` environment it uses a self managed S3 backend.

Note that when you use a self managed state backend `spec.cacheStatus` needs to be set to `false`, since caching is only available with the pulumi managed state backend. The same applies to `spec.orgName` which only makes sense in the context of the pulumi managed state backend. Please ensure that `spec.orgName` is set to `null` or empty string `""` for all the environments that are not using the pulumi managed state backend.

```yaml
apiVersion: garden.io/v1
kind: Project
name: pulumi
defaultEnvironment: dev
environments:
  - name: dev
    variables:
      backendURL: s3://<bucket-name>
  - name: prod
providers:
  - name: pulumi
    environments: [dev, prod]
    backendURL: ${var.backendURL || null} # backendURL defaults to the pulumi managed state backend if null or empty string ""
---
kind: Deploy
type: pulumi
name: s3stack
spec:
  stack: s3
  orgName: '${environment.name == "prod" ? "s3stack-prod" : ""}' # orgName has to be null or an empty string "" for self-managed state backends
  createStack: true
  cacheStatus: '${environment.name == "prod" ? true : false}' # cacheStatus has to be set to false for self-managed state backends
  description: Creates an s3 bucket
  pulumiVariables:
    environment: ${environment.name}
```

See the [reference docs for the pulumi deploy action type](../../reference/action-types/Deploy/pulumi.md) for more info on each available config field (and how/when to use them).
