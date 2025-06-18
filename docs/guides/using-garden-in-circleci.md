---
title: Using Garden in CircleCI
order: 90
---

## Prerequisites

In addition to the prerequisites in the [Portable CI Pipelines that Run Anywhere](../overview/use-cases/portable-ci-pipelines.md) doc.

For the purposes of this example we'll be using [CircleCI](https://circleci.com) and deploying to a Google Kubernetes Engine (GKE) cluster.

## Project overview

The project is based on our basic [demo-project](https://github.com/garden-io/garden/tree/0.14.4/examples/demo-project) example, but configured for multiple environments. Additionally it contains a CircleCI config file. You'll find the entire source code [here](https://github.com/garden-io/ci-demo-project).

The CI pipeline is configured so that Garden tests the project and deploys it to a **preview** environment on every pull request. Additionally, it tests the project and deploys it to a separate **staging** environment on every merge to the `main` branch.

To see it in action, you can fork the repository and follow the set-up steps below. Once you've set everything up, you can submit a pull request to the fork to trigger a CircleCI job which in turns deploys the project to your remote Kubernetes cluster.

## Configure remote environments

Configuring Garden to work against a remote Kubernetes cluster is explained step by step in our [Remote Kubernetes guide](../garden-for/kubernetes/README.md).

For this project we're using three environments: `local`, `preview` and `staging`. The `local` environment is the default and is configured for a local Kubernetes cluster that runs on the user's machine. The other two run on remote clusters.

We deploy to the `preview` environment every time someone makes a pull request on Github. The configuration looks like this:

```yaml
# garden.yml
apiVersion: garden.io/v2
kind: Project
name: ci-demo-project
environments:
  ...
  - name: preview
    defaultNamespace: preview-${local.env.CIRCLE_BRANCH || local.username}
providers:
  - name: kubernetes
    environments: [preview]
    context: my-preview-cluster
    defaultHostname: ${environment.namespace}.preview.my-domain
    buildMode: cluster-buildkit
```

Notice that we're using the `CIRCLE_BRANCH` environment variable to label the project namespace. This ensures that each pull request gets deployed into its own namespace.

The `staging` environment is configured in a similar manner. The relevant CI job is triggered on merges to the `main` branch.

You'll find the rest of the config [here](https://github.com/garden-io/ci-demo-project/blob/main/garden.yml).

## Configure the kubectl context

We need to make sure that it can access our remote cluster. We do this by setting up a [kubectl context](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/) on the CI agent. How you set this up will vary by how and where you have deployed your cluster. What follows is specific to GKE.

We create a re-usable command for configuring the kubectl context:

```yaml
# .circleci/config
commands:
  configure_kubectl_context:
    description: Configure the kubectl context so that we can access our remote cluster
    steps:
      - run:
          name: Configure kubectl context via gcloud
          command: |
            gcloud --quiet components update
            echo $GCLOUD_SERVICE_KEY | gcloud auth activate-service-account --key-file=-
            gcloud --quiet config set project $GCLOUD_PROJECT_ID && gcloud --quiet config set compute/zone $GCLOUD_COMPUTE_ZONE
            gcloud --quiet container clusters get-credentials $GCLOUD_CLUSTER_ID --zone $GCLOUD_COMPUTE_ZONE
            gcloud --quiet auth configure-docker
```

The commands use the following environment variables that you can set on the **Project Environment Variables** page (see [here](https://circleci.com/docs/2.0/env-vars/#setting-an-environment-variable-in-a-project)) in the CircleCI dashboard:

- `GCLOUD_SERVICE_KEY`: Follow [these instructions](https://cloud.google.com/sdk/docs/authorizing#authorizing_with_a_service_account) to get a service account key.
- `GCLOUD_PROJECT_ID`, `GCLOUD_COMPUTE_ZONE`, and `GCLOUD_CLUSTER_ID`: These you'll find under the relevant project in your Google Cloud Platform console.

Please refer to this [doc](https://circleci.com/docs/2.0/google-auth/) for more information on using the Google Cloud SDK in CircleCI.

You'll find the entire CircleCI config for this project
[here](https://github.com/garden-io/ci-demo-project/blob/main/.circleci/config.yml).

## Running Garden commands in CircleCI

Now that we have everything set up, we can [add the project](https://circleci.com/docs/2.0/getting-started/#setting-up-your-build-on-circleci) to CircleCI and start using Garden in our CI pipelines.

Note: Below we use the `gardendev/garden-gcloud` container image, that extends the standard
`gardendev/garden` image to bundle the `gcloud` binary (Google Cloud CLI).
For an overview of all official Garden convenience containers, please refer to [the reference guide for DockerHub containers](../reference/dockerhub-containers.md).

Here's what our preview job looks like:

```yaml
# .circleci/config
jobs:
  preview:
    docker:
      - image: gardendev/garden-gcloud:bonsai-alpine
    environment:
      GARDEN_LOG_LEVEL: verbose # set the log level to your preference here
    steps:
      - checkout
      - configure_kubectl_context
      - run:
          name: Test project
          command: garden test --env=preview
      - run:
          name: Deploy project
          command: garden deploy --env=preview
```

Notice that there are no configuration steps outside of just configuring the kubectl context.
And no matter how you change your stack, these steps will remain the same, making for a highly portable
workflow—and much less fiddling around with CI!
