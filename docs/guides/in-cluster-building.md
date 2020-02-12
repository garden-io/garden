---
title: In-Cluster Building
---
# Building images in remote Kubernetes clusters

One of Garden's most powerful features is the ability to build images in your Kubernetes development cluster, thus
avoiding the need for local Kubernetes clusters. This guide covers the requirements for in-cluster building and how
to set it up.

This guide assumes you've already read through the [Remote Kubernetes](./remote-kubernetes.md) guide.

## Security considerations

First off, you should only use in-cluster building in development clusters! Production clusters should not run the
builder services for multiple reasons, both to do with resource and security concerns.

You should also avoid using in-cluster building in clusters where you don't control/trust all the code being deployed,
i.e. multi-tenant setups (where tenants are external, or otherwise not fully trusted).

## Requirements

In-cluster building works with _most_ Kubernetes clusters, provided they have enough resources allocated. We have
tested on GKE, AKS, EKS and some custom installations. One provider that is currently known _not to work_ is
DigitalOcean (track [issue #877](https://github.com/garden-io/garden/issues/877) for details and progress).

Specifically, the clusters need the following:

- Support for `hostPort`, and for reaching `hostPort`s from the node/Kubelet. This should work out-of-the-box in most
  standard setups, but clusters using Cilium for networking may need to configure this specifically, for example.
- At least 2GB of RAM _on top of your own service requirements_. More RAM is strongly recommended if you have many
  concurrent developers or CI builds.
- Support for `PersistentVolumeClaim`s and enough disk space for layer caches and the in-cluster image registry.

You can—_and should_—adjust the allocated resources and storage in the provider configuration, under
[resources](../providers/kubernetes.md#providersresources) and
[storage](../providers/kubernetes.md#providersstorage). See the individual modes below as well for more
information on how to allocate resources appropriately.

## Build modes

Garden supports multiple methods for building images and making them available to the cluster:

1. Cluster Docker
2. Kaniko
3. Local Docker

The _Cluster Docker_ and _Kaniko_ modes build container images inside your development cluster, so you don't need to
run Docker on your machine, and avoid having to build locally and push build artifacts over the wire to the cluster
for every change to your code.

The _Local Docker_ mode is the default. You should definitely use that when using _Docker for Desktop_, _Minikube_
and most other local development clusters, and also if you're using Garden to deploy to staging/production clusters
(more on [security considerations](#security-considerations) above).

Let's look at how each mode works, and how you configure them:

### Cluster Docker

The Cluster Docker mode installs a standalone Docker daemon into your cluster, that is then used for builds across
all users of the clusters, along with a handful of other supporting services. Enable this mode by setting
`buildMode: cluster-docker` in your `kubernetes` provider configuration.

In this mode, builds are executed as follows:

1. Your code (build context) is synchronized to a sync service in the cluster, making it available to the Docker daemon.
2. A build is triggered in the Docker daemon.
3. The built image is pushed to an in-cluster registry (which is automatically installed), which makes it available to the cluster.

After enabling this mode (we currently still default to the `local-docker` mode), you will need to run `garden plugins kubernetes cluster-init --env=<env-name>` for each applicable environment, in order to install the required cluster-wide services. Those services include the Docker daemon itself, as well as an image registry, a sync service for receiving build contexts, two persistent volumes, an NFS volume provisioner for one of those volumes, and a couple of small utility services.

Optionally, you can also enable [BuildKit]((https://github.com/moby/buildkit)). In most cases, this should work well and be more performant, but remains optional for now. If you have `cluster-docker` set as your `buildMode` you can enable BuildKit for an environment as follows:

```yaml
clusterDocker:
  enableBuildKit: false
```

Make sure your cluster has enough resources and storage to support the required services, and keep in mind that these
services are shared across all users of the cluster. Please look at the
[resources](../providers/kubernetes.md#providersresources) and
[storage](../providers/kubernetes.md#providersstorage) sections in the provider reference for
details.

### Kaniko

This mode works _mostly_ the same way as Cluster Docker, but replaces the Docker daemon with [Kaniko](https://github.com/GoogleContainerTools/kaniko). Enable this by setting `buildMode: kaniko` in your `kubernetes` provider configuration, and running `garden plugins kubernetes cluster-init --env=<env-name>` to install required cluster-wide service.

The Kaniko project is still improving, but it provides a
compelling alternative to the standard Docker daemon because it can run without special privileges on the cluster,
and is thus more secure. It may also scale better because it doesn't rely on a single daemon shared across users, so
builds are executed in individual Pods and don't share the same resources of a single Pod. This also removes the need
to provision another persistent volume, which the Docker daemon needs for its layer cache.

The trade-off is generally in performance, at least for the moment, partly because it relies on the Docker registry to
cache layers. There are also some known issues and incompatibilities, so your mileage may vary.

Note the difference in how resources for the builder are allocated. See the
[builder resources](../providers/kubernetes.md#providersresourcesbuilder) reference for details.

### Local Docker

This is the default mode. It is the least efficient one for remote clusters, but requires no additional services to be
deployed to the cluster. For remote clusters, you do however need to explicitly configure a _deployment registry_, and
to have Docker running locally.

See the [Local Docker builds](./remote-kubernetes.md) section in the Remote Clusters guide for details.

## Publishing images

You can publish images that have been built in your cluster, using the `garden publish` command.

The only caveat is that you currently need to have Docker running locally, and you need to have authenticated with the
target registry. When publishing, we pull the image from the in-cluster registry to the local Docker daemon, and then
go on to push it from there. We do this to avoid having to (re-)implement all the various authentication methods (and
by extension key management) involved in pushing directly from the cluster.

As usual, you need to specify the `image` field on the `container` module in question. For example:

```yaml
kind: Module
name: my-module
image: my-repo/my-image:v1.2.3   # <- omit the tag here if you'd like to use the Garden-generated version tag
...
```

## Cleaning up cached images

In order to avoid disk-space issues in the cluster, the `kubernetes` provider exposes a utility command:

```sh
garden --env=<your-environment> plugins kubernetes cleanup-cluster-registry
```

The command does the following:

1. Looks through all Pods in the cluster to see which images/tags are in use, and flags all other images as deleted in the in-cluster registry.
2. Restarts the registry in read-only mode.
3. Runs the registry garbage collection.
4. Restarts the registry again without the read-only mode.
5. When using the `cluster-docker` build mode, we additionally untag in the Docker daemon all images that are no longer in the registry, and then clean up the dangling image layers by running `docker image prune`.

There are plans to do this automatically when disk-space runs low, but for now you can run this manually or set up
your own cron jobs.

## Pulling base images from private registries

The in-cluster builder may need to be able to pull base images from a private registry, e.g. if your Dockerfile starts with something like this:

```dockerfile
FROM my-private-registry.com/my-image:tag
```

where `my-private-registry.com` requires authorization.

For this to work, you need to create a registry secret in your cluster (see [this guide](https://kubernetes.io/docs/tasks/configure-pod-container/pull-image-private-registry/) for how to create the secret) and then configure the [imagePullSecrets](../providers/kubernetes.md#providersimagepullsecrets) field in your `kubernetes` provider configuration:

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

> Note: Any time you add or modify imagePullSecrets after first initializing your cluster, you need to run `garden plugins kubernetes cluster-init` again for them to work when pulling base images!
