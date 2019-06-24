# Using Garden with a remote Kubernetes cluster

Below are some notes on the steps you need to take before deploying Garden projects to a remote Kubernetes cluster,
and an overview of the things you'll want to configure.

Many of the steps are not specific to Garden as such, so you may have already performed some of these steps
and/or may need to follow the provided links in each section for details on how to perform the steps you have
not yet completed.

## Connecting to the cluster

Start by making sure you have a [kubectl context](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
set up on your development machine to access your cluster. How you set this up will vary by how and where you
have deployed your cluster.

Then configure the project and provider in your project `garden.yml`, along with the kubectl context you use to
connect to your cluster.

Example:

```yaml
kind: Project
name: my-project
environments:
- name: dev
  providers:
  - name: kubernetes
    context: my-dev-context   # the name of the kubectl context for the cluster
    ...
defaultEnvironment: dev
```

## Permissions

Note that you need to have permissions to create namespaces and to create deployments,
daemonsets, services and ingresses within the namespaces created.

The plugin will create two or more namespaces per user and project, one to run services, another to manage
metadata and configuration (this is so that your environment can be reset without
clearing your configuration variables), and potentially more to support specific plugins/providers.

## Building and pushing images

Garden supports multiple methods for building images and making them available to the cluster:

1. Cluster Docker
2. Kaniko
3. Local Docker

The _Cluster Docker_ and _Kaniko_ modes build container images inside your development cluster, so you don't need to
run Docker on your machine, and avoid having to build locally and push build artifacts over the wire to the cluster
for every change to your code.

Let's look at how each mode works, and how you configure them:

### Cluster Docker

The Cluster Docker mode installs a standalone Docker daemon into your cluster, that is then used for builds across
all users of the clusters, along with a handful of other supporting services. Enable this mode by setting
`buildMode: cluster-docker` in your `kubernetes` provider configuration.

In this mode, builds are executed as follows:

1. Your code (build context) is synchronized to a sync service in the cluster, making it available to the
   Docker daemon.
2. A build is triggered in the Docker daemon.
3. The built image is pushed to an in-cluster registry (which is automatically installed), which makes it available
   to the cluster.

After enabling this mode (we currently still default to the `local` mode), you will need to run `garden init` for each
applicable environment, in order to install the
required cluster-wide services. Those services include the Docker daemon itself, as well as an image registry,
a sync service for receiving build contexts, two persistent volumes, an NFS volume provisioner for one of those volumes,
and a couple of small utility services.

Make sure your cluster has enough resources and storage to support the required services, and keep in mind that these
services are shared across all users of the cluster. Please look at the
[resources](../reference/providers/kubernetes.md#providers[].resources) and
[storage](../reference/providers/kubernetes.md#providers[].storage) sections in the provider reference for
details.

### Kaniko

This mode works _mostly_ the same way as Cluster Docker, but replaces the Docker daemon with
[Kaniko](https://github.com/GoogleContainerTools/kaniko).
Enable this by setting `buildMode: kaniko` in your `kubernetes` provider configuration.

The Kaniko project is still improving, but it provides a
compelling alternative to the standard Docker daemon because it can run without special privileges on the cluster,
and is thus more secure. It may also scale better because it doesn't rely on a single daemon shared across users, so
builds are executed in individual Pods and don't share the same resources of a single Pod. This also removes the need
to provision another persistent volume, which the Docker daemon needs for its layer cache.

The trade-off is generally in performance, at least for the moment, partly because it relies on the Docker registry to
cache layers. There are also some known issues and incompatibilities, so your mileage may vary.

Note the difference in how resources for the builder are allocated. See the
[builder resources](../reference/providers/kubernetes.md#providers[].resources.builder) reference for details.

### Local Docker

This is the default mode. It is the least efficient one for remote clusters, but requires no additional services to be
deployed to the cluster. For remote clusters, you do however need to explicitly configure a _deployment registry_, and
to have Docker running locally.

When you deploy to the environment (via `garden deploy` or `garden dev`), images are first built locally and then
pushed to the configured deployment registry, where the K8s cluster will then pull the built images when deploying.
This should generally be a _private_ container registry, or at least a private project in a public registry.

Similarly to the below TLS configuration, you may also need to set up auth for the registry using K8s Secrets, in this
case via the `kubectl create secret docker-registry` helper.

_Note that you do not need to configure the authentication and imagePullSecrets when using GKE along with GCR,
as long as your deployment registry is in the same project as the GKE cluster._

The lovely folks at [Heptio](https://heptio.com) have prepared good guides on how to configure private registries
for Kubernetes, which you can find [here](http://docs.heptio.com/content/private-registries.html).

Once you've created the auth secret in the cluster, you can configure the registry and the secrets in your
`garden.yml` project config like this:

```yaml
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

### Ingress, TLS and DNS

By default, Garden will not install an ingress controller for remote environments. This can be toggled by setting the [`setupIngressController` flag](../reference/providers/kubernetes.md#providers[].setupingresscontroller) to `nginx`. Alternatively, you can set up your own ingress controller, e.g. using [Traefik](https://traefik.io/), [Ambassador](https://www.getambassador.io/) or [Istio](https://istio.io/).  You can find examples for [using Garden with Ambassador](https://github.com/garden-io/garden/tree/v0.9.12/examples/ambassador) and [with Istio](https://github.com/garden-io/garden/tree/v0.9.12/examples/istio) in our [examples directory](https://github.com/garden-io/garden/tree/master/examples).

You'll also need to point one or more DNS entries to your cluster, and configure a TLS certificate for the hostnames
you will expose for ingress.
_How you configure DNS and prepare the certificates will depend on how you manage DNS and certificates in general,
so we won't cover that in detail here._

Once you have the certificates in hand (the `.crt` and `.key` files), create a
[Secret](https://kubernetes.io/docs/concepts/configuration/secret/) for each cert in the cluster so
they can be referenced when deploying services:

```sh
kubectl create secret tls mydomain-tls-secret --key <path-to-key-file> --cert <path-to-crt-file>
```

Then configure each certificate/secret in your `garden.yml` provider configuration:

```yaml
kind: Project
name: my-project
defaultEnvironment: dev
environments:
- name: dev
  providers:
  - name: kubernetes
    context: my-dev-context
    defaultHostname: mydomain.com
    tlsCertificates:
    - name: main
      # Optionally set particular hostnames to use this certificate for
      # (useful if you have multiple certs for the same hostname).
      hostnames: [mydomain.com]
      secretRef:
        # Change to whatever name you chose for the secret above.
        name: my-tls-secret
        # Change this if you store the secret in another namespace.
        namespace: default
    - name: wildcard
      secretRef:
        name: wildcard-tls-secret
        namespace: default
    ...
```
