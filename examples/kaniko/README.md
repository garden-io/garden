# kaniko

A very basic demo project for Garden showing in-cluster building with [kaniko](https://github.com/GoogleContainerTools/kaniko).

Just run `garden deploy` and see the kaniko builder do its job!

Snippet from [project config](garden.yml)
```yml
kind: Project
name: kaniko
environments:
  - name: local
  - name: remote
    defaultNamespace: ${var.userId}
providers:
  - name: local-kubernetes
    environments: [local]
    buildMode: kaniko
    kaniko:
      namespace: null # This will make the kaniko builder pod appear in the same namespace as the project
...
```
