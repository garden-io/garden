---
title: Provider Configuration
order: 1
---

# Provider Configuration

First, you need to enable the pulumi provider in your project configuration. This is as simple as placing it in your list of providers:
```yaml
apiVersion: garden.io/v1
kind: Project
name: my-project
providers:
  - name: pulumi # <----
  ...
```

In case you want to use different backends for different Garden environments you can configure your provider and modules follows. This example uses two
different pulumi backends. In the `dev` environment it uses a self-managed state backend, in this case an S3 bucket which is specified
with the `backendURL`.
In the `prod` environment it uses pulumi managed state backend, which is the default so we don't need to specify a `backendURL`. 

Note that when you use a self managed state backend, Garden's module level `cacheStatus` needs to be set to `false`, since 
caching is only available with the pulumi managed state backend. The same applies to `orgName` which only makes sense in the context of the pulumi managed state backend.
Please ensure that `orgName` is set to `null` or empty string `""` for all the environments that are not using the pulumi managed state backend.

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
kind: Module
type: pulumi
name: aws-s3
stack: ${environment.name}
createStack: true
cacheStatus: ${var.cacheStatus} # cacheStatus has to be set to false for self-managed state backends
description: Creates an s3 bucket
pulumiVariables:
  environment: ${environment.name}
```

There are several configuration options you can set on the provider—see the [reference docs for the pulumi provider](../reference/providers/pulumi.md) for details.
