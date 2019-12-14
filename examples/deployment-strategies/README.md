# Deployment strategies example

A basic demo project showing different deployment strategies.

It is based on the [examples/demo-project](https://github.com/garden-io/garden/tree/master/examples/demo-project) and it's meant to show how to configure the deployment strategies.

> NOTE: the "Deployment Strategies feature" is still in the experimental phase. This means there might be changes to the properties names/values or to the behaviour in the future. Please be aware of this when using the feature.


## Usage

This project doesn't require any specific set up and can be deployed (in your local cluster) in a single step with the `deploy` command:

```sh
garden deploy --env=local-blue-green
```

The first deploy on a fresh cluster will always be a normal `rolling-update` deploy. After making some changes to any of the module you will be able to see the Blue/Green strategy in action.

### Example of configuration

For more detailed configuration please check out the `garden.yml` file.

```yaml
kind: Project
name: My Project
environments:
  - name: local-blue-green
  providers:
    # Blue-green deployment strategy on local-kubernetes.
    - name: local-kubernetes
      deploymentStrategy: blue-green
```
