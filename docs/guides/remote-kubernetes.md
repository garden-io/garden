---
title: Remote Kubernetes
---
# Using Garden with a remote Kubernetes cluster

Below are some notes on the steps you need to take before deploying Garden projects to a remote Kubernetes cluster,
and an overview of the things you'll want to configure.

Many of the steps are not specific to Garden as such, so you may have already performed some of these steps
and/or may need to follow the provided links in each section for details on how to perform the steps you have
not yet completed.

Our [cloud provider setup guide](./cloud-provider-setup.md) includes instructions for getting started with a few prominent
hosted Kubernetes providers, and for configuring your Garden project to connect with them.

## Requirements

Garden is committed to supporting the _latest six_ stable versions of Kubernetes (i.e. if the latest stable version is v1.17.x, Garden supports v1.12.x and newer). Any conformant cluster should work fine.

Using [in-cluster building](./in-cluster-building.md) introduces additional requirements. Please look at the [in-cluster building guide](./in-cluster-building.md) for details.

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

## Initializing the cluster

When you're connecting to a new cluster, or after you have updated your provider configuration or Garden itself,
you need to install/update cluster-wide services that Garden needs to operate. When using `local-kubernetes` this
happens automatically when you're deploying or testing, but for remote clusters this requires a manual step. This is
so that different users don't end up "competing" with different configurations or versions.

To initialize or update your cluster-wide services, run:

```sh
garden --env=<environment-name> plugins kubernetes cluster-init
```

To later uninstall the installed services, you can run:

```sh
garden --env=<environment-name> plugins kubernetes uninstall-garden-services
```

This will remove all services from the `garden-system` namespace, as well as any installed cluster-scoped resources.

## Building and pushing images

Garden supports multiple methods for building images and making them available to the cluster. Below we detail how
to configure for the standard out-of-cluster build flow, but do make sure to look at the
[in-cluster building](./in-cluster-building.md) for details on how to build images directly inside the cluster.

### Local Docker builds

This is the default build mode. It is the least efficient one for remote clusters, but requires no additional services
to be deployed to the cluster. For remote clusters, you do however need to explicitly configure a _deployment registry_,
and to have Docker running locally. For development clusters, you may in fact get set up quicker if you use
[in-cluster building](./in-cluster-building.md).

When you deploy to your environment (via `garden deploy` or `garden dev`) using the local Docker mode, images are first
built locally and then pushed to the configured _deployment registry_, where the K8s cluster will then pull the built
images when deploying. This should generally be a _private_ container registry, or at least a private project in a
public registry.

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

By default, Garden will not install an ingress controller for remote environments. This can be toggled by setting the [`setupIngressController` flag](../providers/kubernetes.md#providerssetupingresscontroller) to `nginx`. Alternatively, you can set up your own ingress controller, e.g. using [Traefik](https://traefik.io/), [Ambassador](https://www.getambassador.io/) or [Istio](https://istio.io/).  You can find examples for [using Garden with Ambassador](https://github.com/garden-io/garden/tree/v0.11.5/examples/ambassador) and [with Istio](https://github.com/garden-io/garden/tree/v0.11.5/examples/istio) in our [examples directory](https://github.com/garden-io/garden/tree/v0.11.5/examples).

You'll also need to point one or more DNS entries to your cluster, and configure a TLS certificate for the hostnames
you will expose for ingress.
_How you configure DNS and prepare the certificates will depend on how you manage DNS and certificates in general,
so we won't cover that in detail here._

If you are using [cert-manager](https://github.com/jetstack/cert-manager) (or would like to use it) to manage your TLS certificates, you may want to check out the [cert-manager integration](../guides/cert-manager-integration.md), which helps to automate some of the otherwise manual work involved in managing certificates.

If you are manually creating or obtaining the certificates (and you have the `.crt` and `.key` files), create a
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

## Deploying to production

Depending on your setup and requirements, you may or may not want to use Garden to deploy to your production environment. In either case, if you do configure your production environment in your Garden project configuration, we highly recommend that you set the [production flag](../reference/config.md#environmentsproduction) on it.

This will protect against accidentally messing with your production environments, by prompting for confirmation before e.g. deploying or running tests in the environment.

The flag is also given to each provider, which may modify behavior accordingly. For the `kubernetes` provider, specifically, it will do the following:

1. Set the default number of replicas for `container` services to 3 (unless specified by the user).
2. Set a soft AntiAffinity setting on `container` deployments to try to schedule Pods in a single Deployment across many nodes.
3. Set a restricted `securityContext` for Pods (runAsUser: 1000, runAsGroup: 3000, fsGroup: 2000).
4. Increase the `RevisionHistoryLimit` on workloads to 10.
5. By default, running `garden deploy --force` will propagate the `--force` flag to `helm upgrade`, and set the `--replace` flag on `helm install` when deploying `helm` modules. This may be okay while developing but risky in production, so the `production` flag prevents both of those.

We would highly appreciate feedback on other configuration settings that should be altered when `production: true`. Please send us feedback via [GitHub issues](https://github.com/garden-io/garden/issues) or reach out on our Slack channel!
