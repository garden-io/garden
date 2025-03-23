---
title: Using Pulumi
order: 1
---

# Plugin Configuration

First, you need to enable the `pulumi` provider in your project configuration. This is as simple as placing it in your list of providers:
```yaml
apiVersion: garden.io/v1
kind: Project
name: my-project
providers:
  - name: pulumi # <----
  ...
```

In case you want to use different backends for different Garden environments you can configure your provider and deploy actions follows. This example uses two different pulumi backends. In the `dev` environment it uses a self-managed state backend, in this case an S3 bucket which is specified with the `backendURL`. In the `prod` environment it uses pulumi managed state backend, which is the default so we don't need to specify a `backendURL`.

Note that when you use a self managed state backend, Garden's deploy action level `spec.cacheStatus` needs to be set to `false`, since caching is only available with the pulumi managed state backend. The same applies to `spec.orgName` which only makes sense in the context of the pulumi managed state backend. Please ensure that `spec.orgName` is set to `null` or empty string `""` for all the environments that are not using the pulumi managed state backend.

```yaml
---
apiVersion: garden.io/v1
kind: Project
name: pulumi
defaultEnvironment: dev
variables:
  cacheStatus: true
environments:
  - name: dev
    variables:
      backendURL: s3://<bucket-name>
      cacheStatus: false # cacheStatus has to be set to false for self-managed state backends
  - name: prod
    variables:
      orgName: garden
providers:
  - name: pulumi
    environments: [dev, prod]
    orgName: ${var.orgName || null} # ensure orgName is null or "" for self-managed state backends
    backendURL: ${var.backendURL || null} # defaults to Pulumi managed state backend if null or ""

---
kind: Deploy
type: pulumi
name: aws-s3
description: Creates an s3 bucket
spec:
  createStack: true
  cacheStatus: ${var.cacheStatus} # cacheStatus has to be set to false for self-managed state backends
  stack: ${environment.name}
  pulumiVariables:
    environment: ${environment.name}
```

There are several configuration options you can set on the provider—see the [reference docs for the pulumi provider](../../reference/providers/pulumi.md) for details.
