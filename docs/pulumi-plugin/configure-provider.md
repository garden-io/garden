---
title: Provider Configuration
order: 1
---

# Provider Configuration

First, you need to enable the pulumi provider in your project configuration. This is as simple as placing it in your list of providers:
```yaml
kind: Project
name: my-project
providers:
  - name: pulumi # <----
  ...
```
There are several configuration options you can set on the provider—see the [reference docs for the pulumi provider](../../reference/providers/pulumi.md) for details.
