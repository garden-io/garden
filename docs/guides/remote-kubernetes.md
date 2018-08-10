# Running against a remote Kubernetes cluster

## Setup

### Connecting to the cluster

Start by making sure you have a [kubectl context](https://kubernetes.io/docs/tasks/access-application-cluster/configure-access-multiple-clusters/)
set up on your development machine to access your cluster.

Then configure the project and provider, along with the kubectl context you use to connect to your
cluster.

Example:

```yaml
    project:
      name: my-project
      environments:
      - name: dev
        providers:
        - name: kubernetes
          context: my-dev-context   # the name of the kubectl context for the cluster
      defaultEnvironment: dev
```

### Ingress, TLS and DNS

The cluster needs to have a configured [nginx ingress controller](https://github.com/kubernetes/ingress-nginx).
You'll also need to configure one or more domains that point to the cluster, and the corresponding TLS
certificate.

For each domain, you'll need a certificate for both the domain itself, and a wildcard certificate for its
subdomains (e.g. `mydomain.com` and `*.mydomain.com`). This can be in the same cert or two separate ones.

Once you have the certificates on hand (the `.crt` and `.key` files), create a
[Secret](https://kubernetes.io/docs/concepts/configuration/secret/) for each cert in the cluster so that
they can be referenced when deploying services:

```sh
kubectl create secret tls mydomain-tls-secret --key <path-to-key-file> --cert <path-to-crt-file>
```

Then configure each domain along with the corresponding TLS secrets:

```yaml
    project:
      name: my-project
      environments:
      - name: dev
        providers:
        - name: kubernetes
          context: my-dev-context
          ingressDomains:
          - name: mydomain.com
            tlsSecrets:
            - name: mydomain-tls-secret  # change to whatever name you chose for the secret above
              namespace: default         # change this if you store the secret in another namespace
          - name: otherdomain.net
            tlsSecrets:
            - name: otherdomain-tls-secret
              namespace: default
      defaultEnvironment: dev
```

### Permissions

Note that you need to have permissions to create namespaces and to create deployments,
daemonsets, services and ingresses within the namespaces created. The plugin will
create two or more namespaces per user and project, one to run services, another to manage
metadata and configuration (this is so that your environment can be reset without
clearing your configuration variables), and potentially more to support specific plugins/providers.
