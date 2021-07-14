---
title: In-Cluster Building
---
# Building images in remote Kubernetes clusters

One of Garden's most powerful features is the ability to build images in your Kubernetes development cluster, thus
avoiding the need for local Kubernetes clusters. This guide covers the requirements for in-cluster building and how
to set it up.

This guide assumes you've already read through the [Remote Kubernetes](./remote-kubernetes.md) guide.

## tl;dr

If in doubt, use the following setup for builds:

- [**`kaniko`**](#kaniko) build mode, which works well for most scenarios.
- Use the project namespace for build pods.
- [Connect a remote deployment registry](#Configuring-a-deployment-registry) to use for built images. _Note: You can also skip this and use the included in-cluster registry while testing, but be aware that you may hit scaling issues as you go._

Here's a basic configuration example:

```yaml
kind: Project
name: my-project
...
providers:
  - name: kubernetes
    # Use the kaniko build mode
    buildMode: kaniko
    kaniko:
      namespace: null  # <--- use the project namespace for builds
    # Recommended: Configure a remote registry
    deploymentRegistry:
      hostname: my-private-registry.com      # <--- the hostname of your registry
      namespace: my-project                  # <--- the namespace to use within your registry
    imagePullSecrets:
      - name: my-deployment-registry-secret  # <--- the name and namespace of a valid Kubernetes imagePullSecret
        namespace: default
```

The only tricky bit would be connecting the remote registry, so we suggest reading more about that [below](#Configuring-a-deployment-registry).

## Security considerations

First off, you should only use in-cluster building in development and testing clusters! Production clusters should not run the builder services for multiple reasons, both to do with resource and security concerns.

You should also avoid using in-cluster building in clusters where you don't control/trust all the code being deployed, i.e. multi-tenant setups (where tenants are external, or otherwise not fully trusted).

## General requirements

In-cluster building works with _most_ Kubernetes clusters, provided they have enough resources allocated and meet some basic requirements. We have tested it on GKE, AKS, EKS, DigitalOcean, and various other custom installations.

The specific requirements vary by the [_build mode_](#build-modes) used, and whether you're using the optional in-cluster registry or not.

In all cases you'll need at least 2GB of RAM _on top of your own service requirements_. More RAM is strongly recommended if you have many concurrent developers or CI builds.

For the [`cluster-docker`](#cluster-docker) mode, and the (optional) in-cluster image registry, support for `PersistentVolumeClaim`s is required, with enough disk space for layer caches and built images. The in-cluster registry also requires support for `hostPort`, and for reaching `hostPort`s from the node/Kubelet. This should work out-of-the-box in most standard setups, but clusters using Cilium for networking may need to configure this specifically, for example.

You can—_and should_—adjust the allocated resources and storage in the provider configuration, under
[resources](../reference/providers/kubernetes.md#providersresources) and
[storage](../reference/providers/kubernetes.md#providersstorage). See the individual modes below as well for more
information on how to allocate resources appropriately.

We also strongly recommend a separate image registry to use for built images. Garden can also—and does by default—deploy an in-cluster registry. The latter is convenient to test things out and may be fine for individual users or small teams. However, we generally recommend using managed container registries (such as ECR, GCR etc.) since they tend to perform better, they scale more easily, and don't need to be operated by your team. See the [Configuring a deployment registry](#configuring-a-deployment-registry) section for more details.

## Build modes

Garden supports multiple methods for building images and making them available to the cluster:

1. [**`kaniko`**](#kaniko) — Individual [Kaniko](https://github.com/GoogleContainerTools/kaniko) pods created for each build.
2. [**`cluster-buildkit`**](#cluster-buildkit) — A [BuildKit](https://github.com/moby/buildkit) deployment created for each project namespace.
3. [**`cluster-docker`**](#cluster-docker) — (**Deprecated**) A single Docker daemon installed in the `garden-system` namespace and shared between users/deployments. It is **no longer recommended** and we will remove it in future releases.
4. `local-docker` — Build using the local Docker daemon on the developer/CI machine before pushing to the cluster/registry.

The `local-docker` mode is set by default. You should definitely use that when using _Docker for Desktop_, _Minikube_ and most other local development clusters.

The other modes—which are why you're reading this guide—all build your images inside your development/testing cluster, so you don't need to run Docker on your machine, and avoid having to build locally and push build artifacts over the wire to the cluster for every change to your code.

The remote building options each have some pros and cons. You'll find more details below but **here are our general recommendations** at the moment:

- [**`kaniko`**](#kaniko) is a solid choice for most cases and is _currently our first recommendation_. It is battle-tested among Garden's most demanding users (including the Garden team itself). It also scales horizontally and elastically, since individual Pods are created for each build. It doesn't require priviliged containers to run and requires no shared cluster-wide services.
- [**`cluster-buildkit`**](#cluster-buildkit) is a new addition and replaces the older `cluster-docker` mode. A [BuildKit](https://github.com/moby/buildkit) Deployment is dynamically created in each project namespace and much like Kaniko requires no other cluster-wide services. This mode also offers a _rootless_ option, which runs without any elevated privileges, in clusters that support it.

We recommend picking a mode based on your usage patterns and scalability requirements. For ephemeral namespaces, `kaniko` is generally the better option, since the persistent BuildKit deployment won't have a warm cache anyway. For long-lived namespaces, like the ones a developer uses while working, `cluster-buildkit` may be a more performant option.

Let's look at how each mode works in more detail, and how you configure them:

### kaniko

This mode uses an individual [Kaniko](https://github.com/GoogleContainerTools/kaniko) Pod for each image build.

The Kaniko project provides a compelling alternative to a Docker daemon because it can run without special privileges on the cluster, and is thus more secure. It also scales better because it doesn't rely on a single daemon shared across multiple users and/or builds; builds are executed in individual Pods and thus scale horizontally and elastically.

In this mode, builds are executed as follows:

1. Your code (build context) is synchronized to a sync service in the cluster, which holds a cache of the build context, so that each change can be uploaded quickly.
2. A Kaniko pod is created, which pulls the build context from the sync service, and performs the build.
3. Kaniko pulls caches from the [deployment registry](#configuring-a-deployment-registry), builds the image, and then pushes the built image back to the registry, which makes it available to the cluster.

#### Configuration and requirements

{% hint style="info" %}
As of Garden v0.12.22, the `kaniko` build mode no longer requires shared system services or an NFS provisioner, nor running `cluster-init` ahead of usage.
{% endhint %}

Enable this by setting `buildMode: kaniko` in your `kubernetes` provider configuration.

_As of Garden v0.12.22, we also recommend setting `kaniko.namespace: null` in the `kubernetes` provider configuration, so that builder pods are started in the project namespace instead of the `garden-system` namespace, which is the current default. This will become the default in Garden v0.13._

Note the difference in how resources for the builder are allocated between Kaniko and the other modes. For this mode, the resource configuration applies to _each Kaniko pod_. See the [builder resources](../reference/providers/kubernetes.md#providersresourcesbuilder) reference for details.

{% hint style="info" %}
If you're using ECR on AWS, you may need to create a cache repository manually for Kaniko to store caches.

That is, if you have a repository like, `my-org/my-image`, you need to manually create a repository next to it called `my-org/my-image/cache`.

You can also select a different name for the cache repository and pass the path to Kaniko via the `--cache-repo` flag, which you can set on the [`extraFlags`](../reference/providers/kubernetes.md#providerskanikoextraFlags) field. See [this GitHub comment](https://github.com/GoogleContainerTools/kaniko/issues/410#issuecomment-433229841) in the Kaniko repo for more details.

This does not appear to be an issue for GCR on GCP. We haven't tested this on other container repositories.
{% endhint %}

You can provide extra arguments to Kaniko via the [`extraFlags`](../reference/providers/kubernetes.md#providerskanikoextraFlags) field. Users with projects with a large number of files should take a look at the `--snapshoteMode=redo` and `--use-new-run` options as these can provide [significant performance improvements](https://github.com/GoogleContainerTools/kaniko/releases/tag/v1.0.0). Please refer to the [official docs](https://github.com/GoogleContainerTools/kaniko#additional-flags) for the full list of available flags.

The Kaniko pods will always have the following toleration set:

```yaml
key: "garden-build",
operator: "Equal",
value: "true",
effect: "NoSchedule"
```

This allows you to set corresponding [Taints](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/) on cluster nodes to control which nodes builder deployments are deployed to. You can also configure a [`nodeSelector`](../reference/providers/kubernetes.md#providerskanikonodeSelector) to serve the same purpose.

### cluster-buildkit

With this mode, a [BuildKit](https://github.com/moby/buildkit) Deployment is dynamically created in each project namespace to perform in-cluster builds.

Much like [`kaniko`](#kaniko) (and unlike [`cluster-docker`](#cluster-docker)), this mode requires no cluster-wide services or permissions to be managed, and thus no permissions outside of a single namespace for each user/project.

In this mode, builds are executed as follows:

1. BuildKit is automatically deployed to the project namespace, if it hasn't already been deployed there.
2. Your code (build context) is synchronized directly to the BuildKit deployment.
3. BuildKit imports caches from the [deployment registry](#configuring-a-deployment-registry), builds the image, and then pushes the built image and caches back to the registry.

#### Configuration and requirements

Enable this mode by setting `buildMode: cluster-buildkit` in your `kubernetes` provider configuration.

In order to enable [rootless](https://github.com/moby/buildkit/blob/master/docs/rootless.md) mode, add the following to your `kubernetes` provider configuration:

```yaml
clusterBuildkit:
  rootless: true
```

*Note that not all clusters can currently support rootless operation, and that you may need to configure your cluster with this in mind. Please see the [BuildKits docs](https://github.com/moby/buildkit/blob/master/docs/rootless.md) for details.*

You should also set the builder resource requests/limits. For this mode, the resource configuration applies to _each BuildKit deployment_, i.e. for _each project namespace_. See the [builder resources](../reference/providers/kubernetes.md#providersresourcesbuilder) reference for details.

The BuildKit deployments will always have the following toleration set:

```yaml
key: "garden-build",
operator: "Equal",
value: "true",
effect: "NoSchedule"
```

This allows you to set corresponding [Taints](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/) on cluster nodes to control which nodes builder deployments are deployed to. You can also configure a [`nodeSelector`](../reference/providers/kubernetes.md#providersclusterbuildkitnodeselector) to serve the same purpose.

### cluster-docker

{% hint style="warning" %}
The `cluster-docker` build mode has been **deprecated** and will be removed in an upcoming release. Please use `kaniko` or `cluster-buildkit` instead.
{% endhint %}

The `cluster-docker` mode installs a standalone Docker daemon into your cluster, that is then used for builds across all users of the clusters, along with a handful of other supporting services.

In this mode, builds are executed as follows:

1. Your code (build context) is synchronized to a sync service in the cluster, making it available to the Docker daemon.
2. A build is triggered in the Docker daemon.
3. The built image is pushed to the [deployment registry](#configuring-a-deployment-registry), which makes it available to the cluster.

#### Configuration and requirements

Enable this mode by setting `buildMode: cluster-docker` in your `kubernetes` provider configuration.

After enabling this mode, you will need to run `garden plugins kubernetes cluster-init --env=<env-name>` for each applicable environment, in order to install the required cluster-wide services. Those services include the Docker daemon itself, as well as an image registry, a sync service for receiving build contexts, two persistent volumes, an NFS volume provisioner for one of those volumes, and a couple of small utility services.

By default, Garden will install an NFS volume provisioner into `garden-system` in order to be able to efficiently synchronize build sources to the cluster and then attaching those to the Kaniko pods. You can also [specify a storageClass](../reference/providers/kubernetes.md#providersstoragesyncstorageclass) to provide another _ReadWriteMany_ capable storage class to use instead of NFS. This may be advisable if your cloud provider provides a good alternative, or if you already have such a provisioner installed.

Optionally, you can also enable [BuildKit](https://github.com/moby/buildkit) to be used by the Docker daemon. _This is not to be confused with the [`cluster-buildkit`](#cluster-buildkit) build mode, which doesn't use Docker at all._ In most cases, this should work well and offer a bit of added performance, but it remains optional for now. If you have `cluster-docker` set as your `buildMode` you can enable BuildKit for an environment by adding the following to your `kubernetes` provider configuration:

```yaml
clusterDocker:
  enableBuildKit: true
```

Make sure your cluster has enough resources and storage to support the required services, and keep in mind that these
services are shared across all users of the cluster. Please look at the [resources](../reference/providers/kubernetes.md#providersresources) and [storage](../reference/providers/kubernetes.md#providersstorage) sections in the provider reference for
details.

### Local Docker

This is the default mode. It is the least efficient one for remote clusters, but requires no additional configuration or services to be deployed to the cluster. For remote clusters, you do however need to explicitly configure a [deployment registry](#configuring-a-deployment-registry), and obviously you'll need to have Docker running locally.

See the [Local Docker builds](./remote-kubernetes.md) section in the Remote Clusters guide for details.

## Configuring a deployment registry

To deploy a built image to a remote Kubernetes cluster, the image first needs to be pushed to a container registry that is accessible to the cluster. We refer to this as a _deployment registry_. Garden offers two options to handle this process:

1. An in-cluster registry.
2. An external registry, e.g. a cloud provider managed registry like ECR or GCR. **(recommended)**

The in-cluster registry is a simple way to get started with Garden that requires no configuration. To set it up, leave the `deploymentRegistry` field on the `kubernetes` provider config undefined, and run `garden plugins kubernetes cluster-init --env=<env-name>` to install the registry. This is nice and convenient, but is _not a particularly good approach for clusters with many users or lots of builds_. When using the in-cluster registry you need to take care of [cleaning it up routinely](#cleaning-up-cached-images), and it may become a performance and redundancy bottleneck with many users and frequent (or heavy) builds.

So, **for any scenario with a non-trivial amount of users and builds, we strongly suggest configuring a separate registry outside of your cluster.** If your cloud provider offers a managed option, that's usually a good choice.

To configure a deployment registry, you need to specify at least the `deploymentRegistry` field on your `kubernetes` provider, and in many cases you also need to provide a Secret in order to authenticate with the registry via the `imagePullSecrets` field:

```yaml
kind: Project
name: my-project
...
providers:
  - name: kubernetes
    ...
    deploymentRegistry:
      hostname: my-private-registry.com      # <--- the hostname of your registry
      namespace: my-project                  # <--- the namespace to use within your registry
    imagePullSecrets:
      - name: my-deployment-registry-secret  # <--- the name and namespace of a valid Kubernetes imagePullSecret
        namespace: default
```

Now say, if you specify `hostname: my-registry.com` and `namespace: my-project-id` for the `deploymentRegistry` field, and you have a container module named `some-module` in your project, it will be tagged and pushed to `my-registry.com/my-project-id/some-module:v:<module-version>` after building. That image ID will be then used in Kubernetes manifests when running containers.

For this to work, you in most cases also need to provide the authentication necessary for both the cluster to read the image and for the builder to push to the registry. We use the same format and mechanisms as Kubernetes _imagePullSecrets_ for this. See [this guide](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/) for how to create the secret, **but keep in mind that for this context, the authentication provided must have write privileges to the configured registry and namespace.**

See below for specific instruction for working with ECR.

{% hint style="warning" %}
Note: If you're using the [`kaniko`](#kaniko) or [`cluster-docker`](#cluster-docker) build mode, you need to re-run `garden plugins kubernetes cluster-init` any time you add or modify imagePullSecrets, for them to work.
{% endhint %}

### Using in-cluster building with ECR

For AWS ECR (Elastic Container Registry), you need to enable the ECR credential helper once for the repository by adding an `imagePullSecret` for you ECR repository.

First create a `config.json` somewhere with the following contents (`<aws_account_id>` and `<region>` are placeholders that you need to replace for your repo):

```json
{
  "credHelpers": {
    "<aws_account_id>.dkr.ecr.<region>.amazonaws.com": "ecr-login"
  }
}
```

Next create the _imagePullSecret_ in your cluster (feel free to replace the default namespace, just make sure it's correctly referenced in the config below):

```sh
kubectl --namespace default create secret generic ecr-config \
  --from-file=.dockerconfigjson=./config.json \
  --type=kubernetes.io/dockerconfigjson
```

Finally, add the secret reference to your `kubernetes` provider configuration:

```yaml
kind: Project
name: my-project
...
providers:
  - name: kubernetes
    ...
    imagePullSecrets:
      - name: ecr-config
        namespace: default
```

### Using in-cluster building with GCR

To use in-cluster building with GCR (Google Container Registry) you need to set up authentication, with the following steps:

1. Create a Google Service Account (GSA).
2. Give the GSA the appropriate permissions.
3. Create a JSON key for the account.
4. Create an _imagePullSecret_ for using the JSON key.
5. Add a reference to the imagePullSecret in your Garden project configuration.

First, create a Google Service Account:

```sh
# You can replace the gcr-access name of course, but make sure you also replace it in the commands below
gcloud iam service-accounts create gcr-access --project ${PROJECT_ID}
```

Then, to grant the Google Service account the right permission to push to GCR, run the following GCR commands:

```sh
# Create a role with the required permissions
gcloud iam roles create gcrAccess \
  --project ${PROJECT_ID} \
  --permissions=storage.objects.get,storage.objects.create,storage.objects.list,storage.objects.update,storage.objects.delete,storage.buckets.create,storage.buckets.get

# Attach the role to the newly create Google Service Account
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:gcr-access@${PROJECT_ID}.iam.gserviceaccount.com \
  --role==projects/${PROJECT_ID}/roles/gcrAccess
```

Next create a JSON key file for the GSA:

```sh
gcloud iam service-accounts keys create keyfile.json --iam-account gcr-access@${PROJECT_ID}.iam.gserviceaccount.com
```

Then prepare the _imagePullSecret_ in your Kubernetes cluster. Run the following command, if appropriate replacing `gcr.io` with the correct registry hostname (e.g. `eu.gcr.io` or `asia.gcr.io`):

```sh
kubectl --namespace default create secret docker-registry gcr-config \
  --docker-server=gcr.io \
  --docker-username=_json_key \
  --docker-password="$(cat keyfile.json)"
```

Finally, add the created _imagePullSecret_ to your `kubernetes` provider configuration:

```yaml
kind: Project
name: my-project
...
providers:
  - name: kubernetes
    ...
    imagePullSecrets:
      - name: gcr-config
        namespace: default
```

## Publishing images

You can publish images that have been built in your cluster, using the `garden publish` command.

The only caveat is that you currently need to have Docker running locally, and you need to have authenticated with the target registry. When publishing, we pull the image from the remote registry to the local Docker daemon, and then go on to push it from there. We do this to avoid having to (re-)implement all the various authentication methods (and by extension key management) involved in pushing directly from the cluster, and because it's often not desired to give clusters access to directly push to production registries.

Unless you're publishing to your configured deployment registry, you need to specify the `image` field on the `container` module in question, to indicate where the image should be published. For example:

```yaml
kind: Module
name: my-module
image: my-repo/my-image:v1.2.3   # <- if you omit the tag here, the Garden module version will be used by default
...
```

By default we use the tag specified in the `container` module `image` field, if any. If none is set there, we default to the Garden module version.

You can also set the `--tag` option on the `garden publish` command to override the tag used for images. You can both set a specific tag or you can _use template strings for the tag_. For example, you can

- Set a specific tag on all published modules: `garden publish --tag "v1.2.3"`
- Set a custom prefix on tags but include the Garden version hash: `garden publish --tag 'v0.1-${module.hash}'`
- Set a custom prefix on tags with the current git branch: `garden publish --tag 'v0.1-${git.branch}'`

{% hint style="warning" %}
Note that you most likely need to wrap templated tags with single quotes, to avoid your shell attempting to perform its own substitution.
{% endhint %}

Generally, you can use any template strings available for module configs for the tags, with the addition of the following:

- `${module.name}` — the name of module being tagged
- `${module.version}` — the full Garden version of module being tagged, e.g. `v-abcdef1234`
- `${module.hash}` — the Garden version hash of module being tagged, e.g. `abcdef1234` (i.e. without the `v-` prefix)

## Cleaning up cached images

In order to avoid disk-space issues in the cluster when using the in-cluster registry and/or either of the [`kaniko`](#kaniko) or [`cluster-docker`](#cluster-docker) build modes, the `kubernetes` provider exposes a utility command:

```sh
garden --env=<your-environment> plugins kubernetes cleanup-cluster-registry
```

The command does the following:

1. Looks through all Pods in the cluster to see which images/tags are in use, and flags all other images as deleted in the in-cluster registry and.
2. Restarts the registry in read-only mode.
3. Runs the registry garbage collection.
4. Restarts the registry again without the read-only mode.
5. When using the [`cluster-docker`](#cluster-docker) build mode, we additionally untag in the Docker daemon all images that are no longer in the registry, and then clean up the dangling image layers by running `docker image prune`.

There are plans to do this automatically when disk-space runs low, but for now you can run this manually or set up
your own cron jobs.

**You can avoid this entirely by using a remote [deployment registry](#configuring-a-deployment-registry) and the [`cluster-buildkit`](#cluster-buildkit) build mode.**

## Pulling base images from private registries

The in-cluster builder may need to be able to pull base images from a private registry, e.g. if your Dockerfile starts with something like this:

```dockerfile
FROM my-private-registry.com/my-image:tag
```

where `my-private-registry.com` requires authorization.

For this to work, you need to create a registry secret in your cluster (see [this guide](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/) for how to create the secret) and then configure the [imagePullSecrets](../reference/providers/kubernetes.md#providersimagepullsecrets) field in your `kubernetes` provider configuration:

```yaml
kind: Project
name: my-project
...
providers:
  - name: kubernetes
    ...
    imagePullSecrets:
      # The name of the registry auth secret you created.
    - name: my-registry-secret
      # Change this if you store the secret in another namespace.
      namespace: default
```

This registry auth secret will then be copied and passed to the in-cluster builder. You can specify as many as you like, and they will be merged together.

{% hint style="warning" %}
Note: If you're using the [`kaniko`](#kaniko) or [`cluster-docker`](#cluster-docker) build mode, you need to re-run `garden plugins kubernetes cluster-init` any time you add or modify imagePullSecrets, for them to work when pulling base images!
{% endhint %}
