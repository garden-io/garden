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
You'll also need to configure one or more TLS certificates for the hostnames you will expose for ingress.

Once you have the certificates on hand (the `.crt` and `.key` files), create a
[Secret](https://kubernetes.io/docs/concepts/configuration/secret/) for each cert in the cluster so that
they can be referenced when deploying services:

```sh
kubectl create secret tls mydomain-tls-secret --key <path-to-key-file> --cert <path-to-crt-file>
```

Then configure each certificate/secret in your provider configuration:

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
      defaultEnvironment: dev
```

### Permissions

Note that you need to have permissions to create namespaces and to create deployments,
daemonsets, services and ingresses within the namespaces created. The plugin will
create two or more namespaces per user and project, one to run services, another to manage
metadata and configuration (this is so that your environment can be reset without
clearing your configuration variables), and potentially more to support specific plugins/providers.
