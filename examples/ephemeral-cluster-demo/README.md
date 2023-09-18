# Demo project with using Ephemeral Cluster

A basic demo showing the use of Ephemeral Clusters.


# Simple demo project using Ephemeral Cluster

This example project demonstrates how to use Garden's ephemeral-kubernetes provider for deploying an application to one of the ephemeral Kubernetes clusters provided by Garden.

For information about ephemeral Kubernetes clusters, [`check out the docs.`](../../docs/overview/ephemeral-clusters.md)

## Configuring ephemeral kubernetes

The project configuration of this application, which is specified in `garden.yml`, declares 2 environments `local` and `remote`. And for the `remote` environment `ephemeral-kubernetes` provider is configured as following:

```yaml
...
environments:
  - name: remote # <-- remote environment name

providers:
  # setting ephemeral-kubernetes provider for remote environment
  - name: ephemeral-kubernetes
    environments: [remote]
...
```

## Deploying the project

To deploy this project to an ephemeral cluster provided by Garden, follow these steps:

1. Login to Garden Cloud using `garden login`.
2. Run `garden deploy` to deploy the application to remote environment which would be on an ephemeral cluster.

The ephemeral cluster will be created for you automatically during the deploy step. Once the project has been successfully deployed, the logs will display the ingress URLs for accessing the backend and the frontend.

> [!NOTE]
> To preview an ingress URL, you'll need to authenticate with GitHub and authorize the "Garden Ephemeral Environment Previews" app.
