# Voting example project using Ephemeral Cluster

This example project demonstrates how to use Garden's ephemeral-kubernetes provider for deploying an application to one of the ephemeral Kubernetes clusters provided by Garden.

For information about ephemeral Kubernetes clusters, check out the docs: <!-- todo: add link to docs for ephemeral clusters -->

## Configuring ephemeral kubernetes

The project configuration of this application, which is specified in `project.garden.yml`, declares an environment called `remote` and configures `ephemeral-kubernetes` provider in the config as following:

```yaml
...
environments:
  - name: remote # <-- environment name

providers:
  # setting ephemeral-kubernetes provider for remote environment
  - name: ephemeral-kubernetes
    environments: [remote]
```

## Deploying the project

To deploy this project to an ephemeral cluster provided by Garden, follow these steps:

1. Login to Garden Cloud using `garden login`.
2. Run `garden deploy` to deploy the application to ephemeral cluster.

The ephemeral cluster will be created for you automatically during the deploy step. Once the project has been successfully deployed, the logs will display the ingress URLs for accessing the frontned and the api.
