---
title: 1. Configure the Provider
order: 1
---

# 1. Configure the Provider

To use the `ephemeral-kubernetes` provider, all you have to do is add it to your project configuration and assign an environment to it.

```yaml
apiVersion: garden.io/v1
kind: Project
environments:
  - name: ephemeral
providers:
  - name: ephemeral-kubernetes
    environments: [ephemeral]
```

(If you're not yet familiar with Garden configuration files, see:
[Configuration files](../../using-garden/configuration-overview.md))

