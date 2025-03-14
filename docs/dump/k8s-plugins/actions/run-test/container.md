---
title: Container
order: 4
---

# Container

The `container` Run and Test actions can be used for running one off jobs as a Pod using a given container image and similarly for running test. For example:

```yaml
kind: Build
name: api
type: container
---
kind: Test
name: api
type: container
dependencies: [build.api]
spec:
  image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action
  command: [npm, run, test]
---
kind: Run
name: seed-db
type: container
dependencies: [build.api]
spec:
  image: ${actions.build.api.outputs.deployment-image-id} # <--- The output from the Build action
  command: [npm, run, seed-db]
```

