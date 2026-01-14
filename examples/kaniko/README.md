# kaniko

A very basic demo project for Garden showing in-cluster building with [kaniko](https://github.com/GoogleContainerTools/kaniko).

Just run `garden deploy --env=remote` and see the kaniko builder do its job!

Snippet from [project config](garden.yml)
```yml
apiVersion: garden.io/v1
kind: Project
name: kaniko
environments:
  - name: local
  - name: remote
providers:
  - name: local-kubernetes
    environments: [local]
  - name: kubernetes
    environments: [remote]
    buildMode: kaniko
    # set these as appropriate
    context: # ...
    namespace: ${project.name}-testing-${var.userId}
    defaultHostname: ${project.name}-testing-${var.userId}.dev.example.com
    deploymentRegistry:
      hostname: # ... # <- set this to your registry hostname
      namespace: # ... # <- typically your organization name, project ID etc.
...
```
