# Running against a remote Kubernetes cluster

Below are some notes on steps you need to take before deploying Garden projects to a remote Kubernetes cluster.

Many of the steps are not specific to Garden as such, so you may have already performed some of these steps
and/or may need to follow the provided links in each section for details on how to perform the steps you have
not yet completed.

## Setup

### Connecting to the cluster

Start by making sure you have a [kubectl context](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
set up on your development machine to access your cluster. How you set this up will vary by how and where you
have deployed your cluster.

Then configure the project and provider in your project `garden.yml`, along with the kubectl context you use to
connect to your cluster.

Example:

```yaml
project:
  name: my-project
  environments:
  - name: dev
    providers:
    - name: kubernetes
      context: my-dev-context   # the name of the kubectl context for the cluster
      ...
  defaultEnvironment: dev
```

### Ingress, TLS and DNS

The cluster needs to have a configured [nginx ingress controller](https://github.com/kubernetes/ingress-nginx).

You'll also need to point one or more DNS entries to your cluster, and configure a TLS certificate for the hostnames
you will expose for ingress.
_How you configure DNS and prepare the certificates will depend on how you manage DNS and certificates in general,
so we won't cover that in detail here._

Once you have the certificates on hand (the `.crt` and `.key` files), create a
[Secret](https://kubernetes.io/docs/concepts/configuration/secret/) for each cert in the cluster so that
they can be referenced when deploying services:

```sh
kubectl create secret tls mydomain-tls-secret --key <path-to-key-file> --cert <path-to-crt-file>
```

Then configure each certificate/secret in your `garden.yml` provider configuration:

```yaml
project:
  name: my-project
  environments:
  - name: dev
    providers:
    - name: kubernetes
      context: my-dev-context
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
  defaultEnvironment: dev
```

### Configuring a container registry

When you deploy to the environment (via `garden deploy` or `garden dev`), containers are first built and then pushed
to the configured _deployment registry_, where the K8s cluster will then pull the built images when deploying.
This should generally be a _private_ container registry, or at least a private project in a public registry.

Similarly to the above TLS configuration, you may also need to set up auth for the registry using K8s Secrets, in this
case via the `kubectl create secret docker-registry` helper.

_Note that you do not need to configure the authentication and imagePullSecrets when using GKE along with GCR,
as long as your deployment registry is in the same project as the GKE cluster._

The lovely folks at [Heptio](https://heptio.com) have prepared good guides on how to configure private registries
for Kubernetes, which you can find [here](http://docs.heptio.com/content/private-registries.html).

Once you've created the auth secret in the cluster, you can configure the registry and the secrets in your
`garden.yml` project config like this:

```yaml
project:
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

### Permissions

Note that you need to have permissions to create namespaces and to create deployments,
daemonsets, services and ingresses within the namespaces created.

The plugin will create two or more namespaces per user and project, one to run services, another to manage
metadata and configuration (this is so that your environment can be reset without
clearing your configuration variables), and potentially more to support specific plugins/providers.