---
title: In-Cluster Building
order: 1
---

# In-Cluster Building

One of Garden's most powerful features is the ability to build images in your Kubernetes development cluster, thus
avoiding the need for local Kubernetes clusters. This guide covers the requirements for in-cluster building and how
to set it up.

This guide assumes you've already configured the [Remote Kubernetes plugin](../remote-k8s/README.md).

## tl;dr

If in doubt, use the following setup for builds:

- [**`cluster-buildkit`**](#cluster-buildkit) build mode, which works well for most scenarios.
- Use the project namespace for build pods.
- [Connect a remote deployment registry](#configuring-a-deployment-registry) to use for built images.

Here's a basic configuration example:

```yaml
apiVersion: garden.io/v1
kind: Project
name: my-project
...
providers:
  - name: kubernetes
    # Use the kaniko build mode
    buildMode: kaniko
    # Recommended: Configure a remote registry
    deploymentRegistry:
      hostname: my-private-registry.com      # <--- the hostname of your registry
      namespace: my-project                  # <--- the namespace to use within your registry
    imagePullSecrets:
      - name: my-deployment-registry-secret  # <--- the name and namespace of a valid Kubernetes imagePullSecret
        namespace: default
```

The only tricky bit would be connecting the remote registry, so we suggest reading more about that [below](#configuring-a-deployment-registry).

## Security considerations

First off, you should only use in-cluster building in development and testing clusters! Production clusters should not run the builder services for multiple reasons, both to do with resource and security concerns.

You should also avoid using in-cluster building in clusters where you don't control/trust all the code being deployed, i.e. multi-tenant setups (where tenants are external, or otherwise not fully trusted).

## General requirements

In-cluster building works with _most_ Kubernetes clusters, provided they have enough resources allocated and meet some basic requirements. We have tested it on GKE, AKS, EKS, DigitalOcean, and various other custom installations.

The specific requirements vary by the [_build mode_](#build-modes) used, and whether you're using the optional in-cluster registry or not.

In all cases you'll need at least 2GB of RAM _on top of your own service requirements_. More RAM is strongly recommended if you have many concurrent developers or CI builds.

You can—_and should_—adjust the allocated resources and storage in the provider configuration, under
[resources](../../reference/providers/kubernetes.md#providersresources) and
[storage](../../reference/providers/kubernetes.md#providersstorage). See the individual modes below as well for more
information on how to allocate resources appropriately.

You also need to configure a Docker registry. See the [Configuring a deployment registry](#configuring-a-deployment-registry) section for more details.

## Build modes

Garden supports multiple methods for building images and making them available to the cluster:

1. [**`cluster-buildkit`**](#cluster-buildkit) — A [BuildKit](https://github.com/moby/buildkit) deployment created for each project namespace.
2. [**`kaniko`**](#kaniko) — Individual [Kaniko](https://github.com/GoogleContainerTools/kaniko) pods created for each build.
3. `local-docker` — Build using the local Docker daemon on the developer/CI machine before pushing to the cluster/registry.

{% hint style="warning" %}
The previously available `cluster-docker` build mode has been removed as of version 0.13!
{% endhint %}

The `local-docker` mode is set by default. You should definitely use that when using _Docker for Desktop_, _Minikube_ and most other local development clusters.

The other modes—which are why you're reading this guide—all build your images inside your development/testing cluster, so you don't need to run Docker on your machine, and avoid having to build locally and push build artifacts over the wire to the cluster for every change to your code.

The remote building options each have some pros and cons. You'll find more details below but *we generally recommend `cluster-buildkit`**.

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

{% hint style="info" %}
As of Garden v0.13, the default namespace for the build Pods is the project namespace. Set `kaniko.namespace` in the provider configuration to override to a specific, separate namespace.
{% endhint %}

Enable this by setting `buildMode: kaniko` in your `kubernetes` provider configuration.

Note the difference in how resources for the builder are allocated between Kaniko and the other modes. For this mode, the resource configuration applies to _each Kaniko pod_. See the [builder resources](../../reference/providers/kubernetes.md#providersresourcesbuilder) reference for details.

{% hint style="info" %}
If you're using ECR on AWS, you may need to create a cache repository manually for Kaniko to store caches.

That is, if you have a repository like, `my-org/my-image`, you need to manually create a repository next to it called `my-org/my-image/cache`. AWS ECR supports immutable image tags, see the [announcement](https://aws.amazon.com/about-aws/whats-new/2019/07/amazon-ecr-now-supports-immutable-image-tags/) and [documentation](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-tag-mutability.html). Make sure to set the cache repository's image tag mutability setting to `mutable`. By default, Kaniko's TTL on old cache layers is two weeks, and every layer of the image cache must be rebuilt after that if the image tags are `immutable`.

You can also select a different name for the cache repository and pass the path to Kaniko via the `--cache-repo` flag, which you can set via the [`extraFlags`](../../reference/providers/kubernetes.md#providerskanikoextraFlags) field. See [this GitHub comment](https://github.com/GoogleContainerTools/kaniko/issues/410#issuecomment-433229841) in the Kaniko repo for more details.

This does not appear to be an issue for GCR on GCP. We haven't tested this on other container repositories.
{% endhint %}

You can provide extra arguments to Kaniko via the [`extraFlags`](../../reference/providers/kubernetes.md#providerskanikoextraFlags) field. Users with projects with a large number of files should take a look at the `--snapshotMode=redo` and `--use-new-run` options as these can provide [significant performance improvements](https://github.com/GoogleContainerTools/kaniko/releases/tag/v1.0.0). Please refer to the [official docs](https://github.com/GoogleContainerTools/kaniko#additional-flags) for the full list of available flags.

The Kaniko pods will always have the following toleration set:

```yaml
key: "garden-build",
operator: "Equal",
value: "true",
effect: "NoSchedule"
```

This allows you to set corresponding [Taints](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/) on cluster nodes to control which nodes builder deployments are deployed to. You can also configure a [`nodeSelector`](../../reference/providers/kubernetes.md#providerskanikonodeSelector) to serve the same purpose.

### cluster-buildkit

With this mode, a [BuildKit](https://github.com/moby/buildkit) Deployment is dynamically created in each project namespace to perform in-cluster builds.

Much like [`kaniko`](#kaniko), this mode requires no cluster-wide services or permissions to be managed, and thus no permissions outside of a single namespace for each user/project.

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

You should also set the builder resource requests/limits. For this mode, the resource configuration applies to _each BuildKit deployment_, i.e. for _each project namespace_. See the [builder resources](../../reference/providers/kubernetes.md#providersresourcesbuilder) reference for details.

The BuildKit deployments will always have the following toleration set:

```yaml
key: "garden-build",
operator: "Equal",
value: "true",
effect: "NoSchedule"
```

This allows you to set corresponding [Taints](https://kubernetes.io/docs/concepts/scheduling-eviction/taint-and-toleration/) on cluster nodes to control which nodes builder deployments are deployed to. You can also configure a [`nodeSelector`](../../reference/providers/kubernetes.md#providersclusterbuildkitnodeselector) to serve the same purpose.

#### Caching

By default, cluster-buildkit will have two layers of cache

1. A local file cache, maintained by the cluster-buildkit instance. The cache is shared for all builds in the same namespace
2. A `_buildcache` image tag in the configured deploymentRegistry will be used as an external cache. This is useful for fresh namespaces, e.g. preview environments

You can customize the cache configuration with the `cache` option. You can list multiple cache layers, and it will choose the first one that generates any hit for all following layers.

In a large team it might be beneficial to use a more complicated cache strategy, for example the following:

```yaml
clusterBuildkit:
  cache:
      - type: registry
        tag: _buildcache-${slice(kebabCase(git.branch), "0", "30")}
      - type: registry
        tag: _buildcache-main
        export: false
```

With this configuration, every new feature branch will benefit from the main branch cache, while not polluting the main branch cache (via `export: false`).
Any subsequent builds will use the feature branch cache.

Please keep in mind that you should also configure a garbage collection policy in your Docker registry to clean old feature branch tags.

#### Multi-stage caching

If your `Dockerfile` has multiple stages, you can benefit from `mode=max` caching. It is automatically enabled, if your registry is in our list of supported registries.

You can find the list of supported registries in [Kubernetes provider configuration guide](../../reference/providers/kubernetes.md#providersclusterbuildkitcache).

You can also configure a different cache registry for your images. That way you can use `mode=max` to achieve a better cache hit rate, even if your registry does not support `mode=max`.

```yaml
clusterBuildkit:
  cache:
      - type: registry
        registry:
          hostname: hub.docker.com
          namespace: my-team-cache
```

For this mode of operation you need secrets for all the registries configured in your `imagePullSecrets`.

Please note that most registries do support `mode=max`. If you are using a self-hosted registry, we do not use `mode=max` by default out of caution. You can force to enable it to achieve a better cache-hit rate with self-hosted registries:

```
clusterBuildkit:
  cache:
      - type: registry
        mode: max # Force mode=max as our self-hosted registry is not in the list of supported registries
        registry:
          hostname: company-registry.example.com
          namespace: my-team-cache

```

### Local Docker

This is the default build mode. It is usually the least efficient one for remote clusters, but requires no additional services
to be deployed to the cluster. For remote clusters, you do however need to explicitly configure a _deployment registry_,
and to have Docker running locally. For development clusters, you
may in fact get set up quicker if you use the in-cluster build
modes.

When you deploy to your environment (via `garden deploy`) using the local Docker mode, images are first
built locally and then pushed to the configured _deployment registry_, where the K8s cluster will then pull the built
images when deploying. This should generally be a _private_ container registry, or at least a private project in a
public registry.

Similarly to the below TLS configuration, you may also need to set up auth for the registry using K8s Secrets, in this
case via the `kubectl create secret docker-registry` helper. You can read more about using and setting up private
registries [here](https://kubernetes.io/docs/concepts/containers/images/#using-a-private-registry).

_Note that you do not need to configure the authentication and imagePullSecrets when using GKE along with GCR,
as long as your deployment registry is in the same project as the GKE cluster._

Once you've created the auth secret in the cluster, you can configure the registry and the secrets in your
`garden.yml` project config like this:

```yaml
apiVersion: garden.io/v1
kind: Project
name: my-project
environments:
- name: dev
  providers:
  - name: kubernetes
    context: my-dev-context
    ...
    deploymentRegistry:
      # The hostname of the registry, e.g. gcr.io for GCR (Google Container Registry)
      hostname: my.registry.io
      # Namespace (aka project ID) to use in the registry for this project.
      # For GKE/GCR, use the project ID where your cluster is.
      namespace: my-project-id
    imagePullSecrets:
      # The name of the secret you stored using `kubectl create secret docker-registry`
    - name: my-registry-secret
      # Change this if you store the secret in another namespace.
      namespace: default
defaultEnvironment: dev
```

You also need to login to the `docker` CLI, so that images can be pushed to the registry. Please refer
to your registry's documentation on how to do that (for Docker Hub you simply run `docker login`).

## Configuring a deployment registry

To deploy a built image to a remote Kubernetes cluster, the image first needs to be pushed to a container registry that is accessible to the cluster. We refer to this as a _deployment registry_. This is an external Docker registry, e.g. a cloud provider managed registry like ECR or GCR.

To configure a deployment registry, you need to specify at least the `deploymentRegistry` field on your `kubernetes` provider, and in many cases you also need to provide a Secret in order to authenticate with the registry via the `imagePullSecrets` field:

```yaml
apiVersion: garden.io/v1
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

Now say, if you specify `hostname: my-registry.com` and `namespace: my-project-id` for the `deploymentRegistry` field, and you have a container Build named `some-build` in your project, it will be tagged and pushed to `my-registry.com/my-project-id/some-build:v:<build-version>` after building. That image ID will be then used in Kubernetes manifests when running containers.

For this to work, you in most cases also need to provide the authentication necessary for both the cluster to read the image and for the builder to push to the registry. We use the same format and mechanisms as Kubernetes _imagePullSecrets_ for this. See [this guide](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/) for how to create the secret, **but keep in mind that for this context, the authentication provided must have write privileges to the configured registry and namespace.**

See below for specific instructions for working with ECR.

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
apiVersion: garden.io/v1
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

#### Configuring Access

If your Kubernetes cluster and ECR repositories are only used for development, an easy way to configure access is to allow push access to all the workers (and subsequently all pods):

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowPushPull",
            "Effect": "Allow",
            "Principal": {
                "AWS": [
                    "arn:aws:iam::<account-id>:role/<k8s_worker_iam_role>"                ]
            },
            "Action": [
                "ecr:BatchGetImage",
                "ecr:BatchCheckLayerAvailability",
                "ecr:CompleteLayerUpload",
                "ecr:GetDownloadUrlForLayer",
                "ecr:InitiateLayerUpload",
                "ecr:PutImage",
                "ecr:UploadLayerPart"
            ]
        }
    ]
}
```

To grant developers permission to push and pull directly from a repository, see [the AWS documentation](https://docs.aws.amazon.com/AmazonECR/latest/userguide/security_iam_id-based-policy-examples.html).

If you need more fine grained control, please use IRSA (see the next section).

#### Using in-cluster-building with IRSA (IAM Roles for Service Accounts)

Using IRSA we can reduce the ECR access from the worker nodes (and subsequently all pods running on these worker nodes) to readonly, and only provide push access to the in-cluster builder Pods.

Depending on how you deployed your EKS cluster you already might have a policy attached to your worker nodes by default that allows read access to all ECR repositories. If you've used `eksctl` to deploy your cluster with [Garden's recommended EKS configuration](../remote-k8s/create-cluster/aws.md#tl;dr), you already have IRSA set up with the correct container registry policy to build, push and pull your ECR images. In that case, skip to the [service account annotation section](#add-irsa-service-account-annotation-to-your-garden-project) of this guide to configure your Garden project. For more info please check [the ECR on EKS user guide of the AWS docs](https://docs.aws.amazon.com/AmazonECR/latest/userguide/ECR_on_EKS.html).

If it does not exist yet, first create an IAM policy to allow the Kubernetes nodes to pull images from your ECR repositories:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "GardenAllowPull",
            "Effect": "Allow",
            "Principal": {
                "AWS": ["arn:aws:iam::<account-id>:role/<k8s-worker-iam-role>"]
            },
            "Action": [
                "ecr:BatchGetImage",
                "ecr:BatchCheckLayerAvailability",
                "ecr:GetDownloadUrlForLayer",
            ]
            "Resource": "arn:aws:ecr:<region>:<account-id>:repository/<ecr-repository>"
        },
        {
            "Sid": "GetAuthorizationToken",
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken"
            ],
            "Resource": "*"
        }
    ]
}
```

Create a [web identity role](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html) to allow pushing images from the in-cluster builder Pods, with the following trust relationship:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::<account-id>:oidc-provider/oidc.eks.<region>.amazonaws.com/id/<oidc-provider-id>"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringLike": {
                  "oidc.eks.<region>.amazonaws.com/id/<oidc-provider-id>:sub": "system:serviceaccount:*:garden-in-cluster-builder"
                },
                "StringEquals": {
                    "oidc.eks.<region>.amazonaws.com/id/<oidc-provider-id>:aud": "sts.amazonaws.com"
                }
            }
        }
    ]
}
```

Note that this trust relationship allows the Pods associated with the `garden-in-cluster-builder` serviceaccount in all namespaces (`*`) to push images.

Configure the following IAM policy with the web identity role:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "GardenAllowPushPull",
            "Effect": "Allow",
            "Action": [
                "ecr:BatchGetImage",
                "ecr:BatchCheckLayerAvailability",
                "ecr:CompleteLayerUpload",
                "ecr:GetDownloadUrlForLayer",
                "ecr:InitiateLayerUpload",
                "ecr:PutImage",
                "ecr:UploadLayerPart"
            ],
            "Resource": "arn:aws:ecr:<region>:<account-id>:repository/<ecr-repository>"
        },
        {
            "Sid": "GetAuthorizationToken",
            "Effect": "Allow",
            "Action": [
                "ecr:GetAuthorizationToken"
            ],
            "Resource": "*"
        }
    ]
}
```

##### Add IRSA service account annotation to your Garden project

{% hint style="info" %}
You need to replace the following placeholders:
- `<account-id>` is your AWS Account ID
- `<k8s-worker-iam-role>` is the Node IAM role name (You can find it in your EKS node group)
- `<region>` AWS region
- `<ecr-repository>` name of the ECR repositories ([matching multiple names using wildcards](https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_resource.html#reference_policies_elements_resource_wildcards) is allowed)
- `<oidc-provider-id>` Part of the OpenID Connect provider URL

If you've configured IRSA with `eksctl`, fetch the IAM role Amazon Resource Name (ARN) associated with your Kubernetes service account by running `kubectl describe sa -n $eksctlNamespace`, where ` eksctlNamespace` refers to the namespace you used for creating the iamserviceaccount in. See also [here](https://eksctl.io/usage/iamserviceaccounts/) for more info.
You can find this value in the service account's annotation with the key `eks.amazonaws.com/role-arn`.
{% endhint %}

Add the IRSA `serviceAccountAnnotations` to your `project.garden.yml`:

```yaml
kind: Project
name: my-project
...
providers:
  - name: kubernetes
    ...
    # If you use the kaniko build mode
    buildMode: kaniko
    kaniko:
      serviceAccountAnnotations:
        eks.amazonaws.com/role-arn: arn:aws:iam::<account-id>:role/<web-identity-role-name>
    # If you use the buildkit build mode
    buildMode: cluster-buildkit
    clusterBuildkit:
      serviceAccountAnnotations:
        eks.amazonaws.com/role-arn: arn:aws:iam::<account-id>:role/<web-identity-role-name>
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

Then, to grant the Google Service account the right permission to push to GCR, run the following gcloud commands:

```sh
# Create a role with the required permissions
gcloud iam roles create gcrAccess \
  --project ${PROJECT_ID} \
  --permissions=storage.objects.get,storage.objects.create,storage.objects.list,storage.objects.update,storage.objects.delete,storage.buckets.create,storage.buckets.get

# Attach the role to the newly create Google Service Account
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:gcr-access@${PROJECT_ID}.iam.gserviceaccount.com \
  --role=projects/${PROJECT_ID}/roles/gcrAccess
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
apiVersion: garden.io/v1
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

### Using in-cluster building with Google Artifact Registry

To use in-cluster building with Google Artifact Registry you need to set up authentication, with the following steps:

1. Create a Google Service Account (GSA).
2. Give the GSA the appropriate permissions.
3. Create a JSON key for the account.
4. Create an _imagePullSecret_ for using the JSON key.
5. Add a reference to the imagePullSecret to your Garden project configuration.

First, create a Google Service Account:

```sh
# Of course you can replace the gar-access name, but make sure you also replace it in the commands below.
gcloud iam service-accounts create gar-access --project ${PROJECT_ID}
```

The service account needs write access to the Google Artifacts Registry. You can either grant write access to all repositories with an IAM policy, or you can grant repository-specific permissions to selected repositories. We recommend the latter, as it follows the pattern of granting the least-privileged access needed.

To grant access to all Google Artifact Registries, run:

```sh
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:gar-access@${PROJECT_ID}.iam.gserviceaccount.com \
  --role=roles/artifactregistry.writer
```

To grant access to one or more repositories, run for each repository:

```sh
gcloud artifacts repositories add-iam-policy-binding ${REPOSITORY} \
  --location=${REGION} \
  --member=serviceAccount:gar-access@${PROJECT_ID}.iam.gserviceaccount.com \
  --role=roles/artifactregistry.writer
```

Next create a JSON key file for the GSA:

```sh
gcloud iam service-accounts keys create keyfile.json --iam-account gar-access@${PROJECT_ID}.iam.gserviceaccount.com
```

Then prepare the _imagePullSecret_ in your Kubernetes cluster. Run the following command and replace `docker.pkg.dev` with the correct registry hostname (e.g. `southamerica-east1-docker.pkg.dev` or `australia-southeast1-docker.pkg.dev`):

```sh
kubectl --namespace default create secret docker-registry gar-config \
  --docker-server=docker.pkg.dev \
  --docker-username=_json_key \
  --docker-password="$(cat keyfile.json)"
```

Finally, add the created _imagePullSecret_ and _deploymentRegistry_ to your `kubernetes` provider configuration:

```yaml
apiVersion: garden.io/v1
kind: Project
name: my-project
...
providers:
  - name: kubernetes
    ...
    deploymentRegistry:
      hostname: europe-central2-docker.pkg.dev      # <--- please replace with the hostname of your registry
      namespace: ${PROJECT_ID}/${REPOSITORY}        # <--- please replace with your GCP project and repository
    imagePullSecrets:
      - name: gar-config
        namespace: default
```

#### Using in-cluster building with Google Workload identity

Workload identity for GKE clusters allows service acccounts in your cluster to impersonate IAM service accounts. Using this method for in-cluster building allows you to avoid storing IAM service account credentials as secrets in your cluster.

Make sure that [workload identity is enabled on your cluster](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity#enable).

First create an IAM service account:

```sh
gcloud iam service-accounts create gar-access \
    --project=${PROJECT_ID}
```

Then attach the roles required to push and pull to Google Artifact Registry:

```sh
gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member=serviceAccount:gar-access@${PROJECT_ID}.iam.gserviceaccount.com \
  --role=roles/artifactregistry.writer
```

Note that you can also use this method with Google Container Registry, for the required roles [check the section about GCR above](#using-in-cluster-building-with-gcr).

Now you need to add an IAM policy binding to allow the Kubernetes service account to impersonate the IAM service account. Note that GCP workload identity for Kubernetes does not allow wildcards for in the member section. This means that every Kubernetes service account in each namespace must be registered as a member. Garden's build services always use a service account with the name `garden-in-cluster-builder`.

```sh
gcloud iam service-accounts add-iam-policy-binding gar-access@${PROJECT_ID}.iam.gserviceaccount.com \
    --role roles/iam.workloadIdentityUser \
    --member "serviceAccount:${PROJECT_ID}.svc.id.goog[${K8S_NAMESPACE}/garden-in-cluster-builder]"
```

And finally add the annotation with your IAM service account to the garden project configuration. Garden will make sure to annotate the in cluster builder service account with this annotation.

```yaml
kind: Project
name: my-project
...
providers:
  - name: kubernetes
    ...
    # If you use the kaniko build mode
    buildMode: kaniko
    kaniko:
      serviceAccountAnnotations:
        iam.gke.io/gcp-service-account: gar-access@${PROJECT_ID}.iam.gserviceaccount.com

    # If you use the buildkit build mode
    buildMode: buildkit
    clusterBuildkit:
      serviceAccountAnnotations:
        iam.gke.io/gcp-service-account: gar-access@${PROJECT_ID}.iam.gserviceaccount.com
```

## Multi-Platform builds

Garden supports building container images for multiple platforms and architectures. Use the `platforms` configuration field, to configure the platforms you want to build for e.g.:

```yaml
# garden.yml
kind: Build
type: container
name: my-container
spec:
  platforms: ["linux/amd64", "linux/arm64"]
```

Multi-platform builds are available for `cluster-buildkit` only. Note that `kaniko` is *not* supported.
For high-performance multi-platform builds consider using [Garden Container Builder](../../reference/providers/container.md).

## Publishing images

You can publish images that have been built in your cluster, using the `garden publish` command. See the [Publishing images](../../other-plugins/container.md#publishing-images) section in the [Container Action guide](../../other-plugins/container.md) for details.

{% hint style="warning" %}
Note that you currently need to have Docker running locally even when using remote building, and you need to have authenticated with the target registry. When publishing, we pull the image from the remote registry to the local Docker daemon, and then go on to push it from there. We do this to avoid having to (re-)implement all the various authentication methods (and by extension key management) involved in pushing directly from the cluster, and because it's often not desired to give clusters access to directly push to production registries.
{% endhint %}

## Pulling base images from private registries

The in-cluster builder may need to be able to pull base images from a private registry, e.g. if your Dockerfile starts with something like this:

```dockerfile
FROM my-private-registry.com/my-image:tag
```

where `my-private-registry.com` requires authorization.

For this to work, you need to create a registry secret in your cluster (see [this guide](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/) for how to create the secret) and then configure the [imagePullSecrets](../../reference/providers/kubernetes.md#providersimagepullsecrets) field in your `kubernetes` provider configuration:

```yaml
apiVersion: garden.io/v1
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
