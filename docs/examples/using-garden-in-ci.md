# Using Garden in CI

In this guide we'll demonstrate how Garden can fit into your continuous integration (CI) pipeline. Simply by adding extra environments to the project configuration, you can use Garden for local development _and_ for testing and deploying your project in CI. This approach has several benefits:

* Use the same tool and the same set of commands for the entire development cycle, from source to finish.
* No need to change your CI configuration when you change your stack since Garden holds the entire stack graph.
* The only thing you need to install in CI is the Garden CLI and its dependencies (or use a ready-made Garden container image).
* When using [in-cluster building](../guides/in-cluster-building.md) your CI also uses the same build and test result cache as you and your team, which makes for a much faster pipeline.

To use Garden in your CI pipeline you need the following:

1. A Garden project, [configured to deploy to a remote cluster](#configure-remote-environments).
2. A [Kubectl context](#configure-the-kubectl-context) on the CI agent that's configured for the remote cluster.

For the purposes of this example we'll be using [CircleCI](https://circleci.com) and deploying to a Google Kubernetes Engine (GKE) cluster. However, the instructions below can easily be applied to other CI platforms and cloud providers.

The guide is based on the [Remote Kubernetes](https://docs.garden.io/guides/remote-kubernetes) example. In what follows we assume that you've read that guide and that you have a running Kubernetes cluster to work with.

## Prerequisites

* A [CircleCI account](https://circleci.com/)
* A running Kubernetes cluster that you have API access to

## Project overview

The project is based on our basic [demo-project](https://github.com/garden-io/garden/tree/v0.11.5/examples/demo-project) example, but configured for multiple environments. Additionally it contains a CircleCI config file. You'll find the entire source code [here](https://github.com/garden-io/ci-demo-project).

The CI pipeline in configured so that Garden tests the project and deploys it to a **preview** environment on every pull request. Additionally, it tests the project and deploys it to a separate **staging** environment on every merge to the `master` branch.

To see it in action, you can fork the repository and follow the set-up steps below. Once you've set everything up, you can submit a pull request to the fork to trigger a CircleCI job which in turns deploys the project to your remote Kubernetes cluster.

## Configure remote environments

Configuring Garden to work against a remote Kubernetes cluster is explained step by step in our [Remote Kubernetes guide](../guides/remote-kubernetes.md). For this example, we also use [in-cluster building](../guides/in-cluster-building.md).

For this project we're using three environments: `local`, `preview` and `staging`. The `local` environment is the default and is configured for a local Kubernetes cluster that runs on the user's machine. The other two run on remote clusters.

We deploy to the `preview` environment every time someone makes a pull request on Github. The configuration looks like this:

```yaml
# garden.yml
kind: Project
name: ci-demo-project
environments:
  ...
  - name: preview
providers:
  - name: kubernetes
    environments: [preview]
    context: my-preview-cluster
    defaultHostname: ci-demo-project-${local.env.CIRCLE_BRANCH || local.username}.preview.my-domain
    namespace: ci-demo-project-${local.env.CIRCLE_BRANCH || local.username}
    buildMode: cluster-docker
```

Notice that we're using the `CIRCLE_BRANCH` environment variable to label the project namespace. This ensures that each pull request gets deployed into its own namespace.

The `staging` environment is configured in a similar manner. The relevant CI job is triggered on merges to the `master` branch.

You'll find the rest of the config [here](https://github.com/garden-io/ci-demo-project/blob/master/garden.yml).

## Configure the kubectl context

We need to make sure that it can access our remote cluster. We do this by setting up a [kubectl context](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/) on the CI agent. How you set this up will vary by how and where you have deployed your cluster. What follows is specific to GKE.

Note: Below we use the `gardendev/garden-gcloud` container image, that extends the standard
`gardendev/garden` image to bundle the `gcloud` binary. You could also add an installation step to install `gcloud`
(or any other binaries needed for your setup), or you could fashion your own container image to save time when testing.
_(You're also more than welcome to ask us to add another pre-packaged container to our release pipeline :))_

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

* `GCLOUD_SERVICE_KEY`: Follow [these instructions](https://cloud.google.com/sdk/docs/authorizing#authorizing_with_a_service_account) to get a service account key.
* `GCLOUD_PROJECT_ID`, `GCLOUD_COMPUTE_ZONE`,  and `GCLOUD_CLUSTER_ID`: These you'll find under the relevant project in your Google Cloud Platform console.

Please refer to this [doc](https://circleci.com/docs/2.0/google-auth/) for more information on using the Google Cloud SDK in CircleCI.

You'll find the entire CircleCI config for this project
[here](https://github.com/garden-io/ci-demo-project/blob/master/.circleci/config.yml).

## Running Garden commands in CircleCI

Now that we have everything set up, we can [add the project](https://circleci.com/docs/2.0/getting-started/#setting-up-your-build-on-circleci) to CircleCI and start using Garden in our CI pipelines.

Here's what our preview job looks like:

```yaml
# .circleci/config
jobs:
  preview:
    docker:
      - image: gardendev/garden-gcloud:v0.10.0-1
    steps:
      - checkout
      - configure_kubectl_context
      - run:
          name: Test project
          command: garden test --logger-type=basic --env=preview
      - run:
          name: Deploy project
          command: garden deploy --logger-type=basic --env=preview
```

Notice that there are no configuration steps outside of just configuring the kubectl context.
And no matter how you change your stack, these steps will remain the same, making for a highly portable
workflow—and much less fiddling around with CI!
