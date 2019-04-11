# Using Garden in CI

In this guide we'll demonstrate how Garden can fit into your continuous integration (CI) pipeline. Simply by adding extra environments to the project configuration, you can use Garden for local development _and_ for testing and deploying your project in CI. This approach has several benefits:

* Use the same tool and the same set of commands for the entire development cycle, from source to finish.
* No need to change your CI configuration when you change your stack since Garden holds the entire stack graph.
* The only thing you need to install in CI is the Garden CLI and its dependencies.

To use Garden in a CI pipeline you need the following:

1. A Garden project, [configured to deploy to a remote cluster](#configure-garden-for-remote-environments).
2. [An installation of Garden on your CI agent](#install-garden-on-your-ci-agent).
3. [Kubectl context](#configure-the-kubectl-context) on the CI agent that's configured against the remote cluster.

For the purposes of this example we'll be using [CircleCI](https://circleci.com) and deploying to a Google Kubernetes Engine (GKE) cluster. However, the instructions below can easily be applied to other CI platforms and cloud providers.

The guide is based on the [Remote Kubernetes](https://docs.garden.io/using-garden/remote-clusters) example. In what follows we assume that you've completed the steps in that guide and that you have a running Kubernetes cluster.

## Prerequisites

* A [CircleCI account](https://circleci.com/)
* A running Kubernetes cluster that you have API access to

## Project overview

The project is based on our [demo-project](https://github.com/garden-io/garden/tree/v0.9.9/examples/simple-project) example, but configured for multiple environments. Additionally it contains a CircleCI config file. You'll find the entire source code [here](https://github.com/garden-io/ci-demo-project).

The CI pipeline in configured so that Garden tests the project and deploys it to a **preview** environment on every pull request. Additionally, it tests the project and deploys it to a separate **staging** environment on every merge to the `master` branch.

To see it in action, you can fork the repository and follow the set-up steps below. Once you've set everything up, you can submit a pull request to the fork to trigger a CircleCI job which in turns deploys the project to your remote Kubernetes cluster.

## Configure remote environments

Configuring Garden to work against a remote Kubernetes cluster is explained step by step in our [Remote Kubernetes guide](https://docs.garden.io/using-garden/remote-clusters).

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
        context: my-preview-cluster
        defaultHostname: ci-demo-project-${local.env.CIRCLE_BRANCH || "default"}.preview.my-domain
        namespace: ci-demo-project-${local.env.CIRCLE_BRANCH || "default"}
        deploymentRegistry:
          # The hostname of the registry, e.g. gcr.io for GCR (Google Container Registry)
          hostname: my-registry-hostname
          # Namespace to use in the registry for this project. For GCR, use the project ID where your cluster is.
          namespace: my-registry-namespace
```

Notice that we're using the `CIRCLE_BRANCH` environment variable to label the project namespace. This ensures that each pull request gets deployed into its own namespace.

The `staging` environment is configured in a similar manner. The relevant CI job is triggered on merges to the `master` branch.

You'll find the rest of the config [here](https://github.com/garden-io/ci-demo-project/blob/master/garden.yml).

## Install Garden on your CI agent

As of CircleCI 2.1, you can define your own re-usable commands. That's what we've done for the `install_garden` command, which, as the name suggests, installs Garden and it's dependencies:

```yaml
# .circleci/config
commands:
  install_garden:
    description: Installs the Garden CLI and it's dependencies
    steps:
      - run:
          name: Install Garden dependencies
          command: |
            sudo apt-get update && sudo apt-get install rsync
            mkdir $HOME/kubectl
            curl -L -o $HOME/kubectl/kubectl "https://storage.googleapis.com/kubernetes-release/release/v1.11.3/bin/linux/amd64/kubectl"
            chmod +x $HOME/kubectl/kubectl
      - run:
          name: Install the Garden CLI
          command: |
            mkdir $HOME/garden
            curl -L https://github.com/garden-io/garden/releases/download/v0.9.6/garden-v0.9.6-linux-amd64.tar.gz | tar xvz -C $HOME/garden --strip-components=1
      - run:
           name: Add Garden and Kubectl to the CircleCI agent path
          command: |
            echo 'export PATH=$HOME/garden:$PATH' >> $BASH_ENV
            echo 'export PATH=$HOME/kubectl:$PATH' >> $BASH_ENV
```

Although the YAML is specific to CircleCI, the commands can be adjusted to most Linux distributions. For Alpine, use our [Alpine release](https://github.com/garden-io/garden/releases/). The first two steps install Garden and dependencies. The last one adds these to the CircleCI agent path (this might look differently on other CI platforms).

You can also find installation instructions in our [documentation](https://docs.garden.io/basics/installation#linux-manual-installation). Note that we do not install Docker since it's already enabled on the CircleCI agent when the `setup_remote_docker` flag is used:

```yaml
# .circleci/config
jobs:
  preview:
    steps:
      - setup_remote_docker
```

> Garden Enterprise users can skip this step as the Enterprise version features in-cluster builds and layer caching out of the box. Please [reach out](https://garden.io/#request-demo) to learn more.

## Configure the kubectl context

With Garden installed, we need to make sure that it can access our remote cluster. We do this by setting up a [kubectl context](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/) on the CI agent. How you set this up will vary by how and where you have deployed your cluster. What follows is specific to GKE users.

As before, we create a re-usable command for configuring the kubectl context:

```yaml
# .circleci/config
commands:
  configure_kubectl_context:
    description: Configure the kubectl context so that we can access our remote cluster
    steps:
      - run:
          name: Install GCloud
          command: |
            mkdir $HOME/gcloud
            curl https://dl.google.com/dl/cloudsdk/release/google-cloud-sdk.tar.gz | tar xvz -C $HOME/gcloud
            $HOME/gcloud/google-cloud-sdk/install.sh --quiet
      - run:
          name: Add GCloud to the CircleCI agent path
          command: echo 'export PATH=$HOME/gcloud/google-cloud-sdk/bin:$PATH' >> $BASH_ENV
      - run:
          name: Configure kubectl context via gloud
          command: |
            gcloud --quiet components update
            echo $GCLOUD_SERVICE_KEY | gcloud auth activate-service-account --key-file=-
            gcloud --quiet config set project $GOOGLE_PROJECT_ID && gcloud --quiet config set compute/zone $GOOGLE_COMPUTE_ZONE
            gcloud --quiet container clusters get-credentials $GOOGLE_CLUSTER_ID --zone $GOOGLE_COMPUTE_ZONE
            gcloud --quiet auth configure-docker
```

The commands use the following environment variables that you can set on the **Project Environment Variables** page (see [here](https://circleci.com/docs/2.0/env-vars/#setting-an-environment-variable-in-a-project)) in the CircleCI dashboard:

* `GCLOUD_SERVICE_KEY`: Follow [these instructions](https://cloud.google.com/sdk/docs/authorizing#authorizing_with_a_service_account) to get a service account key.
* `GCLOUD_PROJECT_ID`, `GOOGLE_COMPUTE_ZONE`,  and `GCLOUD_CLUSTER_ID`: These you'll find under the relevant project in your Google Cloud Platform console.

Please refer to this [doc](https://circleci.com/docs/2.0/google-auth/) for more information on using the Google Cloud SDK in CircleCI.

You'll find the entire CircleCI config for this project [here](https://github.com/garden-io/ci-demo-project/blob/master/.circleci/config.yml).

## Running Garden commands in CircleCI

Now that we have everything set up, we can [add the project](https://circleci.com/docs/2.0/getting-started/#setting-up-your-build-on-circleci) to CircleCI and start using Garden in our CI pipelines.

Here's what our preview job looks like:

```yaml
# .circleci/config
jobs:
  preview:
    <<: *image-config
    steps:
      - checkout
      - setup_remote_docker:
          docker_layer_caching: true
      - install_garden
      - configure_kubectl_context
      - run:
          name: Test project
          command: garden test --logger-type=basic --env=preview
      - run:
          name: Deploy project
          command: garden deploy --logger-type=basic --env=preview
```

Notice that there are no configuration steps outside of just installing Garden and configuring the kubectl context. And no matter how you change your stack, these steps will remain the same, making for a highly portable workflow.