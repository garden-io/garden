---
title: Module Configuration
order: 2
---

# Module Configuration

You need to write Garden module configs next to the pulumi stacks you'd like to include in your project. These should be located in the same direcory as the stack config, or in an enclosing directory.

For example:
```yaml
kind: Module
type: pulumi
name: my-pulumi-module
# If the pulumi stack doesn't exist already when deploying, create it
createStack: true 
# Cache deploys based on the Garden service version (see the section below)
cacheStatus: true
# These variables will be merged into the stack config before deploying or previewing
pulumiVariables:
  my-variable: pineapple
# Variables defined in varfiles will also be merged into the stack config in declaration
# order (and take precedence over variables defined in this module's pulumiVariables).
pulumiVarfiles: [my-default-varfile.yaml, dev.yaml]
```
See the [reference docs for the pulumi module type](../../reference/module-types/pulumi.md) for more info on each available config field (and how/when to use them).

